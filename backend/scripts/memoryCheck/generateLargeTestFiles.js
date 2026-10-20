'use strict';
// Generates the two synthetic "large lecture file" fixtures used by
// runMemoryCheck.js: a ~40 MB PPTX (80 text slides + embedded image padding)
// and a ~40 MB PDF (200+ pages + an embedded per-page image). Not run as part
// of the normal test suite, and nothing it produces is committed — see
// runMemoryCheck.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ZipWriter, randomBinary } = require('./zipWriter');

const SLIDE_COUNT = 80;
const PAGE_COUNT = 220;
const LAST_SLIDE_SENTINEL = 'UNIQUE_SENTINEL_SLIDE_SENTENCE_7f3a9c';
const LAST_PAGE_SENTINEL = 'UNIQUE_SENTINEL_PAGE_SENTENCE_2b8e41';

function lectureParagraph(topic, index) {
  // A realistic-ish paragraph of real text per slide/page — enough that the
  // cumulative extracted text across all slides/pages comfortably exceeds
  // the ~120,000 char cap sent to Gemini, so the chunk-selection path (not
  // just "send everything") actually gets exercised.
  return [
    `Topic ${index}: ${topic}.`,
    'This section covers the underlying mechanism, typical presentation, and key nursing considerations.',
    'Students should be able to identify the primary signs, explain the pathophysiology in their own words,',
    'and describe the first three priority actions a nurse would take when this presents in a clinical setting.',
    'Review the associated lab values and medication interactions before the next session.',
  ].join(' ');
}

function escapePdfText(line) {
  return line.split('\\').join('\\\\').split('(').join('\\(').split(')').join('\\)');
}

function wrapLines(text, maxCharsPerLine = 90) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function generatePptx(outPath) {
  const zw = new ZipWriter();
  zw.addFile('[Content_Types].xml', '<?xml version="1.0"?><Types/>');
  zw.addFile('_rels/.rels', '<?xml version="1.0"?><Relationships/>');

  for (let i = 1; i <= SLIDE_COUNT; i += 1) {
    const isLast = i === SLIDE_COUNT;
    const text = lectureParagraph(`Nursing concept #${i}`, i) + (isLast ? ` ${LAST_SLIDE_SENTINEL}` : '');
    const runs = text
      .split('. ')
      .map((sentence) => `<a:p><a:r><a:t>${sentence}.</a:t></a:r></a:p>`)
      .join('');
    zw.addFile(
      `ppt/slides/slide${i}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody>${runs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    );
    zw.addFile(
      `ppt/notesSlides/notesSlide${i}.xml`,
      `<?xml version="1.0"?><p:notes xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Speaker note for slide ${i}.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`
    );
    // ~500 KB of fake "picture" per slide — never valid image bytes, never
    // meant to be opened; this is exactly the kind of entry the zip reader
    // must enumerate but skip decompressing.
    zw.addFile(`ppt/media/image${i}.bin`, randomBinary(500 * 1024));
  }

  fs.writeFileSync(outPath, zw.toBuffer());
}

function generatePdf(outPath) {
  const objects = [];
  const pageObjIds = [];
  const contentObjIds = [];
  const imageObjIds = [];
  let nextId = 3;

  for (let i = 0; i < PAGE_COUNT; i += 1) {
    pageObjIds.push(nextId); nextId += 1;
    contentObjIds.push(nextId); nextId += 1;
    imageObjIds.push(nextId); nextId += 1;
  }
  const fontId = nextId; nextId += 1;

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${PAGE_COUNT} >>\nendobj\n`;

  const IMG_SIDE = 450; // 450*450 = 202,500 bytes/page * 220 pages =~ 42 MB of image data alone
  const imageBuffer = randomBinary(IMG_SIDE * IMG_SIDE);

  pageObjIds.forEach((id, i) => {
    objects[id] = `${id} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> /XObject << /Im1 ${imageObjIds[i]} 0 R >> >> ` +
      `/Contents ${contentObjIds[i]} 0 R >>\nendobj\n`;
  });

  for (let i = 0; i < PAGE_COUNT; i += 1) {
    const pageNumber = i + 1;
    const isLast = pageNumber === PAGE_COUNT;
    const text = lectureParagraph(`Nursing concept #${pageNumber}`, pageNumber) + (isLast ? ` ${LAST_PAGE_SENTINEL}` : '');
    const lines = wrapLines(text);

    let y = 740;
    let streamBody = 'q 300 0 0 300 150 400 cm /Im1 Do Q\nBT /F1 11 Tf\n';
    for (const line of lines) {
      streamBody += `1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj\n`;
      y -= 14;
    }
    streamBody += 'ET';

    const contentId = contentObjIds[i];
    objects[contentId] = `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(streamBody)} >>\nstream\n${streamBody}\nendstream\nendobj\n`;

    const imageId = imageObjIds[i];
    objects[imageId] = Buffer.concat([
      Buffer.from(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${IMG_SIDE} /Height ${IMG_SIDE} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${imageBuffer.length} >>\nstream\n`, 'binary'),
      imageBuffer,
      Buffer.from('\nendstream\nendobj\n', 'binary'),
    ]);
  }

  objects[fontId] = `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  const chunks = [Buffer.from('%PDF-1.4\n', 'binary')];
  const offsets = [0];
  let offset = chunks[0].length;
  for (let id = 1; id < nextId; id += 1) {
    offsets[id] = offset;
    const obj = Buffer.isBuffer(objects[id]) ? objects[id] : Buffer.from(objects[id], 'binary');
    chunks.push(obj);
    offset += obj.length;
  }

  const xrefOffset = offset;
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id += 1) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(Buffer.from(xref, 'binary'));

  fs.writeFileSync(outPath, Buffer.concat(chunks));
}

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('Usage: node generateLargeTestFiles.js <output-directory>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const pptxPath = path.join(outDir, 'large-lecture.pptx');
  const pdfPath = path.join(outDir, 'large-lecture.pdf');

  console.log('Generating PPTX...');
  generatePptx(pptxPath);
  console.log(`  ${pptxPath} (${(fs.statSync(pptxPath).size / 1024 / 1024).toFixed(1)} MB)`);

  console.log('Generating PDF...');
  generatePdf(pdfPath);
  console.log(`  ${pdfPath} (${(fs.statSync(pdfPath).size / 1024 / 1024).toFixed(1)} MB)`);

  console.log(JSON.stringify({ pptxPath, pdfPath, lastSlideSentinel: LAST_SLIDE_SENTINEL, lastPageSentinel: LAST_PAGE_SENTINEL }));
}

if (require.main === module) {
  main();
}

module.exports = { generatePptx, generatePdf, LAST_SLIDE_SENTINEL, LAST_PAGE_SENTINEL };
