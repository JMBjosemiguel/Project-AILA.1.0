const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const ApiError = require('../utils/ApiError');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

const MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function getStorageDriver() {
  return (process.env.STORAGE_DRIVER || 'local').toLowerCase();
}

function isR2Enabled() {
  return getStorageDriver() === 'r2';
}

function encodePathSegments(value) {
  return value.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = (process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new ApiError(503, 'Resource storage is not configured. Please check the R2 environment variables.');
  }

  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function signR2Request({ method, key, body = Buffer.alloc(0), headers = {} }) {
  const { endpoint, accessKeyId, secretAccessKey, bucket } = getR2Config();
  const url = new URL(`${endpoint}/${bucket}/${encodePathSegments(key)}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = body.length ? hash(body) : EMPTY_SHA256;

  const signedHeadersMap = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(
      Object.entries(headers)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([name, value]) => [name.toLowerCase(), String(value)])
    ),
  };

  const signedHeaderNames = Object.keys(signedHeadersMap).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${signedHeadersMap[name].trim().replace(/\s+/g, ' ')}`)
    .join('\n');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), 'auto'), 's3'),
    'aws4_request'
  );
  const signature = hmac(signingKey, stringToSign, 'hex');

  return {
    url,
    headers: {
      ...headers,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function r2Request(method, key, { body, headers = {} } = {}) {
  const bodyBuffer = body ? Buffer.from(body) : Buffer.alloc(0);
  const signed = signR2Request({ method, key, body: bodyBuffer, headers });
  const response = await fetch(signed.url, {
    method,
    headers: signed.headers,
    ...(bodyBuffer.length ? { body: bodyBuffer } : {}),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiError(404, 'This file is not available in storage.');
    }
    throw new ApiError(502, 'Resource storage could not complete the request.');
  }

  return response;
}

function buildStoredFileName(originalName) {
  const extension = path.extname(originalName || '').toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
}

function buildR2ObjectKey(userId, originalName) {
  return `resources/user-${userId}/${buildStoredFileName(originalName)}`;
}

function keyFromStoredPath(filePath) {
  const value = String(filePath || '');
  if (value.startsWith('r2://')) return value.slice(5);
  if (value.startsWith('/resources/')) return `resources/legacy/${path.basename(value)}`;
  return value.replace(/^\/+/, '');
}

function fileNameFromStoredPath(filePath) {
  return path.basename(String(filePath || '').replace(/^r2:\/\//, '')) || 'download';
}

function contentTypeForName(fileName) {
  return MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

async function ensureUploadsDir() {
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
}

async function getUploadBuffer(file) {
  if (file.buffer) return file.buffer;
  if (file.path) return fs.promises.readFile(file.path);
  throw new ApiError(400, 'Uploaded file data is missing.');
}

async function storeResourceFile(userId, file) {
  const buffer = await getUploadBuffer(file);

  if (isR2Enabled()) {
    const key = buildR2ObjectKey(userId, file.originalname);
    await r2Request('PUT', key, {
      body: buffer,
      headers: {
        'content-type': file.mimetype || contentTypeForName(file.originalname),
      },
    });
    return { filePath: `r2://${key}`, buffer };
  }

  await ensureUploadsDir();
  if (file.path && file.filename) {
    return { filePath: `/resources/${file.filename}`, buffer };
  }

  const fileName = buildStoredFileName(file.originalname);
  await fs.promises.writeFile(path.join(UPLOADS_DIR, fileName), buffer);
  return { filePath: `/resources/${fileName}`, buffer };
}

async function getStoredFile(filePath) {
  const fileName = fileNameFromStoredPath(filePath);

  if (isR2Enabled()) {
    const response = await r2Request('GET', keyFromStoredPath(filePath));
    const webStream = response.body;
    return {
      fileName,
      contentType: response.headers.get('content-type') || contentTypeForName(fileName),
      contentLength: response.headers.get('content-length'),
      stream: Readable.fromWeb(webStream),
    };
  }

  const absolutePath = path.join(UPLOADS_DIR, path.basename(filePath));
  let stats;
  try {
    stats = await fs.promises.stat(absolutePath);
  } catch {
    throw new ApiError(404, 'This file is not available on the server yet.');
  }

  return {
    fileName,
    contentType: contentTypeForName(fileName),
    contentLength: stats.size,
    stream: fs.createReadStream(absolutePath),
  };
}

async function deleteStoredFile(filePath) {
  if (!filePath) return;

  if (isR2Enabled()) {
    try {
      await r2Request('DELETE', keyFromStoredPath(filePath));
    } catch (error) {
      if (error.statusCode !== 404) throw error;
    }
    return;
  }

  try {
    const absolutePath = path.join(UPLOADS_DIR, path.basename(filePath));
    await fs.promises.unlink(absolutePath);
  } catch {
    // Best-effort cleanup; the DB row is already soft-deleted regardless.
  }
}

module.exports = {
  UPLOADS_DIR,
  deleteStoredFile,
  getStoredFile,
  getStorageDriver,
  isR2Enabled,
  isTruthy,
  storeResourceFile,
};
