const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { validateRequest } = require('../middlewares/validateRequest');
const {
  userIdParamValidator,
  resourceIdParamValidator,
  courseIdParamValidator,
  announcementIdParamValidator,
  updateAnnouncementValidator,
  setUserActiveValidator,
  announcementValidator,
  paginationQueryValidator,
  bulkResourceValidator,
} = require('../validators/adminValidator');

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/dashboard', adminController.getDashboardStats);
router.post('/announcements', announcementValidator, validateRequest, adminController.createAnnouncement);
router.get('/announcements/list', paginationQueryValidator, validateRequest, adminController.listAnnouncements);
router.patch('/announcements/:announcementId', announcementIdParamValidator, updateAnnouncementValidator, validateRequest, adminController.updateAnnouncement);
router.post('/announcements/:announcementId/archive', announcementIdParamValidator, validateRequest, adminController.archiveAnnouncement);
router.post('/announcements/:announcementId/unarchive', announcementIdParamValidator, validateRequest, adminController.unarchiveAnnouncement);
router.delete('/announcements/:announcementId', announcementIdParamValidator, validateRequest, adminController.deleteAnnouncement);

router.get('/users', paginationQueryValidator, validateRequest, adminController.listUsers);
router.get('/users/:userId', userIdParamValidator, validateRequest, adminController.getUserDetail);
router.patch('/users/:userId', userIdParamValidator, setUserActiveValidator, validateRequest, adminController.setUserActive);
router.delete('/users/:userId', userIdParamValidator, validateRequest, adminController.deleteUser);
router.post('/users/:userId/reset-progress', userIdParamValidator, validateRequest, adminController.resetUserProgress);

router.get('/resources', paginationQueryValidator, validateRequest, adminController.listResources);
router.post('/resources/bulk', bulkResourceValidator, validateRequest, adminController.bulkResourceAction);
router.get('/resources/:resourceId/download', resourceIdParamValidator, validateRequest, adminController.downloadResource);
router.delete('/resources/:resourceId', resourceIdParamValidator, validateRequest, adminController.deleteResource);
router.post('/resources/:resourceId/archive', resourceIdParamValidator, validateRequest, adminController.archiveResource);
router.post('/resources/:resourceId/unarchive', resourceIdParamValidator, validateRequest, adminController.unarchiveResource);

router.get('/learning', paginationQueryValidator, validateRequest, adminController.listCourses);
router.get('/learning/:courseId', courseIdParamValidator, validateRequest, adminController.getCourseDetail);
router.delete('/learning/:courseId', courseIdParamValidator, validateRequest, adminController.deleteCourse);
router.post('/learning/:courseId/archive', courseIdParamValidator, validateRequest, adminController.archiveCourse);
router.post('/learning/:courseId/unarchive', courseIdParamValidator, validateRequest, adminController.unarchiveCourse);

router.get('/analytics', adminController.getAnalytics);

router.get('/audit-log/export', adminController.exportAuditLog);
router.get('/audit-log', paginationQueryValidator, validateRequest, adminController.listAuditLog);

module.exports = router;
