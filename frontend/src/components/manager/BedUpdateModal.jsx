import React, { useState, useEffect, useRef } from 'react';
import { X, BedDouble, Loader2, Clock, User, Calendar, AlertCircle, FileText } from 'lucide-react';
import api from '@/services/api';
import TimeRemaining from '../common/TimeRemaining';

const BedUpdateModal = ({ bed, isOpen, onClose, onSuccess, emergencyPatientData }) => {
  const [status, setStatus] = useState(bed?.status || 'available');
  const [patientName, setPatientName] = useState(bed?.patientName || '');
  const [patientId, setPatientId] = useState(bed?.patientId || '');
  const [, setCleaningDuration] = useState('45');
  const [notes, setNotes] = useState(bed?.notes || '');
  const [estimatedDischargeTime, setEstimatedDischargeTime] = useState('');
  const [dischargeNotes, setDischargeNotes] = useState(bed?.dischargeNotes || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const timePickerRef = useRef(null);

  // Calculate time-related metadata
  const [timeInBed, setTimeInBed] = useState(null);
  const [cleaningProgress, setCleaningProgress] = useState(null);
  const [admissionTime, setAdmissionTime] = useState(null);

  useEffect(() => {
    if (!bed) return;

    // Set the action status based on current bed status
    if (bed.status === 'available') {
      setStatus('occupied'); // Action: Assign Patient
    } else if (bed.status === 'occupied') {
      setStatus('cleaning'); // Action: Release (Mark as Cleaning)
    } else {
      setStatus('available'); // Fallback
    }

    // If emergency patient data exists, use it; otherwise use bed data
    if (emergencyPatientData) {
      setPatientName(emergencyPatientData.patientName || '');
      setPatientId(emergencyPatientData.patientId || '');
      setNotes(emergencyPatientData.reason || '');
    } else {
      setPatientName(bed.patientName || '');
      setPatientId(bed.patientId || '');
      setNotes(bed.notes || '');
    }

    setDischargeNotes(bed.dischargeNotes || '');

    // Format discharge time for datetime-local input
    if (bed.estimatedDischargeTime) {
      const date = new Date(bed.estimatedDischargeTime);
      const formatted = date.toISOString().slice(0, 16);
      setEstimatedDischargeTime(formatted);
    } else {
      setEstimatedDischargeTime('');
    }

    // Calculate admission time (using updatedAt as proxy)
    if (bed.status === 'occupied' && bed.updatedAt) {
      setAdmissionTime(new Date(bed.updatedAt));

      // Calculate time in bed
      const now = new Date();
      const admission = new Date(bed.updatedAt);
      const diffMs = now - admission;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      setTimeInBed({ hours: diffHours, minutes: diffMinutes });
    } else {
      setAdmissionTime(null);
      setTimeInBed(null);
    }

    // Calculate cleaning progress
    if (bed.status === 'cleaning' && bed.cleaningStartTime && bed.estimatedCleaningDuration) {
      const now = new Date();
      const startTime = new Date(bed.cleaningStartTime);
      const elapsedMs = now - startTime;
      const elapsedMinutes = elapsedMs / (1000 * 60);
      const percentage = Math.min(Math.round((elapsedMinutes / bed.estimatedCleaningDuration) * 100), 100);
      const remainingMinutes = Math.max(0, bed.estimatedCleaningDuration - elapsedMinutes);
      const isOverdue = elapsedMinutes > bed.estimatedCleaningDuration;

      setCleaningProgress({
        percentage,
        elapsed: Math.round(elapsedMinutes),
        remaining: Math.round(remainingMinutes),
        isOverdue,
        estimatedDuration: bed.estimatedCleaningDuration
      });

      // Set current cleaning duration for adjustment
      setCleaningDuration(bed.estimatedCleaningDuration.toString());
    } else {
      setCleaningProgress(null);
      setCleaningDuration('45'); // Reset to default
    }
  }, [bed, emergencyPatientData]);

  // Close time picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (timePickerRef.current && !timePickerRef.current.contains(event.target)) {
        setShowTimePicker(false);
      }
    };

    if (showTimePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTimePicker]);

  if (!isOpen || !bed) return null;

  const handleTimeSelect = (hour, minute, period) => {
    let hour24 = parseInt(hour);
    if (period === 'PM' && hour24 !== 12) {
      hour24 += 12;
    } else if (period === 'AM' && hour24 === 12) {
      hour24 = 0;
    }

    const timeString = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const date = estimatedDischargeTime.split('T')[0] || new Date().toISOString().split('T')[0];
    setEstimatedDischargeTime(`${date}T${timeString}`);
    setShowTimePicker(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (status === 'occupied' && !patientName.trim()) {
      setError('Patient name is required for occupied status');
      return;
    }

    setIsUpdating(true);

    try {
      const payload = {
        status,
        notes: notes.trim() || null,
        ...(status === 'occupied' && {
          patientName: patientName.trim(),
          patientId: patientId.trim() || null
        })
      };

      const response = await api.patch(`/beds/${bed.bedId}/status`, payload);

      if (response.data.success) {
        // If assigning patient and discharge time is set, update discharge time
        if (status === 'occupied' && estimatedDischargeTime) {
          try {
            const dischargePayload = {
              estimatedDischargeTime: new Date(estimatedDischargeTime).toISOString(),
              dischargeNotes: dischargeNotes.trim() || null
            };
            await api.patch(`/beds/${bed.bedId}/discharge-time`, dischargePayload);
          } catch (dischargeErr) {
            console.error('Error setting discharge time:', dischargeErr);
            // Don't fail the whole operation if discharge time setting fails
          }
        }

        onSuccess && onSuccess(response.data.data);
        onClose();
      }
    } catch (err) {
      console.error('Error updating bed:', err);
      setError(err.response?.data?.message || 'Failed to update bed');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateDischargeTime = async () => {
    if (!estimatedDischargeTime) {
      setError('Please select a discharge date and time');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const payload = {
        estimatedDischargeTime: new Date(estimatedDischargeTime).toISOString(),
        dischargeNotes: dischargeNotes.trim() || null
      };

      const response = await api.patch(`/beds/${bed.bedId}/discharge-time`, payload);

      if (response.data.success) {
        onSuccess && onSuccess(response.data.data.bed);
        alert('Discharge time updated successfully');
      }
    } catch (err) {
      console.error('Error updating discharge time:', err);
      setError(err.response?.data?.message || 'Failed to update discharge time');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'text-green-400 bg-green-900/20';
      case 'occupied': return 'text-red-400 bg-red-900/20';
      case 'cleaning': return 'text-orange-400 bg-orange-900/20';
      default: return 'text-zinc-400 bg-zinc-800';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-neutral-900 border border-zinc-800 rounded-lg max-w-2xl w-full my-8 max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${emergencyPatientData ? 'bg-red-500/10' : 'bg-cyan-500/10'}`}>
              <BedDouble className={`w-6 h-6 ${emergencyPatientData ? 'text-red-500' : 'text-cyan-500'}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {emergencyPatientData ? '🚨 Emergency Patient Assignment' : `Bed ${bed?.bedId || 'Selection'}`}
              </h2>
              <p className="text-zinc-400 text-sm">
                {emergencyPatientData
                  ? `Ward: ${emergencyPatientData.ward} | Priority: ${emergencyPatientData.priority?.toUpperCase()}`
                  : `Ward: ${bed?.ward || 'N/A'}`
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Metadata Section - Task 2.5c */}
        <div className="p-6 border-b border-zinc-800 bg-zinc-950/50 flex-shrink-0">
          <h3 className="text-sm font-semibold text-zinc-400 mb-4 text-left">Current Information</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Current Status */}
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded ${getStatusColor(bed.status)}`}>
                <BedDouble className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs text-zinc-500">Current Status</p>
                <p className="text-sm font-medium text-white capitalize">{bed.status}</p>
              </div>
            </div>

            {/* Last Updated */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-purple-500/10">
                <Clock className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-xs text-zinc-500">Last Updated</p>
                <p className="text-sm font-medium text-white">{formatDateTime(bed.updatedAt)}</p>
              </div>
            </div>

            {/* Patient Info (if occupied) */}
            {bed.status === 'occupied' && bed.patientName && (
              <>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-blue-500/10">
                    <User className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-zinc-500">Patient Name</p>
                    <p className="text-sm font-medium text-white">{bed.patientName}</p>
                    {bed.patientId && (
                      <p className="text-xs text-zinc-400">ID: {bed.patientId}</p>
                    )}
                  </div>
                </div>

                {admissionTime && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded bg-cyan-500/10">
                      <Calendar className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-zinc-500">Admission Time</p>
                      <p className="text-sm font-medium text-white">{formatDateTime(admissionTime)}</p>
                      {timeInBed && (
                        <p className="text-xs text-cyan-400">
                          Time in bed: {timeInBed.hours}h {timeInBed.minutes}m
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Estimated Discharge Time */}
                {bed.estimatedDischargeTime && (
                  <div className="col-span-2">
                    <div className="p-4 bg-cyan-900/20 border border-cyan-700/30 rounded-lg">
                      <TimeRemaining
                        targetTime={bed.estimatedDischargeTime}
                        label="Estimated discharge"
                      />
                      {bed.dischargeNotes && (
                        <p className="mt-2 text-xs text-neutral-400">
                          Note: {bed.dischargeNotes}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Cleaning Progress (if cleaning) */}
            {bed.status === 'cleaning' && cleaningProgress && (
              <>
                <div className="col-span-2">
                  <div className="flex items-start gap-3 mb-2">
                    <div className={`p-2 rounded ${cleaningProgress.isOverdue ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                      <AlertCircle className={`w-4 h-4 ${cleaningProgress.isOverdue ? 'text-red-400' : 'text-yellow-400'}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-xs text-zinc-500">Cleaning Progress</p>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-white">
                          {cleaningProgress.percentage}% Complete
                        </p>
                        <p className="text-xs text-zinc-400">
                          {cleaningProgress.isOverdue ? (
                            <span className="text-red-400">Overdue</span>
                          ) : (
                            <span>{cleaningProgress.remaining} min remaining</span>
                          )}
                        </p>
                      </div>
                      <div className="w-full bg-zinc-700 rounded-full h-2">
                        <div
                          className={`h-full rounded-full transition-all ${cleaningProgress.isOverdue ? 'bg-red-500' :
                            cleaningProgress.percentage >= 75 ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}
                          style={{ width: `${cleaningProgress.percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        Elapsed: {cleaningProgress.elapsed} min / Estimated: {cleaningProgress.estimatedDuration} min
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Notes (if any) */}
            {bed.notes && (
              <div className="col-span-2 flex items-start gap-3">
                <div className="p-2 rounded bg-zinc-700">
                  <FileText className="w-4 h-4 text-zinc-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-xs text-zinc-500">Current Notes</p>
                  <p className="text-sm text-zinc-300">{bed.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Cleaning Status Warning - Managers cannot update beds being cleaned */}
          {bed.status === 'cleaning' ? (
            <div className="p-6 space-y-4">
              <div className="p-4 bg-orange-500/10 border border-orange-500/50 rounded-lg text-orange-400 text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold mb-2">Bed Currently Being Cleaned</p>
                  <p className="text-orange-300">
                    This bed is assigned to ward staff for cleaning. Only ward staff members can update the status to "Available" once cleaning is complete.
                  </p>
                  {bed.cleaningStartTime && (
                    <p className="text-orange-300 mt-2">
                      Cleaning started: {formatDateTime(bed.cleaningStartTime)}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={onClose}
                type="button"
                className="w-full py-3 px-4 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors font-medium"
              >
                Close
              </button>
            </div>
          ) : (
            /* Edit Form - Only shown if not in cleaning status */
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <h3 className="text-sm font-semibold text-zinc-400 text-left">Update Bed Information</h3>

              {/* Status Dropdown - Single action option based on current bed status */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2 text-left">Action</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-neutral-400"
                  disabled={isUpdating}
                >
                  {bed.status === 'available' ? (
                    <option value="occupied">Assign Patient</option>
                  ) : bed.status === 'occupied' ? (
                    <option value="cleaning">Release (Mark as Cleaning)</option>
                  ) : (
                    <option value="available">Mark as Available</option>
                  )}
                </select>
                {bed.status === 'occupied' && (
                  <p className="text-xs text-yellow-400 mt-2 flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>This will release the patient and mark the bed for cleaning by ward staff.</span>
                  </p>
                )}
                {bed.status === 'available' && (
                  <p className="text-xs text-blue-400 mt-2">
                    This will assign the bed to a patient. Please enter patient details below.
                  </p>
                )}
              </div>

              {/* Patient Info - Only for Occupied */}
              {status === 'occupied' && (
                <>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2 text-left">
                      Patient Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="Enter patient name"
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-neutral-400"
                      disabled={isUpdating}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2 text-left">Patient ID (Optional)</label>
                    <input
                      type="text"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      placeholder="Enter patient ID"
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-neutral-400"
                      disabled={isUpdating}
                    />
                  </div>
                </>
              )}

              {/* Notes Field - Task 2.5c */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2 text-left">
                  Notes <span className="text-zinc-600">(Optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes or comments..."
                  rows="3"
                  maxLength="500"
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-neutral-400 resize-none"
                  disabled={isUpdating}
                />
                <p className="text-xs text-zinc-500 mt-1">
                  {notes.length}/500 characters
                </p>
              </div>

              {/* Estimated Discharge Time Section - For Assigning Patient or Updating Occupied Beds */}
              {/* Show if: (1) assigning a new patient (status='occupied'), OR (2) bed is currently occupied */}
              {(status === 'occupied' || bed.status === 'occupied') && (
                <div className="pt-4 border-t border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-400 mb-3 flex items-start gap-2 text-left">
                    <Calendar className="w-4 h-4" />
                    {bed.status === 'available' ? 'Set' : 'Update'} Estimated Discharge Time
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-zinc-400 mb-2 text-left">
                        Discharge Date & Time <span className="text-zinc-600">(Optional)</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1 text-left">Date (DD/MM/YYYY)</label>
                          <input
                            type="date"
                            value={estimatedDischargeTime.split('T')[0] || ''}
                            onChange={(e) => {
                              const date = e.target.value;
                              const time = estimatedDischargeTime.split('T')[1] || '00:00';
                              setEstimatedDischargeTime(date ? `${date}T${time}` : '');
                            }}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-neutral-400 [color-scheme:dark] cursor-pointer"
                            disabled={isUpdating}
                          />
                        </div>
                        <div className="relative" ref={timePickerRef}>
                          <label className="block text-xs text-zinc-500 mb-1 text-left">Time (HH:MM)</label>
                          <div
                            onClick={() => !isUpdating && setShowTimePicker(!showTimePicker)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white cursor-pointer flex items-center justify-between hover:border-neutral-400 transition-colors"
                          >
                            <span className={estimatedDischargeTime.split('T')[1] ? 'text-white' : 'text-zinc-500'}>
                              {estimatedDischargeTime.split('T')[1] ?
                                (() => {
                                  const [hours, minutes] = estimatedDischargeTime.split('T')[1].split(':');
                                  const hour = parseInt(hours);
                                  const period = hour >= 12 ? 'PM' : 'AM';
                                  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                  return `${String(displayHour).padStart(2, '0')}:${minutes} ${period}`;
                                })()
                                : '--:-- --'
                              }
                            </span>
                            <Clock className="w-4 h-4 text-zinc-400" />
                          </div>

                          {showTimePicker && (
                            <div className="absolute z-50 bottom-full mb-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-4 w-full">
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                {/* Hours */}
                                <div>
                                  <div className="text-xs text-zinc-400 mb-2 text-center">Hour</div>
                                  <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
                                    {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => {
                                      const currentTime = estimatedDischargeTime.split('T')[1] || '12:00';
                                      const [currentHour24] = currentTime.split(':').map(Number);
                                      const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                      const isSelected = currentHour12 === hour;

                                      return (
                                        <button
                                          key={hour}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = estimatedDischargeTime.split('T')[1] || '12:00';
                                            const [, currentMinute] = currentTime.split(':');
                                            const [currentHour24] = currentTime.split(':').map(Number);
                                            const period = currentHour24 >= 12 ? 'PM' : 'AM';
                                            handleTimeSelect(hour, currentMinute, period);
                                          }}
                                          className={`w-full px-2 py-1.5 rounded text-sm transition-colors ${isSelected
                                            ? 'bg-cyan-600 text-white'
                                            : 'hover:bg-zinc-800 text-zinc-300'
                                            }`}
                                        >
                                          {String(hour).padStart(2, '0')}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Minutes */}
                                <div>
                                  <div className="text-xs text-zinc-400 mb-2 text-center">Min</div>
                                  <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
                                    {Array.from({ length: 60 }, (_, i) => i).map(minute => {
                                      const currentTime = estimatedDischargeTime.split('T')[1] || '12:00';
                                      const [, currentMinute] = currentTime.split(':').map(Number);
                                      const isSelected = currentMinute === minute;

                                      return (
                                        <button
                                          key={minute}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = estimatedDischargeTime.split('T')[1] || '12:00';
                                            const [currentHour24] = currentTime.split(':').map(Number);
                                            const period = currentHour24 >= 12 ? 'PM' : 'AM';
                                            const hour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                            handleTimeSelect(hour12, minute, period);
                                          }}
                                          className={`w-full px-2 py-1.5 rounded text-sm transition-colors ${isSelected
                                            ? 'bg-cyan-600 text-white'
                                            : 'hover:bg-zinc-800 text-zinc-300'
                                            }`}
                                        >
                                          {String(minute).padStart(2, '0')}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* AM/PM */}
                                <div>
                                  <div className="text-xs text-zinc-400 mb-2 text-center">Period</div>
                                  <div className="space-y-1">
                                    {['AM', 'PM'].map(period => {
                                      const currentTime = estimatedDischargeTime.split('T')[1] || '12:00';
                                      const [currentHour24] = currentTime.split(':').map(Number);
                                      const currentPeriod = currentHour24 >= 12 ? 'PM' : 'AM';
                                      const isSelected = currentPeriod === period;

                                      return (
                                        <button
                                          key={period}
                                          type="button"
                                          onClick={() => {
                                            const currentTime = estimatedDischargeTime.split('T')[1] || '12:00';
                                            const [currentHour24, currentMinute] = currentTime.split(':').map(Number);
                                            const currentHour12 = currentHour24 === 0 ? 12 : currentHour24 > 12 ? currentHour24 - 12 : currentHour24;
                                            handleTimeSelect(currentHour12, currentMinute, period);
                                          }}
                                          className={`w-full px-2 py-1.5 rounded text-sm transition-colors ${isSelected
                                            ? 'bg-cyan-600 text-white'
                                            : 'hover:bg-zinc-800 text-zinc-300'
                                            }`}
                                        >
                                          {period}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {bed.status === 'available' && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Set the expected discharge time when assigning the patient
                        </p>
                      )}
                      {bed.status === 'occupied' && bed.estimatedDischargeTime && new Date(bed.estimatedDischargeTime) < new Date() && (
                        <p className="text-xs text-yellow-400 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Current discharge time is overdue. Update to a new time.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400 mb-2 text-left">
                        Discharge Notes <span className="text-zinc-600">(Optional)</span>
                      </label>
                      <textarea
                        value={dischargeNotes}
                        onChange={(e) => setDischargeNotes(e.target.value)}
                        placeholder="Add discharge notes or instructions..."
                        rows="2"
                        maxLength="500"
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-neutral-400 resize-none"
                        disabled={isUpdating}
                      />
                    </div>
                    {bed.status === 'occupied' && (
                      <button
                        type="button"
                        onClick={handleUpdateDischargeTime}
                        className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        disabled={isUpdating || !estimatedDischargeTime}
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Clock className="w-4 h-4" />
                            Update Discharge Time
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white transition-colors"
                  disabled={isUpdating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`flex-1 px-4 py-2 rounded-lg text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${bed.status === 'occupied'
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : 'bg-cyan-600 hover:bg-cyan-700'
                    }`}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Updating...
                    </>
                  ) : bed.status === 'available' ? (
                    'Assign Patient'
                  ) : bed.status === 'occupied' ? (
                    'Release Patient'
                  ) : (
                    'Update Bed'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default BedUpdateModal;
