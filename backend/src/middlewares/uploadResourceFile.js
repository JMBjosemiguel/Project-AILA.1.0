const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { isR2Enabled, UPLOADS_DIR } = require('../services/storageService');

const MAX_FILE_SIZE = 15 * 1024 * 1024;

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
  },
});

function fileFilter(req, file, cb) {
  if (!MIME_TO_TYPE[file.mimetype]) {
    cb(new ApiError(400, 'That file type is not supported. Please upload a PDF, DOC, DOCX, PPT, PPTX, or image file.'));
    return;
  }
  cb(null, true);
}

const uploadResourceFile = multer({
  storage: isR2Enabled() ? multer.memoryStorage() : storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('file');

module.exports = { uploadResourceFile, resourceTypeForMimetype, UPLOADS_DIR };
