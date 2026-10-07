# ML Model Training - Pre-Training Analysis

## 🎯 Purpose
This document analyzes the current database schema and ML model requirements to identify any mismatches or ambiguities before proceeding with model training.

---

## 📊 Current Database State

### ✅ Database Connection
- **Database**: MongoDB (localhost:27017/bedmanager)
- **Status**: Connected and verified
- **Data Generated**: Successfully using updated workflow (seedBeds.js → generateSyntheticData.js)

### ✅ Bed Data (192 beds)
- **ICU Ward**: 24 beds (iA1-iA12, iB1-iB12)
- **General Ward**: 84 beds (A1-A21, B1-B21, C1-C21, D1-D21)
- **Emergency Ward**: 84 beds (E1-E21, F1-F21, G1-G21, H1-H21)
- **Status Distribution**: ~70% occupied, ~7% available, ~22% cleaning

---

## 🔍 Schema Analysis

### 1. Bed Model Schema
```javascript
{
  bedId: String (required, unique),
  status: String ['available', 'cleaning', 'occupied'],
  ward: String (required),
  patientName: String (nullable),
  patientId: String (nullable),
  cleaningStartTime: Date (nullable),
  estimatedCleaningDuration: Number (minutes, nullable),
  estimatedCleaningEndTime: Date (nullable),
  notes: String (nullable),
  estimatedDischargeTime: Date (nullable),
  dischargeNotes: String (nullable),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
```

### 2. OccupancyLog Model Schema
```javascript
{
  bedId: ObjectId (ref: Bed, required),
  userId: ObjectId (ref: User, required),
  timestamp: Date (required, must be <= now),
  statusChange: String ['assigned', 'released', 'maintenance_start', 'maintenance_end', 'reserved', 'reservation_cancelled'],
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
```

### 3. CleaningLog Model Schema
```javascript
{
  bedId: ObjectId (ref: Bed, required),
  ward: String (required),
  startTime: Date (required),
  endTime: Date (nullable),
  estimatedDuration: Number (minutes, required),
  actualDuration: Number (minutes, nullable),
  status: String ['in_progress', 'completed', 'overdue'],
  assignedTo: ObjectId (ref: User, nullable),
  completedBy: ObjectId (ref: User, nullable),
  notes: String (nullable),
  createdAt: Date (auto),
  updatedAt: Date (auto)
}
```

---

## ⚠️ CRITICAL SCHEMA MISMATCHES IDENTIFIED

### 🚨 Issue #1: Missing `admissionTime` Field in Bed Model

**ML Model Expectation** (train_discharge.py):
- Tries to calculate discharge duration by finding admission time from OccupancyLogs
- Works by pairing "assigned" and "released" events in OccupancyLog

**Database Reality**:
- ✅ Bed model does NOT have `admissionTime` field
- ✅ This is actually CORRECT - admission time should come from OccupancyLog
- ✅ Current implementation pairs "assigned" → "released" events

**Status**: ✅ **NO ISSUE** - ML training script correctly uses OccupancyLog events

---

### 🚨 Issue #2: Ward Name Consistency

**ML Model Expectations**:
```python
ward_mapping = {
    'ICU': 0,
    'Emergency': 1,
    'General': 2,
    'Pediatrics': 3,  # ❌ NOT IN OUR DATABASE
    'Maternity': 4    # ❌ NOT IN OUR DATABASE
}
```

**Database Reality**:
```javascript
wards: ["ICU", "General", "Emergency"]  // Only 3 wards
```

**Impact**:
- ❌ ML models have hardcoded ward mappings including non-existent wards
- ⚠️ Default mapping `.fillna(2)` will map unknown wards to "General"
- ⚠️ This works but creates unused categorical values

**Recommendation**: 
- Update ML training scripts to use only: ICU, General, Emergency
- Remove Pediatrics and Maternity from ward mappings

---

### 🚨 Issue #3: OccupancyLog Timestamp Validation

**Database Constraint**:
```javascript
timestamp: {
  validate: {
    validator: function(value) {
      return value <= new Date();  // ❌ CANNOT BE IN FUTURE
    }
  }
}
```

**Current Data Generation**:
- ✅ Fixed in generateSyntheticData.js
- ✅ Only creates past timestamps for occupancy logs
- ✅ Does NOT create future "released" events

**Status**: ✅ **RESOLVED** - No future timestamps in database

---

### 🚨 Issue #4: Field Name Inconsistency - CleaningLog

**ML Model Uses** (train_cleaning_duration.py):
```python
df['actualDuration']   # ✅ Matches schema
df['estimatedDuration'] # ✅ Matches schema  
df['startTime']        # ✅ Matches schema
df['endTime']          # ✅ Matches schema
```

**Database Schema**:
```javascript
actualDuration: Number    // ✅ MATCHES
estimatedDuration: Number // ✅ MATCHES
startTime: Date          // ✅ MATCHES
endTime: Date            // ✅ MATCHES
```

**Status**: ✅ **NO ISSUE** - Field names match perfectly

---

## 📈 Data Volume Assessment

### Current Data (After Running generateSyntheticData.js)

