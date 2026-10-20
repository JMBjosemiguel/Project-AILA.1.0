'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { extractPdfChunks } = require('../../src/utils/pdfTextByPage');

// A minimal, hand-built multi-page PDF — no external PDF-writing library is
// installed, and a real page-by-page extractor deserves a real (if tiny)
// multi-page PDF to run against, not a mock.
function escapePdfText(line) {
  return line.split('\\').join('\\\\').split('(').join('\\(').split(')').join('\\)');
}

function buildPdf(pageTexts) {
  const objects = [];
  const pageObjIds = [];
  const contentObjIds = [];
  let nextId = 3;
  for (let i = 0; i < pageTexts.length; i += 1) {
    pageObjIds.push(nextId); nextId += 1;
    contentObjIds.push(nextId); nextId += 1;
  }
  const fontId = nextId; nextId += 1;

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>\nendobj\n`;

  pageObjIds.forEach((id, i) => {
    objects[id] = `${id} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentObjIds[i]} 0 R >>\nendobj\n`;
  });

  pageTexts.forEach((text, i) => {
    let y = 700;
    let streamBody = 'BT /F1 18 Tf\n';
    for (const line of text.split('\n')) {
      streamBody += `1 0 0 1 72 ${y} Tm (${escapePdfText(line)}) Tj\n`;
      y -= 24;
    }
    streamBody += 'ET';
    const id = contentObjIds[i];
    objects[id] = `${id} 0 obj\n<< /Length ${Buffer.byteLength(streamBody)} >>\nstream\n${streamBody}\nendstream\nendobj\n`;
  });

  objects[fontId] = `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < nextId; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'binary');
    pdf += objects[id];
  }
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'binary');
}

function tempPdfPath(pageTexts) {
  const file = path.join(os.tmpdir(), `pdfTextByPage-test-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);
  fs.writeFileSync(file, buildPdf(pageTexts));
  return file;
}

test('extractPdfChunks', async (t) => {
  await t.test('extracts text from every page, in order, including the last page', async () => {
    const pages = [];
    for (let i = 1; i <= 8; i += 1) {
      pages.push(`Page ${i} content` + (i === 8 ? '\nUNIQUE_LAST_PAGE_TEXT' : ''));
    }
    const file = tempPdfPath(pages);
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const { chunks, pageCount } = await extractPdfChunks(file);

    assert.equal(pageCount, 8);
    assert.equal(chunks.length, 8);
    assert.deepEqual(chunks.map((c) => c.label), [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Page ${n}`));
    assert.match(chunks[0].text, /Page 1 content/);
    assert.match(chunks[7].text, /UNIQUE_LAST_PAGE_TEXT/, 'the last page must be read, not cut off by any page limit');
  });

  await t.test('a page with no text content is simply omitted, never a crash', async () => {
    const file = tempPdfPath(['', 'Page with text']);
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const { chunks, pageCount } = await extractPdfChunks(file);
    assert.equal(pageCount, 2);
    assert.equal(chunks.length, 1);
    assert.match(chunks[0].text, /Page with text/);
  });

  await t.test('a corrupt/non-PDF file rejects instead of hanging or crashing the process', async () => {
    const file = path.join(os.tmpdir(), `pdfTextByPage-test-corrupt-${Date.now()}.pdf`);
    fs.writeFileSync(file, 'this is not a pdf');
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    await assert.rejects(() => extractPdfChunks(file));
  });
});
