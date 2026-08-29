const express = require('express');
const authRoutes = require('./authRoutes');
const chatRoutes = require('./chatRoutes');
const adminChatRoutes = require('./adminChatRoutes');
const adminFeedbackRoutes = require('./adminFeedbackRoutes');
const adminRoutes = require('./adminRoutes');
const aiStudyToolsRoutes = require('./aiStudyToolsRoutes');
const { subjectsRouter, lessonsRouter } = require('./learningRoutes');
const resourceRoutes = require('./resourceRoutes');
const quizRoutes = require('./quizRoutes');
const plannerRoutes = require('./plannerRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const notificationRoutes = require('./notificationRoutes');
const profileRoutes = require('./profileRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const feedbackRoutes = require('./feedbackRoutes');
const { createScaffoldRouter } = require('./scaffoldRoutes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/admin/chat-sessions', adminChatRoutes);
router.use('/admin/feedback', adminFeedbackRoutes);
router.use('/admin', adminRoutes);
router.use('/ai/study-tools', aiStudyToolsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/subjects', subjectsRouter);
router.use('/lessons', lessonsRouter);
router.use('/resources', resourceRoutes);
router.use('/quizzes', quizRoutes);
router.use('/study-tasks', plannerRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/users/me', profileRoutes);
router.use('/users', createScaffoldRouter('Users'));
router.use('/feedback', feedbackRoutes);

module.exports = router;
