const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const { extractPptxChunks, extractDocxChunks } = require('../utils/zipTextEntries');
const { extractPdfChunks } = require('../utils/pdfTextByPage');
const { extractOfficeText } = require('../utils/officeText');
const { getStoredFile } = require('./storageService');
const { createQueue } = require('../utils/concurrencyQueue');
const resourceTextCache = require('./resourceTextCache');

const NO_READABLE_TEXT_MESSAGE = "AILA couldn't read text from this file. It may be scanned images — try a PDF with selectable text.";

// One heavy extraction (unzipping a PPTX, walking every PDF page) at a time
// across the whole process — a burst of requests for different large files
// queues briefly instead of running in parallel and spiking memory together.
const extractionQueue = createQueue();

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // 'PK\x03\x04'

async function looksLikeZip(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    const { bytesRead } = await handle.read(buffer, 0, 4, 0);
    return bytesRead === 4 && buffer.equals(ZIP_SIGNATURE);
  } finally {
    await handle.close();
  }
}

// type==='docx' covers both real .docx uploads AND legacy binary .doc
// uploads (see uploadResourceFile.js's MIME_TO_TYPE — both map to 'docx').
// Only the former is actually a zip; the latter needs officeparser's
// auto-detecting buffer-based reader instead of the yauzl path.
async function extractLegacyOfficeChunks(filePath, type) {
  const buffer = await fs.promises.readFile(filePath);
  const text = await extractOfficeText(buffer, type).catch(() => '');
  return { chunks: text ? [{ label: 'Document', text }] : [] };
}

async function runExtraction(filePath, type) {
  try {
    if (type === 'pptx') return await extractPptxChunks(filePath);
    if (type === 'docx') {
      return (await looksLikeZip(filePath)) ? await extractDocxChunks(filePath) : await extractLegacyOfficeChunks(filePath, 'docx');
    }
    if (type === 'ppt') return await extractLegacyOfficeChunks(filePath, 'ppt');
    if (type === 'pdf') return await extractPdfChunks(filePath);
    return { chunks: [] };
  } catch (error) {
    console.error(`[resourceTextExtraction] extraction failed for ${type} file: ${error.message}`);
    return { chunks: [], extractionFailed: true };
  }
}

function extractChunksFromFile(filePath, type) {
  return extractionQueue.run(() => runExtraction(filePath, type));
}

// Downloads an R2-stored file to a fresh temp file for extraction (R2's own
// SDK/fetch body is a stream either way — this just lands it on disk so the
// zip/pdf readers, which need random access, can seek it). Local-driver
// resources are already on local disk, so this just points at that file
// directly with a no-op cleanup.
async function withLocalFile(filePathRef, run) {
  const stored = await getStoredFile(filePathRef);
  const isAlreadyLocalFile = typeof stored.stream.path === 'string';

  if (isAlreadyLocalFile) {
    stored.stream.destroy();
    return run(stored.stream.path);
  }

  const tempPath = path.join(os.tmpdir(), `aila-extract-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`);
  await pipeline(stored.stream, fs.createWriteStream(tempPath));
  try {
    return await run(tempPath);
  } finally {
    await fs.promises.unlink(tempPath).catch(() => {});
  }
}

// Cache-first full-document extraction for an EXISTING resource (Ask AILA /
// Generate Quiz referencing something already uploaded). `resource` is the
// row shape from resourceModel.getResourceById: { id, type, file_path,
// extracted_text, ... }.
async function getResourceChunks(resource) {
  const cached = resourceTextCache.get(resource.id);
  if (cached) return cached;

  let chunks = [];
  if (resource.file_path) {
    try {
      ({ chunks } = await withLocalFile(resource.file_path, (absolutePath) => extractChunksFromFile(absolutePath, resource.type)));
    } catch (error) {
      console.error(`[resourceTextExtraction] could not read resource ${resource.id}'s file, falling back to its stored analysis text if any: ${error.message}`);
    }
  }

  // Falls back to whatever was captured at upload time if the live file
  // can't be re-read (temporarily unreachable storage) or there is no
  // file_path at all — degraded grounding beats none.
  if (!chunks.length && resource.extracted_text) {
    chunks = [{ label: 'Document', text: resource.extracted_text }];
  }

  resourceTextCache.set(resource.id, chunks);
  return chunks;
}