**Expected Volumes**:
- ✅ Beds: 192 beds
- ✅ Users: 17 users
- ✅ OccupancyLogs: ~1,920 logs (historical + current)
- ✅ CleaningLogs: ~2,843 logs
- ✅ EmergencyRequests: ~38 requests
- ✅ Alerts: ~22 alerts

### ML Training Requirements

**Minimum Data for Decent Models**:
- Discharge Prediction: 100+ complete sessions (assigned → released pairs)
- Cleaning Duration: 100+ completed cleaning logs
- Bed Availability: 100+ occupancy samples

**Current Status**:
- ✅ OccupancyLogs: ~1,920 → Should provide 800-1,000 complete sessions
- ✅ CleaningLogs: ~2,843 → Plenty for training
- ✅ Bed snapshots: Can generate 100+ from occupancy timeline

**Verdict**: ✅ **SUFFICIENT DATA** for initial model training

---

## 🔧 Required Fixes Before Training

### Fix #1: Update Ward Mappings in All ML Training Scripts

**Files to Update**:
1. `ml-service/train/train_discharge.py`
2. `ml-service/train/train_cleaning_duration.py`
3. `ml-service/train/train_bed_availability.py`

**Change Required**:
```python
# OLD (includes non-existent wards)
ward_mapping = {
    'ICU': 0,
    'Emergency': 1,
    'General': 2,
    'Pediatrics': 3,   # ❌ Remove
    'Maternity': 4     # ❌ Remove
}

# NEW (matches actual database)
ward_mapping = {
    'ICU': 0,
    'Emergency': 1,
    'General': 2
}
```

---

## 🎯 Stay Duration Verification

### Current Configuration in generateSyntheticData.js
```javascript
const LOS = {
  ICU: [72, 168],       // 3-7 days
  General: [48, 120],   // 2-5 days  
  Emergency: [24, 72]   // 1-3 days
};
```

### Verification Against Realistic Patterns
- **ICU**: 3-7 days → ✅ Realistic for critical care
- **General**: 2-5 days → ✅ Realistic for standard admission
- **Emergency**: 1-3 days → ✅ Realistic for stabilization

**Status**: ✅ **APPROPRIATE** - Matches real hospital patterns

---

## 📋 Pre-Training Checklist

### Database Schema ✅
- [x] Bed model schema verified
- [x] OccupancyLog schema verified
- [x] CleaningLog schema verified
- [x] No future timestamps in OccupancyLog
- [x] Field names match ML expectations

### Data Generation ✅
- [x] seedBeds.js creates correct structure (192 beds)
- [x] generateSyntheticData.js uses existing beds
- [x] Realistic stay durations (ICU: 3-7d, General: 2-5d, Emergency: 1-3d)
- [x] Sufficient data volume (~1,920 occupancy logs, ~2,843 cleaning logs)

### ML Training Scripts ⚠️
- [ ] ❌ **NEEDS FIX**: Update ward mappings (remove Pediatrics, Maternity)
- [x] Feature engineering logic correct
- [x] Data extraction logic correct
- [x] Model evaluation metrics appropriate

---

## 🚀 Action Plan

### Step 1: Fix Ward Mappings
Update all 3 training scripts to use only ICU, General, Emergency wards.

### Step 2: Verify MongoDB Connection
Ensure ML service can connect to MongoDB using correct URI.

### Step 3: Run Training Pipeline
Execute training for all 3 models:
1. Discharge prediction model
2. Cleaning duration model  
3. Bed availability model

### Step 4: Validate Models
Check model metrics and ensure reasonable performance.

### Step 5: Test Predictions
Verify predictions work correctly via API endpoints.

---

## ❓ Questions to Resolve Before Proceeding

1. **Ward Mapping Fix**: Should I proceed with updating the ward mappings in all ML training scripts?
   - Current: ICU, Emergency, General, Pediatrics, Maternity
   - Proposed: ICU, Emergency, General only

2. **Data Sufficiency**: Is ~1,920 occupancy logs and ~2,843 cleaning logs sufficient, or should we generate more data?

3. **Model Storage**: The trained models will be saved to `ml-service/models/` directory. Confirm this location is acceptable.

4. **Training Order**: Should we train all 3 models, or prioritize one model first?

5. **MongoDB URI**: Confirm the ML service should use `mongodb://localhost:27017/bedmanager`

---

## 📊 Expected Training Results

### Discharge Prediction Model
- **Target**: Predict discharge time in hours
- **Expected MAE**: 8-15 hours (reasonable given data variance)
- **Expected R²**: 0.4-0.7

### Cleaning Duration Model  
- **Target**: Predict cleaning duration in minutes
- **Expected MAE**: 3-8 minutes
- **Expected R²**: 0.5-0.8

### Bed Availability Model
- **Target**: Predict if bed will be available in 6 hours
- **Expected Accuracy**: 70-85%
- **Expected F1**: 0.6-0.8

---

## ✅ Ready to Proceed?

**Once you confirm the following, I can proceed with training:**

1. ✅ Fix ward mappings to match actual database (ICU, General, Emergency only)
2. ✅ Use current data (~1,920 occupancy logs is sufficient)
3. ✅ Save models to `ml-service/models/` directory
4. ✅ Train all 3 models in sequence
5. ✅ Use MongoDB URI: `mongodb://localhost:27017/bedmanager`

**Please confirm or provide additional requirements before I proceed with model training.**
