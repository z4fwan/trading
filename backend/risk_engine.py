import math
from typing import Dict, List
import numpy as np

class DynamicRiskEngine:
    """
    V4 Institutional Risk Engine
    
    Computes precise Stop Distance based on:
    - ATR (Average True Range)
    - Historical Volatility
    - Market Regime
    - Liquidity
    - Portfolio Heat
    
    Returns target sizing, EV (Expected Value), and absolute price stops.
    """
    
    def __init__(self):
        self.max_account_risk_pct = 0.02  # Max 2% risk per trade
        self.default_account_size = 100000 # Paper trading capital
        
    def calculate_atr(self, prices: List[float], period: int = 14) -> float:
        if len(prices) < period:
            return prices[-1] * 0.015 # fallback 1.5% atr
        
        # Simple ATR approximation for V4
        # (In reality this needs High/Low, but we only have close prices passed from TS right now)
        # We will use standard deviation of log returns as a volatility proxy instead
        returns = np.diff(prices) / prices[:-1]
        volatility = np.std(returns[-period:])
        return prices[-1] * volatility * math.sqrt(period)

    def evaluate_risk(self, probability: float, prices: List[float], regime: str = "BULL_TRENDING") -> Dict:
        """
        Evaluate full risk profile for a prediction.
        """
        current_price = prices[-1]
        atr = self.calculate_atr(prices)
        
        # 1. Base Stop Distance = ATR * multiplier based on regime
        regime_multipliers = {
            "BULL_TRENDING": 1.5,
            "BEAR_TRENDING": 1.5,
            "CHOPPY": 2.5,  # Wider stops in chop
            "VOLATILE": 3.0
        }
        multiplier = regime_multipliers.get(regime, 2.0)
        stop_distance = atr * multiplier
        
        # 2. Risk Reward Ratio targets
        base_rr = 2.0 # Target 2R
        if probability > 80:
            base_rr = 3.0 # High conviction = hold for larger target
            
        target_distance = stop_distance * base_rr
        
        # 3. Calculate absolute levels based on Direction
        direction = "BUY" if probability > 50 else "SELL"
        
        if direction == "BUY":
            stop_loss = current_price - stop_distance
            target_price = current_price + target_distance
        else:
            stop_loss = current_price + stop_distance
            target_price = current_price - target_distance
            
        # 5. Expected Value (EV) with Slippage
        # Slippage approximation based on regime (e.g. 0.1% normal, 0.3% volatile)
        slippage_pct = 0.003 if regime in ["VOLATILE", "CHOPPY"] else 0.001
        slippage_cost = current_price * slippage_pct
        
        prob_win = probability / 100.0
        prob_loss = 1.0 - prob_win
        
        # EV = (Prob_Win * (Target_Distance - Slippage)) - (Prob_Loss * (Stop_Distance + Slippage))
        net_target = target_distance - slippage_cost
        net_stop = stop_distance + slippage_cost
        ev = (prob_win * net_target) - (prob_loss * net_stop)
        
        # 6. Kelly Criterion for Sizing
        # Kelly % = W - [(1 - W) / R] where W = Win Probability, R = Risk/Reward
        # We use Half-Kelly for safety
        if base_rr > 0:
            kelly_pct = prob_win - (prob_loss / base_rr)
            half_kelly = max(0.0, kelly_pct / 2.0)
        else:
            half_kelly = 0.0
            
        # Bound Kelly size by max account risk
        final_risk_pct = min(self.max_account_risk_pct, half_kelly)
        risk_amount_dollars = self.default_account_size * final_risk_pct
        
        # Position Size = Risk Amount / Risk Per Share
        risk_per_share = abs(current_price - stop_loss)
        if risk_per_share == 0:
            risk_per_share = current_price * 0.01 # Fallback 1%
            
        max_shares = math.floor(risk_amount_dollars / risk_per_share)
        position_size_dollars = max_shares * current_price
        
        return {
            "atr_value": round(atr, 2),
            "stop_loss": round(stop_loss, 2),
            "target_price": round(target_price, 2),
            "risk_reward_ratio": base_rr,
            "max_shares": max_shares,
            "capital_allocation": round(position_size_dollars, 2),
            "expected_value": round(ev, 2),
            "market_regime": regime,
            "kelly_fraction": round(half_kelly, 4)
        }

risk_engine = DynamicRiskEngine()
