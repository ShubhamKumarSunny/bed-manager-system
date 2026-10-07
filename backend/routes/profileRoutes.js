// backend/routes/profileRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const { handleUploadError } = upload;
const {
  getProfile,
  updateProfile,
  deleteProfilePicture,
  getProfilePicture
} = require('../controllers/profileController');

// Public: profile images are loaded straight from <img> tags
router.get('/picture/:userId', getProfilePicture);

// All other routes require authentication
router.use(protect);

// Profile routes
router.get('/', getProfile);
router.put('/', upload.single('profilePicture'), handleUploadError, updateProfile);
router.delete('/picture', deleteProfilePicture);

module.exports = router;
