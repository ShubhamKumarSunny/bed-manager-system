// backend/routes/logRoutes.js
const express = require('express');
const router = express.Router();
const { getAllLogs, getBedLogs, getUserLogs } = require('../controllers/logsController');
const { protect } = require('../middleware/authMiddleware');

// All log routes require an authenticated user
router.use(protect);

router.get('/', getAllLogs);
router.get('/bed/:bedId', getBedLogs);
router.get('/user/:userId', getUserLogs);

module.exports = router;
