'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ZipWriter } = require('../../scripts/memoryCheck/zipWriter');
const {
  NO_READABLE_TEXT_MESSAGE,
  extractChunksFromFile,
  getResourceChunks,
  joinChunks,
  selectRelevantChunks,
  selectSpreadChunks,
} = require('../../src/services/resourceTextExtraction');
const resourceTextCache = require('../../src/services/resourceTextCache');
const { UPLOADS_DIR } = require('../../src/services/storageService');

function makeChunks(count, charsPerChunk = 50) {
  return Array.from({ length: count }, (_, i) => ({
    label: `Page ${i + 1}`,
    text: i === count - 1 ? `${'filler '.repeat(charsPerChunk / 7)} UNIQUE_LAST_CHUNK` : 'filler '.repeat(charsPerChunk / 7),
  }));
}

test('selectRelevantChunks (Ask AILA)', async (t) => {
  await t.test('returns everything joined, untruncated, when it already fits the budget', () => {
    const chunks = makeChunks(3, 20);
    const { text, truncated } = selectRelevantChunks(chunks, 'what is on the last page', 100000);
    assert.equal(truncated, false);
    assert.equal(text, joinChunks(chunks));
  });

  await t.test('when it does not fit, picks chunks that match the question keywords and includes an outline', () => {
    const chunks = [
      { label: 'Page 1', text: 'Introduction to photosynthesis and plant biology basics. '.repeat(50) },
      { label: 'Page 2', text: 'Mitochondria and cellular respiration in animal cells. '.repeat(50) },
      { label: 'Page 3', text: 'Photosynthesis light reactions occur in the thylakoid membrane. '.repeat(50) },
    ];
    const budget = 400; // forces truncation given the chunk sizes above
    const { text, truncated } = selectRelevantChunks(chunks, 'explain photosynthesis light reactions', budget);

    assert.equal(truncated, true);
    assert.match(text, /Document outline/);
    assert.match(text, /Page 3/, 'the chunk matching the question keywords should be selected');
    assert.ok(text.length <= budget);
  });

  await t.test('with no question text, still returns something (falls back to the first-ranked chunk) rather than empty', () => {
    const chunks = makeChunks(5, 300);
    const { text, truncated } = selectRelevantChunks(chunks, '', 200);
    assert.equal(truncated, true);
    assert.ok(text.length > 0);
  });
});

test('selectSpreadChunks (Generate Quiz)', async (t) => {
  await t.test('returns everything joined, untruncated, when it already fits the budget', () => {
    const chunks = makeChunks(3, 20);
    const { text, truncated } = selectSpreadChunks(chunks, 100000);
    assert.equal(truncated, false);
    assert.equal(text, joinChunks(chunks));
  });

  await t.test('when it does not fit, always includes the FIRST and LAST chunk — coverage across the whole document', () => {
    const chunks = makeChunks(40, 300);
    const { text, truncated } = selectSpreadChunks(chunks, 2000);

    assert.equal(truncated, true);
    assert.match(text, /\[Page 1\]/, 'must include the first chunk');
    assert.match(text, /UNIQUE_LAST_CHUNK/, 'must include the last chunk\'s content, proving full-document coverage');
    assert.ok(text.length <= 2000);
  });

  await t.test('selected chunks are spread across indexes, not clustered at the start', () => {
    const chunks = makeChunks(100, 50);
    const { text } = selectSpreadChunks(chunks, 1500);
    const includedPages = [...text.matchAll(/\[Page (\d+)\]/g)].map((m) => Number(m[1]));
    const maxIncluded = Math.max(...includedPages);
    assert.ok(maxIncluded > 50, `expected selection to reach past the halfway point (100 pages), max included was Page ${maxIncluded}`);
  });
});

test('extractChunksFromFile dispatch', async (t) => {
  function tempPath(name) {
    return path.join(os.tmpdir(), `resourceTextExtraction-test-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
  }

  await t.test('an unreadable/corrupt file never throws — it reports extractionFailed and empty chunks', async () => {
    const file = tempPath('corrupt.pptx');
    fs.writeFileSync(file, 'not actually a zip file');
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const result = await extractChunksFromFile(file, 'pptx');
    assert.deepEqual(result.chunks, []);
    assert.equal(result.extractionFailed, true);
  });

  await t.test('an unknown/unsupported type returns empty chunks without touching the filesystem oddly', async () => {
    const result = await extractChunksFromFile('/does/not/matter', 'link');
    assert.deepEqual(result.chunks, []);
  });

  await t.test('type "docx" on a genuine zip uses the zip reader', async () => {
    const zw = new ZipWriter();
    zw.addFile('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Real docx text</w:t></w:r></w:p></w:body></w:document>');
    const file = tempPath('real.docx');
    fs.writeFileSync(file, zw.toBuffer());
    t.after(() => fs.promises.unlink(file).catch(() => {}));

    const { chunks } = await extractChunksFromFile(file, 'docx');
    assert.match(chunks.map((c) => c.text).join('\n'), /Real docx text/);
  });
});

test('getResourceChunks caches per resourceId', async (t) => {
  t.beforeEach(() => resourceTextCache.clear());

  await t.test('a second call for the same resource does not re-read the file', async () => {
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    const fileName = `cache-test-${Date.now()}.pptx`;
    const absolutePath = path.join(UPLOADS_DIR, fileName);

    const zw = new ZipWriter();
    zw.addFile('ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Cached slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
    fs.writeFileSync(absolutePath, zw.toBuffer());

    const resource = { id: 987654321, type: 'pptx', file_path: `/resources/${fileName}` };

    const first = await getResourceChunks(resource);
    assert.match(first.map((c) => c.text).join(), /Cached slide/);

    // Delete the underlying file — if the second call hit the cache instead
    // of re-reading, it still succeeds; if it tried to re-read, it would fail.
    await fs.promises.unlink(absolutePath);

    const second = await getResourceChunks(resource);
    assert.deepEqual(second, first);
  });
});

test('NO_READABLE_TEXT_MESSAGE', () => {
  assert.match(NO_READABLE_TEXT_MESSAGE, /couldn't read text/i);
  assert.match(NO_READABLE_TEXT_MESSAGE, /scanned images/i);
});
