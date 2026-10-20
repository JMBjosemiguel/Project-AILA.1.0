const yauzl = require('yauzl');

const ENTITY_MAP = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXmlEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const codePoint = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ENTITY_MAP[code.toLowerCase()] ?? match;
  });
}

// DOCX/PPTX text lives entirely inside <w:t>/<a:t> runs — reading just those
// (rather than parsing the full XML tree) is simple, fast, and never touches
// the separate binary media entries this reader skips anyway.
function textRunsToPlainText(xml, { runTag, paragraphCloseTag }) {
  const paragraphs = xml.split(paragraphCloseTag);
  const runPattern = new RegExp(`<${runTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${runTag}>`, 'g');
  const lines = paragraphs.map((paragraph) => {
    let line = '';
    let match;
    runPattern.lastIndex = 0;
    while ((match = runPattern.exec(paragraph))) {
      line += match[1];
    }
    return decodeXmlEntities(line);
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function readEntryText(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, readStream) => {
      if (err) { reject(err); return; }
      const parts = [];
      readStream.on('data', (chunk) => parts.push(chunk));
      readStream.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
      readStream.on('error', reject);
    });
  });
}

// Walks a PPTX/DOCX's central directory and reads ONLY the small XML text
// entries matched by `wantEntry`, in file order (lazyEntries + only calling
// openReadStream for wanted entries means every embedded image/video/audio
// entry is enumerated but never decompressed). `onEntryText(fileName, text)`
// receives each wanted entry's raw XML text as it's read.
function walkZipTextEntries(filePath, wantEntry, onEntryText) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) { reject(err); return; }

      let failed = false;
      zipfile.on('error', (zipError) => {
        if (failed) return;
        failed = true;
        reject(zipError);
      });

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (failed) return;
        const isDirectory = /\/$/.test(entry.fileName);
        if (isDirectory || !wantEntry(entry.fileName)) {
          zipfile.readEntry();
          return;
        }

        readEntryText(zipfile, entry)
          .then((text) => {
            if (failed) return;
            onEntryText(entry.fileName, text);
            zipfile.readEntry();
          })
          .catch((readError) => {
            if (failed) return;
            failed = true;
            reject(readError);
          });
      });

      zipfile.on('end', () => {
        if (!failed) resolve();
      });
    });
  });
}

function slideNumber(fileName) {
  const match = fileName.match(/(\d+)\.xml$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractPptxChunks(filePath) {
  const slideText = new Map();
  const notesText = new Map();

  await walkZipTextEntries(
    filePath,
    (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name),
    (name, xml) => {
      const text = textRunsToPlainText(xml, { runTag: 'a:t', paragraphCloseTag: '</a:p>' });
      if (!text) return;
      if (name.startsWith('ppt/slides/')) slideText.set(slideNumber(name), text);
      else notesText.set(slideNumber(name), text);
    }
  );

  const slideNumbers = [...slideText.keys()].sort((a, b) => a - b);
  const chunks = slideNumbers.map((n) => {
    const notes = notesText.get(n);
    return {
      label: `Slide ${n}`,
      text: notes ? `${slideText.get(n)}\n[Speaker notes] ${notes}` : slideText.get(n),
    };
  });

  return { chunks };
}

// DOCX has no stored "page" concept (pagination is a layout-time computation
// PowerPoint/Word never persists in the XML) — the body is one continuous
// text-run stream, so it's split into roughly-equal-sized chunks instead.
const DOCX_CHUNK_CHARS = 3000;

function splitIntoChunks(text, label, chunkChars) {
  if (!text) return [];
  if (text.length <= chunkChars) return [{ label, text }];

  const chunks = [];
  // Break on paragraph boundaries near the target size rather than mid-word.
  const paragraphs = text.split('\n');
  let current = '';
  let part = 1;
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 1 > chunkChars) {
      chunks.push({ label: `${label} (part ${part})`, text: current.trim() });
      part += 1;
      current = '';
    }
    current += (current ? '\n' : '') + paragraph;
  }
  if (current.trim()) chunks.push({ label: `${label} (part ${part})`, text: current.trim() });
  return chunks;
}

async function extractDocxChunks(filePath) {
  let bodyXml = '';
  const headerFooterXml = [];

  await walkZipTextEntries(
    filePath,
    (name) => name === 'word/document.xml' || /^word\/(header|footer)\d+\.xml$/.test(name),
    (name, xml) => {
      if (name === 'word/document.xml') bodyXml = xml;
      else headerFooterXml.push(xml);
    }
  );

  const bodyText = textRunsToPlainText(bodyXml, { runTag: 'w:t', paragraphCloseTag: '</w:p>' });
  const headerFooterText = headerFooterXml
    .map((xml) => textRunsToPlainText(xml, { runTag: 'w:t', paragraphCloseTag: '</w:p>' }))
    .filter(Boolean)
    .join('\n');

  const chunks = splitIntoChunks(bodyText, 'Document', DOCX_CHUNK_CHARS);
  if (headerFooterText) chunks.push({ label: 'Headers/footers', text: headerFooterText });
  return { chunks };
}

module.exports = { extractPptxChunks, extractDocxChunks };
