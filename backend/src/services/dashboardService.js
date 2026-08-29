const { query } = require('../config/database');
const learningModel = require('../models/learningModel');
const plannerModel = require('../models/plannerModel');
const quizModel = require('../models/quizModel');
const userModel = require('../models/userModel');
const resourceModel = require('../models/resourceModel');
const chatModel = require('../models/chatModel');
const { weekdayLabel } = require('../utils/dateLabels');
const { getStudentContext, buildRecommendation } = require('./studentContextService');

async function getWeeklyLessonCount(userId) {
  const rows = await query(
    "SELECT COUNT(*) AS count FROM lesson_progress WHERE user_id = ? AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)",
    [userId]
  );
  return rows[0]?.count ?? 0;
}

async function getStreak(userId) {
  const rows = await query(
    'SELECT current_streak, longest_streak FROM learning_streaks WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || { current_streak: 0, longest_streak: 0 };
}

async function getWeeklyActivity(userId) {
  const rows = await query(
    `
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM dashboard_activity_log
      WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    [userId]
  );
  return rows.map((row) => ({ day: weekdayLabel(row.date), count: row.count }));
}

function findLessonForTopic(subjects, topicId) {
  if (!topicId) return null;

  for (const subject of subjects) {
    for (const module_ of subject.modules) {
      const topic = module_.topics.find((item) => item.id === topicId);
      if (!topic) continue;

      const lesson = topic.lessons.find((item) => !item.completed) || topic.lessons[0];
      if (lesson) {
        return { lessonId: lesson.id, lessonTitle: lesson.title, topicTitle: topic.title, subjectName: subject.name };
      }
    }
  }
  return null;
}

function findContinueLearning(subjects) {
  for (const subject of subjects) {
    for (const module_ of subject.modules) {
      const inProgressTopic = module_.topics.find((topic) => topic.status === 'in_progress');
      const target = inProgressTopic || module_.topics.find((topic) => topic.status === 'not_started');
      if (!target) continue;

      const lesson = target.lessons.find((item) => !item.completed);
      if (lesson) {
        return {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          topicTitle: target.title,
          subjectName: subject.name,
        };
      }
    }
  }
  return null;
}

async function getSummary(userId) {
  const [
    subjects,
    plannerData,
    quizAverage,
    activities,
    streak,
    weeklyLessons,
    profileRow,
    recentConversations,
    recentQuizzes,
    recentlyOpenedResources,
    weeklyActivity,
    studentContext,
  ] = await Promise.all([
    learningModel.listSubjectsForUser(userId),
    plannerModel.listTasksForUser(userId),
    quizModel.getQuizAverageScore(userId),
    userModel.getRecentActivity(userId, 8),
    getStreak(userId),
    getWeeklyLessonCount(userId),
    userModel.findUserById(userId),
    chatModel.listConversationsForUser(userId),
    quizModel.listAttemptsForUser(userId, 3),
    resourceModel.listRecentlyOpened(userId, 3),
    getWeeklyActivity(userId),
    getStudentContext(userId),
  ]);

  const recommendation = buildRecommendation(studentContext);
  const recommendationLesson = findLessonForTopic(subjects, recommendation.topicId);

  const pendingTasks = plannerData.filter((task) => task.status !== 'completed');
  const upcomingDeadlines = pendingTasks
    .filter((task) => task.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 5)
    .map((task) => ({
      id: task.id,
      title: task.title,
      deadline: task.deadline,
      priority_label: task.priority_label,
    }));

  const courses = subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    code: subject.code,
    color: subject.color,
    tint: subject.tint,
    progress_percent: subject.progress_percent,
  }));

  const stats = [
    { label: 'Completed Lessons', value: String(weeklyLessons), delta: 'this week', trend: weeklyLessons > 0 ? 'up' : 'neutral' },
    { label: 'Study Streak', value: `${streak.current_streak}d`, trend: streak.current_streak > 0 ? 'up' : 'neutral' },
    { label: 'Pending Tasks', value: String(pendingTasks.length), trend: 'neutral' },
    { label: 'Avg Quiz Score', value: quizAverage.avg_percent != null ? `${quizAverage.avg_percent}%` : '--', trend: 'neutral' },
  ];

  return {
    profile: {
      first_name: profileRow.first_name,
      xp_points: profileRow.profile?.xp_points ?? 0,
      level: profileRow.profile?.level ?? 1,
    },
    stats,
    courses,
    activities,
    deadlines: upcomingDeadlines,
    streak,
    recentConversations: recentConversations.slice(0, 3),
    recentQuizzes,
    recentlyOpenedResources,
    weeklyActivity,
    continueLearning: findContinueLearning(subjects),
    recommendation: { ...recommendation, lessonId: recommendationLesson?.lessonId ?? null },
  };
}

module.exports = {
  getSummary,
};
