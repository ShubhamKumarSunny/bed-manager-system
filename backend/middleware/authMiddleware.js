// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');

/**
 * @desc    Protect routes - Verify JWT token
 * @access  Private
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check if authorization header exists and starts with 'Bearer'
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // Extract token from header
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route - No token provided'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, getJwtSecret());

      // Fetch user from database
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        // Account was deleted after the token was issued
        return res.status(401).json({
          success: false,
          message: 'Not authorized to access this route - Account no longer exists'
        });
      }

      // Attach user to request object (with _id, not just id)
      req.user = user;

      next();
    } catch (error) {
      console.error('Token verification error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route - Invalid token'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication middleware'
    });
  }
};

/**
 * @desc    Grant access to specific roles
 * @param   {...string} roles - Roles that are allowed to access the route
 * @access  Private
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route - User not found'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }

    next();
  };
};
