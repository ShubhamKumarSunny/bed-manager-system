// backend/controllers/analyticsController.js
// Analytics controller for hospital bed metrics and reporting

const Bed = require('../models/Bed');
const OccupancyLog = require('../models/OccupancyLog');
const CleaningLog = require('../models/CleaningLog');
const mongoose = require('mongoose');

/**
 * @desc    Get occupancy summary for all beds with week-over-week comparison
 * @route   GET /api/analytics/occupancy-summary
 * @access  Public
 * @returns { totalBeds, occupied, available, maintenance, reserved, occupancyPercentage, weekOverWeek }
 */
exports.getOccupancySummary = async (req, res) => {
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Count beds by status (only 3 statuses now: available, cleaning, occupied)
    const [totalBeds, occupied, available, cleaning] = await Promise.all([
      Bed.countDocuments({}),
      Bed.countDocuments({ status: 'occupied' }),
      Bed.countDocuments({ status: 'available' }),
      Bed.countDocuments({ status: 'cleaning' })
    ]);

    // Calculate occupancy percentage
    const occupancyPercentage = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

    // Occupancy a week ago = occupancy now minus the net admissions since then
    const weekFilter = { timestamp: { $gte: oneWeekAgo, $lte: now } };
    const [assignedLastWeek, releasedLastWeek] = await Promise.all([
      OccupancyLog.countDocuments({ ...weekFilter, statusChange: 'assigned' }),
      OccupancyLog.countDocuments({ ...weekFilter, statusChange: 'released' })
    ]);

    const netChangeLastWeek = assignedLastWeek - releasedLastWeek;

    // Week-over-week changes
    const occupiedChange = netChangeLastWeek;
    const availableChange = -occupiedChange; // Available moves opposite to occupied

    // Calculate occupancy rate change
    const historicalOccupancyRate = totalBeds > 0 
      ? Math.round(((occupied - netChangeLastWeek) / totalBeds) * 100) 
      : 0;
    const occupancyRateChange = occupancyPercentage - historicalOccupancyRate;

    res.status(200).json({
      success: true,
      totalBeds,
      occupiedBeds: occupied,
      availableBeds: available,
      cleaningBeds: cleaning,
      occupancyRate: occupancyPercentage,
      weekOverWeek: {
        totalBedsChange: 0, // Beds don't change week to week typically
        occupiedChange,
        availableChange,
        occupancyRateChange: `${occupancyRateChange >= 0 ? '+' : ''}${occupancyRateChange}%`
      }
    });
  } catch (error) {
    console.error('Get occupancy summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching occupancy summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get occupancy breakdown by ward
 * @route   GET /api/analytics/occupancy-by-ward
 * @access  Public
 * @returns Array of { ward, totalBeds, occupied, available, maintenance, reserved, occupancyPercentage }
 */
exports.getOccupancyByWard = async (req, res) => {
  try {
    const { ward } = req.query;

    // If specific ward is requested, return data for that ward only
    if (ward) {
      const [totalBeds, occupied, available, cleaning] = await Promise.all([
        Bed.countDocuments({ ward }),
        Bed.countDocuments({ ward, status: 'occupied' }),
        Bed.countDocuments({ ward, status: 'available' }),
        Bed.countDocuments({ ward, status: 'cleaning' })
      ]);

      const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

      return res.status(200).json({
        success: true,
        totalBeds,
        occupiedBeds: occupied,
        availableBeds: available,
        cleaningBeds: cleaning,
        occupancyRate
      });
    }

    // Get all unique wards
    const wards = await Bed.distinct('ward');

    // For each ward, get the count of beds by status
    const wardData = await Promise.all(
      wards.map(async (ward) => {
        const [totalBeds, occupied, available, cleaning] = await Promise.all([
          Bed.countDocuments({ ward }),
          Bed.countDocuments({ ward, status: 'occupied' }),
          Bed.countDocuments({ ward, status: 'available' }),
          Bed.countDocuments({ ward, status: 'cleaning' })
        ]);

        const occupancyPercentage = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

        return {
          ward,
          totalBeds,
          occupied,
          available,
          cleaning,
          occupancyPercentage
        };
      })
    );

    // Sort by ward name for consistent ordering
    wardData.sort((a, b) => a.ward.localeCompare(b.ward));

    res.status(200).json({
      success: true,
      data: {
        wardBreakdown: wardData
      }
    });
  } catch (error) {
    console.error('Get occupancy by ward error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching ward occupancy data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get bed history - complete history of status changes for a specific bed
 * @route   GET /api/analytics/bed-history/:bedId
 * @access  Public
 * @param   bedId - MongoDB ObjectId or bedId string (e.g., "iA5")
 * @query   limit (default: 50), skip (default: 0)
 * @returns Array of occupancy log entries with user and status change details
 */
exports.getBedHistory = async (req, res) => {
  try {
    const { bedId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200); // Max 200 records
    const skip = parseInt(req.query.skip) || 0;

    // Find bed by ID or bedId string
    let bed;
    if (mongoose.Types.ObjectId.isValid(bedId)) {
      bed = await Bed.findById(bedId);
    } else {
      bed = await Bed.findOne({ bedId: bedId });
    }

    if (!bed) {
      return res.status(404).json({
        success: false,
        message: 'Bed not found'
      });
    }

    // Get occupancy history for this bed
    const [history, totalRecords] = await Promise.all([
      OccupancyLog.find({ bedId: bed._id })
        .populate('userId', 'name email role')
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      OccupancyLog.countDocuments({ bedId: bed._id })
    ]);

    res.status(200).json({
      success: true,
      data: {
        bed: {
          _id: bed._id,
          bedId: bed.bedId,
          ward: bed.ward,
          currentStatus: bed.status
        },
        history,
        pagination: {
          total: totalRecords,
          limit,
          skip,
          hasMore: skip + limit < totalRecords
        }
      }
    });
  } catch (error) {
    console.error('Get bed history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bed history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get occupancy trends over time
 * @route   GET /api/analytics/occupancy-trends
 * @access  Public
 * @query   startDate (ISO string), endDate (ISO string), granularity ('hourly'|'daily'|'weekly', default: 'daily')
 * @returns Array of time series data points with occupancy metrics
 */
exports.getOccupancyTrends = async (req, res) => {
  try {
    const { startDate, endDate, granularity = 'daily' } = req.query;

    // Validate and parse dates
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const end = endDate ? new Date(endDate) : new Date();

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use ISO 8601 format (e.g., 2025-11-05T00:00:00Z)'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date'
      });
    }

    // Validate granularity
    const validGranularities = ['hourly', 'daily', 'weekly'];
    if (!validGranularities.includes(granularity)) {
      return res.status(400).json({
        success: false,
        message: `Invalid granularity. Must be one of: ${validGranularities.join(', ')}`
      });
    }

    // Determine grouping format based on granularity
    let dateFormat;
    if (granularity === 'hourly') {
      dateFormat = '%Y-%m-%d %H:00'; // Group by hour
    } else if (granularity === 'daily') {
      dateFormat = '%Y-%m-%d'; // Group by day
    } else if (granularity === 'weekly') {
      dateFormat = '%Y-W%V'; // Group by week
    }

    // Aggregate occupancy logs to get trends
    const trends = await OccupancyLog.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          statusChange: { $in: ['assigned', 'released', 'maintenance_start', 'maintenance_end'] }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$timestamp' } },
          count: { $sum: 1 },
          assignedCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'assigned'] }, 1, 0] }
          },
          releasedCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'released'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get total beds for context
    const totalBeds = await Bed.countDocuments({});

    res.status(200).json({
      success: true,
      data: {
        timeRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          granularity
        },
        totalBeds,
        trends
      }
    });
  } catch (error) {
    console.error('Get occupancy trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching occupancy trends',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get forecasting data - predicted discharges and available beds
 * @route   GET /api/analytics/forecasting
 * @access  Public
 * @returns { expectedDischarges, availabilityForecast, insights, timeline }
 *
 * Enhanced implementation for Task 2.4:
 * - Calculates actual average length of stay from OccupancyLog
 * - Queries expected discharges based on patient admission times
 * - Provides timeline visualization data
 */
exports.getForecasting = async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Determine ward filter based on user role
    const userRole = req.user?.role || 'unknown';
    const userWard = req.user?.ward;
    let wardFilter = {};
    
    // Managers can only see their ward's data (if ward is set)
    if (userRole === 'manager' && userWard) {
      wardFilter.ward = userWard;
    }
    // hospital_admin, er_staff, technical_team, and managers without ward can see all wards

    // ===== 1. Calculate Average Length of Stay =====
    // Find all assigned/released pairs in last 30 days to calculate actual stay duration
    // Note: OccupancyLog has bedId (ObjectId reference), not ward field directly
    const occupancyLogFilter = {
      timestamp: { $gte: thirtyDaysAgo },
      statusChange: { $in: ['assigned', 'released'] }
    };

    // Fetch occupancy logs and populate bed data to get ward information
    const occupancyLogs = await OccupancyLog.find(occupancyLogFilter)
      .populate('bedId', 'ward bedId') // Populate to get ward field from Bed model
      .sort({ bedId: 1, timestamp: 1 })
      .lean();

    // Filter by ward if manager role (after population)
    let filteredLogs = occupancyLogs;
    if (wardFilter.ward) {
      filteredLogs = occupancyLogs.filter(log => log.bedId?.ward === wardFilter.ward);
    }

    // Group logs by bedId and calculate stay durations
    // Build occupancy sessions: pair each 'assigned' with next 'released' for same bed
    const bedStays = {};
    const stayDurations = [];
    const occupancySessions = []; // Store complete session data for debugging

    filteredLogs.forEach(log => {
      const bedKey = log.bedId?._id?.toString() || log.bedId?.toString();
      if (!bedKey) return; // Skip if bedId is null
      
      if (!bedStays[bedKey]) {
        bedStays[bedKey] = {
          logs: [],
          ward: log.bedId?.ward || 'Unknown'
        };
      }
      bedStays[bedKey].logs.push(log);
    });

    // Calculate duration for each stay (assigned -> released)
    // Each 'assigned' followed by 'released' is one complete occupancy session
    Object.entries(bedStays).forEach(([bedKey, bedData]) => {
      const logs = bedData.logs;
      const ward = bedData.ward;
      
      for (let i = 0; i < logs.length - 1; i++) {
        if (logs[i].statusChange === 'assigned' && logs[i + 1].statusChange === 'released') {
          const admissionTime = logs[i].timestamp;
          const dischargeTime = logs[i + 1].timestamp;
          const durationMs = dischargeTime - admissionTime;
          const durationHours = durationMs / (1000 * 60 * 60);
          const durationDays = durationHours / 24;
          
          // Only count valid sessions (duration > 0 and < 365 days)
          if (durationHours > 0 && durationDays < 365) {
            stayDurations.push(durationDays);
            
            // Store complete session for potential future use
            occupancySessions.push({
              bedId: bedKey,
              ward: ward,
              admissionTime: admissionTime,
              dischargeTime: dischargeTime,
              durationHours: durationHours,
              durationDays: durationDays
            });
          }
        }
      }
    });

    const averageLengthOfStay = stayDurations.length > 0
      ? stayDurations.reduce((sum, dur) => sum + dur, 0) / stayDurations.length
      : 3.5; // Default 3.5 days if no data

    // ===== 2. Get Current Occupancy and Expected Discharges =====
    // Apply ward filter for managers
    const bedFilter = { status: 'occupied', ...wardFilter };
    const occupiedBeds = await Bed.find(bedFilter)
      .select('_id bedId ward patientName patientId updatedAt estimatedDischargeTime')
      .lean();

    // Count total beds (filtered by ward for managers)
    const totalBeds = await Bed.countDocuments(wardFilter);
    const currentlyOccupied = occupiedBeds.length;

    // Calculate expected discharge time for each occupied bed
    // PRIORITY: Use estimatedDischargeTime if set by manager, otherwise use ML prediction
    const mlService = require('../services/mlService');
    
    // Group beds by ward for efficient ML predictions
    const bedsWithoutManualTime = occupiedBeds.filter(bed => !bed.estimatedDischargeTime);
    const mlPredictionsByWard = {};
    
    // Get ML predictions for each ward (one call per ward instead of per bed)
    if (bedsWithoutManualTime.length > 0) {
      const uniqueWards = [...new Set(bedsWithoutManualTime.map(bed => bed.ward))];
      await Promise.all(uniqueWards.map(async ward => {
        try {
          const mlPrediction = await mlService.predictDischarge(ward, new Date());
          if (mlPrediction.success && mlPrediction.data.prediction) {
            mlPredictionsByWard[ward] = mlPrediction.data.prediction.hours_until_discharge;
          }
        } catch (error) {
          console.error(`ML prediction failed for ward ${ward}:`, error.message);
        }
      }));
    }
    
    // A patient's admission time is the latest "assigned" log of their bed
    const admissionLogs = await OccupancyLog.aggregate([
      { $match: { bedId: { $in: occupiedBeds.map(bed => bed._id) }, statusChange: 'assigned' } },
      { $group: { _id: '$bedId', admittedAt: { $max: '$timestamp' } } }
    ]);
    const admittedAt = new Map(admissionLogs.map(a => [String(a._id), a.admittedAt]));

    const expectedDischargesList = occupiedBeds.map(bed => {
      const admissionTime = admittedAt.get(String(bed._id)) || bed.updatedAt;
      let expectedDischargeTime;
      let isManuallySet = false;

      // Use manager-set discharge time if available, otherwise use ML prediction
      if (bed.estimatedDischargeTime) {
        expectedDischargeTime = new Date(bed.estimatedDischargeTime);
        isManuallySet = true;
      } else {
        // Use ML prediction if available for this ward
        if (mlPredictionsByWard[bed.ward]) {
          const hoursToAdd = mlPredictionsByWard[bed.ward];
          expectedDischargeTime = new Date(admissionTime.getTime() + hoursToAdd * 60 * 60 * 1000);
        } else {
          // Fallback: use average length of stay
          expectedDischargeTime = new Date(
            admissionTime.getTime() + averageLengthOfStay * 24 * 60 * 60 * 1000
          );
        }
      }

      const hoursUntilDischarge = (expectedDischargeTime - now) / (1000 * 60 * 60);

      return {
        bedId: bed.bedId,
        ward: bed.ward,
        patientName: bed.patientName,
        patientId: bed.patientId,
        admissionTime: admissionTime,
        expectedDischargeTime: expectedDischargeTime,
        hoursUntilDischarge: Math.max(0, hoursUntilDischarge),
        daysInBed: (now - admissionTime) / (1000 * 60 * 60 * 24),
        isManuallySet: isManuallySet // Flag to indicate if manager set the time
      };
    });

    // Sort by expected discharge time
    expectedDischargesList.sort((a, b) => a.expectedDischargeTime - b.expectedDischargeTime);

    // Count discharges by time window
    const dischargesNext24h = expectedDischargesList.filter(d => d.hoursUntilDischarge <= 24).length;
    const dischargesNext48h = expectedDischargesList.filter(d => d.hoursUntilDischarge <= 48).length;
    const dischargesNext72h = expectedDischargesList.filter(d => d.hoursUntilDischarge <= 72).length;

    // ===== 3. Get Ward-Level Statistics =====
    // Build aggregation pipeline with ward filter for managers
    const wardStatsPipeline = [];
    
    // Add match stage if manager (filter by ward)
    if (wardFilter.ward) {
      wardStatsPipeline.push({
        $match: { ward: wardFilter.ward }
      });
    }
    
    wardStatsPipeline.push(
      {
        $group: {
          _id: '$ward',
          totalBeds: { $sum: 1 },
          occupiedBeds: {
            $sum: { $cond: [{ $eq: ['$status', 'occupied'] }, 1, 0] }
          },
          availableBeds: {
            $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { _id: 1 }
      }
    );
    
    const wardStats = await Bed.aggregate(wardStatsPipeline);

    // Calculate ward-specific forecasts
    const wardForecasts = wardStats.map(ward => {
      const wardDischarges = expectedDischargesList.filter(d => d.ward === ward._id);
      const wardDischargesNext24h = wardDischarges.filter(d => d.hoursUntilDischarge <= 24).length;
      const wardDischargesNext48h = wardDischarges.filter(d => d.hoursUntilDischarge <= 48).length;

      return {
        ward: ward._id,
        totalBeds: ward.totalBeds,
        occupiedBeds: ward.occupiedBeds,
        availableBeds: ward.availableBeds,
        occupancyPercentage: Math.round((ward.occupiedBeds / ward.totalBeds) * 100),
        expectedDischarges: {
          next24Hours: wardDischargesNext24h,
          next48Hours: wardDischargesNext48h
        },
        projectedAvailability: {
          next24Hours: ward.availableBeds + wardDischargesNext24h,
          next48Hours: ward.availableBeds + wardDischargesNext48h
        }
      };
    });

    // ===== 4. Build Timeline Data =====
    // Create hourly buckets for next 72 hours
    const timelineBuckets = [];
    for (let i = 0; i < 72; i += 6) { // 6-hour intervals
      const bucketTime = new Date(now.getTime() + i * 60 * 60 * 1000);
      const bucketEndTime = new Date(now.getTime() + (i + 6) * 60 * 60 * 1000);
      
      const dischargesInBucket = expectedDischargesList.filter(
        d => d.expectedDischargeTime >= bucketTime && d.expectedDischargeTime < bucketEndTime
      );

      timelineBuckets.push({
        startTime: bucketTime,
        endTime: bucketEndTime,
        label: `${i}h - ${i + 6}h`,
        expectedDischarges: dischargesInBucket.length,
        beds: dischargesInBucket.map(d => ({
          bedId: d.bedId,
          ward: d.ward,
          patientId: d.patientId
        }))
      });
    }

    // ===== 5. Generate Insights =====
    const insights = [];
    
    // Count manually set vs estimated discharge times
    const manuallySetCount = expectedDischargesList.filter(d => d.isManuallySet).length;
    const estimatedCount = expectedDischargesList.filter(d => !d.isManuallySet).length;
    
    if (currentlyOccupied / totalBeds > 0.9) {
      insights.push({
        type: 'warning',
        message: `High occupancy alert: ${Math.round((currentlyOccupied / totalBeds) * 100)}% of beds occupied`,
        priority: 'high'
      });
    }

    if (dischargesNext24h >= 3) {
      const manualNext24h = expectedDischargesList.filter(d => d.hoursUntilDischarge <= 24 && d.isManuallySet).length;
      insights.push({
        type: 'info',
        message: `${dischargesNext24h} beds expected to be available in next 24 hours (${manualNext24h} confirmed, ${dischargesNext24h - manualNext24h} estimated)`,
        priority: 'medium'
      });
    }

    if (estimatedCount > manuallySetCount && currentlyOccupied > 5) {
      insights.push({
        type: 'warning',
        message: `${estimatedCount} of ${currentlyOccupied} occupied beds using estimated discharge times. Set accurate discharge times for better forecasting.`,
        priority: 'medium'
      });
    }

    const criticalWards = wardForecasts.filter(w => w.occupancyPercentage > 90);
    if (criticalWards.length > 0) {
      insights.push({
        type: 'warning',
        message: `Critical capacity in ${criticalWards.map(w => w.ward).join(', ')}`,
        priority: 'high'
      });
    }

    // ===== Response =====
    res.status(200).json({
      success: true,
      data: {
        currentMetrics: {
          totalBeds,
          occupiedBeds: currentlyOccupied,
          availableBeds: totalBeds - currentlyOccupied,
          occupancyPercentage: Math.round((currentlyOccupied / totalBeds) * 100)
        },
        averageLengthOfStay: {
          days: Math.round(averageLengthOfStay * 10) / 10,
          hours: Math.round(averageLengthOfStay * 24 * 10) / 10,
          basedOnSamples: stayDurations.length,
          sessionsAnalyzed: occupancySessions.length,
          note: `Calculated from ${occupancySessions.length} patient stays in last 30 days`
        },
        expectedDischarges: {
          next24Hours: dischargesNext24h,
          next48Hours: dischargesNext48h,
          next72Hours: dischargesNext72h,
          total: expectedDischargesList.length,
          manuallySet: expectedDischargesList.filter(d => d.isManuallySet).length,
          estimated: expectedDischargesList.filter(d => !d.isManuallySet).length,
          details: expectedDischargesList.slice(0, 100).map(d => ({
            bedId: d.bedId,
            ward: d.ward,
            patientId: d.patientId,
            patientName: d.patientName,
            expectedDischargeTime: d.expectedDischargeTime,
            hoursUntilDischarge: Math.round(d.hoursUntilDischarge * 10) / 10,
            daysInBed: Math.round(d.daysInBed * 10) / 10,
            isManuallySet: d.isManuallySet
          }))
        },
        wardForecasts,
        timeline: timelineBuckets,
        insights,
        metadata: {
          timestamp: now.toISOString(),
          forecastHorizon: '72 hours',
          calculationMethod: 'Combines manager-set discharge times with AI estimates based on historical average length of stay',
          disclaimer: 'Forecasts prioritize manager-set discharge times when available. Estimates may not account for emergency admissions or unscheduled discharges.',
          accuracyNote: `${manuallySetCount} beds have confirmed discharge times, ${estimatedCount} use AI estimates`,
          filteredByWard: wardFilter.ward || null,
          userRole: userRole,
          scope: wardFilter.ward ? `Data filtered for ${wardFilter.ward} ward only` : 'Hospital-wide data'
        }
      }
    });
  } catch (error) {
    console.error('Get forecasting error:', error);
    console.error('User info:', req.user ? { role: req.user.role, ward: req.user.ward, id: req.user._id } : 'No user');
    res.status(500).json({
      success: false,
      message: 'Server error fetching forecasting data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get cleaning performance analytics
 * @route   GET /api/analytics/cleaning-performance
 * @access  Private (Manager, Hospital Admin)
 * @query   ward (optional), startDate, endDate, period (default: 7 days)
 */
exports.getCleaningPerformance = async (req, res) => {
  try {
    const { ward, startDate, endDate, period = 7 } = req.query;
    
    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.startTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to last N days based on period
      const daysAgo = parseInt(period) || 7;
      dateFilter.startTime = {
        $gte: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
      };
    }
    
    // Build filter
    const filter = { ...dateFilter };
    
    // Apply ward filter for managers
    if (req.user.role === 'manager' && req.user.ward) {
      filter.ward = req.user.ward;
    } else if (ward) {
      filter.ward = ward;
    }
    
    // Get all cleaning logs
    const allCleanings = await CleaningLog.find(filter)
      .populate('assignedTo', 'name email')
      .populate('completedBy', 'name email')
      .sort({ startTime: -1 })
      .lean();
    
    // Filter completed cleanings for detailed stats
    const completedCleanings = allCleanings.filter(log => log.status === 'completed');
    const overdueCleanings = completedCleanings.filter(log => 
      log.actualDuration > log.estimatedDuration
    );
    const inProgressCleanings = allCleanings.filter(log => log.status === 'in_progress');
    
    // Calculate statistics
    const totalCleanings = allCleanings.length;
    const totalCompleted = completedCleanings.length;
    const totalOverdue = overdueCleanings.length;
    const totalInProgress = inProgressCleanings.length;
    
    // Average durations
    const avgActualDuration = completedCleanings.length > 0
      ? completedCleanings.reduce((sum, log) => sum + log.actualDuration, 0) / completedCleanings.length
      : 0;
    
    const avgEstimatedDuration = allCleanings.length > 0
      ? allCleanings.reduce((sum, log) => sum + log.estimatedDuration, 0) / allCleanings.length
      : 0;
    
    // Fastest and slowest cleanings
    const sortedByDuration = [...completedCleanings].sort((a, b) => a.actualDuration - b.actualDuration);
    const fastestCleaning = sortedByDuration[0] || null;
    const slowestCleaning = sortedByDuration[sortedByDuration.length - 1] || null;
    
    // Overdue rate
    const overdueRate = totalCompleted > 0
      ? Math.round((totalOverdue / totalCompleted) * 100)
      : 0;
    
    // On-time rate
    const onTimeRate = totalCompleted > 0
      ? Math.round(((totalCompleted - totalOverdue) / totalCompleted) * 100)
      : 0;
    
    // Group by ward
    const byWard = {};
    allCleanings.forEach(log => {
      if (!byWard[log.ward]) {
        byWard[log.ward] = {
          total: 0,
          completed: 0,
          overdue: 0,
          inProgress: 0,
          avgDuration: 0
        };
      }
      
      byWard[log.ward].total++;
      if (log.status === 'completed') {
        byWard[log.ward].completed++;
        if (log.actualDuration > log.estimatedDuration) {
          byWard[log.ward].overdue++;
        }
      } else if (log.status === 'in_progress') {
        byWard[log.ward].inProgress++;
      }
    });
    
    // Calculate average duration per ward
    Object.keys(byWard).forEach(wardName => {
      const wardCleanings = completedCleanings.filter(log => log.ward === wardName);
      if (wardCleanings.length > 0) {
        byWard[wardName].avgDuration = Math.round(
          wardCleanings.reduce((sum, log) => sum + log.actualDuration, 0) / wardCleanings.length
        );
      }
    });
    
    // Group by staff member (only for completed cleanings)
    const byStaff = {};
    completedCleanings.forEach(log => {
      if (log.completedBy) {
        const staffId = log.completedBy._id.toString();
        if (!byStaff[staffId]) {
          byStaff[staffId] = {
            name: log.completedBy.name || log.completedBy.email,
            email: log.completedBy.email,
            totalCompleted: 0,
            avgDuration: 0,
            overdue: 0
          };
        }
        
        byStaff[staffId].totalCompleted++;
        if (log.actualDuration > log.estimatedDuration) {
          byStaff[staffId].overdue++;
        }
      }
    });
    
    // Calculate average duration per staff
    Object.keys(byStaff).forEach(staffId => {
      const staffCleanings = completedCleanings.filter(log => 
        log.completedBy && log.completedBy._id.toString() === staffId
      );
      if (staffCleanings.length > 0) {
        byStaff[staffId].avgDuration = Math.round(
          staffCleanings.reduce((sum, log) => sum + log.actualDuration, 0) / staffCleanings.length
        );
      }
    });
    
    // Convert to array and sort by total completed (descending)
    const staffPerformance = Object.values(byStaff).sort((a, b) => b.totalCompleted - a.totalCompleted);
    
    // Daily breakdown
    const dailyStats = {};
    allCleanings.forEach(log => {
      const dateKey = new Date(log.startTime).toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = {
          date: dateKey,
          total: 0,
          completed: 0,
          overdue: 0,
          inProgress: 0
        };
      }
      
      dailyStats[dateKey].total++;
      if (log.status === 'completed') {
        dailyStats[dateKey].completed++;
        if (log.actualDuration > log.estimatedDuration) {
          dailyStats[dateKey].overdue++;
        }
      } else if (log.status === 'in_progress') {
        dailyStats[dateKey].inProgress++;
      }
    });
    
    // Convert to array and sort by date (ascending)
    const dailyBreakdown = Object.values(dailyStats).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCleanings,
          totalCompleted,
          totalOverdue,
          totalInProgress,
          overdueRate,
          onTimeRate,
          avgActualDuration: Math.round(avgActualDuration),
          avgEstimatedDuration: Math.round(avgEstimatedDuration)
        },
        performance: {
          fastestCleaning: fastestCleaning ? {
            bedId: fastestCleaning.bedId,
            ward: fastestCleaning.ward,
            duration: fastestCleaning.actualDuration,
            completedBy: fastestCleaning.completedBy?.name || 'Unknown'
          } : null,
          slowestCleaning: slowestCleaning ? {
            bedId: slowestCleaning.bedId,
            ward: slowestCleaning.ward,
            duration: slowestCleaning.actualDuration,
            completedBy: slowestCleaning.completedBy?.name || 'Unknown'
          } : null
        },
        byWard,
        staffPerformance,
        dailyBreakdown,
        recentCleanings: allCleanings.slice(0, 10) // Last 10 cleanings
      }
    });
  } catch (error) {
    console.error('Get cleaning performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching cleaning performance',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get occupancy history with date range and granularity
 * @route   GET /api/analytics/occupancy-history
 * @access  Public
 * @query   startDate (ISO string), endDate (ISO string), wardFilter (string), granularity ('hourly'|'daily'|'weekly', default: 'daily')
 * @returns Time series data of occupancy changes aggregated from OccupancyLog
 */
exports.getOccupancyHistory = async (req, res) => {
  try {
    const { startDate, endDate, wardFilter, granularity = 'daily' } = req.query;

    // Default to last 30 days if no dates provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use ISO 8601 format (e.g., 2025-11-01T00:00:00Z)'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }

    // Validate granularity
    const validGranularities = ['hourly', 'daily', 'weekly'];
    if (!validGranularities.includes(granularity)) {
      return res.status(400).json({
        success: false,
        message: `Invalid granularity. Must be one of: ${validGranularities.join(', ')}`
      });
    }

    // Determine grouping format based on granularity
    let dateFormat;
    if (granularity === 'hourly') {
      dateFormat = '%Y-%m-%d %H:00';
    } else if (granularity === 'daily') {
      dateFormat = '%Y-%m-%d';
    } else if (granularity === 'weekly') {
      dateFormat = '%Y-W%V';
    }

    // Build aggregation pipeline
    const matchStage = {
      timestamp: { $gte: start, $lte: end }
    };

    // Add ward filter if provided
    if (wardFilter) {
      const bedsInWard = await Bed.find({ ward: wardFilter }).distinct('_id');
      matchStage.bedId = { $in: bedsInWard };
    }

    const history = await OccupancyLog.aggregate([
      {
        $match: matchStage
      },
      {
        $lookup: {
          from: 'beds',
          localField: 'bedId',
          foreignField: '_id',
          as: 'bedDetails'
        }
      },
      {
        $unwind: { path: '$bedDetails', preserveNullAndEmptyArrays: true }
      },
      {
        $group: {
          _id: {
            timePeriod: { $dateToString: { format: dateFormat, date: '$timestamp' } },
            ward: '$bedDetails.ward'
          },
          totalChanges: { $sum: 1 },
          assignedCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'assigned'] }, 1, 0] }
          },
          releasedCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'released'] }, 1, 0] }
          },
          maintenanceStartCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'maintenance_start'] }, 1, 0] }
          },
          maintenanceEndCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'maintenance_end'] }, 1, 0] }
          },
          reservedCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'reserved'] }, 1, 0] }
          },
          reservationCancelledCount: {
            $sum: { $cond: [{ $eq: ['$statusChange', 'reservation_cancelled'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id.timePeriod': 1, '_id.ward': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        timeRange: {
          start: start.toISOString(),
          end: end.toISOString(),
          granularity
        },
        wardFilter: wardFilter || 'all',
        history
      }
    });
  } catch (error) {
    console.error('Get occupancy history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching occupancy history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get ward utilization with detailed metrics
 * @route   GET /api/analytics/ward-utilization
 * @access  Public
 * @returns Detailed ward-level metrics aggregated from OccupancyLog and Bed data
 */
exports.getWardUtilization = async (req, res) => {
  try {
    // Get all unique wards
    const wards = await Bed.distinct('ward');

    // For each ward, calculate detailed metrics
    const utilizationData = await Promise.all(
      wards.map(async (ward) => {
        // Current bed status counts
        const [totalBeds, occupied, available, maintenance, reserved] = await Promise.all([
          Bed.countDocuments({ ward }),
          Bed.countDocuments({ ward, status: 'occupied' }),
          Bed.countDocuments({ ward, status: 'available' }),
          Bed.countDocuments({ ward, status: 'maintenance' }),
          Bed.countDocuments({ ward, status: 'reserved' })
        ]);

        // Calculate occupancy percentage
        const occupancyPercentage = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0;

        // Get occupancy log data for the last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const bedIds = await Bed.find({ ward }).distinct('_id');

        const recentLogs = await OccupancyLog.find({
          bedId: { $in: bedIds },
          timestamp: { $gte: sevenDaysAgo }
        }).lean();

        // Calculate turnover rate (number of assigned + released events)
        const turnoverCount = recentLogs.filter(
          log => log.statusChange === 'assigned' || log.statusChange === 'released'
        ).length;

        // Calculate average turnaround time (time between released and next assigned)
        const turnAroundTimes = [];
        const sortedLogs = recentLogs.sort((a, b) => a.timestamp - b.timestamp);
        
        const bedLogGroups = {};
        sortedLogs.forEach(log => {
          const bedIdStr = log.bedId.toString();
          if (!bedLogGroups[bedIdStr]) {
            bedLogGroups[bedIdStr] = [];
          }
          bedLogGroups[bedIdStr].push(log);
        });

        Object.values(bedLogGroups).forEach(logs => {
          for (let i = 0; i < logs.length - 1; i++) {
            if (logs[i].statusChange === 'released' && logs[i + 1].statusChange === 'assigned') {
              const turnAroundMs = logs[i + 1].timestamp - logs[i].timestamp;
              const turnAroundHours = turnAroundMs / (1000 * 60 * 60);
              turnAroundTimes.push(turnAroundHours);
            }
          }
        });

        const avgTurnAroundTime = turnAroundTimes.length > 0
          ? Math.round((turnAroundTimes.reduce((sum, t) => sum + t, 0) / turnAroundTimes.length) * 10) / 10
          : 0;

        return {
          ward,
          totalBeds,
          currentStatus: {
            occupied,
            available,
            maintenance,
            reserved
          },
          occupancyPercentage,
          last7Days: {
            totalStatusChanges: recentLogs.length,
            turnoverCount,
            avgTurnAroundTimeHours: avgTurnAroundTime,
            assignedCount: recentLogs.filter(log => log.statusChange === 'assigned').length,
            releasedCount: recentLogs.filter(log => log.statusChange === 'released').length,
            maintenanceEvents: recentLogs.filter(
              log => log.statusChange === 'maintenance_start' || log.statusChange === 'maintenance_end'
            ).length
          }
        };
      })
    );

    // Sort by occupancy percentage descending
    utilizationData.sort((a, b) => b.occupancyPercentage - a.occupancyPercentage);

    res.status(200).json({
      success: true,
      data: {
        totalWards: wards.length,
        utilization: utilizationData
      }
    });
  } catch (error) {
    console.error('Get ward utilization error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching ward utilization',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get peak demand analysis with seasonal patterns and projections
 * @route   GET /api/analytics/peak-demand-analysis
 * @access  Public
 * @returns Peak demand patterns, seasonal trends, and projections from OccupancyLog
 */
exports.getPeakDemandAnalysis = async (req, res) => {
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Aggregate occupancy logs by hour of day and day of week
    const hourlyPattern = await OccupancyLog.aggregate([
      {
        $match: {
          timestamp: { $gte: ninetyDaysAgo },
          statusChange: 'assigned'
        }
      },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Aggregate by day of week
    const dayOfWeekPattern = await OccupancyLog.aggregate([
      {
        $match: {
          timestamp: { $gte: ninetyDaysAgo },
          statusChange: 'assigned'
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$timestamp' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Map day numbers to names
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekData = dayOfWeekPattern.map(item => ({
      day: dayNames[item._id - 1],
      dayNumber: item._id,
      admissionCount: item.count
    }));

    // Find peak hours and days
    const peakHour = hourlyPattern.reduce((max, item) => item.count > max.count ? item : max, { _id: 0, count: 0 });
    const peakDay = dayOfWeekPattern.reduce((max, item) => item.count > max.count ? item : max, { _id: 0, count: 0 });

    // Calculate monthly trends for seasonal patterns
    const monthlyTrends = await OccupancyLog.aggregate([
      {
        $match: {
          timestamp: { $gte: ninetyDaysAgo },
          statusChange: 'assigned'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' }
          },
          admissionCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Calculate average daily admissions
    const totalAssignments = await OccupancyLog.countDocuments({
      timestamp: { $gte: ninetyDaysAgo },
      statusChange: 'assigned'
    });
    const avgDailyAdmissions = Math.round((totalAssignments / 90) * 10) / 10;

    // Project next 7 days based on day-of-week pattern
    const projections = [];
    for (let i = 0; i < 7; i++) {
      const projectedDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = projectedDate.getDay() + 1; // MongoDB uses 1-7, JS uses 0-6
      const dayPattern = dayOfWeekPattern.find(d => d._id === dayOfWeek) || { count: 0 };
      const projectedAdmissions = Math.round((dayPattern.count / 90) * 7); // Scale to expected daily count

      projections.push({
        date: projectedDate.toISOString().split('T')[0],
        dayOfWeek: dayNames[projectedDate.getDay()],
        projectedAdmissions
      });
    }

    // Calculate current total beds for capacity planning
    const totalBeds = await Bed.countDocuments({});
    const currentOccupied = await Bed.countDocuments({ status: 'occupied' });
    const currentOccupancyRate = totalBeds > 0 ? Math.round((currentOccupied / totalBeds) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        analysisWindow: {
          start: ninetyDaysAgo.toISOString(),
          end: now.toISOString(),
          days: 90
        },
        currentCapacity: {
          totalBeds,
          occupied: currentOccupied,
          available: totalBeds - currentOccupied,
          occupancyRate: currentOccupancyRate
        },
        peakDemand: {
          peakHour: {
            hour: peakHour._id,
            timeRange: `${peakHour._id}:00 - ${peakHour._id + 1}:00`,
            admissionCount: peakHour.count
          },
          peakDay: {
            day: dayNames[peakDay._id - 1],
            admissionCount: peakDay.count
          },
          avgDailyAdmissions
        },
        patterns: {
          hourlyDistribution: hourlyPattern.map(item => ({
            hour: item._id,
            timeRange: `${item._id}:00 - ${item._id + 1}:00`,
            admissionCount: item.count
          })),
          dayOfWeekDistribution: dayOfWeekData
        },
        seasonalTrends: {
          monthlyData: monthlyTrends.map(item => ({
            year: item._id.year,
            month: item._id.month,
            monthName: new Date(item._id.year, item._id.month - 1).toLocaleString('default', { month: 'long' }),
            admissionCount: item.admissionCount
          }))
        },
        projections: {
          next7Days: projections,
          methodology: 'Based on historical day-of-week admission patterns from last 90 days'
        }
      }
    });
  } catch (error) {
    console.error('Get peak demand analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching peak demand analysis',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

