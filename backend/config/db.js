// backend/config/db.js
// MongoDB connection with mongoose. The connection promise is cached so the
// same code works for a long-running server and for serverless functions,
// where the module is re-used across warm invocations.

const mongoose = require('mongoose');

let connectionPromise = null;

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB runtime error:', err.message || err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
  connectionPromise = null;
});

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';

  if (!uri) {
    throw new Error('MONGO_URI environment variable is not set');
  }

  connectionPromise = mongoose
    .connect(uri, { serverSelectionTimeoutMS: 10000 })
    .then(() => {
      console.log(`✅ MongoDB connected (${mongoose.connection.name})`);
      return mongoose;
    })
    .catch((err) => {
      connectionPromise = null;
      console.error('❌ MongoDB connection failed:', err.message || err);
      throw err;
    });

  return connectionPromise;
}

module.exports = connectDB;
