// backend/routes/emergencyRequestRoutes.js
const express = require('express');
const router = express.Router();
const {
  createEmergencyRequest,
  getAllEmergencyRequests,
  getEmergencyRequestById,
  updateEmergencyRequest,
  deleteEmergencyRequest,
  approveEmergencyRequest,
  rejectEmergencyRequest
} = require('../controllers/emergencyRequestController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Who may raise/cancel requests, and who may decide on them
const canRequest = authorize('er_staff', 'manager', 'hospital_admin');
const canDecide = authorize('manager', 'hospital_admin');

// POST /api/emergency-requests - Create new emergency request (ER Staff)
router.post('/', protect, canRequest, createEmergencyRequest);

// GET /api/emergency-requests - Get all emergency requests (filtered by ward for managers)
router.get('/', protect, getAllEmergencyRequests);

// GET /api/emergency-requests/:id - Get single emergency request by ID
router.get('/:id', protect, getEmergencyRequestById);

// PATCH /api/emergency-requests/:id/approve - Approve request (Manager only)
router.patch('/:id/approve', protect, canDecide, approveEmergencyRequest);

// PATCH /api/emergency-requests/:id/reject - Reject request (Manager only)
router.patch('/:id/reject', protect, canDecide, rejectEmergencyRequest);

// PUT /api/emergency-requests/:id - Update emergency request
router.put('/:id', protect, canDecide, updateEmergencyRequest);

// DELETE /api/emergency-requests/:id - Delete emergency request
router.delete('/:id', protect, canRequest, deleteEmergencyRequest);

module.exports = router;
