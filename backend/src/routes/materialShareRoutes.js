const express = require('express');
const controller = require('../controllers/materialShareController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { shareCheckRateLimiter } = require('../middlewares/shareCheckRateLimiter');
const { materialParamsValidator, createShareValidator, shareTokenValidator, checkAnswersValidator } = require('../validators/materialShareValidator');

// /api/materials/:type/:id/share — owner-only, authenticated.
const materialsRouter = express.Router();
materialsRouter.get('/:type/:id/share', authenticate, materialParamsValidator, validateRequest, controller.status);
materialsRouter.post('/:type/:id/share', authenticate, createShareValidator, validateRequest, controller.create);
materialsRouter.delete('/:type/:id/share', authenticate, materialParamsValidator, validateRequest, controller.revoke);

// /api/share/:token — the read-only view is PUBLIC (unlisted link); copy needs auth.
const shareRouter = express.Router();
shareRouter.get('/:token', shareTokenValidator, validateRequest, controller.view);
shareRouter.post('/:token/copy', authenticate, shareTokenValidator, validateRequest, controller.copy);
// Grading a shared quiz is PUBLIC and stateless — no `authenticate` here on
// purpose, so a visitor never needs an account and a logged-in user's token
// (if sent) is simply never inspected.
shareRouter.post('/:token/check', shareCheckRateLimiter, checkAnswersValidator, validateRequest, controller.check);

module.exports = { materialsRouter, shareRouter };
