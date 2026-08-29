const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/http');
const plannerService = require('../services/plannerService');

const listTasks = asyncHandler(async (req, res) => {
  const result = await plannerService.listTasks(req.auth.user.id);
  sendSuccess(res, result, 200, 'Study tasks retrieved.');
});

const createTask = asyncHandler(async (req, res) => {
  const {
    title, description, deadline, priority_id: priorityId,
    color, notes, repeat_interval: repeatInterval, remind_me: remindMe,
    difficulty, estimated_minutes: estimatedMinutes, subject_id: subjectId,
  } = req.body;
  const task = await plannerService.createTask(req.auth.user.id, {
    title, description, deadline, priorityId, color, notes, repeatInterval, remindMe, difficulty, estimatedMinutes, subjectId,
  });
  sendSuccess(res, task, 201, 'Task created.');
});

const updateTask = asyncHandler(async (req, res) => {
  const {
    title, description, deadline, priority_id: priorityId, status,
    color, notes, repeat_interval: repeatInterval, remind_me: remindMe,
    difficulty, estimated_minutes: estimatedMinutes, subject_id: subjectId,
  } = req.body;
  const task = await plannerService.updateTask(req.auth.user.id, req.params.taskId, {
    title, description, deadline, priorityId, status, color, notes, repeatInterval, remindMe, difficulty, estimatedMinutes, subjectId,
  });
  sendSuccess(res, task, 200, 'Task updated.');
});

const deleteTask = asyncHandler(async (req, res) => {
  await plannerService.deleteTask(req.auth.user.id, req.params.taskId);
  sendSuccess(res, null, 200, 'Task deleted.');
});

const duplicateTask = asyncHandler(async (req, res) => {
  const task = await plannerService.duplicateTask(req.auth.user.id, req.params.taskId);
  sendSuccess(res, task, 201, 'Task duplicated.');
});

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  duplicateTask,
};
