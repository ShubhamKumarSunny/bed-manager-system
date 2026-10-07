// backend/server.js
// Long-running entry point (local development, Render, Railway, a VM...).
// Adds what a serverless function cannot provide: Socket.IO and cron jobs.
require('dotenv').config({ quiet: true });
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const initializeSocket = require('./socketHandler');
const scheduledReportService = require('./services/scheduledReportService');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});

app.set('io', io);
initializeSocket(io);

const PORT = process.env.PORT || 5001;

connectDB()
  .then(() => {
    scheduledReportService.initialize();
    server.listen(PORT, () => console.log(`Backend: listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Backend failed to start:', err.message || err);
    process.exit(1);
  });

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);
  scheduledReportService.shutdown();
  io.close();
  server.close(async () => {
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  });
  // Don't hang forever on open keep-alive connections
  setTimeout(() => process.exit(0), 5000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
