import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchBeds } from '@/features/beds/bedsSlice';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Bed, Users, TrendingUp, AlertCircle } from 'lucide-react';
import api from '@/services/api';

const ExecutiveSummary = () => {
  const dispatch = useDispatch();
  const { bedsList, status } = useSelector((state) => state.beds);
  const [analyticsData, setAnalyticsData] = useState(null);

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchBeds());
    }
  }, [dispatch, status]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await api.get('/analytics/occupancy-summary');
        setAnalyticsData(response.data);
      } catch (error) {
        console.error('Error fetching analytics:', error);
      }
    };
    fetchAnalytics();

    // Refresh every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate metrics from beds data
  const totalBeds = bedsList.length || analyticsData?.totalBeds || 0;
  const occupiedBeds = bedsList.filter(bed => bed.status === 'occupied').length || analyticsData?.occupied || 0;
  const availableBeds = bedsList.filter(bed => bed.status === 'available').length || analyticsData?.available || 0;
  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;


  // Get week-over-week changes from analytics data
  const weekOverWeek = analyticsData?.weekOverWeek || {};
  const totalBedsChange = weekOverWeek.totalBedsChange || 0;
  const occupiedChange = weekOverWeek.occupiedChange || 0;
  const availableChange = weekOverWeek.availableChange || 0;
  const occupancyRateChange = weekOverWeek.occupancyRateChange || '+0%';

  const kpis = [
    {
      title: 'Total Beds',
      value: totalBeds.toString(),
      change: totalBedsChange === 0 ? '+0' : `${totalBedsChange > 0 ? '+' : ''}${totalBedsChange}`,
      changeType: totalBedsChange >= 0 ? 'positive' : 'negative',
      icon: Bed,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Occupancy Rate',
      value: `${occupancyRate}%`,
      change: occupancyRateChange,
      changeType: occupancyRateChange.includes('-') ? 'negative' : 'positive',
      icon: Activity,
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Active Patients',
      value: occupiedBeds.toString(),
      change: occupiedChange === 0 ? '+0' : `${occupiedChange > 0 ? '+' : ''}${occupiedChange}`,
      changeType: occupiedChange >= 0 ? 'positive' : 'negative',
      icon: Users,
      color: 'from-green-500 to-emerald-500',
    },
    {
      title: 'Available Beds',
      value: availableBeds.toString(),
      change: availableChange === 0 ? '+0' : `${availableChange > 0 ? '+' : ''}${availableChange}`,
      changeType: availableChange >= 0 ? 'positive' : 'negative',
      icon: TrendingUp,
      color: 'from-orange-500 to-yellow-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card
              key={index}
              className="bg-neutral-900 border-neutral-700 hover:border-neutral-600 transition-all text-left"
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-neutral-400 mb-1">{kpi.title}</p>
                    <h3 className="text-3xl font-bold text-white mb-2">{kpi.value}</h3>
                    <Badge
                      variant={kpi.changeType === 'positive' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {kpi.change} vs last week
                    </Badge>
                  </div>
                  <div
                    className={`p-3 rounded-xl bg-gradient-to-br ${kpi.color} bg-opacity-10`}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

    </div>
  );
};

export default ExecutiveSummary;
