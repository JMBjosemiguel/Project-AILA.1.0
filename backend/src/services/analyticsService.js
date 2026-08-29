const analyticsModel = require('../models/analyticsModel');
const quizModel = require('../models/quizModel');
const { query } = require('../config/database');
const { weekdayLabel } = require('../utils/dateLabels');

const USAGE_COLORS = { text: '#2563EB', quiz: '#7C3AED', flashcards: '#059669' };
const USAGE_LABELS = { text: 'Chat', quiz: 'Quizzes', flashcards: 'Flashcards' };
const RESOURCE_TYPE_COLORS = { pdf: '#EF4444', doc: '#2563EB', pptx: '#F97316', video: '#8B5CF6', link: '#0EA5E9', image: '#0D9488' };

async function getProfileStats(userId) {
  const rows = await query(
    'SELECT xp_points, level FROM user_profiles WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || { xp_points: 0, level: 1 };
}

async function getStreak(userId) {
  const rows = await query(
    'SELECT current_streak, longest_streak FROM learning_streaks WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || { current_streak: 0, longest_streak: 0 };
}

async function getSummary(userId) {
  const [
    completion,
    studyHoursRaw,
    masteryRaw,
    usageRaw,
    trendRaw,
    strongTopics,
    weakTopics,
    quizAverage,
    profile,
    streak,
    xpOverTimeRaw,
    resourceUsageRaw,
  ] = await Promise.all([
    analyticsModel.getCompletionCounts(userId),
    analyticsModel.getStudyHoursThisWeek(userId),
    analyticsModel.getMasteryBySubject(userId),
    analyticsModel.getChatUsageBreakdown(userId),
    analyticsModel.getQuizPerformanceTrend(userId),
    analyticsModel.getTopicMasteryList(userId, 'desc'),
    analyticsModel.getTopicMasteryList(userId, 'asc'),
    quizModel.getQuizAverageScore(userId),
    getProfileStats(userId),
    getStreak(userId),
    analyticsModel.getXpOverTime(userId),
    analyticsModel.getResourceUsage(userId),
  ]);

  const kpis = [
    { label: 'Completed Lessons', value: String(completion.completed_lessons), trend: 'up' },
    { label: 'Avg Quiz Score', value: quizAverage.avg_percent != null ? `${quizAverage.avg_percent}%` : '--', trend: 'neutral' },
    { label: 'Study Streak', value: `${streak.current_streak} days`, trend: streak.current_streak > 0 ? 'up' : 'neutral' },
    { label: 'XP / Level', value: `${profile.xp_points} XP`, delta: `Lv. ${profile.level}`, trend: 'up' },
  ];

  const studyHours = studyHoursRaw.map((row) => ({
    day: weekdayLabel(row.date),
    hours: Number(row.hours),
  }));

  const mastery = masteryRaw.map((row, index) => ({
    subject: row.name,
    pct: Number(row.pct) || 0,
    color: ['#2563EB', '#7C3AED', '#059669', '#DB2777', '#D97706', '#0891B2'][index % 6],
  }));

  const totalUsage = usageRaw.reduce((sum, row) => sum + row.count, 0);
  const chatbotUsage = totalUsage
    ? usageRaw.map((row) => ({
        label: USAGE_LABELS[row.message_type] || row.message_type,
        pct: Math.round((row.count / totalUsage) * 100),
        color: USAGE_COLORS[row.message_type] || '#64748B',
      }))
    : [];

  const performanceTrend = trendRaw.map((row) => ({
    date: row.date,
    value: Number(row.avg_percent) || 0,
  }));

  const xpOverTime = xpOverTimeRaw.map((row) => ({
    date: row.date,
    value: Number(row.xp) || 0,
  }));

  const totalResourceViews = resourceUsageRaw.reduce((sum, row) => sum + row.count, 0);
  const resourceUsage = totalResourceViews
    ? resourceUsageRaw.map((row) => ({
        label: row.type,
        pct: Math.round((row.count / totalResourceViews) * 100),
        color: RESOURCE_TYPE_COLORS[row.type] || '#64748B',
      }))
    : [];

  return {
    kpis,
    studyHours,
    mastery,
    chatbotUsage,
    performanceTrend,
    xpOverTime,
    resourceUsage,
    strongTopics,
    weakTopics,
    completedSubjects: completion.completed_subjects,
    completedTopics: completion.completed_topics,
  };
}

module.exports = {
  getSummary,
};
