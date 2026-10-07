// backend/controllers/emergencyRequestController.js
const EmergencyRequest = require('../models/EmergencyRequest');
const Alert = require('../models/Alert');
const mongoose = require('mongoose');

/**
 * @desc    Create a new emergency request
 * @route   POST /api/emergency-requests
 * @access  Private
 */
exports.createEmergencyRequest = async (req, res) => {
  try {
    const { patientName, patientContact, patientId, location, ward, priority, reason, description } = req.body;

    // Validate required fields
    if (!patientName || !location || !ward) {
      return res.status(400).json({
        success: false,
        message: 'Please provide patientName, location, and ward'
      });
    }

    // Validate patientId format if provided
    if (patientId && !mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid patient ID format'
      });
    }

    // Create emergency request
    const emergencyRequest = await EmergencyRequest.create({
      patientName,
      patientContact: patientContact || null,
      patientId: patientId || null,
      location,
      ward,
      priority: priority || 'medium',
      reason: reason || null,
      description: description || null
    });

    // Create an alert for this emergency request
    const alertSeverity = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    }[priority] || 'medium';

    const alert = await Alert.create({
      type: 'request_pending',
      severity: alertSeverity,
      message: `Emergency bed request for ${patientName} at ${location} (${ward} ward)`,
      relatedRequest: emergencyRequest._id,
      ward: ward,
      targetRole: ['manager', 'hospital_admin'],
      read: false
    });

    console.log('✅ Alert created for emergency request:', alert._id);

    // Emit Socket.io event for real-time notification to ward-specific room
    if (req.io) {
      // Emit to ward-specific room and all managers
      req.io.to(`ward-${ward}`).emit('emergencyRequestCreated', {
        requestId: emergencyRequest._id,
        patientName: emergencyRequest.patientName,
        patientContact: emergencyRequest.patientContact,
        patientId: emergencyRequest.patientId,
        location: emergencyRequest.location,
        ward: emergencyRequest.ward,
        priority: emergencyRequest.priority,
        status: emergencyRequest.status,
        createdAt: emergencyRequest.createdAt
      });
      
      // Also emit to all hospital admins
      req.io.to('role-hospital_admin').emit('emergencyRequestCreated', {
        requestId: emergencyRequest._id,
        patientName: emergencyRequest.patientName,
        patientContact: emergencyRequest.patientContact,
        patientId: emergencyRequest.patientId,
        location: emergencyRequest.location,
        ward: emergencyRequest.ward,
        priority: emergencyRequest.priority,
        status: emergencyRequest.status,
        createdAt: emergencyRequest.createdAt
      });
      
      // Emit alert created event
      req.io.to(`ward-${ward}`).emit('alertCreated', alert);
      req.io.to('role-hospital_admin').emit('alertCreated', alert);
      req.io.to('role-manager').emit('alertCreated', alert);
      
      console.log(`✅ Socket event emitted: emergencyRequestCreated to ward-${ward}`);
      console.log(`✅ Socket event emitted: alertCreated for emergency request`);
    }

    res.status(201).json({
      success: true,
      message: 'Emergency request created successfully',
      data: { emergencyRequest }
    });
  } catch (error) {
    console.error('Create emergency request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating emergency request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all emergency requests with optional filtering
 * @route   GET /api/emergency-requests
 * @access  Private
 * @query   status, ward
 */
exports.getAllEmergencyRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const userRole = req.user?.role;
    const userWard = req.user?.ward;

    // Build filter object
    const filter = {};
    
    // If user is a manager, filter by their assigned ward
    if (userRole === 'manager' && userWard) {
      filter.ward = userWard;
    }
    
    if (status) {
      // Validate status
      const validStatuses = ['pending', 'approved', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      filter.status = status;
    }

    // Fetch emergency requests and populate patient details
    const emergencyRequests = await EmergencyRequest.find(filter)
      .populate('patientId', 'name email')
      .sort({ createdAt: -1 })
      .limit(200);

    res.status(200).json({
      success: true,
      count: emergencyRequests.length,
      data: { emergencyRequests }
    });
  } catch (error) {
    console.error('Get all emergency requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching emergency requests',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get single emergency request by ID
 * @route   GET /api/emergency-requests/:id
 * @access  Private
 */
exports.getEmergencyRequestById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid emergency request ID format'
      });
    }

    // Fetch emergency request
    const emergencyRequest = await EmergencyRequest.findById(id)
      .populate('patientId', 'name email');

    if (!emergencyRequest) {
      return res.status(404).json({
        success: false,
        message: 'Emergency request not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { emergencyRequest }
    });
  } catch (error) {
    console.error('Get emergency request by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching emergency request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update emergency request
 * @route   PUT /api/emergency-requests/:id
 * @access  Private
 */
exports.updateEmergencyRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, location, description } = req.body;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid emergency request ID format'
      });
    }

    // Validate status if provided
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, approved, rejected'
      });
    }

    // Find existing emergency request
    const existingRequest = await EmergencyRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: 'Emergency request not found'
      });
    }

    // Store old status for comparison
    const oldStatus = existingRequest.status;

    // Build update object
    const updateData = {};
    if (status) updateData.status = status;
    if (location) updateData.location = location;
    if (description !== undefined) updateData.description = description;

    // Update emergency request
    const updatedRequest = await EmergencyRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('patientId', 'name email');

    // Emit Socket.io events based on status change
    if (req.io && status && oldStatus !== status) {
      if (status === 'approved') {
        req.io.emit('emergencyRequestApproved', {
          requestId: updatedRequest._id,
          patientId: updatedRequest.patientId,
          location: updatedRequest.location,
          status: updatedRequest.status,
          updatedAt: updatedRequest.updatedAt
        });
        console.log('✅ Socket event emitted: emergencyRequestApproved');
      } else if (status === 'rejected') {
        req.io.emit('emergencyRequestRejected', {
          requestId: updatedRequest._id,
          patientId: updatedRequest.patientId,
          location: updatedRequest.location,
          status: updatedRequest.status,
          updatedAt: updatedRequest.updatedAt
        });
        console.log('✅ Socket event emitted: emergencyRequestRejected');
      }
    }

    res.status(200).json({
      success: true,
      message: 'Emergency request updated successfully',
      data: { emergencyRequest: updatedRequest }
    });
  } catch (error) {
    console.error('Update emergency request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating emergency request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete emergency request
 * @route   DELETE /api/emergency-requests/:id
 * @access  Private
 */
exports.deleteEmergencyRequest = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid emergency request ID format'
      });
    }

    // Find and delete emergency request
    const emergencyRequest = await EmergencyRequest.findByIdAndDelete(id);

    if (!emergencyRequest) {
      return res.status(404).json({
        success: false,
        message: 'Emergency request not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Emergency request deleted successfully',
      data: { emergencyRequest }
    });
  } catch (error) {
    console.error('Delete emergency request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting emergency request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Approve emergency request (Manager only - ward-specific)
 * @route   PATCH /api/emergency-requests/:id/approve
 * @access  Private (Manager)
 */
exports.approveEmergencyRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { bedId } = req.body; // Optional: assign a specific bed
    const userRole = req.user?.role;
    const userWard = req.user?.ward;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid emergency request ID format'
      });
    }

    // Find the emergency request
    const emergencyRequest = await EmergencyRequest.findById(id);
    
    if (!emergencyRequest) {
      return res.status(404).json({
        success: false,
        message: 'Emergency request not found'
      });
    }

    // Check if manager is authorized for this ward
    if (userRole === 'manager' && emergencyRequest.ward !== userWard) {
      return res.status(403).json({
        success: false,
        message: `Not authorized: You can only approve requests for ${userWard} ward`
      });
    }

    // Check if already processed
    if (emergencyRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request is already ${emergencyRequest.status}`
      });
    }

    // Update status to approved
    emergencyRequest.status = 'approved';
    await emergencyRequest.save();

    // Update related alert to mark as read (dismissed)
    await Alert.findOneAndUpdate(
      { relatedRequest: emergencyRequest._id },
      { read: true }
    );

    // Populate patient details
    await emergencyRequest.populate('patientId', 'name email');

    // Emit Socket.io event for real-time notification
    if (req.io) {
      const eventData = {
        requestId: emergencyRequest._id,
        patientId: emergencyRequest.patientId,
        location: emergencyRequest.location,
        ward: emergencyRequest.ward,
        status: emergencyRequest.status,
        bedId: bedId || null,
        approvedBy: req.user?.name || req.user?.email,
        updatedAt: emergencyRequest.updatedAt
      };
      
      // Emit to ward-specific room
      req.io.to(`ward-${emergencyRequest.ward}`).emit('emergencyRequestApproved', eventData);
      
      // Also broadcast to all
      req.io.emit('emergencyRequestApproved', eventData);
      
      console.log(`✅ Socket event emitted: emergencyRequestApproved for ward-${emergencyRequest.ward}`);
    }

    res.status(200).json({
      success: true,
      message: 'Emergency request approved successfully',
      data: { 
        emergencyRequest,
        bedId: bedId || null
      }
    });
  } catch (error) {
    console.error('Approve emergency request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error approving emergency request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Reject emergency request (Manager only - ward-specific)
 * @route   PATCH /api/emergency-requests/:id/reject
 * @access  Private (Manager)
 */
exports.rejectEmergencyRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body; // Optional: reason for rejection
    const userRole = req.user?.role;
    const userWard = req.user?.ward;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid emergency request ID format'
      });
    }

    // Find the emergency request
    const emergencyRequest = await EmergencyRequest.findById(id);
    
    if (!emergencyRequest) {
      return res.status(404).json({
        success: false,
        message: 'Emergency request not found'
      });
    }

    // Check if manager is authorized for this ward
    if (userRole === 'manager' && emergencyRequest.ward !== userWard) {
      return res.status(403).json({
        success: false,
        message: `Not authorized: You can only reject requests for ${userWard} ward`
      });
    }

    // Check if already processed
    if (emergencyRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request is already ${emergencyRequest.status}`
      });
    }

    // Update status to rejected
    emergencyRequest.status = 'rejected';
    if (rejectionReason) {
      emergencyRequest.description = rejectionReason;
    }
    await emergencyRequest.save();

    // Update related alert to mark as read (dismissed)
    await Alert.findOneAndUpdate(
      { relatedRequest: emergencyRequest._id },
      { read: true }
    );

    // Populate patient details
    await emergencyRequest.populate('patientId', 'name email');

    // Emit Socket.io event for real-time notification
    if (req.io) {
      const eventData = {
        requestId: emergencyRequest._id,
        patientId: emergencyRequest.patientId,
        location: emergencyRequest.location,
        ward: emergencyRequest.ward,
        status: emergencyRequest.status,
        rejectionReason: rejectionReason || null,
        rejectedBy: req.user?.name || req.user?.email,
        updatedAt: emergencyRequest.updatedAt
      };
      
      // Emit to ward-specific room
      req.io.to(`ward-${emergencyRequest.ward}`).emit('emergencyRequestRejected', eventData);
      
      // Also broadcast to all
      req.io.emit('emergencyRequestRejected', eventData);
      
      console.log(`✅ Socket event emitted: emergencyRequestRejected for ward-${emergencyRequest.ward}`);
    }

    res.status(200).json({
      success: true,
      message: 'Emergency request rejected successfully',
      data: { emergencyRequest }
    });
  } catch (error) {
    console.error('Reject emergency request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error rejecting emergency request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
