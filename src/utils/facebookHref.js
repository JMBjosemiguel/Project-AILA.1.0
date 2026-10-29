// The profile's Facebook field is free text ("Name or facebook.com link").
// Returns a safe http(s) link when the value is a URL (or a bare
// facebook.com / fb.com address), otherwise null so it shows as plain text.
const BARE_FACEBOOK = /^(www\.|m\.|web\.)?(facebook\.com|fb\.com|fb\.me)\//i;

export function facebookHref(value) {
  const text = (value ?? '').toString().trim();
  if (!text || /\s/.test(text)) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : BARE_FACEBOOK.test(text) ? `https://${text}` : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
