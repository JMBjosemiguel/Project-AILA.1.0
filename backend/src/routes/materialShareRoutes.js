const express = require('express');
const controller = require('../controllers/materialShareController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { materialParamsValidator, createShareValidator, shareTokenValidator } = require('../validators/materialShareValidator');

// /api/materials/:type/:id/share — owner-only, authenticated.
const materialsRouter = express.Router();
materialsRouter.get('/:type/:id/share', authenticate, materialParamsValidator, validateRequest, controller.status);
materialsRouter.post('/:type/:id/share', authenticate, createShareValidator, validateRequest, controller.create);
materialsRouter.delete('/:type/:id/share', authenticate, materialParamsValidator, validateRequest, controller.revoke);

// /api/share/:token — the read-only view is PUBLIC (unlisted link); copy needs auth.
const shareRouter = express.Router();
shareRouter.get('/:token', shareTokenValidator, validateRequest, controller.view);
shareRouter.post('/:token/copy', authenticate, shareTokenValidator, validateRequest, controller.copy);

module.exports = { materialsRouter, shareRouter };
