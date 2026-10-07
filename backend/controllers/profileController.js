// backend/controllers/profileController.js
const mongoose = require('mongoose');
const User = require('../models/User');

// @desc    Get current user profile
// @route   GET /api/profile
// @access  Private
exports.getProfile = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      console.error('User not found in database:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, address, dateOfBirth, bio, department } = req.body;

    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        message: 'Shared demo accounts are read-only. Sign up for your own account to edit a profile.'
      });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    const user = await User.findById(req.user._id);
    
    if (!user) {
      console.error('User not found in database:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update allowed fields
    if (name && name.trim()) user.name = name.trim();
    if (phone !== undefined) user.phone = phone || null;
    if (address !== undefined) user.address = address || null;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth || null;
    if (bio !== undefined) user.bio = bio || null;
    if (department !== undefined) user.department = department || null;

    // Handle profile picture upload (kept in MongoDB, served via /api/profile/picture/:userId)
    if (req.file) {
      user.profilePictureData = req.file.buffer;
      user.profilePictureType = req.file.mimetype;
      user.profilePicture = `/api/profile/picture/${user._id}?v=${Date.now()}`;
    }

    await user.save();

    // Return user without password
    const updatedUser = await User.findById(user._id).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(e => e.message).join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

// @desc    Delete profile picture
// @route   DELETE /api/profile/picture
// @access  Private
exports.deleteProfilePicture = async (req, res) => {
  try {
    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        message: 'Shared demo accounts are read-only. Sign up for your own account to edit a profile.'
      });
    }

    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.profilePicture) {
      return res.status(400).json({
        success: false,
        message: 'No profile picture to delete'
      });
    }

    user.profilePicture = null;
    user.profilePictureData = undefined;
    user.profilePictureType = undefined;
    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');

    res.status(200).json({
      success: true,
      message: 'Profile picture deleted successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Delete profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete profile picture',
      error: error.message
    });
  }
};

// @desc    Serve a user's profile picture
// @route   GET /api/profile/picture/:userId
// @access  Public (image URLs are used directly in <img> tags)
exports.getProfilePicture = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(404).end();
    }

    const user = await User.findById(req.params.userId).select('+profilePictureData +profilePictureType');

    if (!user || !user.profilePictureData) {
      return res.status(404).end();
    }

    res.setHeader('Content-Type', user.profilePictureType || 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // URLs carry a ?v= version, so the image itself can be cached for a long time
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(user.profilePictureData);
  } catch (error) {
    console.error('Get profile picture error:', error);
    res.status(500).end();
  }
};
