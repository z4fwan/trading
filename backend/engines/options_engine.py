import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class OptionsEngine:
    """
    Evaluates Put-Call Ratio (PCR), Max Pain, and Unusual Options Activity.
    """
    
    def __init__(self):
        # Constants for F&O evaluation
        self.PCR_EXTREME_HIGH = 1.5   # Overbought / Bearish reversal likely
        self.PCR_EXTREME_LOW = 0.7    # Oversold / Bullish reversal likely
        
    def evaluate_options_flow(self, options_data: Dict) -> Dict:
        """
        Parses DalalAI options data and generates a signal overlay.
        
        Input options_data example:
        {
            "pcr": 1.6,
            "max_pain_distance": 1.02, # 2% above max pain
            "unusual_activity": {"type": "BLOCK_DEAL", "side": "BUY", ...}
        }
        """
        if not options_data:
            return {"signal": "NEUTRAL", "confidence_boost": 0.0, "reasoning": "No options data."}
            
        pcr = options_data.get("pcr", 1.0)
        max_pain = options_data.get("max_pain_distance", 1.0)
        unusual = options_data.get("unusual_activity")
        
        boost = 0.0
        signal = "NEUTRAL"
        reasons = []
        
        # 1. PCR Reversals
        if pcr > self.PCR_EXTREME_HIGH:
            signal = "BEARISH_REVERSAL"
            boost += 0.2
            reasons.append(f"PCR extremely high at {pcr} (Market overbought, puts loaded)")
        elif pcr < self.PCR_EXTREME_LOW:
            signal = "BULLISH_REVERSAL"
            boost += 0.2
            reasons.append(f"PCR extremely low at {pcr} (Market oversold, calls loaded)")
            
        # 2. Max Pain Gravity
        # If price is > 3% above max pain (e.g. 1.03), it's likely to get pulled down
        if max_pain > 1.03:
            reasons.append(f"Price is {((max_pain - 1) * 100):.1f}% above Max Pain (Gravitational pull down)")
            if signal == "NEUTRAL":
                signal = "BEARISH_PULL"
        elif max_pain < 0.97:
            reasons.append(f"Price is {((1 - max_pain) * 100):.1f}% below Max Pain (Gravitational pull up)")
            if signal == "NEUTRAL":
                signal = "BULLISH_PULL"
                
        # 3. Unusual Activity (Smart Money)
        if unusual:
            side = unusual.get("side", "UNKNOWN")
            instr = unusual.get("instrument", "UNKNOWN")
            mult = unusual.get("volume_multiplier", 1.0)
            
            # Buying CALLs or Selling PUTs -> Bullish
            # Buying PUTs or Selling CALLs -> Bearish
            if side == "BUY" and instr == "CALL":
                reasons.append(f"🚨 Smart Money Block CALL Buying ({mult}x volume)")
                signal = "STRONG_BULLISH"
                boost += 0.3
            elif side == "BUY" and instr == "PUT":
                reasons.append(f"🚨 Smart Money Block PUT Buying ({mult}x volume)")
                signal = "STRONG_BEARISH"
                boost += 0.3
                
        # Consolidate reasoning
        reasoning_str = " | ".join(reasons) if reasons else "Options flow is stable/neutral."
        
        return {
            "pcr": pcr,
            "max_pain_distance": max_pain,
            "signal": signal,
            "confidence_boost": min(boost, 0.4), # Cap options boost at 40%
            "reasoning": reasoning_str,
            "unusual": unusual is not None
        }

options_engine = OptionsEngine()
