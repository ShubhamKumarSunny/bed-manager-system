// backend/middleware/roleGuards.js

const Bed = require('../models/Bed');
const mongoose = require('mongoose');

/**
 * @desc    Role-based read access control for beds
 * @access  Private (requires protect middleware first)
 * @note    Modifies req.query to filter beds based on user role
 */
exports.canReadBeds = (req, res, next) => {
  // Bed availability is visible to every authenticated role (ER staff and
  // ward staff need hospital-wide numbers). Patient details are redacted per
  // role in the controller.
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }
  return next();
};

/**
 * @desc    Role-based write access control for bed status updates
 * @access  Private (requires protect middleware first)
 * @note    Only ward_staff and manager can update bed status
 */
exports.canUpdateBedStatus = async (req, res, next) => {
  try {
    const { role, ward } = req.user;
    const { id } = req.params;

    // Only ward_staff and manager can update bed status
    if (!['ward_staff', 'manager'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update bed status.'
      });
    }

    // For ward staff, verify they can only update beds in their assigned ward
    // Ward staff and managers are limited to beds in their assigned ward
    if (role === 'ward_staff' || role === 'manager') {
      // Find the bed to check its ward
      let bed;
      if (mongoose.Types.ObjectId.isValid(id)) {
        bed = await Bed.findById(id);
      } else {
        bed = await Bed.findOne({ bedId: id });
      }

      if (!bed) {
        return res.status(404).json({
          success: false,
          message: 'Bed not found'
        });
      }

      // Check if bed's ward matches user's assigned ward
      if (bed.ward !== ward) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this ward.'
        });
      }
    }

    // Manager role can update any bed in their ward (to be filtered at controller level if needed)
    return next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Authorization error: ' + err.message
    });
  }
};