function joinChunks(chunks) {
  return chunks.map((chunk) => `[${chunk.label}]\n${chunk.text}`).join('\n\n');
}

function buildOutline(chunks) {
  return chunks
    .map((chunk) => `- ${chunk.label}: ${chunk.text.split('\n')[0].slice(0, 80)}`)
    .join('\n');
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'is', 'are', 'was', 'were', 'be', 'this',
  'that', 'it', 'for', 'with', 'as', 'at', 'by', 'from', 'about', 'what', 'which', 'who', 'how',
  'why', 'when', 'does', 'do', 'did', 'can', 'could', 'would', 'please', 'tell', 'me',
]);

function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9']+/g) || []).filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scoreChunkForWords(chunkTextLower, words) {
  let score = 0;
  for (const word of words) {
    const matches = chunkTextLower.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g'));
    if (matches) score += matches.length;
  }
  return score;
}

// Ask AILA: picks the chunks most likely to answer THIS question (simple
// keyword overlap — see module docstring), in document order, plus a short
// whole-document outline so the model has some global context even for
// sections that didn't make the cut.
function selectRelevantChunks(chunks, questionText, maxChars) {
  const full = joinChunks(chunks);
  if (full.length <= maxChars) return { text: full, truncated: false };

  const outlineBlock = `Document outline (${chunks.length} sections):\n${buildOutline(chunks)}\n\n`;
  const budget = Math.max(0, maxChars - outlineBlock.length);
  const words = [...new Set(tokenize(questionText))];

  const ranked = chunks
    .map((chunk, index) => ({ index, chunk, score: words.length ? scoreChunkForWords(chunk.text.toLowerCase(), words) : 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const chosen = [];
  let used = 0;
  for (const item of ranked) {
    const piece = `[${item.chunk.label}]\n${item.chunk.text}`;
    if (chosen.length > 0 && used + piece.length + 2 > budget) continue;
    chosen.push(item);
    used += piece.length + 2;
    if (used >= budget) break;
  }

  chosen.sort((a, b) => a.index - b.index);
  const body = chosen.map((item) => `[${item.chunk.label}]\n${item.chunk.text}`).join('\n\n');
  return { text: (outlineBlock + body).slice(0, maxChars), truncated: true };
}

// Generate Quiz: picks chunks evenly spread across the WHOLE document
// (always including the first and last) instead of the most "relevant" ones,
// so a quiz draws from the entire file rather than just the beginning.
function selectSpreadChunks(chunks, maxChars) {
  const full = joinChunks(chunks);
  if (full.length <= maxChars) return { text: full, truncated: false };

  const MIN_USEFUL_CHARS = 400;
  const n = chunks.length;
  const count = Math.max(2, Math.min(n, Math.floor(maxChars / MIN_USEFUL_CHARS)));

  const indexes = new Set();
  for (let i = 0; i < count; i += 1) {
    indexes.add(count === 1 ? 0 : Math.round((i * (n - 1)) / (count - 1)));
  }
  const sortedIndexes = [...indexes].sort((a, b) => a - b);
  const perChunkCap = Math.floor(maxChars / sortedIndexes.length);

  const body = sortedIndexes
    .map((i) => {
      const chunk = chunks[i];
      const text = chunk.text.length > perChunkCap ? `${chunk.text.slice(0, perChunkCap)}…` : chunk.text;
      return `[${chunk.label}]\n${text}`;
    })
    .join('\n\n');

  return { text: body.slice(0, maxChars), truncated: true };
}

module.exports = {
  NO_READABLE_TEXT_MESSAGE,
  extractChunksFromFile,
  getResourceChunks,
  joinChunks,
  selectRelevantChunks,
  selectSpreadChunks,
};
