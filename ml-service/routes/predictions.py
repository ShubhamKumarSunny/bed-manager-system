"""
Prediction routes for ML models
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime
import numpy as np
import logging

from config import settings

from schemas import (
    DischargeRequest,
    BedAvailabilityRequest,
    CleaningDurationRequest,
    PredictionResponse,
    ErrorResponse
)
from utils import (
    extract_time_features,
    ward_to_numeric,
    format_prediction_response
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/predict", tags=["predictions"])

# Helper function for time of day classification
def get_time_of_day(hour):
    """Convert hour (0-23) to time of day category (0-3)"""
    if 6 <= hour < 12:
        return 0  # morning
    elif 12 <= hour < 18:
        return 1  # afternoon
    elif 18 <= hour < 22:
        return 2  # evening
    else:
        return 3  # night

# Global model storage (will be loaded from main.py)
models = {
    'discharge': None,
    'bed_availability': None,
    'cleaning_duration': None
}


def set_models(discharge_model, bed_availability_model, cleaning_duration_model):
    """Set loaded models (called from main.py)"""
    models['discharge'] = discharge_model
    models['bed_availability'] = bed_availability_model
    models['cleaning_duration'] = cleaning_duration_model


@router.post("/discharge", response_model=PredictionResponse)
async def predict_discharge(request: DischargeRequest):
    """
    Predict patient discharge time in hours from admission
    
    Returns estimated hours until discharge based on:
    - Ward type
    - Admission time (hour, day of week)
    - Historical patterns
    """
    try:
        if models['discharge'] is None:
            raise HTTPException(
                status_code=503,
                detail="Discharge prediction model not loaded"
            )
        
        model_package = models['discharge']
        model = model_package['model']
        feature_columns = model_package['feature_columns']
        
        # Use provided time or current time
        admission_time = request.admission_time or datetime.utcnow()
        
        # Extract time features
        time_features = extract_time_features(admission_time)
        
        # Build feature vector (matching ward-focused training model)
        ward_encoded = ward_to_numeric(request.ward)
        features = {
            'ward_encoded': ward_encoded,
            'hour': time_features['hour'],
            'day_of_week': time_features['day_of_week'],
            'month': admission_time.month,
            'day_of_month': admission_time.day,
            'is_weekend': time_features['is_weekend'],
            'is_business_hours': time_features['is_business_hours'],
            'time_of_day': time_features['time_of_day'],
        }
        
        # Calculate actual historical averages from database
        try:
            from pymongo import MongoClient
            from datetime import timedelta
            
            # Connect to MongoDB
            # MONGO_URI comes from the environment (e.g. mongodb://mongo:27017/bedmanager
            # under Docker); fail fast so a missing database never stalls a prediction
            mongo_client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=2000)
            db = mongo_client.get_default_database(default='bedmanager')
            
            # Get occupancy logs from last 30 days
            thirty_days_ago = datetime.utcnow() - timedelta(days=30)
            logs = list(db.occupancylogs.find({
                'timestamp': {'$gte': thirty_days_ago}
            }).sort([('bedId', 1), ('timestamp', 1)]))
            
            # Populate bed info to get ward
            bed_ids = list(set([log['bedId'] for log in logs]))
            beds_info = {
                bed['_id']: bed['ward'] 
                for bed in db.beds.find({'_id': {'$in': bed_ids}}, {'ward': 1})
            }
            
            # Group logs by bedId and calculate durations
            bed_groups = {}
            for log in logs:
                bed_id = str(log['bedId'])
                if bed_id not in bed_groups:
                    bed_groups[bed_id] = []
                bed_groups[bed_id].append(log)
            
            # Calculate durations by ward
            ward_durations = {}
            time_of_day_durations = {0: [], 1: [], 2: [], 3: []}  # morning, afternoon, evening, night
            
            for bed_id_str, bed_logs in bed_groups.items():
                bed_obj_id = bed_logs[0]['bedId']
                ward = beds_info.get(bed_obj_id, 'General')
                
                for i in range(len(bed_logs) - 1):
                    if bed_logs[i]['statusChange'] == 'assigned' and bed_logs[i+1]['statusChange'] == 'released':
                        duration_hours = (bed_logs[i+1]['timestamp'] - bed_logs[i]['timestamp']).total_seconds() / 3600
                        if 0 < duration_hours < 8760:  # Valid range (less than 1 year)
                            # Ward average
                            if ward not in ward_durations:
                                ward_durations[ward] = []
                            ward_durations[ward].append(duration_hours)
                            
                            # Time of day average
                            admission_hour = bed_logs[i]['timestamp'].hour
                            tod = get_time_of_day(admission_hour)
                            time_of_day_durations[tod].append(duration_hours)
            
            # Calculate ward average
            if request.ward in ward_durations and len(ward_durations[request.ward]) > 0:
                ward_avg = sum(ward_durations[request.ward]) / len(ward_durations[request.ward])
            else:
                # Fallback to overall average if ward has no data
                all_durations = [d for durations in ward_durations.values() for d in durations]
                ward_avg = sum(all_durations) / len(all_durations) if all_durations else 48.0
            
            # Calculate time of day average
            tod = get_time_of_day(time_features['hour'])
            if len(time_of_day_durations[tod]) > 0:
                time_avg = sum(time_of_day_durations[tod]) / len(time_of_day_durations[tod])
            else:
                time_avg = ward_avg
            
            # Calculate combined ward+time average
            ward_time_key = f"{request.ward}_{tod}"
            ward_time_durations = []
            for bed_id_str, bed_logs in bed_groups.items():
                bed_obj_id = bed_logs[0]['bedId']
                ward = beds_info.get(bed_obj_id, 'General')
                if ward == request.ward:
                    for i in range(len(bed_logs) - 1):
                        if bed_logs[i]['statusChange'] == 'assigned' and bed_logs[i+1]['statusChange'] == 'released':
                            admission_hour = bed_logs[i]['timestamp'].hour
                            if get_time_of_day(admission_hour) == tod:
                                duration_hours = (bed_logs[i+1]['timestamp'] - bed_logs[i]['timestamp']).total_seconds() / 3600
                                if 0 < duration_hours < 8760:
                                    ward_time_durations.append(duration_hours)
            
            ward_time_avg = sum(ward_time_durations) / len(ward_time_durations) if ward_time_durations else ward_avg
            
            # Set features for ward-focused model
            features['ward_avg_duration'] = ward_avg
            features['time_avg_duration'] = time_avg
            features['ward_time_avg_duration'] = ward_time_avg
            
            logger.info(f"Ward-focused features: ward_avg={ward_avg:.2f}h, time_avg={time_avg:.2f}h, ward_time_avg={ward_time_avg:.2f}h, ward_encoded={ward_encoded}")
            
            mongo_client.close()
            
        except Exception as e:
            logger.error(f"Failed to calculate historical averages from database: {e}", exc_info=True)
            # Fallback to reasonable defaults based on ward
            ward_defaults = {
                'ICU': 48.0,
                'Emergency': 24.0,
                'General': 36.0,
                'Pediatrics': 30.0,
                'Maternity': 48.0,
                'Surgery': 36.0,
                'Cardiology': 40.0
            }
            default_duration = ward_defaults.get(request.ward, 36.0)
            features['ward_avg_duration'] = default_duration
            features['time_avg_duration'] = default_duration  # Fallback to ward avg
            features['ward_time_avg_duration'] = default_duration  # Fallback to ward avg
        
        # Create input array in correct order
        X = np.array([[features[col] for col in feature_columns]])
        
        # Predict
        prediction_hours = float(model.predict(X)[0])
        
        # Calculate estimated discharge time
        estimated_discharge = admission_time.timestamp() + (prediction_hours * 3600)
        estimated_discharge_dt = datetime.fromtimestamp(estimated_discharge)
        
        return format_prediction_response(
            prediction={
                "hours_until_discharge": round(prediction_hours, 2),
                "estimated_discharge_time": estimated_discharge_dt.isoformat()
            },
            metadata={
                "ward": request.ward,
                "admission_time": admission_time.isoformat(),
                "model_version": model_package.get('version', '1.0.0')
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Discharge prediction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bed-availability", response_model=PredictionResponse)
async def predict_bed_availability(request: BedAvailabilityRequest):
    """
    Predict if a bed will become available in the next N hours
    
    Returns probability that a bed in the specified ward will become available
    """
    try:
        if models['bed_availability'] is None:
            raise HTTPException(
                status_code=503,
                detail="Bed availability prediction model not loaded"
            )
        
        model_package = models['bed_availability']
        model = model_package['model']
        feature_columns = model_package['feature_columns']
        
        # Use provided time or current time
        current_time = request.current_time or datetime.utcnow()
        
        # Extract time features
        time_features = extract_time_features(current_time)
        
        # Build feature vector
        features = {
            'hour': time_features['hour'],
            'day_of_week': time_features['day_of_week'],
            'month': current_time.month,
            'is_weekend': time_features['is_weekend'],
            'is_business_hours': time_features['is_business_hours'],
            'time_of_day': time_features['time_of_day'],
            'ward_encoded': ward_to_numeric(request.ward),
            'is_occupied': 1,  # Assume bed is currently occupied
            'is_cleaning': 0,
            'ward_occupancy_rate': 0.75,  # Default occupancy rate
            'hour_availability_rate': 0.15  # Default availability rate
        }
        
        # Create input array
        X = np.array([[features[col] for col in feature_columns]])
        
        # Predict probability
        will_be_available = int(model.predict(X)[0])
        probability = float(model.predict_proba(X)[0][1])
        
        return format_prediction_response(
            prediction={
                "will_be_available": bool(will_be_available),
                "probability": round(probability, 4),
                "prediction_horizon_hours": request.prediction_horizon_hours
            },
            confidence=probability,
            metadata={
                "ward": request.ward,
                "current_time": current_time.isoformat(),
                "model_version": model_package.get('version', '1.0.0')
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bed availability prediction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleaning-duration", response_model=PredictionResponse)
async def predict_cleaning_duration(request: CleaningDurationRequest):
    """
    Predict actual cleaning duration for a bed
    
    Returns predicted cleaning time in minutes based on:
    - Ward type
    - Time of day
    - Estimated duration
    - Historical patterns
    """
    try:
        if models['cleaning_duration'] is None:
            raise HTTPException(
                status_code=503,
                detail="Cleaning duration prediction model not loaded"
            )
        
        model_package = models['cleaning_duration']
        model = model_package['model']
        feature_columns = model_package['feature_columns']
        
        # Use provided time or current time
        start_time = request.start_time or datetime.utcnow()
        
        # Extract time features
        time_features = extract_time_features(start_time)
        
        # Build feature vector
        features = {
            'hour': time_features['hour'],
            'day_of_week': time_features['day_of_week'],
            'month': start_time.month,
            'day_of_month': start_time.day,
            'is_weekend': time_features['is_weekend'],
            'is_business_hours': time_features['is_business_hours'],
            'time_of_day': time_features['time_of_day'],
            'ward_encoded': ward_to_numeric(request.ward),
            'estimated_duration': request.estimated_duration or 30,
        }
        
        # Add historical averages (defaults based on ward)
        ward_avg_durations = {
            'ICU': 35.0,
            'Emergency': 28.0,
            'General': 30.0,
            'Pediatrics': 32.0,
            'Maternity': 33.0
        }
        avg_duration = ward_avg_durations.get(request.ward, 30.0)
        
        features['ward_avg_duration'] = avg_duration
        features['time_avg_duration'] = avg_duration
        features['ward_time_avg_duration'] = avg_duration
        features['ward_std_duration'] = 10.0  # Default std deviation
        
        # Create input array
        X = np.array([[features[col] for col in feature_columns]])
        
        # Predict
        predicted_duration = float(model.predict(X)[0])
        
        # Calculate estimated end time
        estimated_end = start_time.timestamp() + (predicted_duration * 60)
        estimated_end_dt = datetime.fromtimestamp(estimated_end)
        
        return format_prediction_response(
            prediction={
                "predicted_duration_minutes": round(predicted_duration, 2),
                "estimated_end_time": estimated_end_dt.isoformat(),
                "variance_from_estimate": round(predicted_duration - (request.estimated_duration or 30), 2)
            },
            metadata={
                "ward": request.ward,
                "start_time": start_time.isoformat(),
                "estimated_duration": request.estimated_duration or 30,
                "model_version": model_package.get('version', '1.0.0')
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cleaning duration prediction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
