import json
import sqlite3
import subprocess
from typing import Dict, Optional
from datetime import datetime
from pathlib import Path

try:
    from paths import DATA_DIR, ensure_data_dirs
except ImportError:
    from backend.paths import DATA_DIR, ensure_data_dirs

class ExperimentRegistry:
    """
    Experiment Registry for reproducibility.
    Logs every training run with exact hyperparameters, metrics, and seeds.
    """
    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = str(DATA_DIR / "experiment_registry.db")
        self.db_path = db_path
        ensure_data_dirs()
        self._init_db()
        
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS experiments (
                experiment_id TEXT PRIMARY KEY,
                git_commit TEXT,
                dataset_version TEXT,
                feature_version TEXT,
                model_version TEXT,
                random_seed INTEGER,
                hyperparameters TEXT,
                metrics TEXT,
                training_time_seconds REAL,
                is_champion BOOLEAN,
                notes TEXT,
                timestamp TEXT
            )
        ''')
        conn.commit()
        conn.close()
        
    def _get_git_commit(self) -> str:
        try:
            return subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode('utf-8').strip()
        except Exception:
            return "UNKNOWN"
            
    def log_experiment(self, 
                       experiment_id: str,
                       dataset_version: str, 
                       feature_version: str,
                       model_version: str,
                       random_seed: int,
                       hyperparameters: Dict,
                       metrics: Dict,
                       training_time_seconds: float,
                       is_champion: bool = False,
                       notes: str = "") -> None:
        
        hyperparameters_str = json.dumps(hyperparameters)
        metrics_str = json.dumps(metrics)
        git_commit = self._get_git_commit()
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO experiments 
            (experiment_id, git_commit, dataset_version, feature_version, model_version, 
             random_seed, hyperparameters, metrics, training_time_seconds, is_champion, notes, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            experiment_id,
            git_commit,
            dataset_version,
            feature_version,
            model_version,
            random_seed,
            hyperparameters_str,
            metrics_str,
            training_time_seconds,
            is_champion,
            notes,
            datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
