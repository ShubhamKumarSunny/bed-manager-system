// Socket.IO connection and event handler
const jwt = require('jsonwebtoken');
const Alert = require('./models/Alert');
const { getJwtSecret } = require('./config/env');

const initializeSocket = (io) => {
  // Track authenticated users
  const authenticatedUsers = {};

  // Middleware to verify JWT token on connection
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    console.log('🔍 Socket connection attempt:', {
      socketId: socket.id,
      hasAuthToken: !!socket.handshake.auth.token,
      hasAuthHeader: !!socket.handshake.headers.authorization,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'none'
    });
    
    if (!token) {
      console.log(`❌ Connection rejected: No token provided (${socket.id})`);
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, getJwtSecret());
      socket.user = decoded; // Attach user data to socket
      console.log(`✅ User authenticated: ${decoded.email} (${socket.id})`);
      next();
    } catch (error) {
      console.log(`❌ Connection rejected: Invalid token (${socket.id})`, error.message);
      console.log('Token causing error:', token);
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ Authenticated user connected: ${socket.user.email} (${socket.id})`);
    
    // Store authenticated user
    authenticatedUsers[socket.id] = {
      userId: socket.user.id,
      email: socket.user.email,
      role: socket.user.role,
      ward: socket.user.ward, // Store ward info
      socketId: socket.id
    };

    // Join room based on ward (for ward-specific alerts)
    if (socket.user.ward) {
      socket.join(`ward-${socket.user.ward}`);
      console.log(`User ${socket.user.email} joined ward room: ward-${socket.user.ward}`);
    }

    // Join room based on role (for role-specific broadcasts)
    if (socket.user.role) {
      socket.join(`role-${socket.user.role}`);
      console.log(`User ${socket.user.email} joined role room: role-${socket.user.role}`);
    }

    // Handle user join with user ID
    socket.on('userJoin', (userId) => {
      authenticatedUsers[socket.id].customUserId = userId;
      console.log(`User ${socket.user.email} joined with custom ID: ${userId}`);
      
      // Broadcast updated user count to all authenticated users
      io.emit('userCount', Object.keys(authenticatedUsers).length);
    });

    // Handle custom messages
    socket.on('message', (data) => {
      console.log(`Message from ${socket.user.email}:`, data);
      // Broadcast message to all authenticated clients
      io.emit('newMessage', {
        userId: socket.user.id,
        email: socket.user.email,
        role: socket.user.role,
        message: data,
        timestamp: new Date()
      });
    });

    // Handle bed status updates (only authenticated users can trigger)
    socket.on('bedStatusUpdate', (bedData) => {
      console.log(`Bed status update from ${socket.user.email}:`, bedData);
      // Broadcast bed status to all authenticated clients
      io.emit('bedStatusChanged', {
        ...bedData,
        updatedBy: socket.user.email
      });
    });

    // Handle occupancy log updates (only authenticated users can trigger)
    socket.on('occupancyLogUpdate', (logData) => {
      console.log(`Occupancy log update from ${socket.user.email}:`, logData);
      // Broadcast occupancy update to all authenticated clients
      io.emit('occupancyLogChanged', {
        ...logData,
        updatedBy: socket.user.email
      });
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
      const user = authenticatedUsers[socket.id];
      delete authenticatedUsers[socket.id];
      console.log(`User ${user?.email} disconnected. Remaining users: ${Object.keys(authenticatedUsers).length}`);
      
      // Broadcast updated user count to remaining authenticated users
      io.emit('userCount', Object.keys(authenticatedUsers).length);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error from ${socket.id}:`, error);
    });
  });
};

/**
 * @desc    Create and emit a new alert in real-time
 * @param   {Object} alertData - Alert data to create
 * @param   {Object} io - Socket.IO server instance
 * @returns {Object} Created alert document
 */
const emitNewAlert = async (alertData, io) => {
  try {
    // Create new alert in database
    const newAlert = await Alert.create(alertData);

    // Emit real-time event to all connected clients
    io.emit('alertCreated', newAlert);

    console.log('✅ Alert created and emitted:', {
      type: newAlert.type,
      severity: newAlert.severity,
      targetRole: newAlert.targetRole
    });

    return newAlert;
  } catch (error) {
    console.error('❌ Error creating/emitting alert:', error);
    throw error;
  }
};

module.exports = initializeSocket;
module.exports.emitNewAlert = emitNewAlert;
