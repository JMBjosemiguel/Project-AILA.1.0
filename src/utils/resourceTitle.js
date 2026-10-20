import { RESOURCE_TYPE_LABELS } from '../constants/ui';
import { formatDate } from './formatDate';

// Matches a UUID with any separator (dash, underscore, space, or none) between
// its groups — some uploads land with dashes replaced by spaces, e.g.
// "644fbfd5 3d47 4b02 9dee 180cd51fc20f".
const UUID_LIKE = /^[0-9a-f]{8}[-_ ]?[0-9a-f]{4}[-_ ]?[0-9a-f]{4}[-_ ]?[0-9a-f]{4}[-_ ]?[0-9a-f]{12}$/i;
// A long run of hex characters with no separators at all (md5/sha-style hash).
const LONG_HEX_HASH = /^[0-9a-f]{20,}$/i;

// DISPLAY ONLY — never changes what's actually stored. A title that's really
// just a machine-generated id/hash isn't useful to a student, so this is
// purely cosmetic: rename/edit still shows and saves the real stored title.
export function isGeneratedIdTitle(title) {
  const trimmed = (title || '').trim();
  if (!trimmed) return false;
  if (UUID_LIKE.test(trimmed)) return true;
  const compact = trimmed.replace(/[-_ ]/g, '');
  return compact.length >= 20 && LONG_HEX_HASH.test(compact);
}

// "Image · Oct 13, 2026" — type + upload date, for a resource whose stored
// title is a generated id. Falls back to the real title otherwise.
export function displayResourceTitle(file) {
  if (!file || !isGeneratedIdTitle(file.title)) return file?.title ?? '';
  const typeLabel = RESOURCE_TYPE_LABELS[file.type] ?? (file.type || 'File');
  const date = formatDate(file.created_at);
  return date ? `${typeLabel} · ${date}` : typeLabel;
}
