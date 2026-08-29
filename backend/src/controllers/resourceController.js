const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const resourceService = require('../services/resourceService');
const { resourceTypeForMimetype } = require('../middlewares/uploadResourceFile');

const listResources = asyncHandler(async (req, res) => {
  const { search = '', type = 'all', sort = 'title' } = req.query;
  const result = await resourceService.listResources(req.auth.user.id, { search, type, sort });
  sendSuccess(res, result, 200, 'Resources retrieved.');
});

const logView = asyncHandler(async (req, res) => {
  const result = await resourceService.logView(req.auth.user.id, req.params.resourceId);
  sendSuccess(res, result, 200, 'View logged.');
});

const upload = asyncHandler(async (req, res) => {
  const subjectId = req.body.subject_id ? Number(req.body.subject_id) : null;
  const type = resourceTypeForMimetype(req.file?.mimetype);
  const result = await resourceService.uploadResource(req.auth.user.id, req.file, type, { subjectId });
  sendSuccess(res, result, 201, 'Resource uploaded and processed.');
});

const addLink = asyncHandler(async (req, res) => {
  const { url, title } = req.body;
  const subjectId = req.body.subject_id ? Number(req.body.subject_id) : null;
  const result = await resourceService.addLinkResource(req.auth.user.id, { url, title, subjectId });
  sendSuccess(res, result, 201, 'Link added and processed.');
});

function sendStoredFile(res, storedFile) {
  res.setHeader('Content-Type', storedFile.contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(storedFile.fileName)}"`);
  if (storedFile.contentLength) {
    res.setHeader('Content-Length', storedFile.contentLength);
  }
  storedFile.stream.pipe(res);
}

const download = asyncHandler(async (req, res) => {
  const storedFile = await resourceService.prepareDownload(req.auth.user.id, req.params.resourceId);
  sendStoredFile(res, storedFile);
});

const update = asyncHandler(async (req, res) => {
  const { title } = req.body;
  const subjectId = req.body.subject_id !== undefined ? (req.body.subject_id ? Number(req.body.subject_id) : null) : undefined;
  const result = await resourceService.updateResource(req.auth.user.id, req.params.resourceId, { title, subjectId });
  sendSuccess(res, result, 200, 'Resource updated.');
});

const remove = asyncHandler(async (req, res) => {
  await resourceService.deleteResource(req.auth.user.id, req.params.resourceId);
  sendSuccess(res, null, 200, 'Resource deleted.');
});

module.exports = {
  listResources,
  upload,
  addLink,
  logView,
  download,
  update,
  remove,
  sendStoredFile,
};
