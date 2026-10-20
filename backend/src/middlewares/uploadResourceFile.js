const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { isR2Enabled, UPLOADS_DIR } = require('../services/storageService');

const MAX_FILE_SIZE = 200 * 1024 * 1024;

const MIME_TO_TYPE = {
  'application/pdf': 'pdf',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
};

function resourceTypeForMimetype(mimetype) {
  return MIME_TO_TYPE[mimetype] || null;
}

function uniqueFileName(originalname) {
  const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return `${unique}${path.extname(originalname).toLowerCase()}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, uniqueFileName(file.originalname)),
});

// Even when R2 is the final destination, a file never sits fully in RAM: it
// streams straight to this OS temp file (multer writes it incrementally as
// it arrives), and storageService streams that temp file on to R2 and
// deletes it afterward — a 200 MB upload never costs more than a few MB of
// buffering at any point, which matters a lot on a 512 MB server.
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => cb(null, uniqueFileName(file.originalname)),
});

function fileFilter(req, file, cb) {
  if (!MIME_TO_TYPE[file.mimetype]) {
    cb(new ApiError(400, 'That file type is not supported. Please upload a PDF, DOC, DOCX, PPT, PPTX, or image file.'));
    return;
  }
  cb(null, true);
}

const runUpload = multer({
  storage: isR2Enabled() ? tempStorage : storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

// Translate multer's own errors (e.g. file-too-large) into friendly 400s so the
// student sees a useful message instead of a generic 500.
function uploadResourceFile(req, res, next) {
  runUpload(req, res, (err) => {
    // Guaranteed cleanup of the R2 temp file no matter what happens next in
    // the chain (ownership check, DB error, successful upload — all paths
    // end in the response finishing or the connection closing). storageService
    // already deletes it right after a successful R2 PUT; this is the
    // catch-all for every other path, so unlink-ing an already-gone file here
    // is the expected common case, not an error.
    if (req.file && isR2Enabled()) {
      const tempPath = req.file.path;
      const cleanup = () => fs.unlink(tempPath, () => {});
      res.once('finish', cleanup);
      res.once('close', cleanup);
    }

    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, `That file is too large. The maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`));
      }
      return next(new ApiError(400, 'That file could not be uploaded. Please try a different file.'));
    }
    return next(err); // ApiError from fileFilter, or anything unexpected
  });
}

module.exports = { uploadResourceFile, resourceTypeForMimetype, UPLOADS_DIR, MAX_FILE_SIZE };
