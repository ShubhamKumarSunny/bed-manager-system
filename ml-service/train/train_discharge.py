"""
Training script for Discharge Time Prediction Model

This script:
1. Connects to MongoDB and extracts OccupancyLog data
2. Builds features from historical occupancy patterns
3. Trains a Random Forest Regressor to predict discharge time
4. Evaluates model performance
5. Saves the trained model to models/discharge_model.pkl
"""

import sys
import os
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from pymongo import MongoClient
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import logging

# Add parent directory to path to import config
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def connect_to_mongodb():
    """Connect to MongoDB and return database instance"""
    try:
        client = MongoClient(settings.MONGO_URI)
        # Extract database name from URI
        db_name = settings.MONGO_URI.split('/')[-1].split('?')[0]
        if not db_name or db_name == '':
            db_name = 'bedmanager'
        db = client[db_name]
        
        # Test connection
        db.command('ping')
        logger.info(f"Successfully connected to MongoDB: {db_name}")
        return db, client
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        raise


def extract_occupancy_data(db):
    """
    Extract occupancy log data and create discharge duration dataset
    
    For each patient admission (assigned status), find the corresponding
    release event to calculate actual occupancy duration
    """
    logger.info("Extracting occupancy data from MongoDB...")
    
    # Get collections
    occupancy_logs = db['occupancylogs']
    beds = db['beds']
    
    # Get all occupancy logs sorted by timestamp
    logs = list(occupancy_logs.find().sort('timestamp', 1))
    logger.info(f"Found {len(logs)} occupancy log entries")
    
    if len(logs) == 0:
        logger.warning("No occupancy logs found in database")
        return pd.DataFrame()
    
    # Build bed occupancy sessions
    bed_sessions = {}  # bed_id -> list of sessions
    
    for log in logs:
        bed_id = str(log['bedId'])
        status_change = log['statusChange']
        timestamp = log['timestamp']
        
        if status_change == 'assigned':
            # Start new session
            if bed_id not in bed_sessions:
                bed_sessions[bed_id] = []
            
            bed_sessions[bed_id].append({
                'bed_id': bed_id,
                'assigned_time': timestamp,
                'released_time': None,
                'user_id': str(log.get('userId', ''))
            })
        
        elif status_change == 'released' and bed_id in bed_sessions:
            # Find the most recent unclosed session for this bed
            for session in reversed(bed_sessions[bed_id]):
                if session['released_time'] is None:
                    session['released_time'] = timestamp
                    break
    
    # Flatten sessions and calculate durations
    all_sessions = []
    for bed_id, sessions in bed_sessions.items():
        for session in sessions:
            if session['released_time'] is not None:
                all_sessions.append(session)
    
    logger.info(f"Found {len(all_sessions)} complete occupancy sessions")
    
    if len(all_sessions) == 0:
        logger.warning("No complete occupancy sessions found")
        return pd.DataFrame()
    
    # Convert to DataFrame
    df = pd.DataFrame(all_sessions)
    
    # Calculate occupancy duration in hours
    df['duration_hours'] = (
        df['released_time'] - df['assigned_time']
    ).dt.total_seconds() / 3600.0
    
    # Get bed information
    beds_data = list(beds.find())
    beds_df = pd.DataFrame(beds_data)
    
    if len(beds_df) > 0:
        # Map bed id (as a string, matching the session keys) to its ward
        ward_by_bed = {str(bed_id): ward for bed_id, ward in zip(beds_df['_id'], beds_df['ward'])}
        df['ward'] = df['bed_id'].map(ward_by_bed).fillna('General')
    else:
        df['ward'] = 'General'
    
    # Filter out invalid durations
    df = df[
        (df['duration_hours'] > 0) & 
        (df['duration_hours'] < 720)  # Less than 30 days
    ]
    
    logger.info(f"Valid sessions after filtering: {len(df)}")
    
    return df


def engineer_features(df):
    """
    Create features for discharge prediction
    
    Features:
    - Time-based: hour, day_of_week, month, is_weekend, is_business_hours
    - Ward encoding
    - Historical patterns: average duration by ward, time of day
    """
    logger.info("Engineering features...")
    
    # Extract time features from assigned_time
    df['hour'] = df['assigned_time'].dt.hour
    df['day_of_week'] = df['assigned_time'].dt.dayofweek
    df['month'] = df['assigned_time'].dt.month
    df['day_of_month'] = df['assigned_time'].dt.day
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    df['is_business_hours'] = ((df['hour'] >= 8) & (df['hour'] <= 17)).astype(int)
    
    # Time of day categorization
    def get_time_of_day(hour):
        if 6 <= hour < 12:
            return 0  # morning
        elif 12 <= hour < 18:
            return 1  # afternoon
        elif 18 <= hour < 22:
            return 2  # evening
        else:
            return 3  # night
    
    df['time_of_day'] = df['hour'].apply(get_time_of_day)
    
    # Ward encoding - Updated to match actual database schema
    # Only ICU, General, Emergency exist in the database
    ward_mapping = {
        'ICU': 0,
        'General': 1,
        'Emergency': 2
    }
    df['ward_encoded'] = df['ward'].map(ward_mapping).fillna(1)  # Default to General
    
    # Historical averages by ward
    ward_avg_duration = df.groupby('ward')['duration_hours'].transform('mean')
    df['ward_avg_duration'] = ward_avg_duration
    
    # Historical averages by time of day
    time_avg_duration = df.groupby('time_of_day')['duration_hours'].transform('mean')
    df['time_avg_duration'] = time_avg_duration
    
    # Historical averages by ward + time_of_day
    ward_time_avg = df.groupby(['ward', 'time_of_day'])['duration_hours'].transform('mean')
    df['ward_time_avg_duration'] = ward_time_avg
    
    logger.info(f"Features engineered. Dataset shape: {df.shape}")
    
    return df


