import React, { useEffect, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchBeds } from '@/features/beds/bedsSlice';
import WardBedGrid from '@/components/WardBedGrid';
import AvailableBedsList from '@/components/AvailableBedsList';
import CleaningQueuePanel from '@/components/wardstaff/CleaningQueuePanel';
import api from '@/services/api';
import DashboardLayout from '@/components/DashboardLayout';
// Task 4.3: Import offline cache utilities for mobile optimization
import { cacheBedData, getCachedBedData, isOnline, getCacheAge } from '@/utils/offlineCache';

const WardStaffDashboard = () => {
  const dispatch = useDispatch();
  const { bedsList, status } = useSelector((state) => state.beds);
  const { user } = useSelector((state) => state.auth);
  const [assignedWard, setAssignedWard] = useState('');
  // Task 4.3: Add online status tracking for offline capability
  const [online, setOnline] = useState(isOnline());
  const [backendConnected, setBackendConnected] = useState(true);
  const [, setLastUpdateTime] = useState(null);

  // Check backend connectivity
  const checkBackendConnection = useCallback(async () => {
    try {
      await api.get('/health');
      setBackendConnected(true);
    } catch (error) {
      console.error('Backend connection check failed:', error);
      setBackendConnected(false);
    }
  }, []);

  // Periodic backend health check
  useEffect(() => {
    checkBackendConnection();
    const interval = setInterval(checkBackendConnection, 30000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [checkBackendConnection]);

  // Task 4.3: Track online/offline status for mobile optimization
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      checkBackendConnection();
      dispatch(fetchBeds()); // Refresh when coming back online
    };
    const handleOffline = () => {
      setOnline(false);
      setBackendConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [dispatch, checkBackendConnection]);

  useEffect(() => {
    // Task 4.3: Try loading from cache first if offline
    if (!online) {
      const cached = getCachedBedData();
      if (cached) {
        console.log('Using cached bed data (offline mode)');
        return;
      }
    }

    dispatch(fetchBeds());
  }, [dispatch, online]);

  // Task 4.3: Cache bed data whenever it updates for offline access
  useEffect(() => {
    if (bedsList && bedsList.length > 0) {
      cacheBedData(bedsList);
      setLastUpdateTime(new Date());
    }
  }, [bedsList]);

  useEffect(() => {
    // Set assigned ward from user data (check both ward and assignedWards fields)
    if (user && user.ward) {
      setAssignedWard(user.ward);
    } else if (user && user.assignedWards && user.assignedWards.length > 0) {
      setAssignedWard(user.assignedWards[0]);
    } else {
      // Default to first ward if no assignment
      const wards = [...new Set(bedsList.map(bed => bed.ward))];
      if (wards.length > 0) {
        setAssignedWard(wards[0]);
      }
    }
  }, [user, bedsList]);

  // Filter beds by assigned ward - show only beds from user's ward
  const wardBeds = bedsList.filter(bed => bed.ward === assignedWard);

  // Task 4.3: Memoize status update handler to prevent re-renders on mobile
  const handleStatusUpdate = useCallback(async (bedId, newStatus) => {
    try {
      console.log('Updating bed status:', bedId, newStatus);
      await api.patch(`/beds/${bedId}/status`, { status: newStatus });
      console.log('Status updated successfully, refreshing beds...');
      await dispatch(fetchBeds());
      console.log('Beds refreshed');
    } catch (error) {
      console.error('Error updating bed status:', error);
      alert('Failed to update bed status: ' + (error.response?.data?.message || error.message));
    }
  }, [dispatch]);

  const stats = {
    total: wardBeds.length,
    available: wardBeds.filter(b => b.status === 'available').length,
    cleaning: wardBeds.filter(b => b.status === 'cleaning').length,
    occupied: wardBeds.filter(b => b.status === 'occupied').length
  };

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full min-h-screen">
          <div className="text-white text-xl">Loading beds...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Task 4.3: Responsive container with mobile-first padding */}
      <div className="max-w-7xl mx-auto space-y-4 px-3 sm:px-4 md:px-6 py-4">
        {/* Task 4.3: Offline indicator banner for mobile users */}
        {!online && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-lg">📡</span>
              <div>
                <p className="text-yellow-400 font-semibold text-sm sm:text-base">Offline Mode</p>
                <p className="text-yellow-300 text-xs sm:text-sm">
                  Viewing cached data. Updates disabled until reconnected.
                  {getCacheAge() && ` (Updated ${getCacheAge()}s ago)`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-8 h-8 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h1 className="text-4xl font-bold">Ward Staff Dashboard</h1>
          </div>
          <p className="text-zinc-400">
            {assignedWard || 'No ward assigned'} • Total: {bedsList.length} • Ward: {wardBeds.length}
            {backendConnected ? (
              <span className="ml-2 text-green-400">● Live</span>
            ) : (
              <span className="ml-2 text-red-400">● Disconnected</span>
            )}
          </p>
        </div>

        {/* Task 4.3: Responsive stats grid - 2 cols mobile, 4 cols desktop with larger touch targets */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
            <div className="text-neutral-400 text-xs sm:text-sm mb-1">Total Beds</div>
            <div className="text-xl sm:text-2xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
            <div className="text-green-400 text-xs sm:text-sm mb-1">Available</div>
            <div className="text-xl sm:text-2xl font-bold text-green-400">{stats.available}</div>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
            <div className="text-orange-400 text-xs sm:text-sm mb-1">Needs Cleaning</div>
            <div className="text-xl sm:text-2xl font-bold text-orange-400">{stats.cleaning}</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
            <div className="text-blue-400 text-xs sm:text-sm mb-1">Occupied</div>
            <div className="text-xl sm:text-2xl font-bold text-blue-400">{stats.occupied}</div>
          </div>
        </div>

        {/* Task 4.3: Mobile-first layout - stack on small screens, side-by-side on large */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          {/* Bed Grid */}
          <div className="lg:col-span-2">
            <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-3 sm:p-4 lg:h-[600px] flex flex-col">
              <h2 className="text-lg sm:text-xl font-bold text-white mb-3 sm:mb-4 flex-shrink-0">Bed Status</h2>
              <div className="overflow-y-auto flex-1">
                <WardBedGrid beds={wardBeds} onStatusUpdate={handleStatusUpdate} isOffline={!online} />
              </div>
            </div>
          </div>

          {/* Task 4.3: Available Beds List - full width on mobile, sidebar on desktop */}
          <div className="lg:col-span-1 lg:h-[600px]">
            <AvailableBedsList beds={wardBeds} />
          </div>
        </div>

        {/* Cleaning Queue for Ward Staff */}
        <CleaningQueuePanel ward={assignedWard} />
      </div>
    </DashboardLayout>
  );
};

export default WardStaffDashboard;
