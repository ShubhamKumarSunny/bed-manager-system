import { io } from 'socket.io-client';
import { updateBedInList, fetchBeds } from '../features/beds/bedsSlice';
import { addAlert, fetchAlerts } from '../features/alerts/alertsSlice';
import { fetchRequests } from '../features/requests/requestsSlice';
import { SOCKET_URL, REALTIME_ENABLED } from './config';

const POLL_INTERVAL_MS = 15000;

let socket = null;
let pollTimer = null;
let removeVisibilityListener = null;

// Components subscribe to this event bus instead of the raw socket. It exists
// before the connection is made and survives reconnects, and it also carries
// the events synthesised by the polling fallback, so components behave the same
// whether or not a WebSocket server is available.
const listeners = new Map();

const bus = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return bus;
  },
  off(event, handler) {
    listeners.get(event)?.delete(handler);
    return bus;
  },
  emit(event, data) {
    if (socket?.connected) socket.emit(event, data);
    return bus;
  },
  get connected() {
    return Boolean(socket?.connected);
  },
};

const publish = (event, ...args) => {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(...args);
    } catch (error) {
      console.error(`Error in "${event}" handler:`, error);
    }
  });
};

const notify = (title, options) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, options);
    } catch {
      // Notifications are best-effort (some mobile browsers throw here)
    }
  }
};

/**
 * Keep the Redux store fresh without WebSockets by polling the API.
 * New emergency requests are published on the bus so the UI can announce
 * them exactly like it does for socket events.
 */
const startPolling = (dispatch) => {
  stopPolling();
  let knownRequestIds = null;

  const poll = async () => {
    if (document.hidden || !navigator.onLine) return;

    dispatch(fetchBeds());
    dispatch(fetchAlerts());

    const result = await dispatch(fetchRequests());
    const requests = result.payload?.data?.emergencyRequests;
    if (!Array.isArray(requests)) return;

    const pending = requests.filter((request) => request.status === 'pending');
    if (knownRequestIds) {
      pending
        .filter((request) => !knownRequestIds.has(request._id))
        .forEach((request) => publish('emergencyRequestCreated', { ...request, requestId: request._id }));
    }
    knownRequestIds = new Set(pending.map((request) => request._id));
  };

  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  // Catch up immediately when the tab becomes visible again
  document.addEventListener('visibilitychange', poll);
  removeVisibilityListener = () => document.removeEventListener('visibilitychange', poll);
};

const stopPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  removeVisibilityListener?.();
  removeVisibilityListener = null;
};

/**
 * Start live updates for an authenticated user: a Socket.IO connection when a
 * realtime server is configured, API polling otherwise.
 * @param {string} token - JWT authentication token
 * @param {Function} dispatch - Redux dispatch function
 */
export const connectSocket = (token, dispatch) => {
  if (!REALTIME_ENABLED) {
    startPolling(dispatch);
    return bus;
  }

  if (socket) {
    if (socket.auth?.token === token) return bus;
    disconnectSocket();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'], // Prefer websocket, fallback to long polling
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  // Forward every server event to the bus
  socket.onAny((event, ...args) => publish(event, ...args));

  socket.on('connect', () => {
    // Real-time connection is healthy - no need to poll
    stopPolling();
  });

  socket.on('connect_error', (error) => {
    console.warn('Socket connection error:', error.message);
    // Stay up to date while the realtime server is unreachable
    if (!pollTimer) startPolling(dispatch);
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      socket.connect();
    }
  });

  // Re-sync data after a reconnection
  socket.io.on('reconnect', () => {
    dispatch(fetchBeds());
    dispatch(fetchAlerts());
  });

  const updateBed = (data) => {
    if (data?.bed) dispatch(updateBedInList(data.bed));
  };

  socket.on('bedStatusChanged', updateBed);
  socket.on('bedUpdate', updateBed); // legacy event name
  socket.on('bedCleaningStarted', updateBed);
  socket.on('bedDischargeTimeUpdated', updateBed);

  socket.on('bedCleaningCompleted', (data) => {
    updateBed(data);
    if (data?.bed) {
      notify('Cleaning Completed', {
        body: `Bed ${data.bed.bedId} cleaning completed${data.cleaningLog?.wasOverdue ? ' (Overdue)' : ''}`,
        tag: `cleaning-complete-${data.bed._id}`,
      });
    }
  });

  socket.on('occupancyAlert', (data) => {
    if (data?.alert) {
      dispatch(addAlert(data.alert));
      notify('High Occupancy Alert', { body: data.alert.message, tag: data.alert._id });
    }
  });

  socket.on('alertCreated', () => {
    dispatch(fetchAlerts());
  });

  socket.on('emergencyRequestCreated', () => {
    dispatch(fetchRequests());
  });

  socket.on('emergencyRequestApproved', (data) => {
    dispatch(fetchRequests());
    notify('Emergency Request Approved', {
      body: `Bed request approved for ${data?.ward || 'the requested'} ward`,
      tag: `approved-${data?.requestId}`,
    });
  });

  socket.on('emergencyRequestRejected', (data) => {
    dispatch(fetchRequests());
    notify('Emergency Request Rejected', {
      body: `Reason: ${data?.rejectionReason || 'No reason provided'}`,
      tag: `rejected-${data?.requestId}`,
    });
  });

  return bus;
};

/**
 * Stop live updates (on logout)
 */
export const disconnectSocket = () => {
  stopPolling();
  if (socket) {
    socket.offAny();
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};

/**
 * Event bus for live updates. Always defined, so components can subscribe
 * with `.on()` / `.off()` at any time.
 */
export const getSocket = () => bus;

/**
 * Check if a WebSocket connection is currently established
 */
export const isSocketConnected = () => bus.connected;

/**
 * Emit a custom event to the server (no-op without a realtime connection)
 */
export const emitSocketEvent = (eventName, data) => {
  bus.emit(eventName, data);
};

export default {
  connectSocket,
  disconnectSocket,
  getSocket,
  isSocketConnected,
  emitSocketEvent,
};
