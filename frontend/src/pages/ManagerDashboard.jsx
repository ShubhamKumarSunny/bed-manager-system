import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentUser } from '@/features/auth/authSlice';
import { fetchBeds } from '@/features/beds/bedsSlice';
import { fetchAnalyticsSummary } from '@/features/analytics/analyticsSlice';
import { Briefcase } from 'lucide-react';
import KPISummaryCard from '@/components/manager/KPISummaryCard';
import BedStatusGrid from '@/components/manager/BedStatusGrid';
import AlertNotificationPanel from '@/components/manager/AlertNotificationPanel';
import EmergencyRequestsQueue from '@/components/manager/EmergencyRequestsQueue';
import ForecastingPanel from '@/components/manager/ForecastingPanel';
import CleaningQueuePanel from '@/components/manager/CleaningQueuePanel';
import BedUpdateModal from '@/components/manager/BedUpdateModal';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/services/api';

const ManagerDashboard = () => {
  const currentUser = useSelector(selectCurrentUser);
  const dispatch = useDispatch();
  const [selectedBed, setSelectedBed] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [emergencyPatientData, setEmergencyPatientData] = useState(null);
  const [backendConnected, setBackendConnected] = useState(true);

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
    const interval = setInterval(checkBackendConnection, 30000);
    return () => clearInterval(interval);
  }, [checkBackendConnection]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        console.log('Notification permission:', permission);
      });
    }
  }, []);

  const handleBedClick = (bed) => {
    setSelectedBed(bed);
    // Keep emergency data if it exists - it will be used to pre-fill patient info
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBed(null);
    setEmergencyPatientData(null); // Clear emergency data on close
  };

  const handleEmergencyApproval = (patientData) => {
    // Store emergency patient data - manager will select a bed from the grid
    setEmergencyPatientData(patientData);
    // Don't open modal yet - wait for manager to select a bed
  };

  const handleUpdateSuccess = () => {
    // Refresh beds and analytics after successful update
    dispatch(fetchBeds());
    dispatch(fetchAnalyticsSummary({ ward: currentUser?.ward }));
    setRefreshKey(prev => prev + 1); // Force re-render
  };

  return (
    <DashboardLayout>
      <div className="w-full mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Briefcase className="w-8 h-8 text-purple-500" />
            <h1 className="text-4xl font-bold">Manager Dashboard</h1>
          </div>
          <p className="text-zinc-400">
            Welcome, <span className="text-cyan-400">{currentUser?.name}</span>
            {currentUser?.ward && (
              <span className="ml-2">
                | Ward: <span className="text-purple-400 font-semibold">{currentUser.ward}</span>
              </span>
            )}
            {backendConnected ? (
              <span className="ml-2 text-green-400">● Live</span>
            ) : (
              <span className="ml-2 text-red-400">● Disconnected</span>
            )}
          </p>
        </div>

        {/* KPI Summary Cards */}
        <KPISummaryCard key={refreshKey} ward={currentUser?.ward} />

        {/* Emergency Patient Assignment Alert */}
        {emergencyPatientData && (
          <div className="bg-red-500/10 border-2 border-red-500 rounded-lg p-6 animate-pulse">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-2xl">
                🚨
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-red-400 mb-2">
                  Emergency Patient Awaiting Bed Assignment
                </h3>
                <div className="text-white space-y-1 mb-3">
                  <p><strong>Patient:</strong> {emergencyPatientData.patientName}</p>
                  <p><strong>Patient ID:</strong> {emergencyPatientData.patientId}</p>
                  <p><strong>Ward:</strong> {emergencyPatientData.ward}</p>
                  <p><strong>Priority:</strong> {emergencyPatientData.priority?.toUpperCase()}</p>
                  <p><strong>Reason:</strong> {emergencyPatientData.reason}</p>
                </div>
                <p className="text-red-300 font-semibold text-lg">
                  👇 Please select an available bed from the grid below to assign this patient
                </p>
              </div>
              <button
                onClick={() => setEmergencyPatientData(null)}
                className="flex-shrink-0 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bed Status Grid */}
        <BedStatusGrid ward={currentUser?.ward} onBedClick={handleBedClick} />

        {/* Two Column Layout for Alerts and Emergency Requests */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AlertNotificationPanel ward={currentUser?.ward} />
          <EmergencyRequestsQueue
            ward={currentUser?.ward}
            onApprovalSuccess={handleEmergencyApproval}
          />
        </div>

        {/* Cleaning Queue Panel - Task 2.5b */}
        <CleaningQueuePanel ward={currentUser?.ward} />

        {/* Forecasting Panel */}
        <ForecastingPanel ward={currentUser?.ward} />

        {/* Bed Update Modal */}
        <BedUpdateModal
          bed={selectedBed}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onSuccess={handleUpdateSuccess}
          emergencyPatientData={emergencyPatientData}
        />
      </div>
    </DashboardLayout>
  );
};

export default ManagerDashboard;
