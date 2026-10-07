// backend/app.js
// Express application. Exported without listening so it can be mounted by
// server.js (long-running process with Socket.IO) or by api/index.js
// (Vercel serverless function).
require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const healthRouter = require('./routes/health');
const authRoutes = require('./routes/authRoutes');
const bedRoutes = require('./routes/bedRoutes');
const logRoutes = require('./routes/logRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const emergencyRequestRoutes = require('./routes/emergencyRequestRoutes');
const alertRoutes = require('./routes/alertRoutes');
const reportRoutes = require('./routes/reportRoutes');
const profileRoutes = require('./routes/profileRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS - local dev servers plus any origins listed in FRONTEND_URL (comma separated).
// When the frontend and API share an origin (single Vercel project) no CORS is needed.
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (same-origin, curl, mobile apps)
    if (!origin) return callback(null, true);
    if (localOrigin.test(origin) || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Return false instead of an Error to avoid a 500 status
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '1mb' }));

// Socket.IO instance is attached by server.js; it is undefined on serverless
// hosts, where controllers skip real-time emits and clients fall back to polling.
app.use((req, res, next) => {
  req.io = app.get('io');
  next();
});

app.use('/api/health', healthRouter);

// Every other API route needs the database
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(503).json({
      success: false,
      message: 'Database unavailable. Please try again shortly.'
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/beds', bedRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/emergency-requests', emergencyRequestRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/profile', profileRoutes);

// Error handling middlewares (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
