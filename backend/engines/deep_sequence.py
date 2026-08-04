"""
Quantum Alpha V7 — Deep Sequence Predictor
Uses a Deep Neural Network (MLP) architecture to process sequences of 
price action and volume (microstructure) rather than isolated snapshots.
"""

import numpy as np
from typing import List, Dict
import warnings

# Suppress warnings from sklearn during live inference
warnings.filterwarnings("ignore", category=UserWarning)

try:
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


class DeepSequencePredictor:
    """
    Simulates a sequence-to-probability deep learning model.
    By flattening the most recent N ticks (prices and volumes) and passing them 
    through deep dense layers, it captures non-linear sequential patterns.
    """
    
    def __init__(self, sequence_length: int = 10):
        self.sequence_length = sequence_length
        self.is_trained = False
        self.scaler = None
        self.model = None
        
        if SKLEARN_AVAILABLE:
            self.model = MLPClassifier(
                hidden_layer_sizes=(128, 64, 32),
                activation='relu',
                solver='adam',
                max_iter=500,
                random_state=42
            )
            self.scaler = StandardScaler()
            self._pre_train_synthetic_base()

    def _pre_train_synthetic_base(self):
        """
        Injects baseline trading intuition (momentum + volume breakouts) 
        so the Deep Model works on day 1 before receiving live user data.
        """
        if not SKLEARN_AVAILABLE:
            return
            
        X_synthetic = []
        y_synthetic = []
        
        # Generate 1000 synthetic sequence samples
        for _ in range(1000):
            prices = np.cumprod(1 + np.random.normal(0, 0.005, self.sequence_length))
            volumes = np.random.lognormal(mean=0.0, sigma=0.5, size=self.sequence_length)
            
            # Feature extraction for synthetic labels
            price_change = prices[-1] / prices[0] - 1
            vol_surge = volumes[-1] / (np.mean(volumes[:-1]) + 1e-5)
            
            # Sequence encoding: [P0, V0, P1, V1, ..., Pn, Vn]
            seq_features = []
            for p, v in zip(prices, volumes):
                seq_features.extend([p, v])
                
            X_synthetic.append(seq_features)
            
            # Label logic: Bullish if strong momentum + volume confirmation
            if price_change > 0.01 and vol_surge > 1.5:
                y_synthetic.append(1)  # Bullish
            elif price_change < -0.01 and vol_surge > 1.5:
                y_synthetic.append(0)  # Bearish
            else:
                y_synthetic.append(np.random.choice([0, 1]))  # Noise
                
        X_arr = np.array(X_synthetic)
        y_arr = np.array(y_synthetic)
        
        X_scaled = self.scaler.fit_transform(X_arr)
        self.model.fit(X_scaled, y_arr)
        self.is_trained = True

    def _prepare_sequence(self, prices: List[float], volumes: List[float]) -> np.ndarray:
        """Flattens prices and volumes into a fixed-length sequence vector."""
        if not prices:
            prices = [1.0] * self.sequence_length
        if not volumes:
            volumes = [1.0] * self.sequence_length
            
        p_arr = np.array(prices)
        v_arr = np.array(volumes)
        
        # Normalize prices to percentage change relative to start of window
        if len(p_arr) > self.sequence_length:
            p_window = p_arr[-self.sequence_length:]
            v_window = v_arr[-self.sequence_length:]
        else:
            # Pad if too short
            pad_len = self.sequence_length - len(p_arr)
            p_window = np.pad(p_arr, (pad_len, 0), 'edge')
            v_window = np.pad(v_arr, (pad_len, 0), 'constant', constant_values=np.mean(v_arr) if len(v_arr)>0 else 1.0)
            
        base_price = p_window[0] if p_window[0] != 0 else 1.0
        p_norm = p_window / base_price
        
        base_vol = np.mean(v_window) if np.mean(v_window) != 0 else 1.0
        v_norm = v_window / base_vol
        
        # Interleave
        seq_features = []
        for p, v in zip(p_norm, v_norm):
            seq_features.extend([float(p), float(v)])
            
        return np.array([seq_features])

    def predict(self, prices: List[float], volumes: List[float]) -> Dict:
        """
        Executes a forward pass through the deep sequence model.
        Returns the bullish probability (0 to 100).
        """
        if not self.is_trained or not SKLEARN_AVAILABLE:
            return {
                'probability': 50.0,
                'confidence': 0.0,
                'signal': 'HOLD',
                'reasoning': 'Deep Sequence Model not initialized.'
            }
            
        X_seq = self._prepare_sequence(prices, volumes)
        X_scaled = self.scaler.transform(X_seq)
        
        # Forward pass
        probs = self.model.predict_proba(X_scaled)[0]
        bullish_prob = probs[1] * 100
        
        # Calculate Order Book Imbalance Proxy
        recent_p = prices[-3:] if len(prices) >= 3 else prices
        recent_v = volumes[-3:] if len(volumes) >= 3 else volumes
        if len(recent_p) >= 2:
            buy_vol = sum(v for i, v in enumerate(recent_v) if i > 0 and recent_p[i] > recent_p[i-1])
            sell_vol = sum(v for i, v in enumerate(recent_v) if i > 0 and recent_p[i] <= recent_p[i-1])
            imbalance = buy_vol / (sell_vol + 1e-5)
        else:
            imbalance = 1.0
            
        # Classify
        if bullish_prob > 65:
            signal = 'STRONG_BUY'
        elif bullish_prob > 55:
            signal = 'BUY'
        elif bullish_prob < 35:
            signal = 'STRONG_SELL'
        elif bullish_prob < 45:
            signal = 'SELL'
        else:
            signal = 'HOLD'
            
        confidence = abs(bullish_prob - 50) * 2  # 0 to 100
        
        return {
            'probability': float(bullish_prob),
            'confidence': float(confidence),
            'signal': signal,
            'order_book_imbalance': float(imbalance),
            'reasoning': f"Deep MLP Sequence processed {self.sequence_length} ticks. Imbalance ratio: {imbalance:.2f}"
        }

# Singleton instance
deep_sequence_engine = DeepSequencePredictor()
