'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SHOW_GAMIFICATION_TO_STUDENTS, isStudyMilestone, isLevelNotification, studentNotifications,
} = require('../../src/utils/studentGamification');
const features = require('../../src/constants/studentFeatures.json');

const notifications = [
  { id: 1, type: 'system', title: 'Level up!', body: 'You reached Level 2. Keep up the momentum.', is_read: 0 },
  { id: 2, type: 'system', title: 'Progress: Level 3 reached', body: 'Your lessons, quizzes and tasks brought you to Level 3.', is_read: 0 },
  { id: 3, type: 'system', title: 'Achievement unlocked', body: 'You earned "Rising Scholar" — Reach Level 5.', is_read: 0 },
  { id: 4, type: 'system', title: 'Achievement earned', body: 'You earned "First Steps" — Complete your first lesson.', is_read: 0 },
  { id: 5, type: 'system', title: 'Lesson completed', body: 'You completed "Cells". +10 XP earned.', is_read: 1 },
  { id: 6, type: 'system', title: 'Quiz scored', body: 'You scored 3/4 on the "Cells" quiz.', is_read: 0 },
  { id: 7, type: 'announcement', title: 'Level up!', body: 'Study workshop on Friday. +10 XP earned.', is_read: 0 },
];

test('gamification is hidden from students by default (one shared config constant)', () => {
  assert.equal(features.showGamificationToStudents, false);
  assert.equal(SHOW_GAMIFICATION_TO_STUDENTS, false);
});

test('only XP/level achievements are left out of study milestones', () => {
  assert.equal(isStudyMilestone({ category: 'level' }), false);
  for (const category of ['learning', 'course', 'streak']) assert.equal(isStudyMilestone({ category }), true);
});

test('level notifications are recognised by their stored titles, old and new', () => {
  assert.deepEqual(notifications.filter(isLevelNotification).map((n) => n.id), [1, 2, 3]);
});

test('hidden: level notifications removed, XP text dropped, achievements read as study milestones', () => {
  const visible = studentNotifications(notifications, false);
  assert.deepEqual(visible.map((n) => n.id), [4, 5, 6, 7]);
  assert.equal(visible.find((n) => n.id === 4).title, 'Study milestone reached');
  assert.equal(visible.find((n) => n.id === 5).body, 'You completed "Cells".');
  assert.deepEqual(visible.find((n) => n.id === 7), notifications[6], 'an announcement is never touched');
  // Stored rows are not modified.
  assert.equal(notifications[4].body, 'You completed "Cells". +10 XP earned.');
  assert.equal(notifications[3].title, 'Achievement earned');
});

test('shown: the list is returned exactly as stored', () => {
  assert.equal(studentNotifications(notifications, true), notifications);
});
