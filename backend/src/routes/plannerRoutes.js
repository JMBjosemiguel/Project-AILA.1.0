const express = require('express');
const plannerController = require('../controllers/plannerController');
const { authenticate } = require('../middlewares/authenticate');
const { validateRequest } = require('../middlewares/validateRequest');
const { taskIdParamValidator, createTaskValidator, updateTaskValidator } = require('../validators/plannerValidator');

const router = express.Router();

router.get('/', authenticate, plannerController.listTasks);
router.post('/', authenticate, createTaskValidator, validateRequest, plannerController.createTask);
router.patch('/:taskId', authenticate, taskIdParamValidator, updateTaskValidator, validateRequest, plannerController.updateTask);
router.delete('/:taskId', authenticate, taskIdParamValidator, validateRequest, plannerController.deleteTask);
router.post('/:taskId/duplicate', authenticate, taskIdParamValidator, validateRequest, plannerController.duplicateTask);

module.exports = router;
