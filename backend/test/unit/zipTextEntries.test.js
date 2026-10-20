'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ZipWriter } = require('../../scripts/memoryCheck/zipWriter');
const { extractPptxChunks, extractDocxChunks } = require('../../src/utils/zipTextEntries');

function tempPath(name) {
  return path.join(os.tmpdir(), `zipTextEntries-test-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
}

function slideXml(text) {
  return `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}
function notesXml(text) {
  return `<?xml version="1.0"?><p:notes xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
}
function wordParagraph(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

test('extractPptxChunks', async (t) => {
  await t.test('reads every slide in order, including its notes, and never touches media entries', async () => {
    const zw = new ZipWriter();
    zw.addFile('[Content_Types].xml', '<Types/>');
    for (let i = 1; i <= 4; i += 1) {
      zw.addFile(`ppt/slides/slide${i}.xml`, slideXml(`Slide text ${i}${i === 4 ? ' UNIQUE_LAST_SLIDE' : ''}`));
      zw.addFile(`ppt/notesSlides/notesSlide${i}.xml`, notesXml(`Notes ${i}`));
    }
    // A media entry whose bytes are NOT valid XML — if this ever got opened
    // and run through the XML-text-run extraction it would just yield no
    // text (not throw), but it must not even be opened: openReadStream is
    // only called for entries wantEntry() matches.
    zw.addFile('ppt/media/image1.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));

    const file = tempPath('slides.pptx');
    fs.writeFileSync(file, zw.toBuffer());
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const { chunks } = await extractPptxChunks(file);

    assert.equal(chunks.length, 4);
    assert.deepEqual(chunks.map((c) => c.label), ['Slide 1', 'Slide 2', 'Slide 3', 'Slide 4']);
    assert.match(chunks[0].text, /Slide text 1/);
    assert.match(chunks[0].text, /\[Speaker notes\] Notes 1/);
    assert.match(chunks[3].text, /UNIQUE_LAST_SLIDE/, 'the last slide\'s text must be extracted, not just a prefix');
  });

  await t.test('a slide with no notes entry just has no notes line (never throws)', async () => {
    const zw = new ZipWriter();
    zw.addFile('ppt/slides/slide1.xml', slideXml('Only slide'));
    const file = tempPath('nonotes.pptx');
    fs.writeFileSync(file, zw.toBuffer());
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const { chunks } = await extractPptxChunks(file);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].text, 'Only slide');
  });
});

test('extractDocxChunks', async (t) => {
  await t.test('reads the body, headers and footers; body text includes the full document', async () => {
    const paragraphs = [];
    for (let i = 1; i <= 50; i += 1) {
      paragraphs.push(wordParagraph(`Paragraph number ${i} with some filler text to build up size.${i === 50 ? ' UNIQUE_LAST_PARAGRAPH' : ''}`));
    }
    const body = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragraphs.join('')}</w:body></w:document>`;

    const zw = new ZipWriter();
    zw.addFile('word/document.xml', body);
    zw.addFile('word/header1.xml', `<w:hdr xmlns:w="w">${wordParagraph('Header text')}</w:hdr>`);
    zw.addFile('word/footer1.xml', `<w:ftr xmlns:w="w">${wordParagraph('Footer text')}</w:ftr>`);
    zw.addFile('word/media/image1.png', Buffer.from([0, 1, 2, 3]));

    const file = tempPath('doc.docx');
    fs.writeFileSync(file, zw.toBuffer());
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const { chunks } = await extractDocxChunks(file);
    const allText = chunks.map((c) => c.text).join('\n');

    assert.match(allText, /Paragraph number 1 /);
    assert.match(allText, /UNIQUE_LAST_PARAGRAPH/, 'the last paragraph must be extracted, not cut off');
    assert.match(allText, /Header text/);
    assert.match(allText, /Footer text/);
  });

  await t.test('splits a long body into multiple chunks rather than one giant one', async () => {
    const paragraphs = [];
    for (let i = 1; i <= 300; i += 1) {
      paragraphs.push(wordParagraph(`This is paragraph ${i} with enough text in it to add up over many paragraphs.`));
    }
    const body = `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${paragraphs.join('')}</w:body></w:document>`;

    const zw = new ZipWriter();
    zw.addFile('word/document.xml', body);
    const file = tempPath('long.docx');
    fs.writeFileSync(file, zw.toBuffer());
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const { chunks } = await extractDocxChunks(file);
    assert.ok(chunks.length > 1, `expected multiple chunks for a long document, got ${chunks.length}`);
  });
});
