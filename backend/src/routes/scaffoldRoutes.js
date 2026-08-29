const express = require('express');
const { createPlaceholderController } = require('../controllers/placeholderController');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');

function createScaffoldRouter(moduleName, options = {}) {
  const router = express.Router();
  const handler = createPlaceholderController(moduleName);
  const middlewares = [authenticate];

  if (options.roles?.length) {
    middlewares.push(authorize(...options.roles));
  }

  router.get('/', ...middlewares, handler);
  router.post('/', ...middlewares, handler);
  router.get('/:id', ...middlewares, handler);
  router.put('/:id', ...middlewares, handler);
  router.patch('/:id', ...middlewares, handler);
  router.delete('/:id', ...middlewares, handler);

  return router;
}

module.exports = {
  createScaffoldRouter,
};
