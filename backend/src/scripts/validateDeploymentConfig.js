require('dotenv').config({ quiet: true });

const REQUIRED_ALWAYS = [
  'NODE_ENV',
  'APP_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET',
  'GEMINI_API_KEY',
  'STORAGE_DRIVER',
];

const REQUIRED_R2 = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
];

const REQUIRED_SMTP = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'EMAIL_FROM',
];

function isMissing(key) {
  return !process.env[key] || process.env[key].trim() === '';
}

function fail(message) {
  console.error(`Deployment config error: ${message}`);
  process.exitCode = 1;
}

for (const key of REQUIRED_ALWAYS) {
  if (isMissing(key)) fail(`${key} is required.`);
}

if (process.env.NODE_ENV !== 'production') {
  fail('NODE_ENV must be production for a cloud deployment.');
}

if (!/^https:\/\//.test(process.env.APP_URL || '')) {
  fail('APP_URL must be an HTTPS frontend origin.');
}

if (!Number.isInteger(Number(process.env.DB_PORT))) {
  fail('DB_PORT must be a number.');
}

if ((process.env.JWT_SECRET || '').length < 32) {
  fail('JWT_SECRET should be at least 32 characters.');
}

// APP_TIMEZONE is optional (defaults to UTC) but a typo would silently mean UTC,
// which the deployer did not intend — so reject an unknown IANA name.
if (!isMissing('APP_TIMEZONE')) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE });
  } catch {
    fail('APP_TIMEZONE must be a valid IANA timezone name (e.g. Asia/Manila), or unset for UTC.');
  }
}

if (process.env.STORAGE_DRIVER === 'r2') {
  for (const key of REQUIRED_R2) {
    if (isMissing(key)) fail(`${key} is required when STORAGE_DRIVER=r2.`);
  }
  // R2_ENDPOINT is optional (it can be derived from R2_ACCOUNT_ID), but when
  // set it must be a bare https origin — a path, bucket, query or wrong scheme
  // breaks SigV4 host matching and every upload then fails with a 403.
  if (!isMissing('R2_ENDPOINT')) {
    try {
      const url = new URL(process.env.R2_ENDPOINT);
      if (url.protocol !== 'https:' || url.search || url.pathname.replace(/\/+$/, '') !== '') {
        fail('R2_ENDPOINT must be a bare https:// origin (no path, bucket, or query string).');
      }
    } catch {
      fail('R2_ENDPOINT must be a valid https:// URL.');
    }
  }
} else if (process.env.STORAGE_DRIVER !== 'local') {
  fail('STORAGE_DRIVER must be either local or r2.');
}

if (process.env.STORAGE_DRIVER === 'r2' && process.env.DB_SSL !== 'true') {
  fail('DB_SSL=true is recommended for the Render + Aiven production deployment.');
}

// EMAIL_DRIVER is optional (defaults to 'console', the dev-safe no-op driver).
// A production deployment left on 'console' never actually sends verification
// email, so it's allowed but not required to be 'smtp' — only validate that
// whichever value is set is one we recognise, and that 'smtp' carries the vars
// it needs.
const emailDriver = (process.env.EMAIL_DRIVER || 'console').toLowerCase();
if (!['console', 'smtp'].includes(emailDriver)) {
  fail('EMAIL_DRIVER must be either console or smtp.');
} else if (emailDriver === 'smtp') {
  for (const key of REQUIRED_SMTP) {
    if (isMissing(key)) fail(`${key} is required when EMAIL_DRIVER=smtp.`);
  }
  if (!isMissing('SMTP_PORT') && !Number.isInteger(Number(process.env.SMTP_PORT))) {
    fail('SMTP_PORT must be a number.');
  }
  if (!isMissing('SMTP_TIMEOUT_MS') && !Number.isInteger(Number(process.env.SMTP_TIMEOUT_MS))) {
    fail('SMTP_TIMEOUT_MS must be a number.');
  }
}

if (!process.exitCode) {
  console.log('Deployment config validation passed.');
}
