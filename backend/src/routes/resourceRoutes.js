const express = require('express');
const resourceController = require('../controllers/resourceController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { aiRateLimiter } = require('../middlewares/aiRateLimiter');
const { uploadResourceFile } = require('../middlewares/uploadResourceFile');
const { resourceIdParamValidator, listResourcesValidator, addLinkValidator, updateResourceValidator } = require('../validators/resourceValidator');

const router = express.Router();

router.get('/', authenticate, listResourcesValidator, validateRequest, resourceController.listResources);
router.post('/upload', authenticate, aiRateLimiter, uploadResourceFile, resourceController.upload);
router.post('/link', authenticate, aiRateLimiter, addLinkValidator, validateRequest, resourceController.addLink);
router.post('/:resourceId/view', authenticate, resourceIdParamValidator, validateRequest, resourceController.logView);
router.get('/:resourceId/download', authenticate, resourceIdParamValidator, validateRequest, resourceController.download);
router.patch('/:resourceId', authenticate, resourceIdParamValidator, updateResourceValidator, validateRequest, resourceController.update);
router.delete('/:resourceId', authenticate, resourceIdParamValidator, validateRequest, resourceController.remove);

module.exports = router;
