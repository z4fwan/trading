"""
Quantum Alpha v6.0 — Maximum Intelligence Layer
Multi-timeframe fusion, regime detection, feature selection, ensemble voting,
live walk-forward retraining, portfolio optimization.
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import pickle, json, sqlite3
from pathlib import Path


class MultiTimeframeEngine:
    """
    Computes signals across 1D, 1W, 1M timeframes and fuses them.
    When all timeframes agree, confidence is maximized.
    """
    @staticmethod
    def resample_ohlcv(prices: List[float], volumes: List[float], factor: int) -> Tuple[List[float], List[float]]:
        """Resample daily bars into higher timeframe bars."""
        if len(prices) < factor:
            return prices, volumes
        n = len(prices)
        new_prices, new_vols = [], []
        for i in range(0, n - factor + 1, factor):
            chunk_p = prices[i:i+factor]
            chunk_v = volumes[i:i+factor]
            new_prices.append(chunk_p[-1])  # Close of last bar
            new_vols.append(sum(chunk_v))
        return new_prices, new_vols

    @staticmethod
    def compute_timeframe_signal(prices: List[float], volumes: List[float]) -> Dict:
        """Compute momentum + mean-reversion signal for a single timeframe."""
        if len(prices) < 30:
            return {'direction': 0, 'strength': 0, 'momentum': 0, 'mean_rev': 0}

        arr = np.array(prices)
        ret_5 = (arr[-1] / arr[-5] - 1) if len(arr) >= 5 else 0
        ret_10 = (arr[-1] / arr[-10] - 1) if len(arr) >= 10 else 0
        ret_20 = (arr[-1] / arr[-20] - 1) if len(arr) >= 20 else 0

        # Momentum score: weighted combination of returns
        momentum = ret_5 * 0.5 + ret_10 * 0.3 + ret_20 * 0.2

        # Mean reversion: distance from 20-day SMA
        sma20 = np.mean(arr[-20:])
        deviation = (arr[-1] - sma20) / (sma20 + 1e-10)
        mean_rev = -deviation  # Negative because we expect reversion

        # RSI-based strength
        deltas = np.diff(arr[-15:])
        gains = np.where(deltas > 0, deltas, 0).mean()
        losses = np.where(deltas < 0, -deltas, 0).mean()
        rs = gains / (losses + 1e-10)
        rsi = 100 - 100 / (1 + rs)
        rsi_signal = (rsi - 50) / 50  # -1 to 1

        # Volume confirmation
        vol_arr = np.array(volumes[-20:]) if len(volumes) >= 20 else np.array(volumes)
        vol_avg = vol_arr.mean()
        vol_latest = vol_arr[-1] if len(vol_arr) > 0 else vol_avg
        vol_ratio = vol_latest / (vol_avg + 1e-10)

        # Combine
        direction = np.tanh(momentum * 10)  # Sigmoid-like normalization
        strength = abs(direction) * min(vol_ratio, 3) / 3  # Volume confirmation

        return {
            'direction': float(direction),
            'strength': float(strength),
            'momentum': float(momentum),
            'mean_rev': float(mean_rev),
            'rsi': float(rsi_signal),
            'vol_ratio': float(vol_ratio),
        }

    @classmethod
    def fuse_signals(cls, prices: List[float], volumes: List[float]) -> Dict:
        """Fuse 1D, 1W (5D), 1M (20D) timeframe signals."""
        # Daily signal
        daily = cls.compute_timeframe_signal(prices, volumes)

        # Weekly (resample 5x)
        w_prices, w_vols = cls.resample_ohlcv(prices, volumes, 5)
        weekly = cls.compute_timeframe_signal(w_prices, w_vols)

        # Monthly (resample 20x)
        m_prices, m_vols = cls.resample_ohlcv(prices, volumes, 20)
        monthly = cls.compute_timeframe_signal(m_prices, m_vols)

        # Confluence: how many timeframes agree on direction
        directions = [daily['direction'], weekly['direction'], monthly['direction']]
        signs = [1 if d > 0.05 else (-1 if d < -0.05 else 0) for d in directions]
        agreement = abs(sum(signs)) / 3  # 1.0 = all agree, 0.0 = split

        # Weighted fusion (monthly gets more weight for trend, daily for timing)
        fused_direction = (
            daily['direction'] * 0.2 +
            weekly['direction'] * 0.3 +
            monthly['direction'] * 0.5
        )

        # Confidence boost when all timeframes agree
        confidence = (
            daily['strength'] * 0.2 +
            weekly['strength'] * 0.3 +
            monthly['strength'] * 0.5
        ) * (0.7 + 0.3 * agreement)  # Boost up to 30% when unanimous

        return {
            'fused_direction': float(fused_direction),
            'confidence': float(min(confidence, 1.0)),
            'agreement': float(agreement),
            'daily': daily,
            'weekly': weekly,
            'monthly': monthly,
            'timeframe_alignment': f"{sum(s > 0 for s in signs)}/3 bullish" if sum(s != 0 for s in signs) == 3 else "mixed",
        }


class RegimeDetector:
    """
    Detects market regime: trending, ranging, volatile.
    Uses different model weights per regime.
    """
    REGIME_TRENDING = 'trending'
    REGIME_RANGING = 'ranging'
    REGIME_VOLATILE = 'volatile'

    @staticmethod
    def detect(prices: List[float], volumes: List[float]) -> Dict:
        if len(prices) < 60:
            return {'regime': 'unknown', 'adx': 0, 'volatility': 0, 'confidence': 0}

        arr = np.array(prices)
        returns = np.diff(arr) / arr[:-1]

        # ADX proxy: directional movement strength
        window = 14
        if len(returns) < window:
            return {'regime': 'unknown', 'adx': 0, 'volatility': 0, 'confidence': 0}

        # Compute "efficiency ratio" (Kaufman's)
        direction = abs(arr[-1] - arr[-window-1])
        volatility_sum = np.sum(np.abs(np.diff(arr[-window-1:])))
        efficiency = direction / (volatility_sum + 1e-10)

        # Volatility regime
        recent_vol = np.std(returns[-20:]) * np.sqrt(252)
        long_vol = np.std(returns[-60:]) * np.sqrt(252) if len(returns) >= 60 else recent_vol
        vol_ratio = recent_vol / (long_vol + 1e-10)

        # Price trend consistency
        sma20 = np.mean(arr[-20:])
        sma50 = np.mean(arr[-50:]) if len(arr) >= 50 else sma20
        trend_consistent = 1 if (arr[-1] > sma20 > sma50) or (arr[-1] < sma20 < sma50) else 0

        # Classify regime
        if efficiency > 0.4 and trend_consistent:
            regime = RegimeDetector.REGIME_TRENDING
            confidence = min(1.0, efficiency * 1.5)
        elif vol_ratio > 1.5 or recent_vol > 0.4:
            regime = RegimeDetector.REGIME_VOLATILE
            confidence = min(1.0, vol_ratio)
        else:
            regime = RegimeDetector.REGIME_RANGING
            confidence = min(1.0, 1 - efficiency)

        return {
            'regime': regime,
            'efficiency_ratio': float(efficiency),
            'volatility': float(recent_vol),
            'vol_ratio': float(vol_ratio),
            'trend_consistent': bool(trend_consistent),
            'confidence': float(confidence),
        }


class FeatureSelector:
    """
    Selects top features by importance to reduce overfitting.
    Uses correlation-based feature ranking.
    """
    @staticmethod
    def rank_features(X: np.ndarray, y: np.ndarray, feature_names: List[str]) -> List[Tuple[str, float]]:
        """Rank features by absolute correlation with target."""
        rankings = []
        for i in range(X.shape[1]):
            col = X[:, i]
            valid = ~(np.isnan(col) | np.isinf(col))
            if valid.sum() < 50:
                rankings.append((feature_names[i], 0.0))
                continue
            corr = abs(np.corrcoef(col[valid], y[valid])[0, 1])
            if np.isnan(corr):
                corr = 0.0
            rankings.append((feature_names[i], float(corr)))
        rankings.sort(key=lambda x: x[1], reverse=True)
        return rankings

    @staticmethod
    def select_top_features(X: np.ndarray, y: np.ndarray, feature_names: List[str],
                           top_k: int = 30) -> Tuple[np.ndarray, List[str]]:
        """Keep only top_k most predictive features."""
        rankings = FeatureSelector.rank_features(X, y, feature_names)
        top_features = [name for name, score in rankings[:top_k]]
        indices = [feature_names.index(name) for name in top_features]
        return X[:, indices], top_features

    @staticmethod
    def remove_collinear(X: np.ndarray, feature_names: List[str],
                        threshold: float = 0.85) -> Tuple[np.ndarray, List[str]]:
        """Remove features with correlation > threshold."""
        if X.shape[1] < 3:
            return X, feature_names

        corr_matrix = np.abs(np.corrcoef(X.T))
        keep = list(range(len(feature_names)))
        removed = set()

        for i in range(len(feature_names)):
            if i in removed:
                continue
            for j in range(i + 1, len(feature_names)):
                if j in removed:
                    continue
                if corr_matrix[i, j] > threshold:
                    removed.add(j)

        keep = [i for i in range(len(feature_names)) if i not in removed]
        return X[:, keep], [feature_names[i] for i in keep]


class EnsembleVoter:
    """
    Weighted voting across multiple models with regime-aware weights.
    """
    # Default weights (can be tuned per regime)
    REGIME_WEIGHTS = {
        RegimeDetector.REGIME_TRENDING: {'XGBoost': 0.35, 'LightGBM': 0.35, 'RandomForest': 0.2, 'LogisticRegression': 0.1},
        RegimeDetector.REGIME_RANGING: {'XGBoost': 0.25, 'LightGBM': 0.25, 'RandomForest': 0.3, 'LogisticRegression': 0.2},
        RegimeDetector.REGIME_VOLATILE: {'XGBoost': 0.3, 'LightGBM': 0.3, 'RandomForest': 0.25, 'LogisticRegression': 0.15},
        'unknown': {'XGBoost': 0.3, 'LightGBM': 0.3, 'RandomForest': 0.25, 'LogisticRegression': 0.15},
    }

    @staticmethod
    def vote(predictions: Dict[str, float], regime: str = 'unknown',
             multi_tf: Optional[Dict] = None) -> Dict:
        """
        Weighted vote across models, boosted by regime and multi-timeframe confluence.
        """
        weights = EnsembleVoter.REGIME_WEIGHTS.get(regime, EnsembleVoter.REGIME_WEIGHTS['unknown'])

        weighted_sum = 0
        total_weight = 0
        model_votes = {}

        for name, prob in predictions.items():
            if name in ('ensemble_mean', 'ensemble_median'):
                continue
            w = weights.get(name, 0.1)
            weighted_sum += prob * w
            total_weight += w
            model_votes[name] = {'probability': prob, 'weight': w}

        if total_weight == 0:
            return {'probability': 50, 'confidence': 0, 'signal': 'HOLD', 'model_votes': {}}

        ensemble_prob = weighted_sum / total_weight

        # Multi-timeframe boost
        tf_boost = 0
        if multi_tf:
            agreement = multi_tf.get('agreement', 0.5)
            fused_dir = multi_tf.get('fused_direction', 0)
            # Boost probability toward the multi-TF direction
            tf_boost = fused_dir * 0.15 * agreement

        final_prob = np.clip(ensemble_prob + tf_boost * 100, 0, 100)

        # Confidence from model agreement
        probs = list(predictions.values())
        probs = [p for p in probs if isinstance(p, (int, float)) and p > 0]
        if len(probs) > 1:
            spread = max(probs) - min(probs)
            model_agreement = max(0, 1 - spread / 50)
        else:
            model_agreement = 0.5

        # Regime confidence
        regime_conf = 0.7 if regime != 'unknown' else 0.5

        # Multi-TF confidence
        tf_conf = multi_tf.get('confidence', 0.5) if multi_tf else 0.5

        total_confidence = model_agreement * 0.4 + regime_conf * 0.3 + tf_conf * 0.3

        # Signal classification
        if final_prob > 65:
            signal = 'STRONG_BUY'
        elif final_prob > 55:
            signal = 'BUY'
        elif final_prob < 35:
            signal = 'STRONG_SELL'
        elif final_prob < 45:
            signal = 'SELL'
        else:
            signal = 'HOLD'

        return {
            'probability': float(final_prob),
            'confidence': float(total_confidence),
            'signal': signal,
            'regime': regime,
            'tf_alignment': multi_tf.get('timeframe_alignment', 'N/A') if multi_tf else 'N/A',
            'model_votes': model_votes,
            'tf_boost': float(tf_boost),
        }


class LiveRetrainer:
    """
    Live walk-forward retraining: incrementally updates models as new data arrives.
    """
    def __init__(self, db_path: str = 'data/stage_b_registry.db'):
        self.db_path = db_path
        self.retrain_interval = 500  # Retrain after N new samples
        self.samples_since_retrain = 0
        self.buffer_X = []
        self.buffer_y = []

    def add_sample(self, features: np.ndarray, label: int):
        """Add a labeled sample to the retraining buffer."""
        self.buffer_X.append(features)
        self.buffer_y.append(label)
        self.samples_since_retrain += 1

    def should_retrain(self) -> bool:
        return self.samples_since_retrain >= self.retrain_interval

    def retrain(self, existing_X: np.ndarray, existing_y: np.ndarray) -> Optional[Dict]:
        """Incremental retrain with walk-forward validation."""
        if not self.buffer_X:
            return None

        new_X = np.array(self.buffer_X)
        new_y = np.array(self.buffer_y)

        # Merge with existing (keep last 10K samples for memory)
        if existing_X is not None and len(existing_X) > 0:
            combined_X = np.vstack([existing_X[-10000:], new_X])
            combined_y = np.concatenate([existing_y[-10000:], new_y])
        else:
            combined_X = new_X
            combined_y = new_y

        self.buffer_X = []
        self.buffer_y = []
        self.samples_since_retrain = 0

        if len(combined_X) < 200:
            return None

        # Quick walk-forward (3-fold) on combined data
        from sklearn.model_selection import TimeSeriesSplit
        from sklearn.preprocessing import StandardScaler
        from sklearn.calibration import CalibratedClassifierCV
        from sklearn.metrics import roc_auc_score

        try:
            import xgboost as xgb
            import lightgbm as lgb

            tscv = TimeSeriesSplit(n_splits=3)
            models = {
                'XGBoost': xgb.XGBClassifier(n_estimators=150, max_depth=4, learning_rate=0.05, verbosity=0, random_state=42),
                'LightGBM': lgb.LGBMClassifier(n_estimators=150, max_depth=4, learning_rate=0.05, verbose=-1, random_state=42),
            }

            results = {}
            for name, algo in models.items():
                roc_scores = []
                for train_idx, val_idx in tscv.split(combined_X):
                    X_tr, X_val = combined_X[train_idx], combined_X[val_idx]
                    y_tr, y_val = combined_y[train_idx], combined_y[val_idx]
                    sc = StandardScaler()
                    X_tr_s = sc.fit_transform(X_tr)
                    X_val_s = sc.transform(X_val)
                    cal = CalibratedClassifierCV(algo, method='isotonic', cv=3)
                    cal.fit(X_tr_s, y_tr)
                    preds = cal.predict_proba(X_val_s)[:, 1]
                    if len(np.unique(y_val)) > 1:
                        roc_scores.append(roc_auc_score(y_val, preds))

                avg_roc = np.mean(roc_scores) if roc_scores else 0
                results[name] = avg_roc

            # Retrain best on all data
            best_name = max(results, key=results.get)
            best_roc = results[best_name]

            sc = StandardScaler()
            X_scaled = sc.fit_transform(combined_X)
            cal = CalibratedClassifierCV(models[best_name], method='isotonic', cv=5)
            cal.fit(X_scaled, combined_y)

            # Save
            try:
                from paths import DATA_DIR
            except ImportError:
                from backend.paths import DATA_DIR
            model_path = DATA_DIR / f'LiveRetrain_{best_name}_{datetime.now().strftime("%Y%m%d%H%M")}.pkl'
            with open(model_path, 'wb') as f:
                pickle.dump({'model': cal, 'scaler': sc, 'roc': best_roc, 'samples': len(combined_y)}, f)

            return {
                'model': best_name,
                'roc': best_roc,
                'samples': len(combined_y),
                'new_samples': len(new_y),
                'path': str(model_path),
            }
        except Exception as e:
            return {'error': str(e)}


class PortfolioOptimizer:
    """
    Risk parity + Kelly criterion portfolio optimization.
    """
    @staticmethod
    def risk_parity_weights(returns_dict: Dict[str, np.ndarray]) -> Dict[str, float]:
        """Equal risk contribution weights."""
        tickers = list(returns_dict.keys())
        n = len(tickers)
        if n == 0:
            return {}

        vols = {}
        for t in tickers:
            r = returns_dict[t]
            vols[t] = np.std(r) if len(r) > 1 else 1.0

        inv_vol_sum = sum(1/v for v in vols.values())
        weights = {t: (1/v) / inv_vol_sum for t, v in vols.items()}
        return weights

    @staticmethod
    def kelly_weights(returns_dict: Dict[str, np.ndarray], win_rate: float = 0.55) -> Dict[str, float]:
        """Kelly criterion position sizing."""
        tickers = list(returns_dict.keys())
        weights = {}

        for t in tickers:
            r = returns_dict[t]
            if len(r) < 10:
                weights[t] = 1.0 / len(tickers)
                continue

            avg_win = np.mean(r[r > 0]) if np.any(r > 0) else 0.01
            avg_loss = abs(np.mean(r[r < 0])) if np.any(r < 0) else 0.01
            payoff_ratio = avg_win / (avg_loss + 1e-10)

            # Kelly formula: f* = (p * b - q) / b
            p = win_rate
            q = 1 - p
            b = payoff_ratio
            kelly_f = (p * b - q) / (b + 1e-10)

            # Half-Kelly for safety
            weights[t] = max(0, kelly_f * 0.5)

        # Normalize
        total = sum(weights.values())
        if total > 0:
            weights = {t: w / total for t, w in weights.items()}
        else:
            weights = {t: 1.0 / len(tickers) for t in tickers}

        return weights

    @staticmethod
    def optimize_portfolio(positions: List[Dict]) -> Dict:
        """Full portfolio optimization with risk parity + Kelly."""
        returns_dict = {}
        for pos in positions:
            ticker = pos.get('ticker', '')
            returns = pos.get('returns', [])
            if ticker and returns:
                returns_dict[ticker] = np.array(returns)

        if not returns_dict:
            return {'error': 'No valid positions'}

        rp_weights = PortfolioOptimizer.risk_parity_weights(returns_dict)
        kelly_weights = PortfolioOptimizer.kelly_weights(returns_dict)

        # Blend: 60% risk parity + 40% Kelly
        blended = {}
        all_tickers = set(list(rp_weights.keys()) + list(kelly_weights.keys()))
        for t in all_tickers:
            rp = rp_weights.get(t, 0)
            kl = kelly_weights.get(t, 0)
            blended[t] = rp * 0.6 + kl * 0.4

        # Normalize
        total = sum(blended.values())
        if total > 0:
            blended = {t: w / total for t, w in blended.items()}

        return {
            'risk_parity': rp_weights,
            'kelly': kelly_weights,
            'blended': blended,
            'method': '60% Risk Parity + 40% Kelly',
        }


class ExecutionSimulator:
    """
    Simulates realistic execution with slippage and transaction costs.
    """
    SLIPPAGE_BPS = 5  # 5 basis points
    COMMISSION_BPS = 3  # 3 basis points
    SPREAD_BPS = 2  # 2 basis points (bid-ask)

    @staticmethod
    def simulate_execution(price: float, side: str, volume: float = 1000000,
                          avg_daily_volume: float = 10000000) -> Dict:
        """Simulate execution with realistic costs."""
        # Slippage based on order size relative to ADV
        size_impact = (volume / (avg_daily_volume + 1e-10)) ** 0.5 * 0.1
        total_bps = ExecutionSimulator.SLIPPAGE_BPS + ExecutionSimulator.COMMISSION_BPS + ExecutionSimulator.SPREAD_BPS
        total_cost_pct = (total_bps + size_impact * 100) / 100

        if side.upper() == 'BUY':
            exec_price = price * (1 + total_cost_pct / 100)
        else:
            exec_price = price * (1 - total_cost_pct / 100)

        return {
            'intent_price': price,
            'execution_price': float(exec_price),
            'slippage_bps': float(ExecutionSimulator.SLIPPAGE_BPS + size_impact * 100),
            'commission_bps': float(ExecutionSimulator.COMMISSION_BPS),
            'spread_bps': float(ExecutionSimulator.SPREAD_BPS),
            'total_cost_pct': float(total_cost_pct),
            'fill_probability': float(min(0.99, 1 - size_impact)),
        }

    @staticmethod
    def backtest_with_costs(prices: List[float], signals: List[int],
                           initial_capital: float = 100000) -> Dict:
        """Backtest with realistic execution costs."""
        capital = initial_capital
        position = 0
        trades = []
        equity_curve = [capital]

        for i in range(1, len(prices)):
            signal = signals[i] if i < len(signals) else 0
            price = prices[i]

            if signal == 1 and position == 0:
                # Buy
                exec_info = ExecutionSimulator.simulate_execution(price, 'BUY')
                exec_price = exec_info['execution_price']
                shares = int(capital * 0.95 / exec_price)  # 95% of capital
                if shares > 0:
                    cost = shares * exec_price
                    capital -= cost
                    position = shares
                    trades.append({'type': 'BUY', 'price': exec_price, 'shares': shares, 'cost': exec_info['total_cost_pct']})

            elif signal == -1 and position > 0:
                # Sell
                exec_info = ExecutionSimulator.simulate_execution(price, 'SELL')
                exec_price = exec_info['execution_price']
                revenue = position * exec_price
                capital += revenue
                trades.append({'type': 'SELL', 'price': exec_price, 'shares': position, 'cost': exec_info['total_cost_pct']})
                position = 0

            equity = capital + position * price
            equity_curve.append(equity)

        # Final metrics
        final_equity = equity_curve[-1]
        total_return = (final_equity / initial_capital - 1) * 100
        total_costs = sum(t.get('cost', 0) for t in trades)

        # Win rate
        wins = 0
        for i in range(0, len(trades) - 1, 2):
            if i + 1 < len(trades):
                if trades[i + 1]['price'] > trades[i]['price']:
                    wins += 1
        win_rate = wins / (len(trades) // 2) if len(trades) >= 2 else 0

        return {
            'total_return_pct': float(total_return),
            'total_trades': len(trades),
            'win_rate': float(win_rate),
            'total_cost_pct': float(total_costs),
            'final_equity': float(final_equity),
            'max_drawdown': float(max(0, 1 - min(equity_curve) / max(equity_curve)) * 100) if equity_curve else 0,
        }


# Singleton instances
multi_tf_engine = MultiTimeframeEngine()
regime_detector = RegimeDetector()
feature_selector = FeatureSelector()
ensemble_voter = EnsembleVoter()
live_retrainer = LiveRetrainer()
portfolio_optimizer = PortfolioOptimizer()
execution_simulator = ExecutionSimulator()
