// In-memory, size-capped cache of extracted chunks per resource. Deliberately
// NOT persisted (no schema change, no DB column, no temp file that survives a
// restart) — it only exists so several Ask AILA / Generate Quiz calls about
// the same resource in a short span don't each re-read and re-parse the file.
// A resource's underlying file is immutable once uploaded (editing a resource
// only changes its title/metadata — see EditResourceDialog), so there is no
// staleness concern to key around, only a memory budget.
const MAX_CACHE_CHARS = 20 * 1024 * 1024; // ~20 MB of extracted text across all cached resources
const MAX_ENTRIES = 100;

const cache = new Map(); // resourceId -> { chunks, totalChars }

function totalCachedChars() {
  let sum = 0;
  for (const entry of cache.values()) sum += entry.totalChars;
  return sum;
}

function evictOldestUntilFits(incomingChars) {
  const oldestFirst = [...cache.keys()];
  for (const key of oldestFirst) {
    if (totalCachedChars() + incomingChars <= MAX_CACHE_CHARS && cache.size < MAX_ENTRIES) break;
    cache.delete(key);
  }
}

function get(resourceId) {
  const entry = cache.get(resourceId);
  if (!entry) return null;
  // Re-insert so Map iteration order reflects recency (simple LRU via
  // insertion order, same trick as the common Map-based LRU pattern).
  cache.delete(resourceId);
  cache.set(resourceId, entry);
  return entry.chunks;
}

function set(resourceId, chunks) {
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  cache.delete(resourceId);
  evictOldestUntilFits(totalChars);
  cache.set(resourceId, { chunks, totalChars });
}

function clear() {
  cache.clear();
}

module.exports = { get, set, clear, MAX_CACHE_CHARS };
