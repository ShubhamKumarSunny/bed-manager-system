/**
 * ML Service Client
 * 
 * Service for communicating with the FastAPI ML microservice
 * Provides predictions for:
 * - Discharge time
 * - Bed availability
 * - Cleaning duration
 */

const axios = require('axios');
const OccupancyLog = require('../models/OccupancyLog');
const CleaningLog = require('../models/CleaningLog');
const Bed = require('../models/Bed');

const HOUR_MS = 60 * 60 * 1000;
const STATS_TTL_MS = 10 * 60 * 1000;
const DEFAULT_STAY_HOURS = { ICU: 120, Emergency: 48, General: 72 };

class MLService {
  constructor() {
    // The ML microservice is optional. Without ML_SERVICE_URL every prediction
    // comes from the statistical fallback built on the hospital's own history.
    this.enabled = Boolean(process.env.ML_SERVICE_URL);
    this.baseURL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    this.statsCache = new Map();
    this.apiPrefix = '/api/ml';
    this.timeout = 5000; // 5 seconds
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Check if ML service is healthy and models are loaded
   */
  async healthCheck() {
    if (!this.enabled) return { success: false, error: 'ML service not configured' };
    try {
      const response = await this.client.get('/health');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('ML Service health check failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Predict discharge time for a patient
   * 
   * @param {string} ward - Ward name (ICU, Emergency, General, etc.)
   * @param {Date} admissionTime - Optional admission time (defaults to now)
   * @returns {Promise<Object>} Prediction with hours until discharge and estimated discharge time
   */
  async predictDischarge(ward, admissionTime = null) {
    if (this.enabled) {
      try {
        const response = await this.client.post(`${this.apiPrefix}/predict/discharge`, {
          ward,
          admission_time: admissionTime ? admissionTime.toISOString() : null
        });
        return { success: true, source: 'ml', data: response.data };
      } catch (error) {
        console.error('Discharge prediction failed:', error.message);
      }
    }

    return {
      success: false,
      source: 'historical',
      fallback: await this._getFallbackDischargeEstimate(ward, admissionTime)
    };
  }

  /**
   * Predict bed availability in the next N hours
   * 
   * @param {string} ward - Ward name
   * @param {number} horizonHours - Hours ahead to predict (default 6)
   * @param {Date} currentTime - Optional current time (defaults to now)
   * @returns {Promise<Object>} Prediction with probability of bed availability
   */
  async predictBedAvailability(ward, horizonHours = 6, currentTime = null) {
    if (this.enabled) {
      try {
        const response = await this.client.post(`${this.apiPrefix}/predict/bed-availability`, {
          ward,
          current_time: currentTime ? currentTime.toISOString() : null,
          prediction_horizon_hours: horizonHours
        });
        return { success: true, source: 'ml', data: response.data };
      } catch (error) {
        console.error('Bed availability prediction failed:', error.message);
      }
    }

    return {
      success: false,
      source: 'historical',
      fallback: { will_be_available: false, probability: 0.5 }
    };
  }

  /**
   * Predict cleaning duration for a bed
   * 
   * @param {string} ward - Ward name
   * @param {number} estimatedDuration - Initial estimate in minutes (default 30)
   * @param {Date} startTime - Optional start time (defaults to now)
   * @returns {Promise<Object>} Prediction with actual cleaning duration
   */
  async predictCleaningDuration(ward, estimatedDuration = 30, startTime = null) {
    if (this.enabled) {
      try {
        const response = await this.client.post(`${this.apiPrefix}/predict/cleaning-duration`, {
          ward,
          estimated_duration: estimatedDuration,
          start_time: startTime ? startTime.toISOString() : null
        });
        return { success: true, source: 'ml', data: response.data };
      } catch (error) {
        console.error('Cleaning duration prediction failed:', error.message);
      }
    }

    return {
      success: false,
      source: 'historical',
      fallback: await this._getFallbackCleaningDuration(ward, estimatedDuration, startTime)
    };
  }

  /**
   * Cache a per-ward statistic for a few minutes
   * @private
   */
  async _cached(key, compute) {
    const hit = this.statsCache.get(key);
    if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.value;
    const value = await compute();
    this.statsCache.set(key, { at: Date.now(), value });
    return value;
  }

  /**
   * Average completed length of stay (hours) for a ward over the last 30 days
   * @private
   */
  _averageStayHours(ward) {
    return this._cached(`stay:${ward}`, async () => {
      const bedIds = await Bed.find({ ward }).distinct('_id');
      const logs = await OccupancyLog.find({
        bedId: { $in: bedIds },
        statusChange: { $in: ['assigned', 'released'] },
        timestamp: { $gte: new Date(Date.now() - 30 * 24 * HOUR_MS) }
      })
        .sort({ timestamp: 1 })
        .select('bedId statusChange timestamp')
        .lean();

      const open = new Map();
      let total = 0;
      let count = 0;
      for (const log of logs) {
        const key = String(log.bedId);
        if (log.statusChange === 'assigned') {
          open.set(key, log.timestamp);
        } else if (open.has(key)) {
          total += (log.timestamp - open.get(key)) / HOUR_MS;
          count++;
          open.delete(key);
        }
      }
      return count >= 5 ? total / count : (DEFAULT_STAY_HOURS[ward] || 72);
    });
  }

  /**
   * Average ratio of actual to estimated cleaning time for a ward
   * @private
   */
  _cleaningRatio(ward) {
    return this._cached(`cleaning:${ward}`, async () => {
      const [stats] = await CleaningLog.aggregate([
        { $match: { ward, status: 'completed', actualDuration: { $gt: 0 }, estimatedDuration: { $gt: 0 } } },
        { $sort: { startTime: -1 } },
        { $limit: 300 },
        { $group: { _id: null, actual: { $sum: '$actualDuration' }, estimated: { $sum: '$estimatedDuration' }, count: { $sum: 1 } } }
      ]);
      return stats && stats.count >= 5 ? stats.actual / stats.estimated : 1.1;
    });
  }

  /**
   * Statistical discharge estimate: the ward's average length of stay minus
   * the time the patient has already spent in the bed.
   * @private
   */
  async _getFallbackDischargeEstimate(ward, admissionTime) {
    let averageStay = DEFAULT_STAY_HOURS[ward] || 72;
    try {
      averageStay = await this._averageStayHours(ward);
    } catch (error) {
      console.error('Average stay lookup failed:', error.message);
    }

    const elapsed = admissionTime ? Math.max(0, (Date.now() - new Date(admissionTime).getTime()) / HOUR_MS) : 0;
    // Patients already past the average stay are expected to leave soon
    const remaining = Math.max(averageStay - elapsed, 6);

    return {
      hours_until_discharge: Math.round(remaining * 10) / 10,
      estimated_discharge_time: new Date(Date.now() + remaining * HOUR_MS).toISOString(),
      average_stay_hours: Math.round(averageStay * 10) / 10,
      note: 'Estimate from historical length of stay'
    };
  }

  /**
   * Statistical cleaning estimate: the planned duration scaled by how long
   * cleanings in this ward actually take compared to their estimates.
   * @private
   */
  async _getFallbackCleaningDuration(ward, estimatedDuration, startTime) {
    let ratio = 1.1;
    try {
      ratio = await this._cleaningRatio(ward);
    } catch (error) {
      console.error('Cleaning ratio lookup failed:', error.message);
    }

    const minutes = Math.max(5, Math.round(estimatedDuration * ratio));
    const start = startTime ? new Date(startTime) : new Date();

    return {
      predicted_duration_minutes: minutes,
      estimated_end_time: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
      note: 'Estimate from historical cleaning times'
    };
  }

  /**
   * Get service status and model information
   */
  async getModelsStatus() {
    if (!this.enabled) return { success: false, error: 'ML service not configured' };
    try {
      const response = await this.client.get('/models/status');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Models status check failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export singleton instance
module.exports = new MLService();
