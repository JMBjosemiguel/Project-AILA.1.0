const dns = require('dns').promises;
const net = require('net');

const ApiError = require('./ApiError');

const BLOCKED_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||            // "this" network
    a === 10 ||           // private
    a === 127 ||          // loopback
    (a === 169 && b === 254) ||             // link-local (incl. cloud metadata 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||    // private
    (a === 192 && b === 168) ||             // private
    (a === 100 && b >= 64 && b <= 127) ||   // carrier-grade NAT
    a >= 224                                // multicast / reserved
  );
}

function isPrivateIpv6(ip) {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true; // link-local / unique-local
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true;
}

const LINK_BLOCKED_MESSAGE = 'That link points to an address AILA can’t fetch. Use a public https:// URL.';

/**
 * Validate a user-supplied URL before the server fetches it, to blunt SSRF.
 * Rejects non-http(s) schemes, credentialed URLs, and hosts that are (or resolve
 * to) loopback / link-local / private / reserved addresses.
 */
async function assertFetchableExternalUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'Please provide a valid link (including https://).');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, LINK_BLOCKED_MESSAGE);
  }
  if (url.username || url.password) {
    throw new ApiError(400, LINK_BLOCKED_MESSAGE);
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new ApiError(400, LINK_BLOCKED_MESSAGE);
  }
  if (!hostname.includes('.') && !net.isIP(hostname)) {
    // bare single-label host (e.g. "router") — never a real public resource
    throw new ApiError(400, LINK_BLOCKED_MESSAGE);
  }
  if (net.isIP(hostname) && isPrivateAddress(hostname)) {
    throw new ApiError(400, LINK_BLOCKED_MESSAGE);
  }

  // Resolve the hostname and reject if any A/AAAA record is a private address.
  // Best-effort: if resolution itself fails, let the later fetch fail naturally.
  if (!net.isIP(hostname)) {
    let records = [];
    try {
      records = await dns.lookup(hostname, { all: true });
    } catch {
      return;
    }
    if (records.some((r) => isPrivateAddress(r.address))) {
      throw new ApiError(400, LINK_BLOCKED_MESSAGE);
    }
  }
}

module.exports = { assertFetchableExternalUrl, isPrivateAddress };
