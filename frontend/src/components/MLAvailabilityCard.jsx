import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, TrendingUp, Calendar, BedDouble, Info, ArrowRight } from 'lucide-react';

/**
 * MLAvailabilityCard - Displays AI-predicted bed availability forecast
 * 
 * @param {number} available24h - Predicted beds available in 24 hours
 * @param {number} available48h - Predicted beds available in 48 hours
 * @param {number} currentAvailable - Current available beds (optional)
 * @param {number} totalBeds - Total beds in system (optional)
 * @param {number} confidence24h - Confidence score 0-1 for 24h (optional, default 0.85)
 * @param {number} confidence48h - Confidence score 0-1 for 48h (optional, default 0.75)
 */
const MLAvailabilityCard = ({ 
  available24h = 0, 
  available48h = 0,
  currentAvailable = null,
  totalBeds = null,
  confidence24h = 0.85,
  confidence48h = 0.75,
  sourceLabel = 'ML Model'
}) => {
  // Calculate net change
  const change24h = currentAvailable !== null ? available24h - currentAvailable : null;
  const change48h = currentAvailable !== null ? available48h - currentAvailable : null;

  const formatConfidence = (score) => {
    return `${Math.round(score * 100)}%`;
  };

  const getConfidenceColor = (score) => {
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getConfidenceBgColor = (score) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  const getTrendIcon = (change) => {
    if (change === null) return null;
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (change < 0) return <TrendingUp className="w-4 h-4 text-red-400 rotate-180" />;
    return <ArrowRight className="w-4 h-4 text-slate-400" />;
  };

  const getTrendText = (change) => {
    if (change === null) return '';
    if (change > 0) return `+${change}`;
    if (change < 0) return `${change}`;
    return 'No change';
  };

  const getAvailabilityStatus = (available, total) => {
    if (total === null || total === 0) return 'unknown';
    const percentage = (available / total) * 100;
    if (percentage >= 25) return 'good';
    if (percentage >= 15) return 'moderate';
    return 'critical';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'good': return 'text-green-400 border-green-500/30 bg-green-500/10';
      case 'moderate': return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
      case 'critical': return 'text-red-400 border-red-500/30 bg-red-500/10';
      default: return 'text-slate-400 border-slate-500/30 bg-slate-500/10';
    }
  };

  const status24h = getAvailabilityStatus(available24h, totalBeds);
  const status48h = getAvailabilityStatus(available48h, totalBeds);

  return (
    <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Target className="w-5 h-5 text-blue-400" />
            Bed Availability Forecast
          </CardTitle>
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40">
            {sourceLabel}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Predicted bed availability based on historical patterns and discharge forecasts
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current Status (if provided) */}
          {currentAvailable !== null && (
            <div className="bg-neutral-900/50 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Current Available</span>
                <BedDouble className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-white">{currentAvailable}</span>
                {totalBeds !== null && (
                  <span className="text-sm text-slate-400">/ {totalBeds} beds</span>
                )}
              </div>
            </div>
          )}

          {/* 24-Hour Forecast */}
          <div className={`border rounded-lg p-4 ${getStatusColor(status24h)}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                <span className="font-semibold text-white">24-Hour Forecast</span>
              </div>
              {getTrendIcon(change24h)}
            </div>
            
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-white">{available24h}</span>
              <span className="text-lg text-slate-300">beds</span>
              {change24h !== null && (
                <Badge 
                  variant="outline" 
                  className={`ml-2 ${
                    change24h > 0 ? 'border-green-500/50 text-green-400' : 
                    change24h < 0 ? 'border-red-500/50 text-red-400' : 
                    'border-slate-500/50 text-slate-400'
                  }`}
                >
                  {getTrendText(change24h)}
                </Badge>
              )}
            </div>

            {/* Confidence Indicator */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Prediction Confidence</span>
                <span className={`font-semibold ${getConfidenceColor(confidence24h)}`}>
                  {formatConfidence(confidence24h)}
                </span>
              </div>
              <div className="w-full bg-neutral-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all ${getConfidenceBgColor(confidence24h)}`}
                  style={{ width: `${confidence24h * 100}%` }}
                />
              </div>
            </div>

            {totalBeds !== null && (
              <div className="mt-2 text-xs text-slate-400">
                Projected availability: {((available24h / totalBeds) * 100).toFixed(1)}%
              </div>
            )}
          </div>

          {/* 48-Hour Forecast */}
          <div className={`border rounded-lg p-4 ${getStatusColor(status48h)}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                <span className="font-semibold text-white">48-Hour Forecast</span>
              </div>
              {getTrendIcon(change48h)}
            </div>
            
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold text-white">{available48h}</span>
              <span className="text-lg text-slate-300">beds</span>
              {change48h !== null && (
                <Badge 
                  variant="outline" 
                  className={`ml-2 ${
                    change48h > 0 ? 'border-green-500/50 text-green-400' : 
                    change48h < 0 ? 'border-red-500/50 text-red-400' : 
                    'border-slate-500/50 text-slate-400'
                  }`}
                >
                  {getTrendText(change48h)}
                </Badge>
              )}
            </div>

            {/* Confidence Indicator */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Prediction Confidence</span>
                <span className={`font-semibold ${getConfidenceColor(confidence48h)}`}>
                  {formatConfidence(confidence48h)}
                </span>
              </div>
              <div className="w-full bg-neutral-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all ${getConfidenceBgColor(confidence48h)}`}
                  style={{ width: `${confidence48h * 100}%` }}
                />
              </div>
            </div>

            {totalBeds !== null && (
              <div className="mt-2 text-xs text-slate-400">
                Projected availability: {((available48h / totalBeds) * 100).toFixed(1)}%
              </div>
            )}
          </div>

          {/* Capacity Planning Insight */}
          {totalBeds !== null && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-300">
                  {available24h < totalBeds * 0.15 ? (
                    <span className="text-yellow-400 font-semibold">
                      ⚠️ Low projected availability (&lt;15%). Consider delaying non-urgent admissions.
                    </span>
                  ) : available24h >= totalBeds * 0.25 ? (
                    <span className="text-green-400 font-semibold">
                      ✓ Good capacity outlook. System has adequate availability projected.
                    </span>
                  ) : (
                    <span>
                      Moderate capacity expected. Monitor closely for changes.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-blue-500/20">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              <span>Net of expected discharges and admissions</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>&gt;25%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>15-25%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>&lt;15%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MLAvailabilityCard;
