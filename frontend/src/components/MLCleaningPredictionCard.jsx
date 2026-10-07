import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

/**
 * MLCleaningPredictionCard - Displays AI-predicted cleaning durations
 * 
 * @param {Array} predictions - Array of cleaning predictions
 * @param {string} predictions[].bedNumber - Bed identifier (e.g., "ICU-01")
 * @param {string} predictions[].ward - Ward name
 * @param {number} predictions[].predicted_cleaning_minutes - Predicted duration in minutes
 * @param {string} predictions[].predicted_end_time - ISO datetime string for completion
 * @param {number} maxDisplay - Maximum number of predictions to show (default: 5)
 */
const MLCleaningPredictionCard = ({ predictions = [], maxDisplay = 5, sourceLabel = 'ML Model' }) => {
  // Filter out invalid predictions and limit display
  const validPredictions = predictions
    .filter(p => p && p.predicted_cleaning_minutes != null)
    .slice(0, maxDisplay);

  if (validPredictions.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-green-500/10 to-teal-500/10 border-green-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-green-400" />
            Cleaning Duration Predictions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-slate-400">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p className="text-sm">No cleaning predictions available</p>
            <p className="text-xs text-slate-500 mt-1">
              Predictions will appear for beds being cleaned
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDuration = (minutes) => {
    if (minutes < 60) {
      return `~${Math.round(minutes)} min`;
    } else {
      const hours = (minutes / 60).toFixed(1);
      return `~${hours}h`;
    }
  };

  const formatEndTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid time';
    }
  };

  const isExtendedCleaning = (minutes) => minutes > 30;

  const getPriorityClass = (minutes) => {
    if (minutes > 45) return 'border-red-500/50 bg-red-500/10';
    if (minutes > 30) return 'border-orange-500/50 bg-orange-500/10';
    return 'border-green-500/30 bg-neutral-900/50';
  };

  // Calculate statistics
  const avgDuration = validPredictions.reduce((sum, p) => sum + p.predicted_cleaning_minutes, 0) / validPredictions.length;
  const extendedCount = validPredictions.filter(p => isExtendedCleaning(p.predicted_cleaning_minutes)).length;

  return (
    <Card className="bg-gradient-to-br from-green-500/10 to-teal-500/10 border-green-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-green-400" />
            Cleaning Duration Predictions
          </CardTitle>
          <Badge className="bg-green-500/20 text-green-300 border-green-500/40">
            {sourceLabel}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Predicted cleaning times for {validPredictions.length} bed{validPredictions.length !== 1 ? 's' : ''}
        </p>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-neutral-900/50 border border-green-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-green-400" />
              <span className="text-xs text-slate-400">Avg. Duration</span>
            </div>
            <p className="text-lg font-bold text-white">{formatDuration(avgDuration)}</p>
          </div>
          <div className="bg-neutral-900/50 border border-orange-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-slate-400">Extended (&gt;30min)</span>
            </div>
            <p className="text-lg font-bold text-white">{extendedCount} bed{extendedCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Predictions List */}
        <div className="space-y-3">
          {validPredictions.map((prediction, index) => {
            const minutes = prediction.predicted_cleaning_minutes;
            const extended = isExtendedCleaning(minutes);
            const priorityClass = getPriorityClass(minutes);

            return (
              <div
                key={index}
                className={`p-3 rounded-lg border ${priorityClass} hover:border-green-400/50 transition-all`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {prediction.ward}
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-300 text-sm">
                      Bed {prediction.bedNumber}
                    </span>
                  </div>
                  <Badge 
                    className={`text-xs ${
                      extended 
                        ? 'bg-orange-500/20 text-orange-300 border-orange-500/40' 
                        : 'bg-green-500/20 text-green-300 border-green-500/40'
                    }`}
                  >
                    {formatDuration(minutes)}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>Expected end: {formatEndTime(prediction.predicted_end_time)}</span>
                  </div>
                  {extended ? (
                    <div className="flex items-center gap-1 text-orange-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Extended</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-green-400">
                      <CheckCircle className="w-3 h-3" />
                      <span>Standard</span>
                    </div>
                  )}
                </div>

                {/* Duration bar */}
                <div className="mt-2 w-full bg-neutral-700 rounded-full h-1 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      minutes > 45 ? 'bg-red-500' : 
                      minutes > 30 ? 'bg-orange-500' : 
                      'bg-green-500'
                    }`}
                    style={{ 
                      width: `${Math.min(100, (minutes / 60) * 100)}%` 
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-green-500/20">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>{validPredictions.length} active prediction{validPredictions.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>≤30min</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span>30-45min</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>&gt;45min</span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning if many extended cleanings */}
        {extendedCount >= 2 && (
          <div className="mt-3 p-2 bg-orange-500/10 border border-orange-500/30 rounded flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-orange-300">
              {extendedCount} bed{extendedCount !== 1 ? 's require' : ' requires'} extended cleaning. 
              Consider allocating additional staff.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MLCleaningPredictionCard;
