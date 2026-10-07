import React, { useEffect, useState } from 'react';
import { TrendingUp, Calendar, Users, Clock, AlertCircle, Info, Activity, BedDouble, ArrowUp, ArrowDown, Minus, Target, BarChart3 } from 'lucide-react';
import api from '../../services/api';
import TimeRemaining from '../common/TimeRemaining';
import { useSocket } from '../../context/SocketProvider';

const ForecastingPanel = ({ ward }) => {
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [, setBedsWithDischargeTime] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const socket = useSocket();

  useEffect(() => {
    fetchForecastData();
    fetchBedsWithDischargeTime();
    // Auto-refresh every 30 seconds (socket events refresh it sooner)
    const interval = setInterval(() => {
      fetchForecastData();
      fetchBedsWithDischargeTime();
    }, 30 * 1000); // 30 seconds
    return () => clearInterval(interval);
  }, [ward]);

  // Update "seconds ago" every second
  useEffect(() => {
    const timer = setInterval(() => {
      const seconds = Math.floor((new Date() - lastRefresh) / 1000);
      setSecondsAgo(seconds);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastRefresh]);

  // Listen for socket events to refresh forecasting data in real-time
  useEffect(() => {
    if (!socket) return;

    const handleBedUpdate = () => {
      console.log('🔄 Bed status changed, refreshing forecasting data...');
      fetchForecastData();
      fetchBedsWithDischargeTime();
    };

    // Listen to all bed-related events for automatic real-time updates
    socket.on('bedStatusChanged', handleBedUpdate);
    socket.on('bedDischargeTimeUpdated', handleBedUpdate);
    socket.on('bedCleaningStarted', handleBedUpdate);
    socket.on('bedCleaningCompleted', handleBedUpdate);
    socket.on('bedUpdated', handleBedUpdate);

    console.log('✅ Forecasting Panel: Socket listeners registered');

    return () => {
      socket.off('bedStatusChanged', handleBedUpdate);
      socket.off('bedDischargeTimeUpdated', handleBedUpdate);
      socket.off('bedCleaningStarted', handleBedUpdate);
      socket.off('bedCleaningCompleted', handleBedUpdate);
      socket.off('bedUpdated', handleBedUpdate);
      console.log('🔌 Forecasting Panel: Socket listeners removed');
    };
  }, [socket, ward]);

  const fetchForecastData = async () => {
    try {
      // Only show loading on initial load, not on refreshes
      if (!forecastData) {
        setLoading(true);
      }
      const response = await api.get('/analytics/forecasting');
      setForecastData(response.data.data);
      setLastRefresh(new Date());
      setError(null);
      console.log('✅ Forecasting data refreshed at', new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Error fetching forecast data:', err);
      setError('Failed to load forecasting data');
    } finally {
      setLoading(false);
    }
  };

  const fetchBedsWithDischargeTime = async () => {
    try {
      const response = await api.get('/beds');
      const beds = response.data?.data?.beds || response.data?.beds || [];
      const occupiedWithDischargeTime = beds.filter(
        bed => bed.status === 'occupied' && bed.estimatedDischargeTime && (!ward || bed.ward === ward)
      );
      // Sort by discharge time (soonest first)
      occupiedWithDischargeTime.sort((a, b) =>
        new Date(a.estimatedDischargeTime) - new Date(b.estimatedDischargeTime)
      );
      setBedsWithDischargeTime(occupiedWithDischargeTime);
    } catch (err) {
      console.error('Error fetching beds with discharge time:', err);
    }
  };

  if (loading && !forecastData) {
    return (
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-6 h-6 text-cyan-500" />
          <h2 className="text-2xl font-bold text-white">Forecasting & Insights</h2>
        </div>
        <div className="text-center py-8 text-zinc-400">Loading forecasting data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-6 h-6 text-cyan-500" />
          <h2 className="text-2xl font-bold text-white">Forecasting & Insights</h2>
        </div>
        <div className="text-center py-8 text-red-400">{error}</div>
      </div>
    );
  }

  // Check if we have valid forecast data
  // Accept data if we have currentMetrics OR wardForecasts
  if (!forecastData || (!forecastData.currentMetrics && (!forecastData.wardForecasts || forecastData.wardForecasts.length === 0))) {
    return (
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-6 h-6 text-cyan-500" />
          <h2 className="text-2xl font-bold text-white">Forecasting & Insights</h2>
        </div>
        <div className="text-center py-8 text-zinc-400">
          <Info className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
          <p>No forecasting data available</p>
          <p className="text-sm text-zinc-500 mt-2">
            {forecastData?.metadata?.filteredByWard
              ? `No beds found in ${forecastData.metadata.filteredByWard} ward`
              : 'Data will appear once beds are occupied'}
          </p>
        </div>
      </div>
    );
  }

  // Backend now filters by ward for managers, so we use the first (and possibly only) ward forecast
  // For admins, we still allow filtering by ward prop if provided
  const wardForecast = ward && forecastData?.wardForecasts?.length > 0
    ? forecastData.wardForecasts.find(w => w.ward === ward) || forecastData.wardForecasts[0]
    : forecastData?.wardForecasts?.[0];

  const displayMetrics = wardForecast
    ? {
      expectedDischarges24h: wardForecast.expectedDischarges?.next24Hours || 0,
      expectedDischarges48h: wardForecast.expectedDischarges?.next48Hours || 0,
      avgLengthOfStay: forecastData?.averageLengthOfStay?.days || 0,
      projectedOccupancy: wardForecast.occupancyPercentage || 0,
      totalBeds: wardForecast.totalBeds || 0,
      occupiedBeds: wardForecast.occupiedBeds || 0,
      availableBeds: wardForecast.availableBeds || 0,
      projectedAvailability24h: wardForecast.projectedAvailability?.next24Hours || 0,
      projectedAvailability48h: wardForecast.projectedAvailability?.next48Hours || 0,
    }
    : {
      expectedDischarges24h: forecastData?.expectedDischarges?.next24Hours || 0,
      expectedDischarges48h: forecastData?.expectedDischarges?.next48Hours || 0,
      avgLengthOfStay: forecastData?.averageLengthOfStay?.days || 0,
      projectedOccupancy: forecastData?.currentMetrics?.occupancyPercentage || 0,
      totalBeds: forecastData?.currentMetrics?.totalBeds || 0,
      occupiedBeds: forecastData?.currentMetrics?.occupiedBeds || 0,
      availableBeds: forecastData?.currentMetrics?.availableBeds || 0,
      projectedAvailability24h: (forecastData?.currentMetrics?.availableBeds || 0) + (forecastData?.expectedDischarges?.next24Hours || 0),
      projectedAvailability48h: (forecastData?.currentMetrics?.availableBeds || 0) + (forecastData?.expectedDischarges?.next48Hours || 0),
    };

  // Calculate trend indicators
  const getTrendIcon = (value) => {
    if (value > 0) return <ArrowUp className="w-3 h-3" />;
    if (value < 0) return <ArrowDown className="w-3 h-3" />;
    return <Minus className="w-3 h-3" />;
  };

  const getTrendColor = (value, inverse = false) => {
    if (inverse) {
      if (value > 0) return 'text-red-500';
      if (value < 0) return 'text-green-500';
      return 'text-zinc-500';
    }
    if (value > 0) return 'text-green-500';
    if (value < 0) return 'text-red-500';
    return 'text-zinc-500';
  };

  const metrics = [
    {
      icon: BedDouble,
      label: 'Current Available Beds',
      value: displayMetrics.availableBeds || 0,
      subtitle: `${displayMetrics.occupiedBeds || 0}/${displayMetrics.totalBeds || 0} occupied`,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
      trend: null,
    },
    {
      icon: Target,
      label: 'Projected Available (24h)',
      value: displayMetrics.projectedAvailability24h || 0,
      subtitle: `+${displayMetrics.expectedDischarges24h || 0} discharges`,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      trend: displayMetrics.expectedDischarges24h || 0,
      trendInverse: false,
    },
    {
      icon: Calendar,
      label: 'Projected Available (48h)',
      value: displayMetrics.projectedAvailability48h || 0,
      subtitle: `+${displayMetrics.expectedDischarges48h || 0} discharges`,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      trend: displayMetrics.expectedDischarges48h || 0,
      trendInverse: false,
    },
    {
      icon: Activity,
      label: 'Current Occupancy Rate',
      value: `${displayMetrics.projectedOccupancy || 0}%`,
      subtitle: displayMetrics.avgLengthOfStay ? `Avg stay: ${displayMetrics.avgLengthOfStay}d` : '-',
      color: (displayMetrics.projectedOccupancy || 0) > 90 ? 'text-red-500' : (displayMetrics.projectedOccupancy || 0) > 75 ? 'text-yellow-500' : 'text-green-500',
      bgColor: (displayMetrics.projectedOccupancy || 0) > 90 ? 'bg-red-500/10' : (displayMetrics.projectedOccupancy || 0) > 75 ? 'bg-yellow-500/10' : 'bg-green-500/10',
      trend: null,
    },
  ];

  const getTimeAgoText = () => {
    if (secondsAgo < 60) {
      return `${secondsAgo} second${secondsAgo !== 1 ? 's' : ''} ago`;
    } else if (secondsAgo < 3600) {
      const minutes = Math.floor(secondsAgo / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
      const hours = Math.floor(secondsAgo / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-cyan-500" />
          <h2 className="text-2xl font-bold text-white">Forecasting & Insights</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-zinc-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last updated: {getTimeAgoText()}
          </div>
          <button
            onClick={() => {
              fetchForecastData();
              fetchBedsWithDischargeTime();
            }}
            className="text-xs text-zinc-400 hover:text-cyan-500 transition-colors px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metrics.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={index}
              className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 hover:border-zinc-600 transition-all hover:scale-[1.02]"
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`${item.bgColor} p-2.5 rounded-lg`}>
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
                {item.trend !== null && (
                  <div className={`flex items-center gap-0.5 ${getTrendColor(item.trend, item.trendInverse)}`}>
                    {getTrendIcon(item.trend)}
                  </div>
                )}
              </div>
              <div>
                <p className="text-zinc-400 text-xs mb-1">{item.label}</p>
                <p className="text-white text-2xl font-bold mb-1">{item.value}</p>
                {item.subtitle && (
                  <p className="text-zinc-500 text-xs">{item.subtitle}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Enhanced Insights Section */}
      {((forecastData?.insights && forecastData.insights.length > 0) || (forecastData?.expectedDischarges?.details?.length > 0)) && (
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 mb-6">
          <p className="text-zinc-400 text-sm mb-3 flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4" />
            AI-Powered Insights & Recommendations
          </p>
          <div className="space-y-2">
            {/* Dynamic insights based on discharge times from backend */}
            {forecastData?.expectedDischarges?.details && (() => {
              const confirmedDischarges = forecastData.expectedDischarges.details.filter(d => d.isManuallySet);
              const now = new Date();

              const next6Hours = confirmedDischarges.filter(d => {
                const hoursUntil = (new Date(d.expectedDischargeTime) - now) / (1000 * 60 * 60);
                return hoursUntil > 0 && hoursUntil <= 6;
              }).length;

              const next24Hours = confirmedDischarges.filter(d => {
                const hoursUntil = (new Date(d.expectedDischargeTime) - now) / (1000 * 60 * 60);
                return hoursUntil > 0 && hoursUntil <= 24;
              }).length;

              const overdue = confirmedDischarges.filter(d => {
                return new Date(d.expectedDischargeTime) < now;
              }).length;

              return (
                <>
                  {overdue > 0 && (
                    <div className="flex items-start gap-3 p-3 rounded bg-red-500/10 border-l-2 border-red-500">
                      <AlertCircle className="w-4 h-4 mt-0.5 text-red-500" />
                      <div>
                        <p className="text-zinc-200 text-sm font-semibold">Action Required</p>
                        <p className="text-zinc-300 text-sm">
                          {overdue} bed{overdue > 1 ? 's have' : ' has'} passed estimated discharge time.
                          Please check status and update accordingly.
                        </p>
                      </div>
                    </div>
                  )}
                  {next6Hours > 0 && (
                    <div className="flex items-start gap-3 p-3 rounded bg-orange-500/10 border-l-2 border-orange-500 text-left">
                      <Clock className="w-4 h-4 mt-0.5 text-orange-500" />
                      <div>
                        <p className="text-zinc-200 text-sm font-semibold">Upcoming Discharges</p>
                        <p className="text-zinc-300 text-sm">
                          {next6Hours} bed{next6Hours > 1 ? 's' : ''} scheduled for discharge in next 6 hours.
                          Alert cleaning team to prepare.
                        </p>
                      </div>
                    </div>
                  )}
                  {next24Hours > 3 && (
                    <div className="flex items-start gap-3 p-3 rounded bg-green-500/10 border-l-2 border-green-500 text-left">
                      <TrendingUp className="w-4 h-4 mt-0.5 text-green-500" />
                      <div>
                        <p className="text-zinc-200 text-sm font-semibold">Capacity Improvement</p>
                        <p className="text-zinc-300 text-sm">
                          {next24Hours} beds expected to be available within 24 hours. Good capacity outlook.
                        </p>
                      </div>
                    </div>
                  )}
                  {displayMetrics.projectedOccupancy > 85 && next24Hours < 2 && (
                    <div className="flex items-start gap-3 p-3 rounded bg-yellow-500/10 border-l-2 border-yellow-500 text-left">
                      <AlertCircle className="w-4 h-4 mt-0.5 text-yellow-500" />
                      <div>
                        <p className="text-zinc-200 text-sm font-semibold">High Occupancy Alert</p>
                        <p className="text-zinc-300 text-sm">
                          Occupancy at {displayMetrics.projectedOccupancy}% with limited upcoming discharges.
                          Consider expediting non-critical discharges.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Original backend insights */}
            {forecastData?.insights?.map((insight, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded text-left ${insight.type === 'warning'
                  ? 'bg-yellow-500/10 border-l-2 border-yellow-500'
                  : 'bg-blue-500/10 border-l-2 border-blue-500'
                  }`}
              >
                <Info
                  className={`w-4 h-4 mt-0.5 ${insight.type === 'warning' ? 'text-yellow-500' : 'text-blue-500'
                    }`}
                />
                <div>
                  {insight.priority && (
                    <p className="text-zinc-200 text-sm font-semibold capitalize">{insight.priority} Priority</p>
                  )}
                  <p className="text-zinc-300 text-sm">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Timeline Section - Now uses backend integrated timing */}
      <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4">
        <p className="text-zinc-400 text-sm mb-4 flex items-center gap-2 font-semibold">
          <Calendar className="w-4 h-4" />
          Discharge Timeline (Next 72 Hours)
        </p>
        <div className="space-y-3">
          {(() => {
            // Backend timeline now includes both confirmed and estimated discharges
            const timelineBuckets = forecastData?.timeline?.slice(0, 12) || [];

            // Separate confirmed vs estimated from discharge details
            const dischargeDetails = forecastData?.expectedDischarges?.details || [];
            const confirmedDischarges = dischargeDetails.filter(d => d.isManuallySet);
            const estimatedDischarges = dischargeDetails.filter(d => !d.isManuallySet);

            const maxDischarges = Math.max(
              ...timelineBuckets.map(b => b.expectedDischarges || 0),
              5
            );

            return timelineBuckets.map((bucket, index) => {
              const bucketStart = new Date(bucket.startTime);
              const bucketEnd = new Date(bucket.endTime);

              // Count confirmed vs estimated in this bucket
              const confirmedInBucket = confirmedDischarges.filter(d => {
                const dischargeTime = new Date(d.expectedDischargeTime);
                return dischargeTime >= bucketStart && dischargeTime < bucketEnd;
              }).length;

              const estimatedInBucket = estimatedDischarges.filter(d => {
                const dischargeTime = new Date(d.expectedDischargeTime);
                return dischargeTime >= bucketStart && dischargeTime < bucketEnd;
              }).length;

              const totalInBucket = bucket.expectedDischarges || 0;
              const hasAny = totalInBucket > 0;

              return (
                <div key={index} className="flex items-center gap-3 py-1.5">
                  <div className="w-24 text-zinc-400 text-xs font-mono flex-shrink-0">{bucket.label}</div>
                  <div className="flex-1 bg-neutral-900 rounded-full h-7 overflow-hidden relative border border-neutral-800">
                    {hasAny ? (
                      <div className="flex h-full">
                        {/* Confirmed discharges (manager-set times) */}
                        {confirmedInBucket > 0 && (
                          <div
                            className="bg-gradient-to-r from-cyan-500 to-cyan-600 h-full flex items-center justify-center transition-all border-r border-cyan-700"
                            style={{
                              width: `${(confirmedInBucket / maxDischarges) * 100}%`,
                              minWidth: confirmedInBucket > 0 ? '30px' : '0'
                            }}
                            title={`${confirmedInBucket} confirmed discharge${confirmedInBucket > 1 ? 's' : ''}`}
                          >
                            <span className="text-white text-xs font-bold">
                              {confirmedInBucket}
                            </span>
                          </div>
                        )}
                        {/* Estimated discharges (AI predicted) */}
                        {estimatedInBucket > 0 && (
                          <div
                            className="bg-gradient-to-r from-yellow-500/50 to-yellow-600/50 h-full flex items-center justify-center transition-all"
                            style={{
                              width: `${(estimatedInBucket / maxDischarges) * 100}%`,
                              minWidth: estimatedInBucket > 0 ? '30px' : '0'
                            }}
                            title={`${estimatedInBucket} estimated discharge${estimatedInBucket > 1 ? 's' : ''}`}
                          >
                            <span className="text-zinc-200 text-xs font-bold">
                              ~{estimatedInBucket}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <span className="text-zinc-600 text-xs">-</span>
                      </div>
                    )}
                  </div>
                  <div className="w-20 text-right flex-shrink-0">
                    {confirmedInBucket > 0 && (
                      <div className="text-cyan-400 text-xs font-semibold">
                        {confirmedInBucket} set
                      </div>
                    )}
                    {estimatedInBucket > 0 && (
                      <div className="text-yellow-500 text-xs">
                        ~{estimatedInBucket} est
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-cyan-500 to-cyan-600"></div>
            <span className="text-xs text-zinc-400">Confirmed (Manager Set)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-gradient-to-r from-yellow-500/50 to-yellow-600/50"></div>
            <span className="text-xs text-zinc-400">Estimated (AI Predicted)</span>
          </div>
        </div>
      </div>



      {/* All Expected Discharges - Now sorted by backend priority */}
      {forecastData?.expectedDischarges?.details && forecastData.expectedDischarges.details.length > 0 && (
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-zinc-400 text-sm flex items-center gap-2 font-semibold">
              <Calendar className="w-4 h-4" />
              All Expected Discharges
            </p>
            <div className="flex items-center gap-2">
              {forecastData.expectedDischarges.manuallySet > 0 && (
                <span className="text-xs text-cyan-500 bg-cyan-500/10 px-2 py-1 rounded">
                  {forecastData.expectedDischarges.manuallySet} confirmed
                </span>
              )}
              {forecastData.expectedDischarges.estimated > 0 && (
                <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {forecastData.expectedDischarges.estimated} estimated
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {forecastData.expectedDischarges.details.map((discharge, index) => {
              const isManual = discharge.isManuallySet;

              return (
                <div
                  key={index}
                  className={`flex items-center justify-between py-2 px-3 rounded border transition-all ${isManual
                    ? 'bg-gradient-to-r from-cyan-900/30 to-cyan-800/20 border-cyan-800/50 hover:border-cyan-600/50'
                    : 'bg-neutral-900/30 border-neutral-800/50 hover:border-neutral-700'
                    }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`font-bold text-sm ${isManual ? 'text-cyan-500' : 'text-yellow-500'}`}>
                      {discharge.bedId}
                    </div>
                    <div className="text-zinc-500 text-xs">•</div>
                    <div className="text-zinc-400 text-sm">{discharge.ward}</div>
                    {discharge.patientName && (
                      <>
                        <div className="text-zinc-500 text-xs">•</div>
                        <div className="text-zinc-300 text-sm truncate max-w-[120px]">{discharge.patientName}</div>
                      </>
                    )}
                    {isManual && (
                      <span className="text-xs text-cyan-500 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                        SET
                      </span>
                    )}
                  </div>
                  <div className="text-right ml-3">
                    {isManual ? (
                      <>
                        <TimeRemaining targetDate={discharge.expectedDischargeTime} compact={true} />
                        <div className="text-zinc-500 text-xs mt-0.5">
                          {new Date(discharge.expectedDischargeTime).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-zinc-300 text-sm font-semibold">
                          {discharge.hoursUntilDischarge < 24
                            ? `~${Math.round(discharge.hoursUntilDischarge)}h`
                            : `~${Math.round(discharge.hoursUntilDischarge / 24)}d`}
                        </div>
                        <div className="text-zinc-500 text-xs">
                          {discharge.daysInBed.toFixed(1)}d in bed
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-neutral-800 flex items-start gap-2 text-xs text-zinc-500">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p>
              {forecastData?.metadata?.accuracyNote || 'Discharge times combine manager-confirmed schedules with AI estimates.'}
            </p>
          </div>
        </div>
      )}

      {/* Capacity Planning Summary */}
      {displayMetrics.totalBeds && (
        <div className="bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 border border-neutral-700 rounded-lg p-4 mt-6">
          <p className="text-zinc-400 text-sm mb-4 flex items-center gap-2 font-semibold">
            <Target className="w-4 h-4" />
            Capacity Planning Summary
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Current Status */}
            <div className="space-y-2">
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Current Status</div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Total Beds:</span>
                  <span className="text-white font-bold">{displayMetrics.totalBeds}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Available:</span>
                  <span className="text-green-500 font-bold">{displayMetrics.availableBeds}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Occupied:</span>
                  <span className="text-cyan-500 font-bold">{displayMetrics.occupiedBeds}</span>
                </div>
              </div>
              <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden mt-2">
                <div
                  className={`h-full transition-all ${displayMetrics.projectedOccupancy > 90
                    ? 'bg-red-500'
                    : displayMetrics.projectedOccupancy > 75
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                    }`}
                  style={{ width: `${displayMetrics.projectedOccupancy}%` }}
                />
              </div>
            </div>

            {/* 24-Hour Projection */}
            <div className="space-y-2">
              <div className="text-xs text-zinc-500 uppercase tracking-wider">24h Projection</div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Expected Available:</span>
                  <span className="text-green-500 font-bold">{displayMetrics.projectedAvailability24h}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Net Change:</span>
                  <span className={`font-bold ${getTrendColor(displayMetrics.expectedDischarges24h || 0)}`}>
                    +{displayMetrics.expectedDischarges24h || 0} beds
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Projected Occupancy:</span>
                  <span className="text-white font-bold">
                    {displayMetrics.totalBeds > 0 ? Math.round((((displayMetrics.occupiedBeds || 0) - (displayMetrics.expectedDischarges24h || 0)) / displayMetrics.totalBeds) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* 48-Hour Projection */}
            <div className="space-y-2">
              <div className="text-xs text-zinc-500 uppercase tracking-wider">48h Projection</div>
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Expected Available:</span>
                  <span className="text-green-500 font-bold">{displayMetrics.projectedAvailability48h}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Net Change:</span>
                  <span className={`font-bold ${getTrendColor(displayMetrics.expectedDischarges48h || 0)}`}>
                    +{displayMetrics.expectedDischarges48h || 0} beds
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400 text-sm">Projected Occupancy:</span>
                  <span className="text-white font-bold">
                    {displayMetrics.totalBeds > 0 ? Math.round((((displayMetrics.occupiedBeds || 0) - (displayMetrics.expectedDischarges48h || 0)) / displayMetrics.totalBeds) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Capacity Recommendation */}
          <div className="mt-4 pt-3 border-t border-neutral-800">
            {displayMetrics.totalBeds > 0 && displayMetrics.projectedAvailability24h < displayMetrics.totalBeds * 0.15 && (
              <div className="flex items-start gap-2 text-xs text-yellow-500 bg-yellow-500/10 p-2 rounded">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Warning: Low projected availability (&lt;15%). Consider delaying non-urgent admissions.
                </span>
              </div>
            )}
            {displayMetrics.totalBeds > 0 && displayMetrics.projectedAvailability24h >= displayMetrics.totalBeds * 0.25 && (
              <div className="flex items-start gap-2 text-xs text-green-500 bg-green-500/10 p-2 rounded">
                <TrendingUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Good capacity outlook: {Math.round(((displayMetrics.projectedAvailability24h || 0) / displayMetrics.totalBeds) * 100)}%
                  projected availability in 24h.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer with metadata */}
      <div className="mt-6 pt-4 border-t border-neutral-800">
        {/* Ward Scope Indicator */}
        {forecastData?.metadata?.filteredByWard && (
          <div className="mb-3 px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-500" />
            <span className="text-sm text-cyan-400 font-semibold">
              {forecastData.metadata.scope}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>{forecastData?.averageLengthOfStay?.basedOnSamples || 0} patient stays analyzed</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Avg. stay: {displayMetrics.avgLengthOfStay || 0} days</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            <span>
              Updated: {forecastData?.metadata?.timestamp
                ? new Date(forecastData.metadata.timestamp).toLocaleTimeString()
                : 'N/A'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600 italic">
          <Info className="w-3 h-3" />
          <p>
            Forecasts combine manager-set discharge times (cyan) with AI estimates based on historical data (yellow).
            {forecastData?.metadata?.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForecastingPanel;
