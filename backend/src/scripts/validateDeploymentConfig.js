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

if (process.env.STORAGE_DRIVER === 'r2') {
  for (const key of REQUIRED_R2) {
    if (isMissing(key)) fail(`${key} is required when STORAGE_DRIVER=r2.`);
  }
} else if (process.env.STORAGE_DRIVER !== 'local') {
  fail('STORAGE_DRIVER must be either local or r2.');
}

if (process.env.STORAGE_DRIVER === 'r2' && process.env.DB_SSL !== 'true') {
  fail('DB_SSL=true is recommended for the Render + Aiven production deployment.');
}

if (!process.exitCode) {
  console.log('Deployment config validation passed.');
}
