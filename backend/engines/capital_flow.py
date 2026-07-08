import pandas as pd
import numpy as np
from typing import Dict, List

class CapitalFlowEngine:
    """
    Detects probability of institutional accumulation without claiming certainty.
    Uses volume shocks, VWAP deviations, and relative volume.
    """
    
    def __init__(self):
        pass
        
    def calculate_accumulation_probability(self, prices: List[float], volumes: List[float], baseline_vol_window: int = 20) -> Dict:
        """
        Estimate the probability of institutional accumulation.
        """
        if len(prices) < baseline_vol_window or len(volumes) < baseline_vol_window:
            return {
                "accumulation_probability": 0.5,
                "relative_volume": 1.0,
                "vwap_strength": 0.0,
                "volume_shock": False
            }
            
        current_vol = volumes[-1]
        baseline_vol = np.mean(volumes[-baseline_vol_window:-1])
        
        # 1. Relative Volume (RVOL)
        rvol = current_vol / (baseline_vol + 1e-9)
        volume_shock = rvol > 3.0
        
        # 2. VWAP Strength proxy (Price relative to recent VWAP)
        # We approximate VWAP over the last N days using typical price if intraday isn't available
        typical_prices = np.array(prices[-baseline_vol_window:])
        vols = np.array(volumes[-baseline_vol_window:])
        vwap = np.sum(typical_prices * vols) / (np.sum(vols) + 1e-9)
        
        vwap_strength = (prices[-1] - vwap) / vwap
        
        # 3. Accumulation Probability Logic
        # High volume + holding above VWAP strongly suggests accumulation
        # High volume + dropping below VWAP suggests distribution
        base_prob = 0.50
        
        if rvol > 1.5:
            if vwap_strength > 0.005:  # Price > VWAP by 0.5%
                base_prob += 0.15 + min(0.15, (rvol - 1.5) * 0.05)
            elif vwap_strength < -0.005: # Distribution
                base_prob -= 0.15 + min(0.15, (rvol - 1.5) * 0.05)
                
        # Bound between 0 and 1
        accumulation_probability = max(0.01, min(0.99, base_prob))
        
        return {
            "accumulation_probability": round(accumulation_probability, 4),
            "relative_volume": round(rvol, 2),
            "vwap_strength": round(vwap_strength, 4),
            "volume_shock": volume_shock
        }

capital_flow_engine = CapitalFlowEngine()
