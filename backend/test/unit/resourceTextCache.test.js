'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CACHE_PATH = path.join(__dirname, '../../src/services/resourceTextCache.js');

function freshCache() {
  delete require.cache[require.resolve(CACHE_PATH)];
  return require(CACHE_PATH);
}

function chunksOfSize(totalChars) {
  return [{ label: 'Page 1', text: 'x'.repeat(totalChars) }];
}

test('resourceTextCache', async (t) => {
  await t.test('a miss returns null; a set then get returns the same chunks', () => {
    const cache = freshCache();
    assert.equal(cache.get(1), null);
    const chunks = [{ label: 'Page 1', text: 'hello' }];
    cache.set(1, chunks);
    assert.deepEqual(cache.get(1), chunks);
  });

  await t.test('is keyed independently per resourceId', () => {
    const cache = freshCache();
    cache.set(1, [{ label: 'A', text: 'one' }]);
    cache.set(2, [{ label: 'B', text: 'two' }]);
    assert.deepEqual(cache.get(1), [{ label: 'A', text: 'one' }]);
    assert.deepEqual(cache.get(2), [{ label: 'B', text: 'two' }]);
  });

  await t.test('evicts the oldest entries once the total cached character budget is exceeded', () => {
    const cache = freshCache();
    const chunkSize = Math.floor(cache.MAX_CACHE_CHARS / 3);

    cache.set(1, chunksOfSize(chunkSize));
    cache.set(2, chunksOfSize(chunkSize));
    cache.set(3, chunksOfSize(chunkSize));
    // All three fit (~MAX_CACHE_CHARS); a fourth should evict the oldest (1).
    cache.set(4, chunksOfSize(chunkSize));

    assert.equal(cache.get(1), null, 'oldest entry should have been evicted to stay under the budget');
    assert.notEqual(cache.get(4), null, 'newest entry must be present');
  });

  await t.test('re-getting an entry refreshes its recency (least-recently-used stays evictable)', () => {
    const cache = freshCache();
    const chunkSize = Math.floor(cache.MAX_CACHE_CHARS / 3);

    cache.set(1, chunksOfSize(chunkSize));
    cache.set(2, chunksOfSize(chunkSize));
    cache.get(1); // touch 1 so 2 becomes the least-recently-used
    cache.set(3, chunksOfSize(chunkSize));
    cache.set(4, chunksOfSize(chunkSize)); // forces an eviction

    assert.notEqual(cache.get(1), null, 'recently-touched entry should survive eviction');
  });

  await t.test('clear() empties the cache', () => {
    const cache = freshCache();
    cache.set(1, [{ label: 'A', text: 'x' }]);
    cache.clear();
    assert.equal(cache.get(1), null);
  });
});
