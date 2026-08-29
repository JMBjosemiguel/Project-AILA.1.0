const express = require('express');
const profileController = require('../controllers/profileController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { updateProfileValidator, changePasswordValidator } = require('../validators/profileValidator');

const router = express.Router();

router.get('/profile', authenticate, profileController.getProfile);
router.patch('/profile', authenticate, updateProfileValidator, validateRequest, profileController.updateProfile);
router.patch('/password', authenticate, changePasswordValidator, validateRequest, profileController.changePassword);

module.exports = router;
