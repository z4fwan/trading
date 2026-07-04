"""
Quantum Alpha V3 - Historical Event Database
Stores every corporate event with structured data for evidence-based predictions.
"""

import json
import hashlib
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import numpy as np

@dataclass
class HistoricalEvent:
    """Represents a historical corporate event with all features and outcomes"""
    
    # Event identification
    event_id: str
    ticker: str
    event_type: str
    event_date: str  # ISO format
    
    # Event details
    headline: str
    source: str
    event_magnitude: float  # Order value / Market cap, or similar metric
    
    # Pre-event features
    pre_event_price: float
    pre_event_technicals: Dict  # RSI, MACD, ATR, etc.
    pre_event_fundamentals: Dict  # P/E, P/B, Market Cap
    pre_event_macro: Dict  # VIX, USDINR, FII flow, market regime
    
    # Post-event outcomes (labels for ML)
    return_1d: float  # 1-day forward return
    return_3d: float  # 3-day forward return (primary label)
    return_5d: float  # 5-day forward return
    return_10d: float  # 10-day forward return
    return_20d: float  # 20-day forward return
    
    # Additional metadata
    sector: str
    market_cap_category: str  # Large, Mid, Small
    created_at: str  # ISO format


class EventDatabase:
    """
    Historical event database for evidence-based predictions.
    Stores 100K+ historical events with features and outcomes.
    """
    
    def __init__(self, db_path: str = "data/event_database.db"):
        self.db_path = db_path
        self._init_database()
    
    def _init_database(self):
        """Initialize SQLite database with proper schema"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Main events table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                event_type TEXT NOT NULL,
                event_date TEXT NOT NULL,
                headline TEXT,
                source TEXT,
                event_magnitude REAL,
                pre_event_price REAL,
                pre_event_technicals TEXT,  -- JSON
                pre_event_fundamentals TEXT,  -- JSON
                pre_event_macro TEXT,  -- JSON
                return_1d REAL,
                return_3d REAL,
                return_5d REAL,
                return_10d REAL,
                return_20d REAL,
                sector TEXT,
                market_cap_category TEXT,
                created_at TEXT
            )
        """)
        
        # Indexes for fast querying
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ticker ON events(ticker)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_event_type ON events(event_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_event_date ON events(event_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sector ON events(sector)")
        
        conn.commit()
        conn.close()
    
    def _generate_event_id(self, ticker: str, event_date: str, headline: str) -> str:
        """Generate unique event ID"""
        raw = f"{ticker}_{event_date}_{headline}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]
    
    def store_event(self, event_data: Dict) -> str:
        """
        Store a new event in the database.
        
        Args:
            event_data: Dictionary with all event fields
            
        Returns:
            event_id: Unique identifier for the stored event
        """
        # Generate event ID
        event_id = self._generate_event_id(
            event_data['ticker'],
            event_data['event_date'],
            event_data['headline']
        )
        
        # Check for duplicates
        if self.get_event(event_id):
            return event_id  # Already exists
        
        # Serialize JSON fields
        pre_event_technicals = json.dumps(event_data.get('pre_event_technicals', {}))
        pre_event_fundamentals = json.dumps(event_data.get('pre_event_fundamentals', {}))
        pre_event_macro = json.dumps(event_data.get('pre_event_macro', {}))
        
        # Insert into database
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT OR REPLACE INTO events (
                event_id, ticker, event_type, event_date, headline, source,
                event_magnitude, pre_event_price, pre_event_technicals,
                pre_event_fundamentals, pre_event_macro,
                return_1d, return_3d, return_5d, return_10d, return_20d,
                sector, market_cap_category, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            event_id,
            event_data['ticker'],
            event_data['event_type'],
            event_data['event_date'],
            event_data.get('headline', ''),
            event_data.get('source', ''),
            event_data.get('event_magnitude', 0.0),
            event_data.get('pre_event_price', 0.0),
            pre_event_technicals,
            pre_event_fundamentals,
            pre_event_macro,
            event_data.get('return_1d', None),
            event_data.get('return_3d', None),
            event_data.get('return_5d', None),
            event_data.get('return_10d', None),
            event_data.get('return_20d', None),
            event_data.get('sector', ''),
            event_data.get('market_cap_category', ''),
            datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
        
        return event_id
    
    def get_event(self, event_id: str) -> Optional[HistoricalEvent]:
        """Retrieve a single event by ID"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM events WHERE event_id = ?", (event_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        return self._row_to_event(row)
    
    def find_similar_events(self, current_features: Dict, k: int = 50) -> List[HistoricalEvent]:
        """
        Find k most similar historical events based on features.
        
        Uses cosine similarity on normalized feature vectors.
        
        Args:
            current_features: Dictionary with current event features
            k: Number of similar events to return
            
        Returns:
            List of similar historical events with their outcomes
        """
        # This is a simplified implementation
        # In production, use vector database (e.g., FAISS, Pinecone) or
        # pre-computed embeddings for fast similarity search
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Build query based on available filters
        filters = []
        params = []
        
        if 'event_type' in current_features:
            filters.append("event_type = ?")
            params.append(current_features['event_type'])
        
        if 'sector' in current_features:
            filters.append("sector = ?")
            params.append(current_features['sector'])
        
        if 'market_cap_category' in current_features:
            filters.append("market_cap_category = ?")
            params.append(current_features['market_cap_category'])
        
        # Require outcomes to be present
        filters.append("return_3d IS NOT NULL")
        
        where_clause = " AND ".join(filters)
        
        # Query similar events
        query = f"""
            SELECT * FROM events 
            WHERE {where_clause}
            ORDER BY event_date DESC
            LIMIT ?
        """
        params.append(k * 5)  # Get more candidates, then filter by similarity
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        # Convert to events and calculate similarity
        candidates = [self._row_to_event(row) for row in rows]
        
        # Calculate similarity scores and sort
        scored_events = []
        for event in candidates:
            similarity = self._calculate_similarity(current_features, event)
            if similarity > 0.5:  # Minimum similarity threshold
                scored_events.append((similarity, event))
        
        # Sort by similarity and return top k
        scored_events.sort(key=lambda x: x[0], reverse=True)
        return [event for similarity, event in scored_events[:k]]
    
    def get_event_statistics(self, event_type: str, filters: Dict = None) -> Dict:
        """
        Get historical statistics for a specific event type.
        
        Args:
            event_type: Type of event to analyze
            filters: Additional filters (sector, market_cap_category, date_range)
            
        Returns:
            Dictionary with historical statistics
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Build query
        base_query = """
            SELECT 
                COUNT(*) as count,
                AVG(return_1d) as avg_return_1d,
                AVG(return_3d) as avg_return_3d,
                AVG(return_5d) as avg_return_5d,
                AVG(return_10d) as avg_return_10d,
                AVG(return_20d) as avg_return_20d,
                STDDEV(return_3d) as std_return_3d,
                MIN(return_3d) as min_return_3d,
                MAX(return_3d) as max_return_3d,
                SUM(CASE WHEN return_3d > 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as win_rate
            FROM events
            WHERE event_type = ?
        """
        
        params = [event_type]
        
        # Add optional filters
        if filters:
            if 'sector' in filters:
                base_query += " AND sector = ?"
                params.append(filters['sector'])
            if 'market_cap_category' in filters:
                base_query += " AND market_cap_category = ?"
                params.append(filters['market_cap_category'])
            if 'date_from' in filters:
                base_query += " AND event_date >= ?"
                params.append(filters['date_from'])
            if 'date_to' in filters:
                base_query += " AND event_date <= ?"
                params.append(filters['date_to'])
        
        cursor.execute(base_query, params)
        row = cursor.fetchone()
        conn.close()
        
        if not row or row[0] == 0:
            return {
                'count': 0,
                'avg_return_1d': 0,
                'avg_return_3d': 0,
                'avg_return_5d': 0,
                'avg_return_10d': 0,
                'avg_return_20d': 0,
                'win_rate': 0,
                'reliability': 'LOW'
            }
        
        count = row[0]
        win_rate = row[8] or 0
        
        # Determine reliability based on sample size and consistency
        if count >= 30 and 45 <= win_rate <= 55:
            reliability = 'LOW'  # No edge
