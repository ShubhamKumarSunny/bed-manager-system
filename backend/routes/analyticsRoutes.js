// backend/routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const {
  getOccupancySummary,
  getOccupancyByWard,
  getBedHistory,
  getOccupancyTrends,
  getForecasting,
  getCleaningPerformance,
  getOccupancyHistory,
  getWardUtilization,
  getPeakDemandAnalysis
} = require('../controllers/analyticsController');
const { getOccupancyForecast, getOccupancyRateHistory } = require('../controllers/forecastController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All analytics routes require an authenticated user
router.use(protect);

/**
 * GET /api/analytics/occupancy-summary
 * Get overall occupancy metrics
 */
router.get('/occupancy-summary', getOccupancySummary);

/**
 * GET /api/analytics/occupancy-by-ward
 * Get occupancy breakdown by ward
 */
router.get('/occupancy-by-ward', getOccupancyByWard);

/**
 * GET /api/analytics/bed-history/:bedId
 * Get complete history of status changes for a specific bed
 * Supports pagination via query params: limit, skip
 */
router.get('/bed-history/:bedId', getBedHistory);

/**
 * GET /api/analytics/occupancy-trends
 * Get occupancy trends over time
 * Query params: startDate (ISO), endDate (ISO), granularity (hourly|daily|weekly)
 */
router.get('/occupancy-trends', getOccupancyTrends);

/**
 * GET /api/analytics/forecasting
 * Get forecasting data - predicted discharges and capacity insights
 * Protected route - managers see only their ward, admins see all
 */
router.get('/forecasting', getForecasting);

/**
 * GET /api/analytics/occupancy-forecast
 * Per-bed discharge/cleaning predictions and a day-by-day occupancy projection
 * Query params: mode (predicted|manager)
 */
router.get('/occupancy-forecast', getOccupancyForecast);

/**
 * GET /api/analytics/occupancy-rate-history
 * Historical occupancy rate reconstructed from admission/discharge logs
 * Query params: range (7days|30days|90days), ward
 */
router.get('/occupancy-rate-history', getOccupancyRateHistory);

/**
 * GET /api/analytics/cleaning-performance
 * Get cleaning performance analytics
 * Task 2.5b: Cleaning duration tracking and analytics
 */
router.get('/cleaning-performance', authorize('manager', 'hospital_admin'), getCleaningPerformance);

/**
 * GET /api/analytics/occupancy-history
 * Get occupancy history with date range and granularity
 * Query params: startDate (ISO), endDate (ISO), wardFilter (string), granularity (hourly|daily|weekly)
 */
router.get('/occupancy-history', getOccupancyHistory);

/**
 * GET /api/analytics/ward-utilization
 * Get ward utilization with detailed metrics
 */
router.get('/ward-utilization', getWardUtilization);

/**
 * GET /api/analytics/peak-demand-analysis
 * Get peak demand analysis with seasonal patterns and projections
 */
router.get('/peak-demand-analysis', getPeakDemandAnalysis);

module.exports = router;

