'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const APPTIME_PATH = require.resolve('../../src/utils/appTime');
const EMAIL_SERVICE_PATH = require.resolve('../../src/services/emailService');

// emailService destructures appDateTimeStr/appTimeStr from appTime at require
// time, so both modules' caches must be cleared together to pick up a
// different APP_TIMEZONE — same reload pattern as appTime.test.js.
function loadWith(tz) {
  const prev = process.env.APP_TIMEZONE;
  if (tz === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = tz;
  delete require.cache[APPTIME_PATH];
  delete require.cache[EMAIL_SERVICE_PATH];
  const mod = require('../../src/services/emailService');
  if (prev === undefined) delete process.env.APP_TIMEZONE;
  else process.env.APP_TIMEZONE = prev;
  return mod;
}

test.after(() => {
  delete require.cache[APPTIME_PATH];
  delete require.cache[EMAIL_SERVICE_PATH];
  require('../../src/services/emailService');
});

test('buildVerificationEmail', async (t) => {
  await t.test('includes the send time in the body so a superseded link is distinguishable', () => {
    const { buildVerificationEmail } = loadWith('Asia/Manila');
    const sentAt = new Date('2026-10-14T13:41:00Z'); // 9:41 PM Asia/Manila (UTC+8)
    const { text, html } = buildVerificationEmail({ firstName: 'Ada', verifyUrl: 'https://example.com/verify?token=abc', sentAt });
    assert.match(text, /Sent .*9:41 PM/);
    assert.match(html, /Sent .*9:41 PM/);
  });

  await t.test('the subject is unique per send time, so Gmail threading does not hide the newest email', () => {
    const { buildVerificationEmail } = loadWith('Asia/Manila');
    const first = buildVerificationEmail({ firstName: 'Ada', verifyUrl: 'https://example.com/verify?token=a', sentAt: new Date('2026-10-14T13:41:00Z') });
    const second = buildVerificationEmail({ firstName: 'Ada', verifyUrl: 'https://example.com/verify?token=b', sentAt: new Date('2026-10-14T14:05:00Z') });
    assert.notEqual(first.subject, second.subject);
    assert.match(first.subject, /9:41 PM/);
    assert.match(second.subject, /10:05 PM/);
  });

  await t.test('still includes the verify link and the 30-minute expiry notice', () => {
    const { buildVerificationEmail } = loadWith('UTC');
    const { text, html } = buildVerificationEmail({ firstName: null, verifyUrl: 'https://example.com/verify?token=xyz' });
    assert.match(text, /https:\/\/example\.com\/verify\?token=xyz/);
    assert.match(html, /https:\/\/example\.com\/verify\?token=xyz/);
    assert.match(text, /30 minutes/);
  });
});
