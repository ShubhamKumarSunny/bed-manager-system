import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, TrendingUp, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import api from '@/services/api';
import MLDischargePredictionCard from './MLDischargePredictionCard';
import MLCleaningPredictionCard from './MLCleaningPredictionCard';
import MLAvailabilityCard from './MLAvailabilityCard';

const ForecastingInsights = () => {
  const { bedsList } = useSelector((state) => state.beds);
  const [forecastPeriod, setForecastPeriod] = useState('7days');
  const [forecastMode, setForecastMode] = useState('ml'); // 'ml' or 'manager'
  const [forecast, setForecast] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch the forecast for the selected mode and keep it fresh
  useEffect(() => {
    let cancelled = false;

    const fetchForecast = async () => {
      try {
        const response = await api.get('/analytics/occupancy-forecast', {
          params: { mode: forecastMode === 'ml' ? 'predicted' : 'manager' }
        });
        if (!cancelled) {
          setForecast(response.data.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load forecast');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    setIsLoading(true);
    fetchForecast();
    const interval = setInterval(fetchForecast, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [forecastMode]);

  // Predictions come from the ML service when it is deployed, otherwise from
  // statistical estimates built on the hospital's own history
  const usesMlService = forecast?.source === 'ml';
  const predictionLabel = usesMlService ? 'ML Model' : 'Historical Model';
  const current = forecast?.current;

  const mlPredictions = useMemo(() => ({
    discharges: forecast?.discharges || [],
    cleaningTimes: forecast?.cleaningTimes || []
  }), [forecast]);

  const managerDischarges = useMemo(
    () => bedsList
      .filter((bed) => bed.status === 'occupied' && bed.estimatedDischargeTime)
      .map((bed) => ({
        bedId: bed._id,
        bedNumber: bed.bedId,
        ward: bed.ward,
        patientName: bed.patientName || 'N/A',
        expectedDischargeDate: bed.estimatedDischargeTime,
        hoursUntilDischarge: Math.max(0, (new Date(bed.estimatedDischargeTime) - new Date()) / (1000 * 60 * 60))
      }))
      .sort((a, b) => a.hoursUntilDischarge - b.hoursUntilDischarge),
    [bedsList]
  );

  const forecasts = useMemo(() => {
    if (!forecast) return {};
    const dataSource = forecastMode === 'ml' ? 'ML Model' : 'Manager Assigned';
    const withTrend = (points, label) => points.map((point, index) => ({
      date: label(point),
      predicted: point.predicted,
      confidence: point.confidence,
      trend: point.predicted >= (index === 0 ? forecast.current.occupancyRate : points[index - 1].predicted) ? 'up' : 'down',
      dataSource
    }));

    return {
      '7days': withTrend(forecast.daily, (point) => `In ${point.day} day${point.day === 1 ? '' : 's'}`),
      '30days': withTrend(forecast.weekly, (point) => `Week ${point.week}`)
    };
  }, [forecast, forecastMode]);

  const recommendations = useMemo(() => {
    if (!forecast) return [];
    const recs = [];

    // Ward-level capacity warnings from the live bed list
    const wardOccupancy = bedsList.reduce((acc, bed) => {
      if (!acc[bed.ward]) acc[bed.ward] = { total: 0, occupied: 0 };
      acc[bed.ward].total++;
      if (bed.status === 'occupied') acc[bed.ward].occupied++;
      return acc;
    }, {});

    Object.entries(wardOccupancy).forEach(([ward, data]) => {
      const rate = data.total > 0 ? (data.occupied / data.total) * 100 : 0;
      if (rate >= 90) {
        recs.push({
          title: `${ward} Critical Capacity`,
          description: `${ward} is at ${Math.round(rate)}% capacity`,
          priority: 'critical',
          action: 'Coordinate with nearby facilities for transfers'
        });
      } else if (rate >= 80) {
        recs.push({
          title: `${ward} High Occupancy`,
          description: `${ward} is at ${Math.round(rate)}% capacity`,
          priority: 'high',
          action: 'Schedule additional staff and prepare for admissions'
        });
      }
    });

    const dischargesIn24h = forecast.discharges.filter((d) => d.predicted_hours_until_discharge < 24).length;
    if (dischargesIn24h > 0) {
      recs.push({
        title: forecastMode === 'ml' ? 'Upcoming Discharges Predicted' : 'Scheduled Discharges',
        description: `${dischargesIn24h} bed(s) expected to be released within 24 hours`,
        priority: 'medium',
        action: 'Confirm discharge readiness and prepare beds for turnover'
      });
    }

    const longCleanings = forecast.cleaningTimes.filter((c) => c.predicted_cleaning_minutes > 30).length;
    if (longCleanings > 0) {
      recs.push({
        title: 'Extended Cleaning Times Predicted',
        description: `${longCleanings} bed(s) likely to need more than 30 min of cleaning`,
        priority: 'medium',
        action: 'Allocate additional cleaning staff to priority areas'
      });
    }

    const peak = forecast.daily.reduce((max, point) => (point.predicted > max.predicted ? point : max), forecast.daily[0]);
    if (peak && peak.predicted >= 85) {
      recs.push({
        title: 'Prepare for Peak Demand',
        description: `Occupancy projected to reach ${peak.predicted}% in ${peak.day} day${peak.day === 1 ? '' : 's'}`,
        priority: 'high',
        action: 'Ensure adequate staffing levels'
      });
    } else if (forecast.current.occupancyRate < 70) {
      recs.push({
        title: 'Maintenance Window Available',
        description: `Occupancy is at ${forecast.current.occupancyRate}% with no peak expected this week`,
        priority: 'low',
        action: 'Schedule routine maintenance and deep cleaning'
      });
    }

    return recs.slice(0, 4);
  }, [forecast, bedsList, forecastMode]);

  const currentForecasts = forecasts[forecastPeriod] || [];

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/20 border-red-500/50 text-red-400';
      case 'high':
        return 'bg-orange-500/20 border-orange-500/50 text-orange-400';
      case 'medium':
        return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400';
      case 'low':
        return 'bg-green-500/20 border-green-500/50 text-green-400';
      default:
        return 'bg-neutral-500/20 border-neutral-500/50 text-neutral-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Forecast Mode Toggle */}
      <Card className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Forecasting Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              onClick={() => setForecastMode('ml')}
              variant={forecastMode === 'ml' ? 'default' : 'outline'}
              className={`flex-1 ${
                forecastMode === 'ml' 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                  : 'border-purple-500/50 text-purple-300 hover:bg-purple-500/20'
              }`}
            >
              🤖 Predicted Discharges
            </Button>
            <Button
              onClick={() => setForecastMode('manager')}
              variant={forecastMode === 'manager' ? 'default' : 'outline'}
              className={`flex-1 ${
                forecastMode === 'manager' 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'border-blue-500/50 text-blue-300 hover:bg-blue-500/20'
              }`}
            >
              👤 Manager Assigned Times
            </Button>
          </div>
          <p className="text-sm text-slate-400 mt-3">
            {forecastMode === 'ml' 
              ? (usesMlService
                  ? 'Using the machine learning service to predict discharge times from historical patterns.'
                  : 'Using statistical estimates from this hospital\'s historical length of stay, cleaning times and admission patterns.')
              : 'Using discharge times manually assigned by managers for scheduled patient releases.'}
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {isLoading && !forecast && (
        <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4">
          <p className="text-blue-400 text-sm">Loading predictions...</p>
        </div>
      )}

      {/* Conditional Rendering Based on Mode */}
      {forecastMode === 'ml' ? (
        <>
          {/* ML PREDICTION CARDS */}
          {/* Discharge Predictions */}
          <MLDischargePredictionCard 
            predictions={mlPredictions.discharges} 
            maxDisplay={5}
            sourceLabel={predictionLabel}
          />

          {/* Cleaning Predictions */}
          <MLCleaningPredictionCard 
            predictions={mlPredictions.cleaningTimes} 
            maxDisplay={5}
            sourceLabel={predictionLabel}
          />

          {/* Availability Forecast */}
          <MLAvailabilityCard 
        available24h={forecast?.availability.available24h ?? 0}
        available48h={forecast?.availability.available48h ?? 0}
        currentAvailable={current?.available ?? 0}
        totalBeds={current?.totalBeds ?? 0}
        sourceLabel={predictionLabel}
        confidence24h={0.85}
        confidence48h={0.75}
      />

        </>
      ) : (
        <>
          {/* Manager Assigned Discharge Times */}
          {managerDischarges.length > 0 ? (
            <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  Manager Assigned Discharge Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {managerDischarges.slice(0, 8).map((discharge, index) => (
                    <div
                      key={index}
                      className="p-3 bg-neutral-900/50 rounded-lg border border-blue-500/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-white">
                          {discharge.ward} - Bed {discharge.bedNumber}
                        </span>
                        <Badge className="bg-blue-500/20 text-blue-300">
                          {discharge.hoursUntilDischarge 
                            ? `~${Math.round(discharge.hoursUntilDischarge)}h`
                            : 'N/A'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">
                        Patient: {discharge.patientName}
                      </p>
                      <p className="text-xs text-slate-500">
                        Scheduled: {new Date(discharge.expectedDischargeDate).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-neutral-900 border-neutral-700">
              <CardContent className="p-8 text-center">
                <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No Discharge Times Assigned</h3>
                <p className="text-slate-400">
                  Managers have not assigned expected discharge dates for occupied beds yet.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Forecast Chart */}
      <Card className="bg-neutral-900 border-neutral-700">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="w-5 h-5 text-green-400" />
              Occupancy Forecast
            </CardTitle>
            <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 border border-neutral-700">
              <Button
                size="sm"
                variant={forecastPeriod === '7days' ? 'default' : 'ghost'}
                onClick={() => setForecastPeriod('7days')}
                className="text-xs"
              >
                Next 7 Days
              </Button>
              <Button
                size="sm"
                variant={forecastPeriod === '30days' ? 'default' : 'ghost'}
                onClick={() => setForecastPeriod('30days')}
                className="text-xs"
              >
                Next 30 Days
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {currentForecasts.map((forecast, index) => {
              const isHighOccupancy = forecast.predicted >= 90;

              return (
                <div
                  key={index}
                  className="p-4 bg-neutral-900 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-300">{forecast.date}</span>
                      <Badge
                        variant="outline"
                        className={isHighOccupancy ? 'border-red-500/50 text-red-400' : 'border-blue-500/50 text-blue-400'}
                      >
                        {forecast.predicted}% predicted
                      </Badge>
                      <Badge className={`text-xs ${
                        forecast.dataSource === 'ML Model' 
                          ? 'bg-purple-500/20 text-purple-300' 
                          : 'bg-blue-500/20 text-blue-300'
                      }`}>
                        {forecast.dataSource === 'ML Model' ? '🤖 Predicted' : '👤 Manager'}
                      </Badge>
                      {forecast.trend === 'up' ? (
                        <ArrowUp className="w-4 h-4 text-red-400" />
                      ) : (
                        <ArrowDown className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                    <span className="text-xs text-neutral-400">
                      {forecast.confidence}% confidence
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-neutral-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full ${isHighOccupancy ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${forecast.predicted}%` }}
                      />
                    </div>
                    <div className="w-24 bg-neutral-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${forecast.confidence}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card className="bg-neutral-900 border-neutral-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Lightbulb className="w-5 h-5 text-yellow-400" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${getPriorityColor(rec.priority)}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-white">{rec.title}</h4>
                        <Badge variant="outline" className={getPriorityColor(rec.priority)}>
                          {rec.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-300 mb-2">{rec.description}</p>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">Action: {rec.action}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ForecastingInsights;
