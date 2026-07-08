import json
import sqlite3
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path

class ModelRegistry:
    """
    Central registry for all trained models.
    Ensures reproducibility and tracks Champion models via explicit Promotion Gates.
    """
    def __init__(self, db_path: str = "data/model_registry.db"):
        self.db_path = db_path
        Path("data").mkdir(parents=True, exist_ok=True)
        self._init_db()
        
    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS models (
                model_version TEXT PRIMARY KEY,
                algorithm TEXT,
                dataset_version TEXT,
                feature_version TEXT,
                training_date TEXT,
                hyperparameters TEXT,
                brier_score REAL,
                roc_auc REAL,
                walk_forward_score REAL,
                is_champion BOOLEAN,
                metadata TEXT
            )
        ''')
        conn.commit()
        conn.close()
        
    def register_model(self, 
                       model_version: str, 
                       algorithm: str,
                       dataset_version: str, 
                       feature_version: str,
                       hyperparameters: Dict,
                       metrics: Dict,
                       metadata: Dict = None) -> None:
        
        hyperparameters_str = json.dumps(hyperparameters)
        metadata_str = json.dumps(metadata or {})
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO models 
            (model_version, algorithm, dataset_version, feature_version, training_date, 
             hyperparameters, brier_score, roc_auc, walk_forward_score, is_champion, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            model_version,
            algorithm,
            dataset_version,
            feature_version,
            datetime.now().isoformat(),
            hyperparameters_str,
            metrics.get('brier_score', 1.0),
            metrics.get('roc_auc', 0.5),
            metrics.get('walk_forward_score', 0.0),
            False, # Never default to champion
            metadata_str
        ))
        
        conn.commit()
        conn.close()
        
    def promote_to_champion(self, model_version: str, checklist: Dict[str, bool]) -> bool:
        """
        The Promotion Gate.
        Requires explicit checklist passing before a model becomes Champion.
        """
        required_checks = [
            'leakage_tests_passed',
            'calibration_within_bounds',
            'walk_forward_threshold_met',
            'realistic_costs_applied'
        ]
        
        for check in required_checks:
            if not checklist.get(check, False):
                print(f"Promotion Failed: {check} failed.")
                return False
                
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Demote current champion
        cursor.execute("UPDATE models SET is_champion = 0 WHERE is_champion = 1")
        
        # Promote new champion
        cursor.execute("UPDATE models SET is_champion = 1 WHERE model_version = ?", (model_version,))
        conn.commit()
        conn.close()
        
        print(f"Model {model_version} promoted to Champion!")
        return True
        
    def get_champion(self) -> Optional[Dict]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM models WHERE is_champion = 1")
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return dict(row)
        return None
