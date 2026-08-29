const ApiError = require('../utils/ApiError');
const plannerModel = require('../models/plannerModel');
const learningModel = require('../models/learningModel');
const { notifyUser } = require('../utils/notify');
const { logActivity } = require('../utils/gamification');

async function assertSubjectOwnership(userId, subjectId) {
  if (!subjectId) return;
  const owned = await learningModel.subjectBelongsToUser(subjectId, userId);
  if (!owned) {
    throw new ApiError(400, 'That course could not be found.');
  }
}

const DEADLINE_REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

function decorateTask(task) {
  const now = new Date();
  const deadline = task.deadline ? new Date(task.deadline) : null;
  const isOverdue = Boolean(deadline) && deadline < now && task.status !== 'completed';
  const isToday = Boolean(deadline) && deadline.toDateString() === now.toDateString();

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    deadline: task.deadline,
    status: task.status,
    completed_at: task.completed_at,
    priority_id: task.priority_id,
    priority: { id: task.priority_id, label: task.priority_label },
    priority_label: task.priority_label,
    color: task.color,
    notes: task.notes,
    repeat_interval: task.repeat_interval,
    remind_me: Boolean(task.remind_me),
    difficulty: task.difficulty,
    estimated_minutes: task.estimated_minutes,
    subject_id: task.subject_id,
    subject_name: task.subject_name,
    overdue_notified: Boolean(task.overdue_notified),
    is_overdue: isOverdue,
    is_today: isToday,
  };
}

function buildCalendarSummary(tasks) {
  const days = [];
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateStr = day.toISOString().slice(0, 10);
    const count = tasks.filter((task) => task.deadline && new Date(task.deadline).toISOString().slice(0, 10) === dateStr).length;
    days.push({ date: dateStr, count });
  }

  return days;
}

async function notifyOverdueTasks(userId, tasks) {
  const newlyOverdue = tasks.filter((task) => task.is_overdue && !task.overdue_notified);

  for (const task of newlyOverdue) {
    await notifyUser(userId, {
      type: 'reminder',
      title: 'Task overdue',
      body: `"${task.title}" was due and is now overdue. Update it or mark it complete.`,
    });
    await plannerModel.markOverdueNotified(task.id);
    task.overdue_notified = true;
  }
}

async function listTasks(userId) {
  const [rawTasks, priorities] = await Promise.all([
    plannerModel.listTasksForUser(userId),
    plannerModel.listPriorities(),
  ]);

  const tasks = rawTasks.map(decorateTask);
  await notifyOverdueTasks(userId, tasks);

  return {
    tasks,
    priorities,
    calendarSummary: buildCalendarSummary(tasks),
  };
}

async function createTask(userId, payload) {
  await assertSubjectOwnership(userId, payload.subjectId);
  const taskId = await plannerModel.createTask(userId, payload);

  if (payload.deadline) {
    const deadline = new Date(payload.deadline);
    const msUntilDue = deadline.getTime() - Date.now();
    if (msUntilDue > 0 && msUntilDue <= DEADLINE_REMINDER_WINDOW_MS) {
      await notifyUser(userId, {
        type: 'reminder',
        title: 'Task due soon',
        body: `"${payload.title}" is due soon. Don't forget to prepare.`,
      });
    }
  }

  const task = await plannerModel.getTaskForUser(taskId, userId);
  const priorities = await plannerModel.listPriorities();
  const priority = priorities.find((item) => item.id === task.priority_id);

  return decorateTask({ ...task, priority_label: priority?.label });
}

async function updateTask(userId, taskId, updates) {
  const existing = await plannerModel.getTaskForUser(Number(taskId), userId);
  if (!existing) {
    throw new ApiError(404, 'Task not found.');
  }

  const fields = {};
  if (updates.title !== undefined) fields.title = updates.title;
  if (updates.description !== undefined) fields.description = updates.description;
  if (updates.deadline !== undefined) fields.deadline = updates.deadline;
  if (updates.priorityId !== undefined) fields.priority_id = updates.priorityId;

  if (updates.color !== undefined) fields.color = updates.color;
  if (updates.notes !== undefined) fields.notes = updates.notes;
  if (updates.repeatInterval !== undefined) fields.repeat_interval = updates.repeatInterval;
  if (updates.remindMe !== undefined) fields.remind_me = updates.remindMe ? 1 : 0;
  if (updates.difficulty !== undefined) fields.difficulty = updates.difficulty;
  if (updates.estimatedMinutes !== undefined) fields.estimated_minutes = updates.estimatedMinutes;
  if (updates.subjectId !== undefined) {
    await assertSubjectOwnership(userId, updates.subjectId);
    fields.subject_id = updates.subjectId;
  }

  if (updates.status !== undefined && updates.status !== existing.status) {
    fields.status = updates.status;
    fields.completed_at = updates.status === 'completed' ? new Date() : null;
    if (updates.status !== 'completed') fields.overdue_notified = 0;
    await plannerModel.logStatusChange(existing.id, existing.status, updates.status);

    if (updates.status === 'completed') {
      await logActivity(userId, 'task_completed', existing.id, `Completed task: ${existing.title}`);
    }
  }

  if (updates.deadline !== undefined && updates.deadline !== existing.deadline) {
    fields.overdue_notified = 0;
  }

  if (Object.keys(fields).length) {
    await plannerModel.updateTask(existing.id, fields);
  }

  const updated = await plannerModel.getTaskForUser(existing.id, userId);
  const priorities = await plannerModel.listPriorities();
  const priority = priorities.find((item) => item.id === updated.priority_id);

  return decorateTask({ ...updated, priority_label: priority?.label });
}

async function deleteTask(userId, taskId) {
  const affectedRows = await plannerModel.softDeleteTask(Number(taskId), userId);
  if (!affectedRows) {
    throw new ApiError(404, 'Task not found.');
  }
}

async function duplicateTask(userId, taskId) {
  const newTaskId = await plannerModel.duplicateTask(Number(taskId), userId);
  if (!newTaskId) {
    throw new ApiError(404, 'Task not found.');
  }

  const task = await plannerModel.getTaskForUser(newTaskId, userId);
  const priorities = await plannerModel.listPriorities();
  const priority = priorities.find((item) => item.id === task.priority_id);

  return decorateTask({ ...task, priority_label: priority?.label });
}

module.exports = {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  duplicateTask,
};
