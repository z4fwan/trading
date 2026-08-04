import json
import sqlite3
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path

try:
    from paths import DATA_DIR, ensure_data_dirs
except ImportError:
    from backend.paths import DATA_DIR, ensure_data_dirs


class ModelRegistry:
    """
    Central registry for all trained models.
    v4.0: Supports walk-forward validation promotion gates.
    """
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            db_path = str(DATA_DIR / "model_registry.db")
        else:
            p = Path(db_path)
            if not p.is_absolute():
                # Callers historically passed "data/<file>.db"; strip the prefix
                # and anchor to the backend data dir regardless of CWD.
                rel = db_path[len("data/"):] if db_path.startswith("data/") else db_path
                db_path = str(DATA_DIR / rel)
        self.db_path = db_path
        ensure_data_dirs()
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
                walk_forward_roc REAL,
                walk_forward_brier REAL,
                walk_forward_accuracy REAL,
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
                       metadata: Dict = None,
                       promote_champion: bool = False) -> None:

        hyperparameters_str = json.dumps(hyperparameters)
        metadata_str = json.dumps(metadata or {})

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if promote_champion:
            cursor.execute("UPDATE models SET is_champion = 0 WHERE is_champion = 1")

        cursor.execute('''
            INSERT OR REPLACE INTO models
            (model_version, algorithm, dataset_version, feature_version, training_date,
             hyperparameters, brier_score, roc_auc, walk_forward_roc, walk_forward_brier,
             walk_forward_accuracy, is_champion, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            model_version,
            algorithm,
            dataset_version,
            feature_version,
            datetime.now().isoformat(),
            hyperparameters_str,
            metrics.get('brier_score', 1.0),
            metrics.get('roc_auc', 0.5),
            metrics.get('walk_forward_roc', 0.0),
            metrics.get('walk_forward_brier', 1.0),
            metrics.get('walk_forward_accuracy', 0.5),
            promote_champion,
            metadata_str
        ))

        conn.commit()
        conn.close()

    def promote_to_champion(self, model_version: str, checklist: Dict[str, bool]) -> bool:
        """
        The Promotion Gate — requires explicit checklist.
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
        cursor.execute("UPDATE models SET is_champion = 0 WHERE is_champion = 1")
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

    def get_all_models(self) -> List[Dict]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM models ORDER BY training_date DESC")
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows

    def get_best_by_algorithm(self) -> Dict[str, Dict]:
        """Get the best model for each algorithm based on walk-forward ROC."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT algorithm, model_version, brier_score, roc_auc,
                   walk_forward_roc, walk_forward_brier, walk_forward_accuracy,
                   is_champion, training_date
            FROM models
            WHERE walk_forward_roc > 0
            ORDER BY walk_forward_roc DESC
        """)
        best = {}
        for row in cursor.fetchall():
            d = dict(row)
            if d['algorithm'] not in best or d['walk_forward_roc'] > best[d['algorithm']]['walk_forward_roc']:
                best[d['algorithm']] = d
        conn.close()
        return best
