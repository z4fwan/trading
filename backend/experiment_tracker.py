"""
Quantum Alpha V3 - Experiment Tracking System
Tracks all model runs, datasets, hyperparameters, and results for reproducibility
"""

import sqlite3
import json
import hashlib
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from pathlib import Path

@dataclass
class ExperimentRun:
    """Represents a single ML experiment run"""
    run_id: str
    experiment_name: str
    dataset_version: str
    feature_set: List[str]
    model_type: str
    hyperparameters: Dict
    training_date: str
    training_samples: int
    validation_samples: int
    
    # Validation metrics
    auc: float
    log_loss: float
    brier_score: float
    precision: float
    recall: float
    f1: float
    
    # Backtest metrics
    sharpe_ratio: float
    sortino_ratio: float
    profit_factor: float
    max_drawdown: float
    total_return: float
    win_rate: float
    calmar_ratio: float
    
    # Status
    status: str  # RUNNING, COMPLETED, FAILED
    notes: str
    created_at: str

class ExperimentTracker:
    """
    Tracks all ML experiments for reproducibility and comparison.
    
    Records:
    - Dataset version
    - Feature set
    - Hyperparameters
    - Model version
    - Training date
    - Validation metrics
    - Backtest metrics
    """
    
    def __init__(self, db_path: str = "data/experiment_tracker.db"):
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """Initialize SQLite database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS experiments (
                run_id TEXT PRIMARY KEY,
                experiment_name TEXT NOT NULL,
                dataset_version TEXT NOT NULL,
                feature_set TEXT NOT NULL,
                model_type TEXT NOT NULL,
                hyperparameters TEXT NOT NULL,
                training_date TEXT NOT NULL,
                training_samples INTEGER,
                validation_samples INTEGER,
                auc REAL,
                log_loss REAL,
                brier_score REAL,
                precision REAL,
                recall REAL,
                f1 REAL,
                sharpe_ratio REAL,
                sortino_ratio REAL,
                profit_factor REAL,
                max_drawdown REAL,
                total_return REAL,
                win_rate REAL,
                calmar_ratio REAL,
                status TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )
        """)
        
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_model_type ON experiments(model_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dataset_version ON experiments(dataset_version)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_status ON experiments(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_auc ON experiments(auc)")
        
        conn.commit()
        conn.close()
    
    def _generate_run_id(self, experiment_name: str, model_type: str) -> str:
        """Generate unique run ID"""
        raw = f"{experiment_name}_{model_type}_{datetime.now().timestamp()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
    
    def log_experiment(
        self,
        experiment_name: str,
        dataset_version: str,
        feature_set: List[str],
        model_type: str,
        hyperparameters: Dict,
        training_samples: int,
        validation_samples: int,
        validation_metrics: Dict = None,
        backtest_metrics: Dict = None,
        status: str = "COMPLETED",
        notes: str = ""
    ) -> str:
        """Log a new experiment run"""
        run_id = self._generate_run_id(experiment_name, model_type)
        
        # Default metrics
        metrics = {
            'auc': 0, 'log_loss': 0, 'brier_score': 0,
            'precision': 0, 'recall': 0, 'f1': 0,
            'sharpe_ratio': 0, 'sortino_ratio': 0, 'profit_factor': 0,
            'max_drawdown': 0, 'total_return': 0, 'win_rate': 0, 'calmar_ratio': 0
        }
        
        if validation_metrics:
            metrics.update(validation_metrics)
        if backtest_metrics:
            metrics.update(backtest_metrics)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO experiments (
                run_id, experiment_name, dataset_version, feature_set,
                model_type, hyperparameters, training_date, training_samples,
                validation_samples, auc, log_loss, brier_score, precision,
                recall, f1, sharpe_ratio, sortino_ratio, profit_factor,
                max_drawdown, total_return, win_rate, calmar_ratio,
                status, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            run_id, experiment_name, dataset_version, json.dumps(feature_set),
            model_type, json.dumps(hyperparameters), datetime.now().isoformat(),
            training_samples, validation_samples,
            metrics['auc'], metrics['log_loss'], metrics['brier_score'],
            metrics['precision'], metrics['recall'], metrics['f1'],
            metrics['sharpe_ratio'], metrics['sortino_ratio'], metrics['profit_factor'],
            metrics['max_drawdown'], metrics['total_return'], metrics['win_rate'],
            metrics['calmar_ratio'], status, notes, datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
        
        return run_id
    
    def get_best_model(self, metric: str = 'auc') -> Optional[Dict]:
        """Get the best performing model by a given metric"""
        conn = sqlite3.connect(self.db_path)
        
        query = f"""
            SELECT * FROM experiments 
            WHERE status = 'COMPLETED'
            ORDER BY {metric} DESC 
            LIMIT 1
        """
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        if df.empty:
            return None
        
        return df.iloc[0].to_dict()
    
    def compare_models(self, model_types: List[str] = None) -> pd.DataFrame:
        """Compare performance of different model types"""
        conn = sqlite3.connect(self.db_path)
        
        query = """
            SELECT 
                model_type,
                COUNT(*) as runs,
                AVG(auc) as avg_auc,
                AVG(log_loss) as avg_log_loss,
                AVG(brier_score) as avg_brier_score,
                AVG(sharpe_ratio) as avg_sharpe,
                AVG(profit_factor) as avg_profit_factor,
                AVG(max_drawdown) as avg_max_dd,
                AVG(win_rate) as avg_win_rate,
                MAX(auc) as best_auc
            FROM experiments
            WHERE status = 'COMPLETED'
        """
        
        params = []
        if model_types:
            query += " AND model_type IN (" + ','.join(['?' for _ in model_types]) + ")"
            params.extend(model_types)
        
        query += " GROUP BY model_type ORDER BY avg_auc DESC"
        
        df = pd.read_sql_query(query, conn, params=params)
        conn.close()
        
        return df
    
    def get_experiment_history(self, experiment_name: str = None) -> pd.DataFrame:
        """Get experiment history"""
        conn = sqlite3.connect(self.db_path)
        
        query = """
            SELECT 
                run_id, experiment_name, model_type, dataset_version,
                auc, sharpe_ratio, profit_factor, max_drawdown, win_rate,
                status, created_at
            FROM experiments
        """
        
        params = []
        if experiment_name:
            query += " WHERE experiment_name = ?"
            params.append(experiment_name)
        
        query += " ORDER BY created_at DESC"
        
        df = pd.read_sql_query(query, conn, params=params)
        conn.close()
        
        return df
    
    def get_champion_model(self) -> Optional[Dict]:
        """Get the current champion model (best overall)"""
        conn = sqlite3.connect(self.db_path)
        
        # Composite score: weighted combination of metrics
        query = """
            SELECT *,
                (auc * 0.3 + sharpe_ratio * 0.2 + profit_factor * 0.2 + 
                 (1 - max_drawdown) * 0.15 + win_rate * 0.15) as composite_score
            FROM experiments
            WHERE status = 'COMPLETED'
            ORDER BY composite_score DESC
            LIMIT 1
        """
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        if df.empty:
            return None
        
        return df.iloc[0].to_dict()


# Example usage
if __name__ == "__main__":
    tracker = ExperimentTracker()
    
    # Example: Log experiment
    # run_id = tracker.log_experiment(
    #     experiment_name="v3_model_comparison",
    #     dataset_version="v1.0",
    #     feature_set=["rsi", "macd", "trend_score", "momentum_score"],
    #     model_type="LightGBM",
    #     hyperparameters={"n_estimators": 500, "learning_rate": 0.01},
    #     training_samples=50000,
    #     validation_samples=10000,
    #     validation_metrics={"auc": 0.67, "brier_score": 0.19},
    #     backtest_metrics={"sharpe_ratio": 1.5, "profit_factor": 1.8},
    #     status="COMPLETED"
    # )
    
    # Example: Compare models
    # comparison = tracker.compare_models(["LightGBM", "XGBoost", "RandomForest"])
    
    print("Experiment Tracker Ready")
    print("Use log_experiment() to record ML runs")
    print("Use compare_models() to compare performance")
    print("Use get_champion_model() to get best model")