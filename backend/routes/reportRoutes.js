const express = require('express');
const router = express.Router();
const {
  generatePDFReport,
  generateCSVReport,
  emailReport,
  getReportHistory,
  downloadReport,
  deleteReport,
  getSchedules,
  updateSchedule,
  runScheduleNow
} = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Reports are for hospital administration and ward managers only
router.use(protect, authorize('hospital_admin', 'manager'));

// Report generation routes
router.post('/generate/pdf', generatePDFReport);
router.post('/generate/csv', generateCSVReport);
router.post('/email', emailReport);

// Report history routes
router.get('/history', getReportHistory);
router.get('/download/:fileName', downloadReport);
router.delete('/:fileName', deleteReport);

// Scheduled report routes
router.get('/schedules', getSchedules);
router.put('/schedules/:scheduleId', updateSchedule);
router.post('/schedules/:scheduleId/run', runScheduleNow);

module.exports = router;
