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
feature_registry.register_feature("rsi", "4.0", "Relative Strength Index", ["XGBoost", "RandomForest"])
feature_registry.register_feature("macd", "4.0", "MACD Histogram + Signal + Diff", ["XGBoost", "RandomForest"])
feature_registry.register_feature("bb", "4.0", "Bollinger Bands %b + Bandwidth", ["XGBoost", "RandomForest"])
feature_registry.register_feature("adx", "4.0", "Average Directional Index", ["XGBoost", "RandomForest"])
feature_registry.register_feature("obv", "4.0", "On-Balance Volume Trend", ["XGBoost", "RandomForest"])
feature_registry.register_feature("mfi", "4.0", "Money Flow Index", ["XGBoost", "RandomForest"])
feature_registry.register_feature("stochastic", "4.0", "Stochastic %K and %D", ["XGBoost", "RandomForest"])
feature_registry.register_feature("cci", "4.0", "Commodity Channel Index", ["XGBoost", "RandomForest"])
feature_registry.register_feature("williams_r", "4.0", "Williams %R", ["XGBoost", "RandomForest"])
feature_registry.register_feature("atr", "4.0", "Average True Range", ["XGBoost", "RandomForest"])
feature_registry.register_feature("momentum", "4.0", "Multi-period price momentum", ["XGBoost", "RandomForest"])
feature_registry.register_feature("volatility", "4.0", "Historical volatility + regime", ["XGBoost", "RandomForest"])
feature_registry.register_feature("support_resistance", "4.0", "Price position vs S/R levels", ["XGBoost", "RandomForest"])
feature_registry.register_feature("volume_profile", "4.0", "Volume trend and acceleration", ["XGBoost", "RandomForest"])
feature_registry.register_feature("price_structure", "4.0", "Higher highs/lows + trend slope", ["XGBoost", "RandomForest"])

FEATURE_NAMES = [
    # Momentum (0-3)
    "rsi_14", "rsi_7", "macd", "macd_signal",
    # Trend (4-7)
    "adx_14", "plus_di", "minus_di", "trend_slope_20",
    # Volatility (8-11)
    "bb_pctb", "bb_bandwidth", "atr_14", "volatility_20",
    # Volume (12-15)
    "obv_trend", "mfi_14", "volume_ratio_20", "volume_accel",
    # Oscillators (16-19)
    "stoch_k", "stoch_d", "cci_20", "williams_r_14",
    # Price Structure (20-23)
    "higher_highs", "higher_lows", "price_vs_52w_high", "price_vs_52w_low",
    # Momentum Returns (24-28)
    "return_1d", "return_3d", "return_5d", "return_10d", "return_20d",
    # Cross-sectional (29-31)
    "price_position_range", "gap_up", "gap_down",
    # Event/Advanced (32-35)
    "event_importance", "event_confidence", "sim_win_rate", "sim_median_return",
    # Capital Flow (36-39)
    "accumulation_prob", "relative_volume", "vwap_strength", "volume_shock",
    # Regime (40-42)
    "regime_trending", "regime_ranging", "regime_volatile",
    # Residual (43-49)
    "rsi_divergence", "macd_histogram", "bb_squeeze", "momentum_consistency",
    "volume_price_trend", "support_distance", "resistance_distance",
    # Cross-Asset (50-54)
    "relative_strength_5d", "relative_strength_20d", "beta_20d",
    "correlation_index_20d", "sector_momentum_10d",
]


