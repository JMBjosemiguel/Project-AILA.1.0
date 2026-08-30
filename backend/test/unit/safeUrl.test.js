'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { assertFetchableExternalUrl, isPrivateAddress } = require('../../src/utils/safeUrl');

test('isPrivateAddress flags loopback / private / link-local / reserved', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.255',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fe80::1', 'fd00::1',
    '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, `${ip} should be private`);
  }
});

test('isPrivateAddress allows normal public addresses', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} should be public`);
  }
});

test('assertFetchableExternalUrl rejects SSRF-style targets', async () => {
  const blocked = [
    'http://localhost/x',
    'http://127.0.0.1:5000/api',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.1.2.3/',
    'http://192.168.0.1/',
    'http://172.16.5.5/',
    'http://[::1]/',
    'ftp://example.com/x',
    'file:///etc/passwd',
    'http://router/',
    'https://user:pass@example.com/',
    'http://foo.local/',
    'http://svc.internal/',
  ];
  for (const url of blocked) {
    await assert.rejects(() => assertFetchableExternalUrl(url), (err) => err.statusCode === 400, `expected ${url} to be rejected`);
  }
});

test('assertFetchableExternalUrl allows ordinary public https links', async () => {
  for (const url of [
    'https://example.com/page',
    'http://example.org/a/b?x=1',
    'https://en.wikipedia.org/wiki/Server-side_request_forgery',
  ]) {
    await assert.doesNotReject(() => assertFetchableExternalUrl(url), `expected ${url} to be allowed`);
  }
});
