// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');

const signToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      ward: user.ward,
      assignedWards: user.assignedWards,
      department: user.department
    },
    getJwtSecret(),
    { expiresIn: '7d' }
  );

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  ward: user.ward,
  assignedWards: user.assignedWards,
  department: user.department,
  profilePicture: user.profilePicture,
  phone: user.phone,
  address: user.address,
  dateOfBirth: user.dateOfBirth,
  bio: user.bio,
  isDemo: user.isDemo,
  createdAt: user.createdAt
});

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name, role, ward, assignedWards, department } = req.body;
    
    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, password, and name'
      });
    }

    // Validate ward requirement for specific roles
    if ((role === 'ward_staff' || role === 'manager') && !ward) {
      return res.status(400).json({
        success: false,
        message: 'Ward is required for ward_staff and manager roles'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Prepare user data
    const userData = {
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'ward_staff'
    };

    // Add optional fields if provided
    if (ward) userData.ward = ward;
    if (assignedWards && Array.isArray(assignedWards) && assignedWards.length > 0) {
      userData.assignedWards = assignedWards;
    }
    if (department) userData.department = department;

    // Create user (password will be hashed by model pre-save hook)
    const user = await User.create(userData);

    const token = signToken(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: publicUser(user),
        token
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email already in use'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user by email and include password field
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+password'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Compare passwords
    const isPasswordMatch = await user.matchPassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = signToken(user);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: publicUser(user),
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Current user fetched successfully',
      data: {
        user: publicUser(user)
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete user account
 * @route   DELETE /api/auth/account
 * @access  Private
 */
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    if (req.user.isDemo) {
      return res.status(403).json({
        success: false,
        message: 'Shared demo accounts cannot be deleted. Sign up for your own account to try this.'
      });
    }

    // Find and delete the user
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
