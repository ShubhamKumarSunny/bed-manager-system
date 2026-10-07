/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectAuthToken, selectIsAuthenticated } from '../features/auth/authSlice';
import { connectSocket, disconnectSocket, getSocket } from '../services/socketService';

// Create Socket Context
const SocketContext = createContext(null);

/**
 * Custom hook to access the live-update event bus
 * @returns {{on: Function, off: Function, emit: Function, connected: boolean}}
 */
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === null) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

/**
 * Socket Provider Component
 * Manages the live-update lifecycle based on authentication state
 */
export const SocketProvider = ({ children }) => {
  const dispatch = useDispatch();
  const token = useSelector(selectAuthToken);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || !token) return undefined;

    connectSocket(token, dispatch);
    return () => disconnectSocket();
  }, [isAuthenticated, token, dispatch]);

  return (
    <SocketContext.Provider value={getSocket()}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;
