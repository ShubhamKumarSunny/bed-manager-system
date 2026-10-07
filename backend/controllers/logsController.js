// backend/controllers/logsController.js
const OccupancyLog = require('../models/OccupancyLog');
const mongoose = require('mongoose');

/**
 * @desc    Get all occupancy logs with optional filtering
 * @route   GET /api/logs
 * @access  Public (or can be made Private based on requirements)
 * @query   ward, bedId, userId, startDate, endDate, statusChange
 */
exports.getAllLogs = async (req, res) => {
  try {
    const { ward, bedId, userId, startDate, endDate, statusChange } = req.query;
    
    // Build filter object
    const filter = {};

    // Filter by bed ID (MongoDB ObjectId or bedId like "BED-101")
    if (bedId) {
      if (mongoose.Types.ObjectId.isValid(bedId)) {
        filter.bedId = bedId;
      } else {
        // Find bed by bedId and get its ObjectId
        const Bed = mongoose.model('Bed');
        const bed = await Bed.findOne({ bedId: bedId.toUpperCase() });
        if (bed) {
          filter.bedId = bed._id;
        } else {
          return res.status(404).json({
            success: false,
            message: 'Bed not found'
          });
        }
      }
    }

    // Filter by user ID
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID format'
        });
      }
      filter.userId = userId;
    }

    // Filter by status change
    if (statusChange) {
      const validStatusChanges = [
        'assigned',
        'released',
        'maintenance_start',
        'maintenance_end',
        'reserved',
        'reservation_cancelled'
      ];
      if (!validStatusChanges.includes(statusChange)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status change. Must be one of: ${validStatusChanges.join(', ')}`
        });
      }
      filter.statusChange = statusChange;
    }

    // Filter by date range
    if (startDate || endDate) {
      filter.timestamp = {};
      
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid startDate format. Use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)'
          });
        }
        filter.timestamp.$gte = start;
      }
      
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid endDate format. Use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)'
          });
        }
        // Set end date to end of day if only date is provided
        end.setHours(23, 59, 59, 999);
        filter.timestamp.$lte = end;
      }
    }

    // Fetch logs with population
    let logs = await OccupancyLog.find(filter)
      .populate('bedId', 'bedId ward status')
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 200, 1000));

    // Filter by ward if specified (after population)
    if (ward) {
      logs = logs.filter(log => log.bedId && log.bedId.ward === ward);
    }

    res.status(200).json({
      success: true,
      count: logs.length,
      data: { logs }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    
    // Handle date parsing errors
    if (error.message.includes('Invalid Date')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error fetching logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get logs for a specific bed
 * @route   GET /api/logs/bed/:bedId
 * @access  Public
 * @param   bedId - MongoDB ObjectId or bedId (e.g., "BED-101")
 */
exports.getBedLogs = async (req, res) => {
  try {
    const { bedId } = req.params;
    let bedObjectId;

    // Check if bedId is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(bedId)) {
      bedObjectId = bedId;
    } else {
      // Find bed by bedId
      const Bed = mongoose.model('Bed');
      const bed = await Bed.findOne({ bedId: bedId.toUpperCase() });
      if (!bed) {
        return res.status(404).json({
          success: false,
          message: 'Bed not found'
        });
      }
      bedObjectId = bed._id;
    }

    // Fetch logs for this bed
    const logs = await OccupancyLog.find({ bedId: bedObjectId })
      .populate('bedId', 'bedId ward status')
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 200, 1000));

    res.status(200).json({
      success: true,
      count: logs.length,
      data: { logs }
    });
  } catch (error) {
    console.error('Get bed logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bed logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get logs for a specific user
 * @route   GET /api/logs/user/:userId
 * @access  Private (typically admin or self)
 * @param   userId - MongoDB ObjectId
 */
exports.getUserLogs = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Fetch logs for this user
    const logs = await OccupancyLog.find({ userId })
      .populate('bedId', 'bedId ward status')
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 200, 1000));

    res.status(200).json({
      success: true,
      count: logs.length,
      data: { logs }
    });
  } catch (error) {
    console.error('Get user logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user logs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
