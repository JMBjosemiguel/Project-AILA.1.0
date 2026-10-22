const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const materialShareService = require('../services/materialShareService');

// GET /api/materials/:type/:id/share  — owner: current share status
const status = asyncHandler(async (req, res) => {
  const data = await materialShareService.getShareStatus(req.auth.user.id, req.params.type, req.params.id);
  sendSuccess(res, data, 200, 'Share status retrieved.');
});

// POST /api/materials/:type/:id/share — owner: create (or replace) the link
const create = asyncHandler(async (req, res) => {
  const data = await materialShareService.createShare(req.auth.user.id, req.params.type, req.params.id, req.body.visibility || 'unlisted');
  sendSuccess(res, data, 201, 'Share link created.');
});

// DELETE /api/materials/:type/:id/share — owner: revoke
const revoke = asyncHandler(async (req, res) => {
  const data = await materialShareService.revokeShare(req.auth.user.id, req.params.type, req.params.id);
  sendSuccess(res, data, 200, 'Share link revoked.');
});

// GET /api/share/:token — PUBLIC read-only view
const view = asyncHandler(async (req, res) => {
  const data = await materialShareService.viewSharedMaterial(req.params.token);
  sendSuccess(res, data, 200, 'Shared material retrieved.');
});

// POST /api/share/:token/copy — authenticated recipient: copy into my materials
const copy = asyncHandler(async (req, res) => {
  const data = await materialShareService.copySharedMaterial(req.auth.user.id, req.params.token);
  sendSuccess(res, data, 201, 'Copied to your materials.');
});

// POST /api/share/:token/check — PUBLIC, stateless: grade answers to a shared
// quiz without creating an attempt or recording anything. Never authenticated
// (no `authenticate` on this route — see materialShareRoutes.js), so any
// Authorization header sent is simply never read.
const check = asyncHandler(async (req, res) => {
  const data = await materialShareService.checkSharedQuizAnswers(req.params.token, req.body.answers);
  sendSuccess(res, data, 200, 'Answers checked.');
});

module.exports = { status, create, revoke, view, copy, check };
