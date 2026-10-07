// backend/routes/bedRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAllBeds,
  getBedById,
  updateBedStatus,
  getOccupiedBeds,
  getOccupantHistory,
  getCleaningQueue,
  markCleaningComplete,
  updateDischargeTime,
  predictDischarge,
  predictCleaningDuration
} = require('../controllers/bedController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { canReadBeds, canUpdateBedStatus } = require('../middleware/roleGuards');
const {
  validateBedQuery,
  validateObjectId,
  validateUpdateBedStatus
} = require('../middleware/validators');

// Protected read routes (requires JWT authentication + role-based filtering)
router.get('/', protect, canReadBeds, validateBedQuery, getAllBeds);
router.get('/occupied', protect, authorize('manager', 'hospital_admin'), getOccupiedBeds); // Task 2.5: Get all occupied beds
router.get('/cleaning-queue', protect, authorize('manager', 'hospital_admin', 'ward_staff'), getCleaningQueue); // Task 2.5b: Get cleaning queue
router.get('/:id', protect, validateObjectId, getBedById);
router.get('/:id/occupant-history', protect, authorize('manager', 'hospital_admin'), getOccupantHistory); // Task 2.5: Get bed occupancy history

// Protected write routes (requires JWT authentication + role-based guards)
router.patch('/:id/status', protect, canUpdateBedStatus, validateUpdateBedStatus, updateBedStatus);
router.put('/:id/cleaning/mark-complete', protect, authorize('manager', 'hospital_admin', 'ward_staff'), markCleaningComplete); // Task 2.5b: Mark cleaning complete - ward staff can mark beds as clean
router.patch('/:id/discharge-time', protect, authorize('manager', 'hospital_admin'), updateDischargeTime); // Update estimated discharge time

// ML-powered prediction routes
router.post('/:id/predict-discharge', protect, authorize('manager', 'hospital_admin', 'ward_staff'), predictDischarge); // ML: Predict discharge time
router.post('/:id/predict-cleaning', protect, authorize('manager', 'hospital_admin', 'ward_staff'), predictCleaningDuration); // ML: Predict cleaning duration

module.exports = router;