def train_model(df):
    """Train Random Forest Regressor for discharge prediction"""
    logger.info("Training discharge prediction model...")
    
    # Define features
    feature_columns = [
        'hour', 'day_of_week', 'month', 'day_of_month',
        'is_weekend', 'is_business_hours', 'time_of_day',
        'ward_encoded', 'ward_avg_duration', 'time_avg_duration',
        'ward_time_avg_duration'
    ]
    
    # Prepare data
    X = df[feature_columns]
    y = df['duration_hours']
    
    logger.info(f"Training set size: {len(X)} samples")
    logger.info(f"Features: {feature_columns}")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=settings.TEST_SIZE,
        random_state=settings.RANDOM_STATE
    )
    
    logger.info(f"Train set: {len(X_train)}, Test set: {len(X_test)}")
    
    # Train Random Forest model with STRONG EMPHASIS ON WARD-BASED FEATURES
    # Configuration prioritizes ward type for predictions
    model = RandomForestRegressor(
        n_estimators=250,        # More trees for better ward pattern learning
        max_depth=10,            # Deeper trees to capture ward-specific patterns
        min_samples_split=8,     # Balanced splitting to preserve ward groupings
        min_samples_leaf=3,      # Smaller leaf size to capture ward nuances
        max_features='sqrt',     # Limit features per split (emphasizes ward features)
        random_state=settings.RANDOM_STATE,
        n_jobs=-1
    )
    
    logger.info("Training Random Forest Regressor with STRONG ward-focused hyperparameters...")
    logger.info("  - max_depth=10 (capture detailed ward-specific patterns)")
    logger.info("  - min_samples_leaf=3 (preserve ward behavior nuances)")
    logger.info("  - Ward type is PRIMARY predictor for discharge timing")
    model.fit(X_train, y_train)
    
    # Evaluate
    train_pred = model.predict(X_train)
    test_pred = model.predict(X_test)
    
    train_mae = mean_absolute_error(y_train, train_pred)
    test_mae = mean_absolute_error(y_test, test_pred)
    train_rmse = np.sqrt(mean_squared_error(y_train, train_pred))
    test_rmse = np.sqrt(mean_squared_error(y_test, test_pred))
    train_r2 = r2_score(y_train, train_pred)
    test_r2 = r2_score(y_test, test_pred)
    
    logger.info("\n" + "="*60)
    logger.info("MODEL EVALUATION - DISCHARGE PREDICTION")
    logger.info("="*60)
    logger.info(f"Train MAE: {train_mae:.2f} hours")
    logger.info(f"Test MAE:  {test_mae:.2f} hours")
    logger.info(f"Train RMSE: {train_rmse:.2f} hours")
    logger.info(f"Test RMSE:  {test_rmse:.2f} hours")
    logger.info(f"Train R²: {train_r2:.4f}")
    logger.info(f"Test R²:  {test_r2:.4f}")
    logger.info("="*60 + "\n")
    
    # Feature importance
    feature_importance = pd.DataFrame({
        'feature': feature_columns,
        'importance': model.feature_importances_
    }).sort_values('importance', ascending=False)
    
    logger.info("Top 5 Feature Importances:")
    for idx, row in feature_importance.head().iterrows():
        logger.info(f"  {row['feature']}: {row['importance']:.4f}")
    
    return model, feature_columns, {
        'train_mae': train_mae,
        'test_mae': test_mae,
        'train_rmse': train_rmse,
        'test_rmse': test_rmse,
        'train_r2': train_r2,
        'test_r2': test_r2,
        'feature_importance': feature_importance.to_dict('records')
    }


def save_model(model, feature_columns, metrics):
    """Save trained model and metadata to disk"""
    logger.info("Saving model to disk...")
    
    # Ensure models directory exists
    os.makedirs(settings.MODELS_DIR, exist_ok=True)
    
    # Create model package
    model_package = {
        'model': model,
        'feature_columns': feature_columns,
        'metrics': metrics,
        'trained_at': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    }
    
    # Save model
    model_path = settings.DISCHARGE_MODEL_PATH
    joblib.dump(model_package, model_path)
    
    logger.info(f"Model saved successfully to: {model_path}")
    
    # Verify saved file
    if os.path.exists(model_path):
        file_size = os.path.getsize(model_path) / (1024 * 1024)  # MB
        logger.info(f"Model file size: {file_size:.2f} MB")
    
    return model_path


def main():
    """Main training pipeline"""
    try:
        logger.info("="*60)
        logger.info("DISCHARGE PREDICTION MODEL TRAINING")
        logger.info("="*60)
        
        # Connect to MongoDB
        db, client = connect_to_mongodb()
        
        # Extract data
        df = extract_occupancy_data(db)
        
        if len(df) == 0:
            logger.error("No data available for training. Please ensure occupancy logs exist.")
            return
        
        # Check minimum data requirement
        if len(df) < 100:
            logger.warning(f"Only {len(df)} samples available. Model may not be accurate.")
            logger.warning("Consider generating more synthetic data or using actual data.")
        
        # Engineer features
        df = engineer_features(df)
        
        # Train model
        model, feature_columns, metrics = train_model(df)
        
        # Save model
        model_path = save_model(model, feature_columns, metrics)
        
        # Close MongoDB connection
        client.close()
        logger.info("MongoDB connection closed")
        
        logger.info("\n" + "="*60)
        logger.info("TRAINING COMPLETE!")
        logger.info(f"Model saved to: {model_path}")
        logger.info(f"Test MAE: {metrics['test_mae']:.2f} hours")
        logger.info(f"Test R²: {metrics['test_r2']:.4f}")
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
