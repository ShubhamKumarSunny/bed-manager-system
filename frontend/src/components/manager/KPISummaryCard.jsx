import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAnalyticsSummary } from '@/features/analytics/analyticsSlice';
import { Activity, BedDouble, AlertCircle, TrendingUp } from 'lucide-react';

const KPISummaryCard = ({ ward }) => {
  const dispatch = useDispatch();
  const { summary, status } = useSelector((state) => state.analytics);
  const currentUser = useSelector((state) => state.auth.user);

  useEffect(() => {
    if (ward || currentUser?.ward) {
      dispatch(fetchAnalyticsSummary({ ward: ward || currentUser?.ward }));
    }
  }, [dispatch, ward, currentUser?.ward]);

  const kpiData = [
    {
      icon: BedDouble,
      label: 'Total Beds',
      value: summary?.totalBeds || 0,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
    },
    {
      icon: Activity,
      label: 'Occupied',
      value: summary?.occupiedBeds || 0,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      icon: AlertCircle,
      label: 'Available',
      value: summary?.availableBeds || 0,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      icon: TrendingUp,
      label: 'Occupancy Rate',
      value: summary?.occupancyRate ? `${summary.occupancyRate}%` : '0%',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
  ];

  if (status === 'loading') {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 animate-pulse">
            <div className="h-12 w-12 bg-zinc-800 rounded-lg mb-4"></div>
            <div className="h-4 bg-zinc-800 rounded w-20 mb-2"></div>
            <div className="h-8 bg-zinc-800 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {kpiData.map((kpi, index) => {
        const Icon = kpi.icon;
        return (
          <div
            key={index}
            className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 hover:border-neutral-600 transition-colors"
          >
            <div className={`inline-flex p-3 rounded-lg ${kpi.bgColor} mb-4`}>
              <Icon className={`w-6 h-6 ${kpi.color}`} />
            </div>
            <p className="text-zinc-400 text-sm mb-1">{kpi.label}</p>
            <h3 className="text-3xl font-bold text-white">{kpi.value}</h3>
          </div>
        );
      })}
    </div>
  );
};

export default KPISummaryCard;