class FeatureEngineering:
    """
    Transforms raw OHLCV and event data into validated ML features.
    v5.0: 55 real features — 50 core + 5 cross-asset.
    Ensures no future data leakage and handles NaNs cleanly.
    """
    def __init__(self):
        self.version = "v5.0"
        self.expected_features = len(FEATURE_NAMES)

    def validate_payload(self, raw_data: Dict) -> bool:
        required = ['symbol', 'prices', 'event']
        if not all(k in raw_data for k in required):
            return False
        if not isinstance(raw_data['prices'], list) or len(raw_data['prices']) < 60:
            return False
        return True

    def _compute_all_indicators(self, prices: List[float], volumes: List[float]) -> Dict[str, float]:
        """Compute all technical indicators from price/volume arrays."""
        df = pd.DataFrame({'close': prices, 'volume': volumes})
        high = df['close'].rolling(5).max() * (1 + df['close'].pct_change().abs().rolling(5).mean())
        low = df['close'].rolling(5).min() * (1 - df['close'].pct_change().abs().rolling(5).mean())
        df['high'] = high.bfill().fillna(df['close'])
        df['low'] = low.bfill().fillna(df['close'])
        c = df['close']
        v = df['volume']
        h = df['high']
        l = df['low']
        result = {}

        # RSI 14 and 7
        delta = c.diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta.where(delta < 0, 0.0))
        avg_gain_14 = gain.ewm(alpha=1/14, min_periods=14).mean()
        avg_loss_14 = loss.ewm(alpha=1/14, min_periods=14).mean()
        rs_14 = avg_gain_14 / (avg_loss_14 + 1e-10)
        df['rsi_14'] = 100 - (100 / (1 + rs_14))
        avg_gain_7 = gain.ewm(alpha=1/7, min_periods=7).mean()
        avg_loss_7 = loss.ewm(alpha=1/7, min_periods=7).mean()
        rs_7 = avg_gain_7 / (avg_loss_7 + 1e-10)
        df['rsi_7'] = 100 - (100 / (1 + rs_7))

        # MACD
        ema12 = c.ewm(span=12, adjust=False).mean()
        ema26 = c.ewm(span=26, adjust=False).mean()
        df['macd'] = ema12 - ema26
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']

        # Bollinger Bands
        sma20 = c.rolling(20).mean()
        std20 = c.rolling(20).std()
        bb_upper = sma20 + 2 * std20
        bb_lower = sma20 - 2 * std20
        df['bb_pctb'] = (c - bb_lower) / (bb_upper - bb_lower + 1e-10)
        df['bb_bandwidth'] = (bb_upper - bb_lower) / (sma20 + 1e-10)
        bb_mid = (bb_upper + bb_lower) / 2
        bb_range = (bb_upper - bb_lower)
        df['bb_squeeze'] = (bb_range / (bb_range.rolling(120).mean() + 1e-10) - 1) if len(prices) > 120 else pd.Series(0, index=df.index)

        # ADX (Average Directional Index)
        tr = pd.concat([h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
        atr14 = tr.ewm(span=14, adjust=False).mean()
        plus_dm = ((h - h.shift(1)).clip(lower=0))
        minus_dm = ((l.shift(1) - l).clip(lower=0))
        plus_dm[plus_dm < minus_dm] = 0
        minus_dm[minus_dm < plus_dm] = 0
        plus_di = 100 * plus_dm.ewm(span=14, adjust=False).mean() / (atr14 + 1e-10)
        minus_di = 100 * minus_dm.ewm(span=14, adjust=False).mean() / (atr14 + 1e-10)
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10)
        df['adx_14'] = dx.ewm(span=14, adjust=False).mean()
        df['plus_di'] = plus_di
        df['minus_di'] = minus_di
        df['atr_14'] = atr14 / (c + 1e-10)  # Normalize ATR as % of price

        # OBV (On-Balance Volume) trend
        obv = (v * np.sign(c.diff())).cumsum()
        obv_sma = obv.rolling(20).mean()
        df['obv_trend'] = (obv - obv_sma) / (obv.rolling(20).std() + 1e-10)

        # MFI (Money Flow Index)
        typical_price = (h + l + c) / 3
        raw_mf = typical_price * v
        pos_mf = raw_mf.where(typical_price > typical_price.shift(1), 0).rolling(14).sum()
        neg_mf = raw_mf.where(typical_price < typical_price.shift(1), 0).rolling(14).sum()
        mfi = 100 - 100 / (1 + pos_mf / (neg_mf + 1e-10))
        df['mfi_14'] = mfi

        # Stochastic %K and %D
        low14 = l.rolling(14).min()
        high14 = h.rolling(14).max()
        df['stoch_k'] = 100 * (c - low14) / (high14 - low14 + 1e-10)
        df['stoch_d'] = df['stoch_k'].rolling(3).mean()

        # CCI (Commodity Channel Index)
        tp = (h + l + c) / 3
        sma_tp = tp.rolling(20).mean()
        mad = tp.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
        df['cci_20'] = (tp - sma_tp) / (0.015 * mad + 1e-10)

        # Williams %R
        df['williams_r_14'] = -100 * (high14 - c) / (high14 - low14 + 1e-10)

        # Volatility (20-day)
        ret = c.pct_change()
        df['volatility_20'] = ret.rolling(20).std() * np.sqrt(252)

        # Trend slope (20-day linear regression slope normalized)
        x = np.arange(20)
        def linreg_slope(y):
            if len(y) < 20 or np.isnan(y).any():
                return 0
            m = (np.mean(x * y) - np.mean(x) * np.mean(y)) / (np.mean(x**2) - np.mean(x)**2 + 1e-10)
            return m / (np.mean(y) + 1e-10)
        df['trend_slope_20'] = c.rolling(20).apply(linreg_slope, raw=True)

        # Momentum returns
        df['return_1d'] = c.pct_change(1)
        df['return_3d'] = c.pct_change(3)
        df['return_5d'] = c.pct_change(5)
        df['return_10d'] = c.pct_change(10)
        df['return_20d'] = c.pct_change(20)

        # Price structure: higher highs / higher lows (last 5 bars)
        hh = (h > h.shift(1)).rolling(5).sum() / 5
        hl = (l > l.shift(1)).rolling(5).sum() / 5
        df['higher_highs'] = hh
        df['higher_lows'] = hl

        # Price position in 52-week range
        high52w = h.rolling(min(252, len(prices))).max()
        low52w = l.rolling(min(252, len(prices))).min()
        df['price_vs_52w_high'] = (c - low52w) / (high52w - low52w + 1e-10)
        df['price_vs_52w_low'] = 1 - df['price_vs_52w_high']

        # Gap analysis
        df['gap_up'] = ((l > c.shift(1)).astype(float) * (l - c.shift(1)) / (c.shift(1) + 1e-10))
        df['gap_down'] = ((h < c.shift(1)).astype(float) * (c.shift(1) - h) / (c.shift(1) + 1e-10))

        # Price position in recent range
        high20 = h.rolling(20).max()
        low20 = l.rolling(20).min()
        df['price_position_range'] = (c - low20) / (high20 - low20 + 1e-10)

        # Volume ratio vs 20-day average
        vol_sma20 = v.rolling(20).mean()
        df['volume_ratio_20'] = v / (vol_sma20 + 1e-10)

        # Volume acceleration (volume change rate)
        df['volume_accel'] = v.pct_change(5)

        # RSI divergence (price making new high but RSI not confirming)
        price_new_high = (c == c.rolling(10).max()).astype(float)
        rsi_new_high = (df['rsi_14'] == df['rsi_14'].rolling(10).max()).astype(float)
        df['rsi_divergence'] = price_new_high - rsi_new_high

        # Momentum consistency (positive returns in last 5 days)
        df['momentum_consistency'] = (ret.rolling(5).apply(lambda x: (x > 0).sum() / 5, raw=True))

        # Volume-price trend
        df['volume_price_trend'] = (v * np.sign(ret)).rolling(10).sum() / (v.rolling(10).sum() + 1e-10)

        # Regime detection
        adx_val = df['adx_14']
        vol_val = df['volatility_20']
        vol_median = vol_val.rolling(60).median()
        adx_median = adx_val.rolling(60).median()
        df['regime_trending'] = ((adx_val > adx_median) & (vol_val < vol_median * 1.5)).astype(float)
        df['regime_ranging'] = ((adx_val < adx_median) & (vol_val < vol_median * 1.5)).astype(float)
        df['regime_volatile'] = (vol_val > vol_median * 1.5).astype(float)

        # Support/Resistance (recent pivots)
        pivot = (h + l + c) / 3
        df['support_distance'] = (c - (2 * pivot - h)) / (c + 1e-10)
        df['resistance_distance'] = ((2 * pivot - l) - c) / (c + 1e-10)

        # === CROSS-ASSET FEATURES (50-54) ===
        # Relative strength: return normalized by recent volatility (higher = stronger trend)
        ret_5 = c.pct_change(5)
        ret_20 = c.pct_change(20)
        vol_20 = ret.rolling(20).std()
        df['relative_strength_5d'] = ret_5 / (vol_20 + 1e-10)
        df['relative_strength_20d'] = ret_20 / (vol_20 + 1e-10)

        # Beta proxy: how much the stock moves relative to its own rolling volatility
        # Higher beta = more volatile relative to its own history
        df['beta_20d'] = vol_20 / (ret.rolling(60).std() + 1e-10)

        # Return autocorrelation: positive = momentum stock, negative = mean-reverting
        df['correlation_index_20d'] = ret.rolling(20).apply(
            lambda x: x.autocorr(lag=1) if len(x.dropna()) >= 10 else 0, raw=False
        )

        # Sector momentum proxy: 10-day smoothed return (captures medium-term trend)
        df['sector_momentum_10d'] = ret.rolling(10).mean() * 100

        df = df.bfill().fillna(0)
        return df

    def generate_features(self, raw_data: Dict) -> np.ndarray:
        """Convert raw data into 55 real features for ML v5.0"""
        if not self.validate_payload(raw_data):
            raise ValueError("Invalid payload schema or insufficient price history (need 60+ bars)")

        prices = raw_data['prices']
        volumes = raw_data.get('volumes', [1.0] * len(prices))
        event = raw_data['event']

        # Compute all indicators
        df = self._compute_all_indicators(prices, volumes)
        last = df.iloc[-1]

        # Feature vector
        features = np.zeros(self.expected_features)

        # Core Technicals (0-3)
        features[0] = last.get('rsi_14', 50)
        features[1] = last.get('rsi_7', 50)
        features[2] = last.get('macd', 0)
        features[3] = last.get('macd_signal', 0)

        # Trend (4-7)
        features[4] = last.get('adx_14', 25)
        features[5] = last.get('plus_di', 25)
        features[6] = last.get('minus_di', 25)
        features[7] = last.get('trend_slope_20', 0)

        # Volatility (8-11)
        features[8] = last.get('bb_pctb', 0.5)
        features[9] = last.get('bb_bandwidth', 0)
        features[10] = last.get('atr_14', 0)
        features[11] = last.get('volatility_20', 0)

        # Volume (12-15)
        features[12] = last.get('obv_trend', 0)
        features[13] = last.get('mfi_14', 50)
        features[14] = last.get('volume_ratio_20', 1)
        features[15] = last.get('volume_accel', 0)

        # Oscillators (16-19)
        features[16] = last.get('stoch_k', 50)
        features[17] = last.get('stoch_d', 50)
        features[18] = last.get('cci_20', 0)
        features[19] = last.get('williams_r_14', -50)

        # Price Structure (20-23)
        features[20] = last.get('higher_highs', 0.5)
        features[21] = last.get('higher_lows', 0.5)
        features[22] = last.get('price_vs_52w_high', 0.5)
        features[23] = last.get('price_vs_52w_low', 0.5)

        # Momentum Returns (24-28)
        features[24] = last.get('return_1d', 0)
        features[25] = last.get('return_3d', 0)
        features[26] = last.get('return_5d', 0)
        features[27] = last.get('return_10d', 0)
        features[28] = last.get('return_20d', 0)

        # Cross-sectional (29-31)
        features[29] = last.get('price_position_range', 0.5)
        features[30] = last.get('gap_up', 0)
        features[31] = last.get('gap_down', 0)

        # Event/Advanced (32-35) - from event engines
        try:
            headline = str(event.get('headline', ''))
            structured_event = event_intelligence_engine.parse_event(headline)
            features[32] = structured_event.importance_score
            features[33] = structured_event.confidence
        except Exception:
            features[32] = 0
            features[33] = 0

        try:
            sim_result = similarity_engine.find_similar_events(
                event_intelligence_engine.parse_event(str(event.get('headline', ''))).category
            )
            features[34] = sim_result.win_rate
            features[35] = sim_result.median_return
        except Exception:
            features[34] = 0.5
            features[35] = 0

        # Capital Flow (36-39)
        try:
            cap_flow = capital_flow_engine.calculate_accumulation_probability(prices, volumes)
            features[36] = cap_flow['accumulation_probability']
            features[37] = cap_flow['relative_volume']
            features[38] = cap_flow['vwap_strength']
            features[39] = 1.0 if cap_flow['volume_shock'] else 0.0
        except Exception:
            features[36] = 0.5
            features[37] = 1.0
            features[38] = 0
            features[39] = 0

        # Regime (40-42)
        features[40] = last.get('regime_trending', 0)
        features[41] = last.get('regime_ranging', 0)
        features[42] = last.get('regime_volatile', 0)

        # Residual indicators (43-49)
        features[43] = last.get('rsi_divergence', 0)
        features[44] = last.get('macd_histogram', 0)
        features[45] = last.get('bb_squeeze', 0)
        features[46] = last.get('momentum_consistency', 0.5)
        features[47] = last.get('volume_price_trend', 0)
        features[48] = last.get('support_distance', 0)
        features[49] = last.get('resistance_distance', 0)

        # Cross-Asset (50-54)
        features[50] = last.get('relative_strength_5d', 0)
        features[51] = last.get('relative_strength_20d', 0)
        features[52] = last.get('beta_20d', 1.0)
        features[53] = last.get('correlation_index_20d', 0)
        features[54] = last.get('sector_momentum_10d', 0)

        return features

feature_engine = FeatureEngineering()
