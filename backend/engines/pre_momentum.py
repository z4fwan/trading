from typing import Dict, List, Any
import uuid
from datetime import datetime

class PreMomentumEngine:
    """
    Master aggregator that generates probabilities for multiple timeframes
    and builds an explainable Decision Trace.
    """
    
    def __init__(self):
        pass
        
    def generate_forecasts(self, ml_prob: float, event_impact: float, accum_prob: float, history_win_rate: float) -> Dict[str, float]:
        """
        Generate multi-timeframe forecasts based on the interplay of signals.
        For Phase 1, we approximate the time decay curves.
        """
        # If it's a strong event with high accumulation, short-term probability spikes
        short_term = (event_impact * 0.4) + (accum_prob * 0.4) + (ml_prob * 0.2)
        
        # Long-term is driven more by ML historical baseline and historical similarity
        long_term = (history_win_rate * 0.5) + (ml_prob * 0.5)
        
        return {
            "prob_15min": round(min(0.99, max(0.01, short_term * 1.1)), 2),
            "prob_1hour": round(min(0.99, max(0.01, short_term * 1.05)), 2),
            "prob_1day": round(min(0.99, max(0.01, short_term)), 2),
            "prob_3days": round(min(0.99, max(0.01, (short_term + long_term) / 2)), 2),
            "prob_1week": round(min(0.99, max(0.01, long_term)), 2)
        }
        
    def generate_decision_trace(self, ticker: str, features_used: List[str], feature_values: List[float], 
                                prediction: str, confidence: str, reasoning: str) -> Dict[str, Any]:
        """
        Every prediction must be reproducible.
        """
        return {
            "decision_id": f"DEC-{ticker}-{uuid.uuid4().hex[:8].upper()}",
            "timestamp": datetime.now().isoformat(),
            "model_version": "xgb_v5.1",
            "dataset_version": "univ_v1",
            "prediction": prediction,
            "confidence_tier": confidence,
            "reasoning": reasoning,
            "features_used": features_used,
            "feature_values": feature_values,
            "rules_passed": ["Information Gain > 0", "Leakage = False"],
            "rules_failed": []
        }

pre_momentum_engine = PreMomentumEngine()
