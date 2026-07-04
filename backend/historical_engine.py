"""
Historical Similarity Matching Engine
Uses ChromaDB for vector-based similarity search
Matches new announcements with historical ones to predict price impact
"""

try:
    import chromadb
    from chromadb.config import Settings
    from sentence_transformers import SentenceTransformer
    HAS_VECTOR_DB = True
except ImportError:
    HAS_VECTOR_DB = False

import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import sqlite3
import json
import os

# Configuration
CHROMA_PERSIST_DIR = "./data/chroma_db"
SQLITE_DB_PATH = "./data/announcements.db"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"


class HistoricalSimilarityEngine:
    """Vector-based historical similarity matching for announcements"""
    
    def __init__(self, persist_dir: str = CHROMA_PERSIST_DIR):
        self.persist_dir = persist_dir
        self.client = None
        self.collection = None
        self.embedding_model = None
        self.db_conn = None
        self.initialized = False
        
    def initialize(self):
        """Initialize ChromaDB and SQLite"""
        if self.initialized:
            return
            
        try:
            # Create data directory
            os.makedirs(self.persist_dir, exist_ok=True)
            os.makedirs(os.path.dirname(SQLITE_DB_PATH), exist_ok=True)
            
            # Initialize ChromaDB if available
            if HAS_VECTOR_DB:
                self.client = chromadb.PersistentClient(path=self.persist_dir)
                self.collection = self.client.get_or_create_collection(
                    name="announcements",
                    metadata={"hnsw:space": "cosine"}
                )
                
                # Load embedding model
                print(f"Loading embedding model: {EMBEDDING_MODEL}...")
                self.embedding_model = SentenceTransformer(EMBEDDING_MODEL)
                print("Embedding model loaded")
            else:
                print("ChromaDB or sentence-transformers not installed. Vector similarity matching is disabled.")
            
            # Initialize SQLite
            self.db_conn = sqlite3.connect(SQLITE_DB_PATH, check_same_thread=False)
            self._create_tables()
            
            self.initialized = True
            print("Historical similarity engine initialized")
            
        except Exception as e:
            print(f"Failed to initialize historical engine: {e}")
    
    def _create_tables(self):
        """Create SQLite tables for historical data"""
        cursor = self.db_conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY,
                symbol TEXT NOT NULL,
                company TEXT,
                headline TEXT,
                category TEXT,
                announcement_date TEXT,
                source TEXT,
                finbert_sentiment TEXT,
                finbert_confidence REAL,
                llm_sentiment TEXT,
                llm_confidence REAL,
                ensemble_signal TEXT,
                ensemble_confidence REAL,
                predicted_direction TEXT,
                predicted_range_min REAL,
                predicted_range_max REAL,
                actual_1d_change REAL,
                actual_5d_change REAL,
                actual_20d_change REAL,
                prediction_correct INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS accuracy_stats (
                date TEXT PRIMARY KEY,
                total_predictions INTEGER,
                correct_predictions INTEGER,
                accuracy_rate REAL,
                avg_1d_change REAL,
                avg_5d_change REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        self.db_conn.commit()
    
    def get_embedding(self, text: str) -> Optional[np.ndarray]:
        """Get embedding vector for text"""
        if not self.embedding_model:
            return None
        return self.embedding_model.encode(text[:512])
    
    def add_announcement(self, announcement: Dict, embedding: Optional[np.ndarray] = None):
        """Add announcement to historical database"""
        if not self.initialized:
            self.initialize()
        
        try:
            ann_id = announcement.get("id", f"{announcement.get('symbol')}_{datetime.now().timestamp()}")
            
            # Add to ChromaDB if available
            if HAS_VECTOR_DB:
                if embedding is None:
                    text = f"{announcement.get('symbol', '')} {announcement.get('headline', '')}"
                    embedding = self.get_embedding(text)
                
                if embedding is not None:
                    self.collection.add(
                        ids=[ann_id],
                        embeddings=[embedding.tolist()],
                        metadatas=[{
                            "symbol": announcement.get("symbol", ""),
                            "headline": announcement.get("headline", ""),
                            "category": announcement.get("category", ""),
                            "date": announcement.get("timestamp", ""),
                            "source": announcement.get("source", ""),
                        }]
                    )
            
            # Add to SQLite (always runs)
            cursor = self.db_conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO announcements 
                (id, symbol, company, headline, category, announcement_date, source,
                 finbert_sentiment, finbert_confidence, llm_sentiment, llm_confidence,
                 ensemble_signal, ensemble_confidence, predicted_direction,
                 predicted_range_min, predicted_range_max)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ann_id,
                announcement.get("symbol", ""),
                announcement.get("company", ""),
                announcement.get("headline", ""),
                announcement.get("category", ""),
                announcement.get("timestamp", ""),
                announcement.get("source", ""),
                announcement.get("finbert_sentiment", ""),
                announcement.get("finbert_confidence", 0),
                announcement.get("llm_sentiment", ""),
                announcement.get("llm_confidence", 0),
                announcement.get("ensemble_signal", ""),
                announcement.get("ensemble_confidence", 0),
                announcement.get("predicted_direction", ""),
                announcement.get("predicted_range_min", 0),
                announcement.get("predicted_range_max", 0),
            ))
            self.db_conn.commit()
            
        except Exception as e:
            print(f"Error adding announcement to historical DB: {e}")
    
    def find_similar(self, 
                    text: str, 
                    symbol: Optional[str] = None,
                    n_results: int = 10) -> List[Dict]:
        """
        Find similar historical announcements
        
        Args:
            text: Text to search for (headline or full text)
            symbol: Optional symbol filter (for company-specific matches)
            n_results: Number of results to return
            
        Returns:
            List of similar announcements with their outcomes
        """
        if not self.initialized:
            self.initialize()
        
        embedding = self.get_embedding(text)
        if embedding is None:
            return []
        
        # Build where clause for symbol filtering
        where_clause = None
        if symbol:
            where_clause = {"symbol": symbol}
        
        results = self.collection.query(
            query_embeddings=[embedding.tolist()],
            n_results=n_results * 2 if symbol else n_results,  # Get more if filtering
            where=where_clause,
            include=["metadatas", "distances"]
        )
        
        similar = []
        if results and results['metadatas'] and results['metadatas'][0]:
            for i, metadata in enumerate(results['metadatas'][0]):
                distance = results['distances'][0][i] if results['distances'] else 1.0
                similarity = 1 - distance  # Convert distance to similarity
                
                # Get actual outcomes from SQLite
                actual_outcomes = self._get_actual_outcomes(metadata.get('id', ''))
                
                similar.append({
                    **metadata,
                    "similarity_score": round(similarity, 4),
                    "distance": round(distance, 4),
                    **actual_outcomes
                })
        
        return similar[:n_results]
    
    def _get_actual_outcomes(self, ann_id: str) -> Dict:
        """Get actual price outcomes for an announcement"""
        cursor = self.db_conn.cursor()
        cursor.execute("""
            SELECT actual_1d_change, actual_5d_change, actual_20d_change, prediction_correct
            FROM announcements WHERE id = ?
        """, (ann_id,))
        
        row = cursor.fetchone()
        if row:
            return {
                "actual_1d_change": row[0],
                "actual_5d_change": row[1],
                "actual_20d_change": row[2],
                "prediction_was_correct": bool(row[3]) if row[3] is not None else None,
            }
        return {}
    
    def update_actual_outcomes(self, 
                              ann_id: str,
                              actual_1d_change: float,
                              actual_5d_change: float,
                              actual_20d_change: float,
                              prediction_correct: bool):
        """Update actual price outcomes for an announcement"""
        cursor = self.db_conn.cursor()
        cursor.execute("""
            UPDATE announcements 
            SET actual_1d_change = ?, actual_5d_change = ?, actual_20d_change = ?,
                prediction_correct = ?
            WHERE id = ?
        """, (actual_1d_change, actual_5d_change, actual_20d_change, 
              1 if prediction_correct else 0, ann_id))
        self.db_conn.commit()
    
    def get_prediction_stats(self, 
                            symbol: Optional[str] = None,
                            days: int = 30) -> Dict:
        """Get prediction accuracy statistics"""
        cursor = self.db_conn.cursor()
        
        date_cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        
        if symbol:
            cursor.execute("""
                SELECT COUNT(*) as total, 
                       SUM(prediction_correct) as correct,
                       AVG(actual_1d_change) as avg_1d,
                       AVG(actual_5d_change) as avg_5d
                FROM announcements 
                WHERE symbol = ? AND announcement_date > ? AND prediction_correct IS NOT NULL
            """, (symbol, date_cutoff))
        else:
            cursor.execute("""
                SELECT COUNT(*) as total, 
                       SUM(prediction_correct) as correct,
                       AVG(actual_1d_change) as avg_1d,
                       AVG(actual_5d_change) as avg_5d
                FROM announcements 
                WHERE announcement_date > ? AND prediction_correct IS NOT NULL
            """, (date_cutoff,))
        
        row = cursor.fetchone()
        if row and row[0] > 0:
            return {
                "total_predictions": row[0],
                "correct_predictions": row[1] or 0,
                "accuracy_rate": round((row[1] or 0) / row[0] * 100, 2),
                "avg_1d_change": round(row[2] or 0, 2),
                "avg_5d_change": round(row[3] or 0, 2),
                "period_days": days,
                "symbol": symbol,
            }
        
        return {
            "total_predictions": 0,
            "correct_predictions": 0,
            "accuracy_rate": 0,
            "avg_1d_change": 0,
            "avg_5d_change": 0,
            "period_days": days,
            "symbol": symbol,
        }
    
    def get_context(self, symbol: str) -> Dict:
        """Get company-specific context (recent announcements, trends)"""
        cursor = self.db_conn.cursor()
        
        # Get last 5 announcements for this symbol
        cursor.execute("""
            SELECT id, headline, category, announcement_date, 
                   ensemble_signal, actual_1d_change
            FROM announcements 
            WHERE symbol = ?
            ORDER BY announcement_date DESC
            LIMIT 5
        """, (symbol,))
        
        recent = []
        for row in cursor.fetchall():
            recent.append({
                "id": row[0],
                "headline": row[1],
                "category": row[2],
                "date": row[3],
                "signal": row[4],
                "actual_1d_change": row[5],
            })
        
        # Get overall stats
        stats = self.get_prediction_stats(symbol, days=90)
        
        return {
            "symbol": symbol,
            "recent_announcements": recent,
            "prediction_stats": stats,
        }
    
    def close(self):
        """Clean up resources"""
        if self.db_conn:
            self.db_conn.close()


# Global instance
_historical_engine: Optional[HistoricalSimilarityEngine] = None

def get_historical_engine() -> HistoricalSimilarityEngine:
    """Get or create global historical engine instance"""
    global _historical_engine
    if _historical_engine is None:
        _historical_engine = HistoricalSimilarityEngine()
        _historical_engine.initialize()
    return _historical_engine