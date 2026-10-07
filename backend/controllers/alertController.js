// backend/controllers/alertController.js
const Alert = require('../models/Alert');
const mongoose = require('mongoose');

/**
 * @desc    Get all alerts for the authenticated user's role
 * @route   GET /api/alerts
 * @access  Private
 */
exports.getAlerts = async (req, res) => {
  try {
    const role = req.user.role;
    const ward = req.user.ward; // Get user's assigned ward

    // Build filter based on role
    const filter = { targetRole: role };
    
    // If user is a manager, filter by their assigned ward
    if (role === 'manager' && ward) {
      filter.$or = [
        { ward }, // Alerts specific to this ward
        { ward: null } // General alerts not specific to any ward
      ];
    }

    // Fetch alerts filtered by user's role and ward, excluding dismissed ones
    const alerts = await Alert.find({
      ...filter,
      read: { $ne: true },
      dismissedBy: { $ne: req.user._id } // Exclude alerts dismissed by this user
    })
      .populate('relatedBed', 'bedId ward status')
      .populate('relatedRequest', 'patientId location status')
      .sort({ timestamp: -1 })
      .limit(50);

    res.status(200).json({
      success: true,
      count: alerts.length,
      data: { alerts }
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching alerts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Dismiss alert (mark as read)
 * @route   PATCH /api/alerts/:id/dismiss
 * @access  Private
 */
exports.dismissAlert = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid alert ID format'
      });
    }

    // Find and update alert - add current user to dismissedBy array
    const alert = await Alert.findByIdAndUpdate(
      id,
      { $addToSet: { dismissedBy: req.user._id } },
      { new: true, runValidators: true }
    );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Task 2.6: Emit socket event for alert dismissal only to the user who dismissed it
    if (req.io && req.user.socketId) {
      req.io.to(req.user.socketId).emit('alertDismissed', {
        alertId: alert._id,
        timestamp: new Date()
      });
      console.log('✅ alertDismissed event emitted to user via socket.io');
    }

    res.status(200).json({
      success: true,
      message: 'Alert dismissed successfully',
      data: { alert }
    });
  } catch (error) {
    console.error('Dismiss alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error dismissing alert',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
