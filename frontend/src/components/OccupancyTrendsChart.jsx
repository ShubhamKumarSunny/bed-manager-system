import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchBeds } from '@/features/beds/bedsSlice';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { TrendingUp, Calendar } from 'lucide-react';
import api from '@/services/api';

const OccupancyTrendsChart = () => {
  const dispatch = useDispatch();
  const { bedsList, status } = useSelector((state) => state.beds);
  const [timeRange, setTimeRange] = useState('7days');
  const [selectedWard, setSelectedWard] = useState('allwards');
  const [trendData, setTrendData] = useState({});
  const [wards, setWards] = useState(['All Wards']);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchBeds());
    }
  }, [dispatch, status]);

  useEffect(() => {
    // Extract unique wards from beds data
    const uniqueWards = ['All Wards', ...[...new Set(bedsList.map(bed => bed.ward))].sort()];
    // Keep the same array when nothing changed so the history is not refetched
    setWards((previous) => (previous.join('|') === uniqueWards.join('|') ? previous : uniqueWards));
  }, [bedsList]);

  // Load the real occupancy history for the selected ward and period
  useEffect(() => {
    let cancelled = false;
    const wardName = wards.find((ward) => ward.toLowerCase().replace(/\s+/g, '') === selectedWard);

    const fetchHistory = async () => {
      try {
        setIsLoading(true);
        const response = await api.get('/analytics/occupancy-rate-history', {
          params: { range: timeRange, ...(selectedWard !== 'allwards' && wardName ? { ward: wardName } : {}) }
        });
        if (!cancelled) {
          setTrendData({ [timeRange]: response.data.data.points });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load occupancy history');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [timeRange, selectedWard, wards]);

  const currentData = trendData[timeRange] || [];
  const avgOccupancy = currentData.length > 0
    ? Math.round(currentData.reduce((sum, d) => sum + d.occupancy, 0) / currentData.length)
    : 0;
  const maxOccupancy = currentData.length > 0 ? Math.max(...currentData.map(d => d.occupancy)) : 0;
  const minOccupancy = currentData.length > 0 ? Math.min(...currentData.map(d => d.occupancy)) : 0;

  // Generate dynamic insights
  const generateInsights = () => {
    if (currentData.length === 0) return [];

    const insights = [];

    // Find peak day
    const peakIndex = currentData.findIndex(d => d.occupancy === maxOccupancy);
    if (peakIndex !== -1) {
      insights.push(`Occupancy peaked on ${currentData[peakIndex].day} with ${maxOccupancy}%`);
    }

    // Check for trend (increasing/decreasing)
    if (currentData.length >= 3) {
      const firstHalf = currentData.slice(0, Math.floor(currentData.length / 2));
      const secondHalf = currentData.slice(Math.floor(currentData.length / 2));
      const firstAvg = firstHalf.reduce((sum, d) => sum + d.occupancy, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, d) => sum + d.occupancy, 0) / secondHalf.length;
      const difference = Math.abs(secondAvg - firstAvg);

      if (difference > 3) {
        if (secondAvg > firstAvg) {
          insights.push(`Upward trend detected with ${Math.round(difference)}% increase`);
        } else {
          insights.push(`Downward trend detected with ${Math.round(difference)}% decrease`);
        }
      } else {
        insights.push('Occupancy remains relatively stable over the period');
      }
    }

    // Check for high occupancy warnings
    const highOccupancyDays = currentData.filter(d => d.occupancy >= 90);
    if (highOccupancyDays.length > 0) {
      const percentage = Math.round((highOccupancyDays.length / currentData.length) * 100);
      insights.push(`High occupancy (≥90%) in ${percentage}% of the periods shown`);
    } else if (avgOccupancy >= 85) {
      insights.push('Average occupancy approaching capacity - monitor closely');
    } else if (avgOccupancy < 70) {
      insights.push('Low occupancy detected - consider resource optimization');
    }

    return insights;
  };

  const dynamicInsights = generateInsights();

  const metrics = [
    { label: 'Average Occupancy', value: `${avgOccupancy}%` },
    { label: 'Peak Occupancy', value: `${maxOccupancy}%` },
    { label: 'Lowest Occupancy', value: `${minOccupancy}%` },
  ];

  return (
    <Card className="bg-neutral-900 border-neutral-700">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            Occupancy Trends
          </CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={selectedWard} onValueChange={setSelectedWard}>
              <SelectTrigger className="w-[180px] border-neutral-600 h-10">
                <SelectValue placeholder="All Wards" />
              </SelectTrigger>
              <SelectContent>
                {wards.map((ward) => (
                  <SelectItem key={ward} value={ward.toLowerCase().replace(/\s+/g, '')}>
                    {ward}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 border border-neutral-700 h-10">
              <Button
                size="sm"
                variant={timeRange === '7days' ? 'default' : 'ghost'}
                onClick={() => setTimeRange('7days')}
                className="text-xs h-8"
              >
                7 Days
              </Button>
              <Button
                size="sm"
                variant={timeRange === '30days' ? 'default' : 'ghost'}
                onClick={() => setTimeRange('30days')}
                className="text-xs h-8"
              >
                30 Days
              </Button>
              <Button
                size="sm"
                variant={timeRange === '90days' ? 'default' : 'ghost'}
                onClick={() => setTimeRange('90days')}
                className="text-xs h-8"
              >
                90 Days
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics.map((metric, index) => (
            <div key={index} className="p-4 bg-neutral-900 rounded-lg border border-neutral-700">
              <p className="text-sm text-neutral-400 mb-1">{metric.label}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{metric.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-neutral-400 px-2">
            <span>Occupancy Rate</span>
            <span>100%</span>
          </div>
          <div className="relative h-64 bg-neutral-900 rounded-lg border border-neutral-700 p-4">
            {currentData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
                {error || (isLoading ? 'Loading occupancy history...' : 'No occupancy history for this period yet')}
              </div>
            )}
            <div className="h-full flex items-end justify-around gap-2">
              {currentData.map((item, index) => {
                const heightPercentage = item.occupancy;
                const isHighOccupancy = item.occupancy >= 90;

                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2 h-full">
                    <div className="w-full relative group flex items-end h-full">
                      <div
                        className={`w-full rounded-t-lg transition-all ${isHighOccupancy
                          ? 'bg-gradient-to-t from-red-600 to-red-400'
                          : 'bg-gradient-to-t from-blue-600 to-blue-400'
                          }`}
                        style={{ height: `${heightPercentage}%`, minHeight: item.occupancy === 0 ? '0px' : '4px' }}
                      >
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-neutral-400">{item.day}</span>
                      <span className="text-xs font-medium text-white">({item.occupancy}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-4">
              {[0, 25, 50, 75, 100].map((line) => (
                <div key={line} className="border-t border-neutral-700/30" />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-neutral-400 px-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-t from-blue-600 to-blue-400" />
              <span>Normal (&lt;90%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-t from-red-600 to-red-400" />
              <span>High (≥90%)</span>
            </div>
          </div>
        </div>

        {/* Insights */}
        {dynamicInsights.length > 0 && (
          <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <h4 className="font-semibold text-purple-400 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Key Insights
            </h4>
            <ul className="space-y-1 text-md text-slate-300 text-left">
              {dynamicInsights.map((insight, index) => (
                <li key={index}>• {insight}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OccupancyTrendsChart;
