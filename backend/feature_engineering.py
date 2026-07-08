import pandas as pd
import numpy as np
from typing import Dict, List, Optional
from datetime import datetime

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engines.event_intelligence import event_intelligence_engine
from engines.historical_similarity import similarity_engine
from engines.capital_flow import capital_flow_engine
from engines.feature_registry import feature_registry

# Register features
feature_registry.register_feature("rsi", "1.0", "Relative Strength Index", ["XGBoost", "RandomForest"])
feature_registry.register_feature("macd", "1.0", "MACD Histogram", ["XGBoost", "RandomForest"])
feature_registry.register_feature("bb_pb", "1.0", "Bollinger Bands %b", ["XGBoost", "RandomForest"])
feature_registry.register_feature("event_impact", "1.0", "Event Importance Score", ["XGBoost", "RandomForest"])
feature_registry.register_feature("historical_win_rate", "1.0", "Win rate of top 20 similar events", ["XGBoost", "RandomForest"])
feature_registry.register_feature("accumulation_prob", "1.0", "Probability of institutional accumulation", ["XGBoost", "RandomForest"])
feature_registry.register_feature("vwap_strength", "1.0", "Deviation from Volume Weighted Average Price", ["XGBoost", "RandomForest"])

class FeatureEngineering:
    """
    Transforms raw OHLCV and event data into validated ML features.
    Ensures no future data leakage and handles NaNs cleanly.
    """
    def __init__(self):
        self.version = "v3.1"
        self.expected_features = 22 # Matching the XGBoost input shape

    def validate_payload(self, raw_data: Dict) -> bool:
        """Ensure payload has required schema"""
        required = ['symbol', 'prices', 'event']
        if not all(k in raw_data for k in required):
            return False
        if not isinstance(raw_data['prices'], list) or len(raw_data['prices']) < 14:
            return False # Need history for indicators
        return True

    def calculate_indicators(self, prices: List[float], volumes: List[float]) -> Dict:
        """Calculate TA indicators without lookahead bias"""
        if len(prices) < 14:
            return {'rsi': 50, 'macd': 0, 'macd_sig': 0, 'bb_upper': prices[-1], 'bb_lower': prices[-1]}
            
        df = pd.DataFrame({'close': prices, 'volume': volumes})
        
        # RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD
        exp1 = df['close'].ewm(span=12, adjust=False).mean()
        exp2 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = exp1 - exp2
        df['macd_sig'] = df['macd'].ewm(span=9, adjust=False).mean()
        
        # Bollinger Bands
        ma = df['close'].rolling(window=20).mean()
        std = df['close'].rolling(window=20).std()
        df['bb_upper'] = ma + (std * 2)
        df['bb_lower'] = ma - (std * 2)
        
        # Fill NaNs from rolling windows
        df = df.bfill().fillna(0)
        
        last_row = df.iloc[-1]
        return {
            'rsi': float(last_row['rsi']),
            'macd': float(last_row['macd']),
            'macd_sig': float(last_row['macd_sig']),
            'bb_upper': float(last_row['bb_upper']),
            'bb_lower': float(last_row['bb_lower'])
        }

    def generate_features(self, raw_data: Dict) -> np.ndarray:
        """Convert raw data into exactly 22 features for ML"""
        if not self.validate_payload(raw_data):
            raise ValueError("Invalid payload schema or insufficient price history")
            
        prices = raw_data['prices']
        volumes = raw_data.get('volumes', [1.0] * len(prices))
        event = raw_data['event']
        
        # 1. Technical Features
        ta = self.calculate_indicators(prices, volumes)
        
        # 2. Event Features (V5)
        headline = str(event.get('headline', ''))
        structured_event = event_intelligence_engine.parse_event(headline)
        
        # 3. Historical Similarity (V5)
        sim_result = similarity_engine.find_similar_events(structured_event.category)
        
        # 4. Capital Flow (V5)
        cap_flow = capital_flow_engine.calculate_accumulation_probability(prices, volumes)
        
        # Create 22 feature array
        features = np.zeros(self.expected_features)
        
        # Base Technicals
        features[0] = ta['rsi']
        features[1] = ta['macd']
        features[2] = ta['macd_sig']
        features[3] = (prices[-1] - ta['bb_lower']) / (ta['bb_upper'] - ta['bb_lower'] + 1e-9) # BB %b
        
        # V5 Advanced Features
        features[4] = structured_event.importance_score
        features[5] = structured_event.confidence
        features[6] = sim_result.win_rate
        features[7] = sim_result.median_return
        features[8] = cap_flow['accumulation_probability']
        features[9] = cap_flow['relative_volume']
        features[10] = cap_flow['vwap_strength']
        features[11] = 1.0 if cap_flow['volume_shock'] else 0.0
        
        # Mock other features to fill the 22-shape array
        for i in range(12, 22):
            features[i] = 0.0
            
        return features

feature_engine = FeatureEngineering()
