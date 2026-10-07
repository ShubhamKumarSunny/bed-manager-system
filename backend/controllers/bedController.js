// backend/controllers/bedController.js
const Bed = require('../models/Bed');
const OccupancyLog = require('../models/OccupancyLog');
const CleaningLog = require('../models/CleaningLog');
const Alert = require('../models/Alert');
const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const mlService = require('../services/mlService');

/**
 * @desc    Get all beds with optional filtering
 * @route   GET /api/beds
 * @access  Public
 * @query   status, ward
 */
exports.getAllBeds = async (req, res) => {
  try {
    const { status, ward } = req.query;
    
    // Build filter object
    const filter = {};
    if (status) {
      // Validate status
      const validStatuses = ['available', 'cleaning', 'occupied'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      filter.status = status;
    }
    if (ward) {
      filter.ward = ward;
    }

    // Fetch beds
    let beds = await Bed.find(filter)
      .sort({ ward: 1, bedId: 1 })
      .lean();

    // Every role sees bed availability hospital-wide, but patient details are
    // limited to administrators and to the staff of the bed's own ward.
    const { role, ward: userWard } = req.user;
    const seesAllPatients = ['hospital_admin', 'technical_team'].includes(role);
    if (!seesAllPatients) {
      beds = beds.map(bed => {
        const ownWard = ['manager', 'ward_staff'].includes(role) && bed.ward === userWard;
        if (ownWard) return bed;
        return { ...bed, patientName: null, patientId: null, notes: null, dischargeNotes: null };
      });
    }

    res.status(200).json({
      success: true,
      count: beds.length,
      data: { beds }
    });
  } catch (error) {
    console.error('Get all beds error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching beds',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get single bed by ID
 * @route   GET /api/beds/:id
 * @access  Public
 * @param   id - MongoDB ObjectId or bedId (e.g., "BED-101")
 */
exports.getBedById = async (req, res) => {
  try {
    const { id } = req.params;
    let bed;

    // Check if id is a valid MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(id)) {
      bed = await Bed.findById(id);
    } else {
      // Try to find by bedId (e.g., "iA5", "BED-101")
      bed = await Bed.findOne({ bedId: id });
    }

    if (!bed) {
      return res.status(404).json({
        success: false,
        message: 'Bed not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { bed }
    });
  } catch (error) {
    console.error('Get bed by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bed details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update bed status
 * @route   PATCH /api/beds/:id/status
 * @access  Private (Requires JWT)
 * @param   id - MongoDB ObjectId or bedId
 * @body    status, patientName, patientId (optional - external patient identifier)
 */
exports.updateBedStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, patientName, patientId, cleaningDuration, notes } = req.body;

    // Validate status
    const validStatuses = ['available', 'cleaning', 'occupied'];
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Validate cleaningDuration for cleaning status
    if (status === 'cleaning' && cleaningDuration) {
      if (typeof cleaningDuration !== 'number' || cleaningDuration <= 0) {
        return res.status(400).json({
          success: false,
          message: 'cleaningDuration must be a positive number (in minutes)'
        });
      }
    }

    // Find bed
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

    // Validate patient info for occupied status
    if (status === 'occupied' && !patientName && !patientId) {
      return res.status(400).json({
        success: false,
        message: 'Patient name or ID is required when marking bed as occupied'
      });
    }

    // Store previous status for logging
    const previousStatus = bed.status;

    // Auto-transition: When patient leaves (occupied -> available), set to cleaning instead
    let finalStatus = status;
    if (previousStatus === 'occupied' && status === 'available') {
      finalStatus = 'cleaning';
    }

    // Update bed
    bed.status = finalStatus;
    bed.patientName = finalStatus === 'occupied' ? (patientName || null) : null;
    bed.patientId = finalStatus === 'occupied' ? (patientId || null) : null;
    
    // Clear discharge time and notes when patient is released (occupied -> cleaning/available)
    if (previousStatus === 'occupied' && finalStatus !== 'occupied') {
      bed.estimatedDischargeTime = null;
      bed.dischargeNotes = null;
    }
    
    // Task 2.5c: Update notes if provided
    if (notes !== undefined) {
      bed.notes = notes ? notes.trim() : null;
    }
    
    // Handle cleaning start time - set for any transition TO cleaning status
    if (finalStatus === 'cleaning' && previousStatus !== 'cleaning') {
      bed.cleaningStartTime = new Date();
      bed.estimatedCleaningDuration = cleaningDuration || 30; // Default 30 minutes
      bed.estimatedCleaningEndTime = new Date(Date.now() + (bed.estimatedCleaningDuration) * 60 * 1000);
    }
    
    await bed.save();

    // Determine status change type for logging
    let statusChangeType;
    if (finalStatus === 'occupied') {
      statusChangeType = 'assigned';
    } else if (previousStatus === 'occupied' && finalStatus === 'cleaning') {
      statusChangeType = 'released'; // Patient left, now needs cleaning
    } else if (previousStatus === 'cleaning' && finalStatus === 'available') {
      statusChangeType = 'maintenance_end'; // Cleaning completed
    } else {
      // Default to assigned for any other transitions
      statusChangeType = 'assigned';
    }

    // Create occupancy log entry
    try {
      console.log('Creating log - User ID:', req.user._id, 'Bed ID:', bed._id);
      await OccupancyLog.create({
        bedId: bed._id,
        userId: req.user._id, // User who made the change (from JWT)
        statusChange: statusChangeType,
        timestamp: new Date()
      });
      console.log('✅ Occupancy log created successfully');
    } catch (logError) {
      console.error('Error creating occupancy log:', logError);
      // Continue even if logging fails - don't block the main operation
    }

    // Create cleaning log entry when starting cleaning (any transition TO cleaning status)
    if (finalStatus === 'cleaning' && previousStatus !== 'cleaning' && bed.cleaningStartTime) {
      try {
        await CleaningLog.create({
          bedId: bed._id,
          ward: bed.ward,
          startTime: bed.cleaningStartTime,
          estimatedDuration: bed.estimatedCleaningDuration,
          status: 'in_progress',
          assignedTo: req.user._id
        });
        console.log('✅ CleaningLog entry created successfully');
        
        // Emit bedCleaningStarted event via socket.io (ward-specific)
        if (req.io) {
          req.io.to(`ward-${bed.ward}`).emit('bedCleaningStarted', {
            bed: bed.toObject(),
            estimatedDuration: bed.estimatedCleaningDuration,
            estimatedEndTime: bed.estimatedCleaningEndTime,
            timestamp: new Date()
          });
          console.log(`✅ bedCleaningStarted event emitted via socket.io (Ward: ${bed.ward})`);
        }
      } catch (cleaningLogError) {
        console.error('Error creating cleaning log:', cleaningLogError);
        // Continue even if logging fails
      }
    }

    // Task 2.6: Emit bedStatusChanged event via socket.io (ward-specific for managers)
    if (req.io) {
      // Emit to specific ward for managers
      req.io.to(`ward-${bed.ward}`).emit('bedStatusChanged', {
        bed: bed.toObject(),
        previousStatus,
        newStatus: status,
        timestamp: new Date()
      });
      
      // Also emit globally for hospital admins
      req.io.emit('bedStatusChanged', {
        bed: bed.toObject(),
        previousStatus,
        newStatus: status,
        timestamp: new Date()
      });
      
      console.log(`✅ bedStatusChanged event emitted via socket.io (Ward: ${bed.ward})`);
    }

    // Check occupancy and trigger alerts if > 90%
    await checkOccupancyAndCreateAlerts(bed.ward, req.io);

    res.status(200).json({
      success: true,
      message: `Bed status updated to ${finalStatus}`,
      data: { bed }
    });
  } catch (error) {
    console.error('Update bed status error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error updating bed status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Helper function to check occupancy levels and create alerts
 * @param {String} ward - Ward to check (ICU, General, Emergency)
 * @param {Object} io - Socket.io instance
 */
const checkOccupancyAndCreateAlerts = async (ward, io) => {
  try {
    // Get total and occupied beds for this ward
    const totalBeds = await Bed.countDocuments({ ward });
    const occupiedBeds = await Bed.countDocuments({ ward, status: 'occupied' });

    if (totalBeds === 0) return; // No beds in this ward

    const occupancyRate = (occupiedBeds / totalBeds) * 100;
    console.log(`📊 ${ward} occupancy: ${occupancyRate.toFixed(1)}% (${occupiedBeds}/${totalBeds})`);

    // Create alert if occupancy > 90%
    if (occupancyRate > 90) {
      // Check if alert already exists for this ward (to avoid duplicates)
      const existingAlert = await Alert.findOne({
        type: 'occupancy_high',
        ward,
        read: { $ne: true },
        timestamp: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) }
      });

      if (!existingAlert) {
        const severity = occupancyRate >= 95 ? 'critical' : 'high';
        
        const alert = await Alert.create({
          type: 'occupancy_high',
          severity,
          message: `${ward} ward occupancy at ${occupancyRate.toFixed(1)}% (${occupiedBeds}/${totalBeds} beds occupied)`,
          ward,
          targetRole: ['manager', 'hospital_admin']
        });

        console.log(`🚨 Alert created: ${ward} occupancy high (${occupancyRate.toFixed(1)}%)`);

        // Emit real-time alert via Socket.io
        if (io) {
          io.emit('occupancyAlert', {
            alert: alert.toObject(),
            ward,
            occupancyRate: occupancyRate.toFixed(1),
            occupiedBeds,
            totalBeds,
            timestamp: new Date()
          });
          console.log('✅ occupancyAlert event emitted via socket.io');
        }
      } else {
        console.log(`ℹ️ Alert already exists for ${ward} ward high occupancy`);
      }
    }
  } catch (error) {
    console.error('Error checking occupancy and creating alerts:', error);
    // Don't throw - this is a background check, shouldn't break main operation
  }
};

/**
 * @desc    Get all occupied beds with patient details
 * @route   GET /api/beds/occupied
 * @access  Private (Manager, Hospital Admin)
 * @query   ward (optional - filter by specific ward)
 * 
 * Task 2.5: Returns detailed information about all occupied beds including:
 * - Patient information (name, ID)
 * - Admission time (latest "assigned" occupancy log)
 * - Time in bed calculation
 * - Ward information
 */
exports.getOccupiedBeds = async (req, res) => {
  try {
    const { ward } = req.query;
    const userRole = req.user?.role;
    const userWard = req.user?.ward;

    // Build filter for occupied beds
    const filter = { status: 'occupied' };

    // Apply ward filtering based on role
    if (userRole === 'manager' && userWard) {
      // Managers can only see their assigned ward
      filter.ward = userWard;
    } else if (ward) {
      // Hospital admin can filter by specific ward
      filter.ward = ward;
    }

    // Fetch occupied beds
    const occupiedBeds = await Bed.find(filter)
      .sort({ ward: 1, bedId: 1 })
      .lean();

    // A patient's admission time is the latest "assigned" log of their bed
    const admissions = await OccupancyLog.aggregate([
      { $match: { bedId: { $in: occupiedBeds.map(bed => bed._id) }, statusChange: 'assigned' } },
      { $group: { _id: '$bedId', admittedAt: { $max: '$timestamp' } } }
    ]);
    const admittedAt = new Map(admissions.map(a => [String(a._id), a.admittedAt]));

    // Enrich each bed with calculated fields
    const now = new Date();
    const enrichedBeds = occupiedBeds.map(bed => {
      const admissionTime = admittedAt.get(String(bed._id)) || bed.updatedAt || bed.createdAt;
      const timeInBedMs = now - admissionTime;
      const timeInBedHours = timeInBedMs / (1000 * 60 * 60);
      const timeInBedDays = timeInBedMs / (1000 * 60 * 60 * 24);

      return {
        ...bed,
        admissionTime,
        timeInBed: {
          hours: Math.round(timeInBedHours * 10) / 10,
          days: Math.round(timeInBedDays * 10) / 10,
          formatted: timeInBedDays >= 1 
            ? `${Math.floor(timeInBedDays)}d ${Math.floor(timeInBedHours % 24)}h`
            : `${Math.floor(timeInBedHours)}h`
        }
      };
    });

    // Group by ward for summary
    const wardSummary = enrichedBeds.reduce((acc, bed) => {
      if (!acc[bed.ward]) {
        acc[bed.ward] = {
          ward: bed.ward,
          occupiedCount: 0,
          patients: []
        };
      }
      acc[bed.ward].occupiedCount++;
      acc[bed.ward].patients.push({
        bedId: bed.bedId,
        patientName: bed.patientName,
        patientId: bed.patientId
      });
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      count: enrichedBeds.length,
      data: {
        beds: enrichedBeds,
        summary: Object.values(wardSummary)
      }
    });
  } catch (error) {
    console.error('Get occupied beds error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching occupied beds',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get occupant history for a specific bed
 * @route   GET /api/beds/:id/occupant-history
 * @access  Private (Manager, Hospital Admin)
 * @param   id - Bed MongoDB ObjectId or bedId string
 * 
 * Task 2.5: Returns timeline of bed occupancy changes including:
 * - All status changes from OccupancyLog
 * - Patient assignments and releases
 * - Maintenance periods
 * - Duration calculations for each occupancy
 */
exports.getOccupantHistory = async (req, res) => {
  try {
    const { id } = req.params;
    let bed;

    // Find bed by MongoDB ObjectId or bedId string
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

    // Check authorization - managers can only view their ward's beds
    const userRole = req.user?.role;
    const userWard = req.user?.ward;
    if (userRole === 'manager' && userWard && bed.ward !== userWard) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only view beds in your assigned ward'
      });
    }

    // Fetch occupancy logs for this bed
    const occupancyLogs = await OccupancyLog.find({ bedId: bed._id })
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .lean();

    // Calculate occupancy periods (paired assigned -> released)
    const occupancyPeriods = [];
    let currentAssignment = null;

    // Process logs in chronological order (reverse the array)
    const chronologicalLogs = [...occupancyLogs].reverse();
    
    chronologicalLogs.forEach(log => {
      if (log.statusChange === 'assigned') {
        currentAssignment = {
          startTime: log.timestamp,
          startLog: log,
          status: 'ongoing'
        };
      } else if (log.statusChange === 'released' && currentAssignment) {
        currentAssignment.endTime = log.timestamp;
        currentAssignment.endLog = log;
        currentAssignment.status = 'completed';
        
        // Calculate duration
        const durationMs = currentAssignment.endTime - currentAssignment.startTime;
        const durationHours = durationMs / (1000 * 60 * 60);
        const durationDays = durationMs / (1000 * 60 * 60 * 24);
        
        currentAssignment.duration = {
          hours: Math.round(durationHours * 10) / 10,
          days: Math.round(durationDays * 10) / 10,
          formatted: durationDays >= 1
            ? `${Math.floor(durationDays)}d ${Math.floor(durationHours % 24)}h`
            : `${Math.floor(durationHours)}h`
        };
        
        occupancyPeriods.push(currentAssignment);
        currentAssignment = null;
      }
    });

    // If there's an ongoing assignment, add it with current time as end
    if (currentAssignment) {
      const now = new Date();
      const durationMs = now - currentAssignment.startTime;
      const durationHours = durationMs / (1000 * 60 * 60);
      const durationDays = durationMs / (1000 * 60 * 60 * 24);
      
      currentAssignment.duration = {
        hours: Math.round(durationHours * 10) / 10,
        days: Math.round(durationDays * 10) / 10,
        formatted: durationDays >= 1
          ? `${Math.floor(durationDays)}d ${Math.floor(durationHours % 24)}h`
          : `${Math.floor(durationHours)}h`,
        ongoing: true
      };
      
      occupancyPeriods.push(currentAssignment);
    }

    // Calculate statistics
    const completedPeriods = occupancyPeriods.filter(p => p.status === 'completed');
    const totalOccupancies = completedPeriods.length;
    const averageDuration = totalOccupancies > 0
      ? completedPeriods.reduce((sum, p) => sum + p.duration.days, 0) / totalOccupancies
      : 0;

    res.status(200).json({
      success: true,
      data: {
        bed: {
          _id: bed._id,
          bedId: bed.bedId,
          ward: bed.ward,
          status: bed.status,
          currentPatient: bed.status === 'occupied' ? {
            patientName: bed.patientName,
            patientId: bed.patientId
          } : null
        },
        history: {
          allLogs: occupancyLogs,
          occupancyPeriods: occupancyPeriods.reverse(), // Most recent first
          statistics: {
            totalOccupancies,
            averageDuration: Math.round(averageDuration * 10) / 10,
            currentlyOccupied: bed.status === 'occupied',
            totalLogs: occupancyLogs.length
          }
        }
      }
    });
  } catch (error) {
    console.error('Get occupant history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching occupant history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get cleaning queue (all beds in cleaning status with progress)
 * @route   GET /api/beds/cleaning-queue
 * @access  Private (Manager, Hospital Admin, Ward Staff)
 * @query   ward (optional - filter by ward)
 */
exports.getCleaningQueue = async (req, res) => {
  try {
    const { ward } = req.query;
    
    // Build filter - only include 'cleaning' status (not maintenance)
    const filter = { status: 'cleaning' };
    
    // Apply ward filter for managers and ward staff
    if ((req.user.role === 'manager' || req.user.role === 'ward_staff') && req.user.ward) {
      filter.ward = req.user.ward;
    } else if (ward) {
      filter.ward = ward;
    }
    
    // Find all beds in cleaning status
    const beds = await Bed.find(filter)
      .select('bedId ward status cleaningStartTime estimatedCleaningDuration estimatedCleaningEndTime')
      .lean();
    
    // Get active cleaning logs for these beds
    const bedIds = beds.map(b => b._id);
    const cleaningLogs = await CleaningLog.find({
      bedId: { $in: bedIds },
      status: 'in_progress'
    })
      .populate('assignedTo', 'name email')
      .sort({ startTime: 1 })
      .lean();
    
    // Create a map of bedId to cleaning log
    const cleaningLogMap = new Map();
    cleaningLogs.forEach(log => {
      cleaningLogMap.set(log.bedId.toString(), log);
    });
    
    // Enrich beds with cleaning progress
    const enrichedBeds = beds.map(bed => {
      const log = cleaningLogMap.get(bed._id.toString());
      
      // Calculate progress
      let progress = null;
      if (bed.cleaningStartTime && bed.estimatedCleaningDuration) {
        const now = new Date();
        const elapsedMs = now - new Date(bed.cleaningStartTime);
        const elapsedMinutes = elapsedMs / (1000 * 60);
        const progressPercentage = Math.min(
          Math.round((elapsedMinutes / bed.estimatedCleaningDuration) * 100),
          100
        );
        
        const timeRemainingMinutes = Math.max(
          0,
          bed.estimatedCleaningDuration - elapsedMinutes
        );
        
        const isOverdue = elapsedMinutes > bed.estimatedCleaningDuration;
        
        progress = {
          percentage: progressPercentage,
          elapsedMinutes: Math.round(elapsedMinutes),
          timeRemainingMinutes: Math.round(timeRemainingMinutes),
          isOverdue
        };
      }
      
      return {
        ...bed,
        cleaningLog: log || null,
        progress
      };
    });
    
    // Sort by urgency (most urgent first)
    // Priority: overdue first, then by time remaining (ascending)
    enrichedBeds.sort((a, b) => {
      if (a.progress && b.progress) {
        // Both overdue or both not overdue
        if (a.progress.isOverdue && !b.progress.isOverdue) return -1;
        if (!a.progress.isOverdue && b.progress.isOverdue) return 1;
        
        // Sort by time remaining (ascending)
        return a.progress.timeRemainingMinutes - b.progress.timeRemainingMinutes;
      }
      return 0;
    });
    
    // Calculate summary statistics
    const summary = {
      total: enrichedBeds.length,
      overdue: enrichedBeds.filter(b => b.progress?.isOverdue).length,
      onTrack: enrichedBeds.filter(b => b.progress && !b.progress.isOverdue).length,
      byWard: {}
    };
    
    enrichedBeds.forEach(bed => {
      if (!summary.byWard[bed.ward]) {
        summary.byWard[bed.ward] = { total: 0, overdue: 0 };
      }
      summary.byWard[bed.ward].total++;
      if (bed.progress?.isOverdue) {
        summary.byWard[bed.ward].overdue++;
      }
    });
    
    res.status(200).json({
      success: true,
      data: {
        summary,
        beds: enrichedBeds
      }
    });
  } catch (error) {
    console.error('Get cleaning queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching cleaning queue',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Mark bed cleaning as complete
 * @route   PUT /api/beds/:id/cleaning/mark-complete
 * @access  Private (Manager, Hospital Admin)
 * @param   id - MongoDB ObjectId or bedId
 * @body    notes (optional)
 */
exports.markCleaningComplete = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    // Find bed
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
    
    // Verify bed is in cleaning status
    // Ward staff and managers can only act on beds in their own ward
    if (['ward_staff', 'manager'].includes(req.user.role) && bed.ward !== req.user.ward) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update beds in this ward.'
      });
    }

    if (bed.status !== 'cleaning') {
      return res.status(400).json({
        success: false,
        message: 'Bed is not currently in cleaning status'
      });
    }
    
    // Find active cleaning log
    const cleaningLog = await CleaningLog.findOne({
      bedId: bed._id,
      status: 'in_progress'
    });
    
    if (!cleaningLog) {
      return res.status(404).json({
        success: false,
        message: 'No active cleaning log found for this bed'
      });
    }
    
    // Update cleaning log
    cleaningLog.endTime = new Date();
    cleaningLog.status = 'completed';
    cleaningLog.completedBy = req.user._id;
    if (notes) {
      cleaningLog.notes = notes;
    }
    await cleaningLog.save();
    
    // Update bed status back to available
    bed.status = 'available';
    // Cleaning fields will be auto-cleared by pre-save middleware
    await bed.save();
    
    // Create occupancy log entry for maintenance end
    try {
      await OccupancyLog.create({
        bedId: bed._id,
        userId: req.user._id,
        statusChange: 'maintenance_end',
        timestamp: new Date()
      });
    } catch (logError) {
      console.error('Error creating occupancy log:', logError);
    }
    
    // Emit bedCleaningCompleted event via socket.io (ward-specific)
    if (req.io) {
      req.io.to(`ward-${bed.ward}`).emit('bedCleaningCompleted', {
        bed: bed.toObject(),
        cleaningLog: {
          duration: cleaningLog.actualDuration,
          wasOverdue: cleaningLog.status === 'overdue' || 
                     cleaningLog.actualDuration > cleaningLog.estimatedDuration,
          completedBy: req.user.name || req.user.email
        },
        timestamp: new Date()
      });
      console.log('✅ bedCleaningCompleted event emitted via socket.io');
    }
    
    // Task 2.6: Also emit bedStatusChanged event
    if (req.io) {
      req.io.to(`ward-${bed.ward}`).emit('bedStatusChanged', {
        bed: bed.toObject(),
        previousStatus: 'cleaning',
        newStatus: 'available',
        timestamp: new Date()
      });
      
      // Global emit for hospital admins
      req.io.emit('bedStatusChanged', {
        bed: bed.toObject(),
        previousStatus: 'cleaning',
        newStatus: 'available',
        timestamp: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cleaning marked as complete',
      data: {
        bed: bed.toObject(),
        cleaningLog: cleaningLog.toObject()
      }
    });
  } catch (error) {
    console.error('Mark cleaning complete error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error marking cleaning as complete',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update estimated discharge time for a bed
 * @route   PATCH /api/beds/:id/discharge-time
 * @access  Private (Manager only)
 */
exports.updateDischargeTime = async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedDischargeTime, dischargeNotes } = req.body;

    // Validate estimatedDischargeTime
    if (!estimatedDischargeTime) {
      return res.status(400).json({
        success: false,
        message: 'Estimated discharge time is required'
      });
    }

    const dischargeDate = new Date(estimatedDischargeTime);
    if (isNaN(dischargeDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format for estimated discharge time'
      });
    }

    // Find bed
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

    // Only allow updating discharge time for occupied beds
    if (bed.status !== 'occupied') {
      return res.status(400).json({
        success: false,
        message: 'Can only set discharge time for occupied beds'
      });
    }

    // Update discharge information
    bed.estimatedDischargeTime = dischargeDate;
    if (dischargeNotes !== undefined) {
      bed.dischargeNotes = dischargeNotes ? dischargeNotes.trim() : null;
    }

    await bed.save();

    // Emit socket event for real-time updates
    if (req.io) {
      req.io.to(`ward-${bed.ward}`).emit('bedDischargeTimeUpdated', {
        bed: bed.toObject(),
        estimatedDischargeTime: bed.estimatedDischargeTime,
        dischargeNotes: bed.dischargeNotes,
        timestamp: new Date()
      });

      // Global emit for hospital admins
      req.io.emit('bedDischargeTimeUpdated', {
        bed: bed.toObject(),
        estimatedDischargeTime: bed.estimatedDischargeTime,
        dischargeNotes: bed.dischargeNotes,
        timestamp: new Date()
      });

      console.log(`✅ bedDischargeTimeUpdated event emitted for bed ${bed.bedId}`);
    }

    res.status(200).json({
      success: true,
      message: 'Estimated discharge time updated successfully',
      data: { bed: bed.toObject() }
    });
  } catch (error) {
    console.error('Update discharge time error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating discharge time',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Predict discharge time using ML
 * @route   POST /api/beds/:id/predict-discharge
 * @access  Private (Manager/Staff)
 */
exports.predictDischarge = async (req, res) => {
  try {
    const { id } = req.params;

    // Find bed
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

    // Only predict for occupied beds
    if (bed.status !== 'occupied') {
      return res.status(400).json({
        success: false,
        message: 'Can only predict discharge time for occupied beds'
      });
    }

    // The patient was admitted when the bed was last assigned
    const admission = await OccupancyLog.findOne({ bedId: bed._id, statusChange: 'assigned' })
      .sort({ timestamp: -1 })
      .select('timestamp')
      .lean();
    const admissionTime = admission ? admission.timestamp : bed.updatedAt;

    // ML service when configured, statistical estimate otherwise
    const prediction = await mlService.predictDischarge(bed.ward, admissionTime);

    res.status(200).json({
      success: true,
      message: 'Discharge prediction generated successfully',
      data: {
        bed: bed.toObject(),
        admissionTime,
        source: prediction.source,
        prediction: prediction.success ? prediction.data.prediction : prediction.fallback,
        metadata: prediction.success ? prediction.data.metadata : undefined
      }
    });
  } catch (error) {
    console.error('Predict discharge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error predicting discharge time',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Predict cleaning duration using ML
 * @route   POST /api/beds/:id/predict-cleaning
 * @access  Private (Staff)
 */
exports.predictCleaningDuration = async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedDuration } = req.body || {};

    // Find bed
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

    // ML service when configured, statistical estimate otherwise
    const prediction = await mlService.predictCleaningDuration(
      bed.ward,
      estimatedDuration || bed.estimatedCleaningDuration || 30,
      bed.cleaningStartTime || new Date()
    );

    res.status(200).json({
      success: true,
      message: 'Cleaning duration prediction generated successfully',
      data: {
        bed: bed.toObject(),
        source: prediction.source,
        prediction: prediction.success ? prediction.data.prediction : prediction.fallback,
        metadata: prediction.success ? prediction.data.metadata : undefined
      }
    });
  } catch (error) {
    console.error('Predict cleaning duration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error predicting cleaning duration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


