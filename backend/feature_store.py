"""
Quantum Alpha V3 - Centralized Feature Store
Stores and manages all features for ML model training and inference
"""

import sqlite3
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pathlib import Path

class FeatureStore:
    """
    Centralized feature storage with:
    - Technical features (RSI, MACD, ATR, etc.)
    - Fundamental features (P/E, P/B, Market Cap)
    - Event features (type, magnitude, sector)
    - Macro features (VIX, USDINR, FII flow)
    - Label: 3-day forward return
    """
    
    def __init__(self, db_path: str = "data/feature_store.db"):
        self.db_path = db_path
        self._init_database()
        
    def _init_database(self):
        """Initialize SQLite database with proper schema"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Features table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS features (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                date TEXT NOT NULL,
                
                -- Technical features
                rsi REAL,
                macd REAL,
                macd_signal REAL,
                macd_histogram REAL,
                trend_score REAL,
                momentum_score REAL,
                volume_score REAL,
                volatility_percentile REAL,
                atr_percent REAL,
                price_vs_vwap REAL,
                supertrend_direction INTEGER,
                ema_trend INTEGER,
                bollinger_position REAL,
                
                -- Fundamental features
                market_cap REAL,
                pe_ratio REAL,
                pb_ratio REAL,
                debt_to_equity REAL,
                roe REAL,
                revenue_growth REAL,
                
                -- Event features
                event_type TEXT,
                event_magnitude REAL,
                sentiment_score REAL,
                urgency REAL,
                source_tier INTEGER,
                
                -- Macro features
                vix_level REAL,
                usdinr REAL,
                fii_flow REAL,
                dii_flow REAL,
                market_regime TEXT,
                sector_strength REAL,
                advance_decline REAL,
                
                -- Options features
                option_volume_ratio REAL,
                put_call_ratio REAL,
                iv_rank REAL,
                oi_change REAL,
                
                -- Label (forward returns)
                return_1d REAL,
                return_3d REAL,
                return_5d REAL,
                return_10d REAL,
                
                -- Metadata
                created_at TEXT,
                updated_at TEXT,
                
                UNIQUE(ticker, date)
            )
        """)
        
        # Indexes for fast querying
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_features_ticker ON features(ticker)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_features_date ON features(date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_features_event_type ON features(event_type)")
        
        conn.commit()
        conn.close()
    
    def store_features(self, ticker: str, date: str, features: Dict) -> bool:
        """
        Store features for a ticker on a specific date.
        
        Args:
            ticker: Stock symbol
            date: Date in ISO format
            features: Dictionary containing all feature values
            
        Returns:
            True if stored successfully, False otherwise
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Prepare columns and values
        columns = ['ticker', 'date']
        values = [ticker, date]
        
        for key, value in features.items():
            if value is not None:
                columns.append(key)
                values.append(value)
        
        # Build INSERT query
        placeholders = ','.join(['?' for _ in values])
        column_names = ','.join(columns)
        
        query = f"""
            INSERT OR REPLACE INTO features ({column_names}, updated_at) 
            VALUES ({placeholders}, ?)
        """
        values.append(datetime.now().isoformat())
        
        try:
            cursor.execute(query, values)
            conn.commit()
            return True
        except Exception as e:
            print(f"Error storing features: {e}")
            return False
        finally:
            conn.close()
    
    def get_features(self, ticker: str, date: str) -> Optional[Dict]:
        """
        Retrieve features for a ticker on a specific date.
        
        Args:
            ticker: Stock symbol
            date: Date in ISO format
            
        Returns:
            Dictionary of feature values or None if not found
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM features 
            WHERE ticker = ? AND date = ?
        """, (ticker, date))
        
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        # Convert row to dictionary
        columns = [description[0] for description in cursor.description]
        return dict(zip(columns, row))
    
    def get_training_data(
        self, 
        start_date: str, 
        end_date: str, 
        filters: Dict = None
    ) -> pd.DataFrame:
        """
        Get labeled training data for ML model.
        
        Args:
            start_date: Start date in ISO format
            end_date: End date in ISO format
            filters: Optional filters (event_type, sector, etc.)
            
        Returns:
            DataFrame with features and labels
        """
        conn = sqlite3.connect(self.db_path)
        
        # Build query
        base_query = """
            SELECT * FROM features 
            WHERE date >= ? AND date <= ? AND return_3d IS NOT NULL
        """
        params = [start_date, end_date]
        
        # Add optional filters
        if filters:
            for key, value in filters.items():
                base_query += f" AND {key} = ?"
                params.append(value)
        
        base_query += " ORDER BY ticker, date"
        
        # Execute query
        df = pd.read_sql_query(base_query, conn, params=params)
        conn.close()
        
        return df
    
    def get_similar_features(
        self, 
        current_features: Dict, 
        k: int = 50
    ) -> pd.DataFrame:
        """
        Find k most similar historical feature vectors.
        
        Args:
            current_features: Current feature values
            k: Number of similar records to return
            
        Returns:
            DataFrame with similar historical records
        """
        conn = sqlite3.connect(self.db_path)
        
        # Build query based on available filters
        filters = []
        params = []
        
        if 'event_type' in current_features:
            filters.append("event_type = ?")
            params.append(current_features['event_type'])
        
        if 'market_regime' in current_features:
            filters.append("market_regime = ?")
            params.append(current_features['market_regime'])
        
        where_clause = " AND ".join(filters) if filters else "1=1"
        
        query = f"""
            SELECT * FROM features 
            WHERE {where_clause} AND return_3d IS NOT NULL
            ORDER BY date DESC
            LIMIT ?
        """
        params.append(k * 5)
        
        df = pd.read_sql_query(query, conn, params=params)
        conn.close()
        
        # Calculate similarity and return top k
        if df.empty:
            return pd.DataFrame()
        
        # Simple similarity calculation (can be enhanced with cosine similarity)
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        current_values = pd.Series(current_features)[numeric_cols].fillna(0)
        
        # Calculate Euclidean distance
        df['similarity'] = df[numeric_cols].apply(
            lambda row: 1 / (1 + np.sqrt(np.sum((row - current_values) ** 2))),
            axis=1
        )
        
        return df.nlargest(k, 'similarity')
    
    def get_feature_statistics(self, feature_columns: List[str] = None) -> Dict:
        """
        Get statistics for features (mean, std, min, max, etc.)
        
        Args:
            feature_columns: List of specific columns to analyze
            
        Returns:
            Dictionary with feature statistics
        """
        conn = sqlite3.connect(self.db_path)
        
        if feature_columns:
            columns = ','.join(feature_columns)
            query = f"""
                SELECT 
                    COUNT(*) as count,
                    {', '.join([f'AVG({col}) as {col}_mean' for col in feature_columns])},
                    {', '.join([f'STDDEV({col}) as {col}_std' for col in feature_columns])},
                    {', '.join([f'MIN({col}) as {col}_min' for col in feature_columns])},
                    {', '.join([f'MAX({col}) as {col}_max' for col in feature_columns])}
                FROM features
            """
        else:
            query = """
                SELECT 
                    COUNT(*) as count,
                    AVG(rsi) as rsi_mean, STDDEV(rsi) as rsi_std,
                    AVG(momentum_score) as momentum_score_mean,
                    AVG(trend_score) as trend_score_mean,
                    AVG(volume_score) as volume_score_mean
                FROM features
            """
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        return df.iloc[0].to_dict()
    
    def get_feature_importance(
        self, 
        target_column: str = 'return_3d',
        method: str = 'correlation'
    ) -> Dict:
        """
        Calculate feature importance scores.
        
        Args:
            target_column: Target variable for importance calculation
            method: 'correlation', 'mutual_info', etc.
            
        Returns:
            Dictionary of feature importance scores
        """
        conn = sqlite3.connect(self.db_path)
        
        # Get all numeric features
        query = """
            SELECT * FROM features WHERE return_3d IS NOT NULL
        """
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        if df.empty:
            return {}
        
        # Select numeric columns
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        numeric_cols = [c for c in numeric_cols if c not in ['id', 'return_1d', 'return_3d', 'return_5d', 'return_10d']]
        
        # Calculate correlations with target
        importance = {}
        for col in numeric_cols:
            if col != target_column and df[col].notna().sum() > 10:
                corr = df[[col, target_column]].corr().iloc[0, 1]
                if not np.isnan(corr):
                    importance[col] = abs(corr)
        
        # Sort by importance
        importance = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
        
        return importance
    
    def cleanup_old_data(self, days_to_keep: int = 365):
        """
        Remove old feature data to save space.
        
        Args:
            days_to_keep: Number of days of data to retain
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cutoff_date = (datetime.now() - timedelta(days=days_to_keep)).isoformat()
        
        cursor.execute("""
            DELETE FROM features WHERE date < ?
        """, (cutoff_date,))
        
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        
        return deleted

# Example usage
if __name__ == "__main__":
    # Initialize feature store
    store = FeatureStore()
    
    # Example: Store features
    # store.store_features("RELIANCE", "2024-01-15", {
    #     'rsi': 65.2,
    #     'macd': 12.5,
    #     'momentum_score': 72,
    #     'event_type': 'ORDER_WIN',
    #     'return_3d': 0.032
    # })
    
    # Example: Get training data
    # df = store.get_training_data("2023-01-01", "2024-01-01")
    
    print("Feature Store ready for ML model training")