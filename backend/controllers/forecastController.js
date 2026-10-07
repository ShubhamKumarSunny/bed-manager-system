// backend/controllers/forecastController.js
const Bed = require('../models/Bed');
const OccupancyLog = require('../models/OccupancyLog');
const mlService = require('../services/mlService');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HISTORY_WEEKS = 4;
const FORECAST_DAYS = 28;

/**
 * @desc    Occupancy forecast: per-bed discharge and cleaning predictions plus a
 *          day-by-day occupancy projection (expected discharges vs. the
 *          hospital's historical admission pattern)
 * @route   GET /api/analytics/occupancy-forecast?mode=predicted|manager
 * @access  Private (managers see only their ward)
 */
exports.getOccupancyForecast = async (req, res) => {
  try {
    const mode = req.query.mode === 'manager' ? 'manager' : 'predicted';
    const now = Date.now();

    const bedFilter = req.user.role === 'manager' && req.user.ward ? { ward: req.user.ward } : {};
    const beds = await Bed.find(bedFilter).lean();
    const bedIds = beds.map(bed => bed._id);
    const occupiedBeds = beds.filter(bed => bed.status === 'occupied');
    const cleaningBeds = beds.filter(bed => bed.status === 'cleaning');
    const totalBeds = beds.length;
    const wards = [...new Set(beds.map(bed => bed.ward))];

    // Typical stay per ward: ML service when configured, historical average otherwise
    const stayByWard = {};
    let source = 'historical';
    await Promise.all(wards.map(async ward => {
      const result = await mlService.predictDischarge(ward, new Date());
      const prediction = result.success ? result.data.prediction : result.fallback;
      stayByWard[ward] = result.success ? prediction.hours_until_discharge : prediction.average_stay_hours;
      if (result.success) source = 'ml';
    }));

    // Admission time of every current patient = latest "assigned" log of the bed
    const admissions = await OccupancyLog.aggregate([
      { $match: { bedId: { $in: occupiedBeds.map(bed => bed._id) }, statusChange: 'assigned' } },
      { $group: { _id: '$bedId', admittedAt: { $max: '$timestamp' } } }
    ]);
    const admittedAt = new Map(admissions.map(a => [String(a._id), a.admittedAt]));

    const discharges = occupiedBeds.map(bed => {
      const admitted = admittedAt.get(String(bed._id)) || bed.updatedAt;
      const elapsedHours = (now - new Date(admitted).getTime()) / HOUR_MS;
      const managerSet = Boolean(bed.estimatedDischargeTime);

      let hours;
      if (mode === 'manager' && managerSet) {
        hours = Math.max(0, (new Date(bed.estimatedDischargeTime).getTime() - now) / HOUR_MS);
      } else {
        // Patients at or past the typical stay still have some time left: spread
        // them deterministically over the next 15-65% of a typical stay.
        const typicalStay = stayByWard[bed.ward];
        const spread = typicalStay * (0.15 + (parseInt(String(bed._id).slice(-4), 16) % 100) / 200);
        hours = Math.max(typicalStay - elapsedHours, spread);
      }

      return {
        bedId: bed._id,
        bedNumber: bed.bedId,
        ward: bed.ward,
        patientName: bed.patientName,
        admittedAt: admitted,
        managerSet: mode === 'manager' && managerSet,
        predicted_hours_until_discharge: Math.round(hours * 10) / 10,
        estimated_discharge_time: new Date(now + hours * HOUR_MS).toISOString()
      };
    }).sort((a, b) => a.predicted_hours_until_discharge - b.predicted_hours_until_discharge);

    const cleaningTimes = await Promise.all(cleaningBeds.map(async bed => {
      const result = await mlService.predictCleaningDuration(
        bed.ward,
        bed.estimatedCleaningDuration || 30,
        bed.cleaningStartTime || new Date()
      );
      const prediction = result.success ? result.data.prediction : result.fallback;
      const start = new Date(bed.cleaningStartTime || now).getTime();
      const minutes = Math.round(prediction.predicted_duration_minutes);
      return {
        bedId: bed._id,
        bedNumber: bed.bedId,
        ward: bed.ward,
        predicted_cleaning_minutes: minutes,
        predicted_end_time: prediction.estimated_end_time || new Date(start + minutes * 60 * 1000).toISOString()
      };
    }));

    // Historical admissions per weekday (average over the last few weeks)
    const historyStart = new Date(now - HISTORY_WEEKS * 7 * DAY_MS);
    const admissionLogs = await OccupancyLog.find({
      bedId: { $in: bedIds },
      statusChange: 'assigned',
      timestamp: { $gte: historyStart }
    }).select('timestamp').lean();

    const admissionsByWeekday = new Array(7).fill(0);
    admissionLogs.forEach(log => { admissionsByWeekday[new Date(log.timestamp).getDay()] += 1 / HISTORY_WEEKS; });
    const avgDailyAdmissions = admissionLogs.length / (HISTORY_WEEKS * 7);

    // Average stay (in days) of future admissions, weighted by ward size
    const avgStayDays = totalBeds > 0
      ? beds.reduce((sum, bed) => sum + stayByWard[bed.ward], 0) / totalBeds / 24
      : 3;
    const stayFloor = Math.max(1, Math.floor(avgStayDays));
    const stayFraction = Math.max(0, Math.min(1, avgStayDays - stayFloor));

    // Day-by-day projection: current patients leave at their predicted time,
    // new patients arrive at the historical rate and stay the average duration.
    const newAdmissions = [0];
    const projection = [];
    let occupied = occupiedBeds.length;

    for (let day = 1; day <= FORECAST_DAYS; day++) {
      const knownDischarges = discharges.filter(d =>
        d.predicted_hours_until_discharge > (day - 1) * 24 && d.predicted_hours_until_discharge <= day * 24
      ).length + (day === 1 ? discharges.filter(d => d.predicted_hours_until_discharge === 0).length : 0);

      const turnoverDischarges =
        (1 - stayFraction) * (newAdmissions[day - stayFloor] || 0) +
        stayFraction * (newAdmissions[day - stayFloor - 1] || 0);

      const afterDischarges = Math.max(0, occupied - knownDischarges - turnoverDischarges);
      const weekday = new Date(now + day * DAY_MS).getDay();
      const admitted = Math.min(admissionsByWeekday[weekday], Math.max(0, totalBeds - afterDischarges));
      newAdmissions[day] = admitted;
      occupied = afterDischarges + admitted;

      projection.push({
        day,
        date: new Date(now + day * DAY_MS).toISOString(),
        occupied: Math.round(occupied),
        available: Math.max(0, totalBeds - Math.round(occupied)),
        predicted: totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0,
        expectedDischarges: Math.round(knownDischarges + turnoverDischarges),
        expectedAdmissions: Math.round(admitted)
      });
    }

    // Heuristic confidence: the further out, the less certain
    const daily = projection.slice(0, 7).map((p, i) => ({ ...p, confidence: 92 - i * 3 }));
    const weekly = [7, 14, 21, 28].map((day, i) => ({ ...projection[day - 1], week: i + 1, confidence: 78 - i * 7 }));

    res.status(200).json({
      success: true,
      data: {
        mode,
        source,
        ward: bedFilter.ward || null,
        current: {
          totalBeds,
          occupied: occupiedBeds.length,
          available: beds.filter(bed => bed.status === 'available').length,
          cleaning: cleaningBeds.length,
          occupancyRate: totalBeds > 0 ? Math.round((occupiedBeds.length / totalBeds) * 100) : 0
        },
        averageStayHours: Object.fromEntries(Object.entries(stayByWard).map(([w, h]) => [w, Math.round(h * 10) / 10])),
        avgDailyAdmissions: Math.round(avgDailyAdmissions * 10) / 10,
        discharges,
        cleaningTimes,
        availability: {
          available24h: projection[0]?.available ?? 0,
          available48h: projection[1]?.available ?? 0
        },
        daily,
        weekly
      }
    });
  } catch (error) {
    console.error('Occupancy forecast error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating occupancy forecast',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Historical occupancy rate, reconstructed by replaying admission and
 *          discharge logs backwards from the current bed state
 * @route   GET /api/analytics/occupancy-rate-history?range=7days|30days|90days&ward=ICU
 * @access  Private (managers see only their ward)
 */
exports.getOccupancyRateHistory = async (req, res) => {
  try {
    const ranges = { '7days': { days: 7, bucket: 1 }, '30days': { days: 28, bucket: 7 }, '90days': { days: 90, bucket: 30 } };
    const rangeKey = ranges[req.query.range] ? req.query.range : '7days';
    const { days, bucket } = ranges[rangeKey];

    const bedFilter = {};
    if (req.user.role === 'manager' && req.user.ward) bedFilter.ward = req.user.ward;
    else if (typeof req.query.ward === 'string' && req.query.ward) bedFilter.ward = req.query.ward;

    const beds = await Bed.find(bedFilter).select('_id status').lean();
    const totalBeds = beds.length;
    const bedIds = beds.map(bed => bed._id);

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(24, 0, 0, 0);
    const start = new Date(endOfToday.getTime() - days * DAY_MS);

    const logs = await OccupancyLog.find({
      bedId: { $in: bedIds },
      statusChange: { $in: ['assigned', 'released'] },
      timestamp: { $gte: start }
    }).sort({ timestamp: 1 }).select('statusChange timestamp').lean();

    // History only goes back as far as the logs do
    const firstLog = await OccupancyLog.findOne({ bedId: { $in: bedIds } }).sort({ timestamp: 1 }).select('timestamp').lean();
    const historyStart = firstLog ? firstLog.timestamp : now;

    // Occupancy at `start` = occupancy now minus the net admissions since then
    const net = logs.reduce((sum, log) => sum + (log.statusChange === 'assigned' ? 1 : -1), 0);
    const clamp = (value) => Math.max(0, Math.min(totalBeds, value));
    let occupied = clamp(beds.filter(bed => bed.status === 'occupied').length - net);

    // Sweep forward, integrating occupied bed-time per day
    const daily = [];
    let index = 0;
    for (let day = 0; day < days; day++) {
      const dayStart = new Date(start.getTime() + day * DAY_MS);
      const dayEnd = new Date(Math.min(dayStart.getTime() + DAY_MS, now.getTime()));
      let cursor = dayStart;
      let bedTime = 0;

      while (index < logs.length && logs[index].timestamp < dayEnd) {
        bedTime += occupied * (logs[index].timestamp - cursor);
        occupied = clamp(occupied + (logs[index].statusChange === 'assigned' ? 1 : -1));
        cursor = logs[index].timestamp;
        index++;
      }
      bedTime += occupied * Math.max(0, dayEnd - cursor);

      const span = dayEnd - dayStart;
      const hasData = span > 0 && dayEnd > historyStart && totalBeds > 0;
      daily.push({
        date: dayStart,
        occupancy: hasData ? Math.round((bedTime / span / totalBeds) * 100) : null
      });
    }

    // Group days into the buckets the chart displays
    const formatDate = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const points = [];
    for (let i = 0; i < daily.length; i += bucket) {
      const slice = daily.slice(i, i + bucket).filter(d => d.occupancy !== null);
      // Skip periods with no data or only a sliver of it
      if (slice.length === 0 || slice.length < bucket / 2) continue;
      const first = slice[0].date;
      const last = slice[slice.length - 1].date;
      points.push({
        day: bucket === 1
          ? first.toLocaleDateString('en-US', { weekday: 'short' })
          : `${formatDate(first)} - ${formatDate(last)}`,
        date: first,
        occupancy: Math.round(slice.reduce((sum, d) => sum + d.occupancy, 0) / slice.length),
        capacity: 100
      });
    }

    res.status(200).json({
      success: true,
      data: { range: rangeKey, ward: bedFilter.ward || null, totalBeds, points }
    });
  } catch (error) {
    console.error('Occupancy rate history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching occupancy history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
