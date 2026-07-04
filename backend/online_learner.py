"""
Quantum Alpha V3 - Online Learning System
Continuous learning from trade outcomes with model updates
"""

import sqlite3
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

@dataclass
class PredictionOutcome:
    """Records a prediction and its actual outcome"""
    prediction_id: str
    ticker: str
    prediction_date: str
    predicted_probability: float
    predicted_direction: str  # BUY or SELL
    actual_return_3d: float
    actual_return_5d: float
    profit_loss: float
    was_profitable: bool
    model_version: str
    features_used: Dict
    
class OnlineLearner:
    """
    Continuous learning from trade outcomes:
    1. Store prediction + actual result
    2. Calculate prediction error
    3. Update model weights
    4. Retrain periodically
    """
    
    def __init__(self, db_path: str = "data/online_learning.db"):
        self.db_path = db_path
        self._init_database()
        
    def _init_database(self):
        """Initialize SQLite database for online learning"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Predictions outcomes table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS prediction_outcomes (
                prediction_id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                prediction_date TEXT NOT NULL,
                predicted_probability REAL NOT NULL,
                predicted_direction TEXT NOT NULL,
                actual_return_3d REAL,
                actual_return_5d REAL,
                profit_loss REAL,
                was_profitable INTEGER,
                model_version TEXT,
                features_used TEXT,  -- JSON
                prediction_error REAL,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        
        # Model performance tracking
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS model_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version TEXT NOT NULL,
                evaluation_date TEXT NOT NULL,
                win_rate REAL,
                avg_return REAL,
                sharpe_ratio REAL,
                max_drawdown REAL,
                prediction_accuracy REAL,
                brier_score REAL,
                total_predictions INTEGER,
                profitable_predictions INTEGER,
                UNIQUE(model_version, evaluation_date)
            )
        """)
        
        # Feature drift tracking
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS feature_drift (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feature_name TEXT NOT NULL,
                current_mean REAL,
                current_std REAL,
                historical_mean REAL,
                historical_std REAL,
                drift_score REAL,
                is_drifting INTEGER,
                detected_at TEXT,
                UNIQUE(feature_name, detected_at)
            )
        """)
        
        # Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_outcomes_ticker ON prediction_outcomes(ticker)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_outcomes_date ON prediction_outcomes(prediction_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_performance_model ON model_performance(model_version)")
        
        conn.commit()
        conn.close()
    
    def record_outcome(
        self,
        prediction_id: str,
        ticker: str,
        prediction_date: str,
        predicted_probability: float,
        predicted_direction: str,
        actual_return_3d: float,
        actual_return_5d: float = None,
        profit_loss: float = None,
        model_version: str = "v1",
        features_used: Dict = None
    ) -> str:
        """
        Record actual outcome for a prediction.
        
        Args:
            prediction_id: Unique prediction identifier
            ticker: Stock symbol
            prediction_date: Date when prediction was made
            predicted_probability: Model's predicted probability
            predicted_direction: BUY or SELL
            actual_return_3d: Actual 3-day return
            actual_return_5d: Actual 5-day return (optional)
            profit_loss: Actual P&L from the trade
            model_version: Version of model that made prediction
            features_used: Features used for prediction
            
        Returns:
            prediction_id of recorded outcome
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Calculate if profitable
        was_profitable = 1 if (actual_return_3d > 0 and predicted_direction == 'BUY') or \
                           (actual_return_3d < 0 and predicted_direction == 'SELL') else 0
        
        # Calculate prediction error
        if predicted_direction == 'BUY':
            prediction_error = predicted_probability - (1 if actual_return_3d > 0 else 0)
        else:
            prediction_error = predicted_probability - (1 if actual_return_3d < 0 else 0)
        
        # Serialize features
        features_json = json.dumps(features_used) if features_used else '{}'
        
        # Insert or update
        cursor.execute("""
            INSERT OR REPLACE INTO prediction_outcomes (
                prediction_id, ticker, prediction_date, predicted_probability,
                predicted_direction, actual_return_3d, actual_return_5d,
                profit_loss, was_profitable, model_version, features_used,
                prediction_error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            prediction_id, ticker, prediction_date, predicted_probability,
            predicted_direction, actual_return_3d, actual_return_5d,
            profit_loss, was_profitable, model_version, features_json,
            prediction_error, datetime.now().isoformat(), datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
        
        return prediction_id
    
    def update_model(self, model, retrain_threshold: int = 100):
        """
        Retrain model with new data if enough new outcomes available.
        
        Args:
            model: ML model to update
            retrain_threshold: Minimum new outcomes needed for retraining
        """
        conn = sqlite3.connect(self.db_path)
        
        # Get recent outcomes for training
        query = """
            SELECT * FROM prediction_outcomes 
            ORDER BY prediction_date DESC 
            LIMIT ?
        """
        df = pd.read_sql_query(query, conn, params=[retrain_threshold * 2])
        conn.close()
        
        if len(df) < retrain_threshold:
            print(f"Not enough new data for retraining ({len(df)} < {retrain_threshold})")
            return False
        
        # Prepare training data
        features_list = df['features_used'].apply(json.loads).tolist()
        features_df = pd.DataFrame(features_list)
        
        # Create target variable
        y = ((df['actual_return_3d'] > 0) & (df['predicted_direction'] == 'BUY')).astype(int)
        y = y | ((df['actual_return_3d'] < 0) & (df['predicted_direction'] == 'SELL')).astype(int)
        
        # Retrain model
        try:
            model.fit(features_df, y)
            print(f"Model retrained on {len(df)} new outcomes")
            return True
        except Exception as e:
            print(f"Error retraining model: {e}")
            return False
    
    def get_learning_metrics(self, model_version: str = None) -> Dict:
        """
        Track model improvement over time.
        
        Returns:
            Dictionary with learning metrics
        """
        conn = sqlite3.connect(self.db_path)
        
        # Build query
        query = """
            SELECT 
                COUNT(*) as total_predictions,
                SUM(was_profitable) as profitable_predictions,
                AVG(was_profitable) as win_rate,
                AVG(actual_return_3d) as avg_return,
                AVG(prediction_error) as avg_prediction_error,
                AVG(predicted_probability) as avg_predicted_probability
            FROM prediction_outcomes
        """
        
        params = []
        if model_version:
            query += " WHERE model_version = ?"
            params.append(model_version)
        
        df = pd.read_sql_query(query, conn, params=params)
        
        # Calculate additional metrics
        if not df.empty and df.iloc[0]['total_predictions'] > 0:
            row = df.iloc[0]
            metrics = {
                'total_predictions': int(row['total_predictions']),
                'profitable_predictions': int(row['profitable_predictions']),
                'win_rate': float(row['win_rate']),
                'avg_return': float(row['avg_return']),
                'avg_prediction_error': float(row['avg_prediction_error']),
                'avg_predicted_probability': float(row['avg_predicted_probability']),
                'calibration_error': abs(float(row['avg_predicted_probability']) - float(row['win_rate']))
            }
        else:
            metrics = {
                'total_predictions': 0,
                'profitable_predictions': 0,
                'win_rate': 0,
                'avg_return': 0,
                'avg_prediction_error': 0,
                'avg_predicted_probability': 0,
                'calibration_error': 0
            }
        
        conn.close()
        return metrics
    
    def detect_feature_drift(self, current_features: Dict, threshold: float = 0.2) -> Dict:
        """
        Detect if feature distributions have drifted.
        
        Args:
            current_features: Current feature values
            threshold: Drift threshold for alerting
            
        Returns:
            Dictionary of drift scores and alerts
        """
        conn = sqlite3.connect(self.db_path)
        
        # Get historical feature statistics
        query = """
            SELECT 
                AVG(rsi) as rsi_mean, STDDEV(rsi) as rsi_std,
                AVG(momentum_score) as momentum_mean, STDDEV(momentum_score) as momentum_std,
                AVG(trend_score) as trend_mean, STDDEV(trend_score) as trend_std
            FROM prediction_outcomes
            WHERE created_at >= datetime('now', '-30 days')
        """
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        if df.empty:
            return {}
        
        row = df.iloc[0]
        drift_results = {}
        
        # Check drift for each feature
        for feature in ['rsi', 'momentum_score', 'trend_score']:
            hist_mean = row[f'{feature}_mean']
            hist_std = row[f'{feature}_std']
            current_value = current_features.get(feature, hist_mean)
            
            if hist_std > 0:
                z_score = abs(current_value - hist_mean) / hist_std
                is_drifting = z_score > (threshold * 10)  # Scale threshold
                
                drift_results[feature] = {
                    'current_value': current_value,
                    'historical_mean': hist_mean,
                    'historical_std': hist_std,
                    'z_score': z_score,
                    'is_drifting': is_drifting
                }
        
        return drift_results
    
    def get_recent_outcomes(self, days: int = 30, limit: int = 100) -> pd.DataFrame:
        """
        Get recent prediction outcomes for analysis.
        
        Args:
            days: Number of days to look back
            limit: Maximum number of records
            
        Returns:
            DataFrame with recent outcomes
        """
        conn = sqlite3.connect(self.db_path)
        
        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        query = """
            SELECT * FROM prediction_outcomes 
            WHERE prediction_date >= ?
            ORDER BY prediction_date DESC
            LIMIT ?
        """
        
        df = pd.read_sql_query(query, conn, params=[cutoff_date, limit])
        conn.close()
        
        # Parse features JSON
        if not df.empty:
            df['features_used'] = df['features_used'].apply(json.loads)
        
        return df
    
    def generate_performance_report(self, model_version: str = None) -> Dict:
        """
        Generate comprehensive performance report.
        
        Returns:
            Dictionary with detailed performance metrics
        """
        metrics = self.get_learning_metrics(model_version)
        
        # Add more detailed analysis
        conn = sqlite3.connect(self.db_path)
        
        query = """
            SELECT 
                predicted_direction,
                COUNT(*) as count,
                AVG(was_profitable) as win_rate,
                AVG(actual_return_3d) as avg_return,
                SUM(profit_loss) as total_pnl
            FROM prediction_outcomes
        """
        
        params = []
        if model_version:
            query += " WHERE model_version = ?"
            params.append(model_version)
        
        query += " GROUP BY predicted_direction"
        
        direction_metrics = pd.read_sql_query(query, conn, params=params)
        
        # Performance by probability decile
        query2 = """
            SELECT 
                CASE 
                    WHEN predicted_probability >= 0.9 THEN '90-100%'
                    WHEN predicted_probability >= 0.8 THEN '80-90%'
                    WHEN predicted_probability >= 0.7 THEN '70-80%'
                    WHEN predicted_probability >= 0.6 THEN '60-70%'
                    ELSE '<60%'
                END as probability_bucket,
                COUNT(*) as count,
                AVG(was_profitable) as win_rate,
                AVG(actual_return_3d) as avg_return
            FROM prediction_outcomes
        """
        
        params2 = []
        if model_version:
            query2 += " WHERE model_version = ?"
            params2.append(model_version)
        
        query2 += " GROUP BY probability_bucket ORDER BY probability_bucket"
        
        bucket_metrics = pd.read_sql_query(query2, conn, params=params2)
        
        conn.close()
        
        return {
            'overall_metrics': metrics,
            'by_direction': direction_metrics.to_dict('records') if not direction_metrics.empty else [],
            'by_probability_bucket': bucket_metrics.to_dict('records') if not bucket_metrics.empty else []
        }

# Example usage
if __name__ == "__main__":
    # Initialize online learner
    learner = OnlineLearner()
    
    # Example: Record outcome
    # learner.record_outcome(
    #     prediction_id="pred_123",
    #     ticker="RELIANCE",
    #     prediction_date="2024-01-15",
    #     predicted_probability=0.78,
    #     predicted_direction="BUY",
    #     actual_return_3d=0.032,
    #     profit_loss=1500,
    #     model_version="v2.1"
    # )
    
    # Example: Get learning metrics
    # metrics = learner.get_learning_metrics("v2.1")
    
    print("Online Learning system ready for continuous improvement")