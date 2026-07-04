"""
Machine Learning Ensemble - Institutional Grade
Gradient Boosted Trees + Calibration for probability prediction
Trained on historical events, technical features, and outcomes
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import joblib
from pathlib import Path

try:
    from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.isotonic import IsotonicRegression
    from sklearn.model_selection import TimeSeriesSplit, cross_val_score
    from sklearn.metrics import brier_score_loss, roc_auc_score, precision_recall_curve
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    import lightgbm as lgb
    HAS_LIGHTGBM = True
except ImportError:
    HAS_LIGHTGBM = False

class MLEnsemble:
    """
    Machine Learning Ensemble for trading probability prediction
    
    Uses gradient boosted trees with probability calibration
    Trained on historical events and their outcomes
    """
    
    def __init__(self, model_path: str = "models/ml_ensemble"):
        self.model_path = Path(model_path)
        self.model_path.mkdir(parents=True, exist_ok=True)
        
        # Feature columns
        self.feature_columns = [
            # News features
            'news_sentiment_score',
            'news_urgency',
            'news_relevance',
            'event_type_encoded',
            'source_tier',
            
            # Technical features
            'rsi',
            'macd_signal',
            'trend_score',
            'momentum_score',
            'volume_score',
            'volatility_percentile',
            'atr_percent',
            'price_vs_vwap',
            
            # Market regime features
            'market_regime_encoded',
            'vix_level',
            'advance_decline_ratio',
            'sector_strength',
            
            # Company features
            'market_cap_log',
            'liquidity_score',
            'beta',
            'relative_strength',
            
            # Historical features
            'historical_win_rate',
            'similar_event_count',
            'days_since_last_event',
            
            # Options features (if available)
            'option_volume_ratio',
            'put_call_ratio',
            'iv_rank',
        ]
        
        # Model components
        self.model = None
        self.calibrator = None
        self.scaler = None
        self.feature_importance = None
        
        # Training history
        self.training_history = []
        
    def create_feature_vector(self, event_data: Dict) -> np.ndarray:
        """
        Convert event data into feature vector for ML model
        
        Args:
            event_data: Dictionary containing all event information
            
        Returns:
            numpy array of features in correct order
        """
        features = np.zeros(len(self.feature_columns))
        
        # News features
        features[0] = event_data.get('sentiment_score', 0.5)
        features[1] = event_data.get('urgency', 50)
        features[2] = event_data.get('relevance', 50)
        features[3] = self._encode_event_type(event_data.get('event_type', 'GENERAL'))
        features[4] = event_data.get('source_tier', 2)
        
        # Technical features
        tech = event_data.get('technical', {})
        features[5] = tech.get('rsi', 50)
        features[6] = tech.get('macd_signal', 0)
        features[7] = tech.get('trend_score', 50)
        features[8] = tech.get('momentum_score', 50)
        features[9] = tech.get('volume_score', 50)
        features[10] = tech.get('volatility_percentile', 50)
        features[11] = tech.get('atr_percent', 1.0)
        features[12] = tech.get('price_vs_vwap', 1.0)
        
        # Market regime features
        market = event_data.get('market', {})
        features[13] = self._encode_market_regime(market.get('regime', 'SIDEWAYS'))
        features[14] = market.get('vix', 15)
        features[15] = market.get('advance_decline', 1.0)
        features[16] = market.get('sector_strength', 50)
        
        # Company features
        company = event_data.get('company', {})
        features[17] = np.log1p(company.get('market_cap', 10000))
        features[18] = company.get('liquidity', 50)
        features[19] = company.get('beta', 1.0)
        features[20] = company.get('relative_strength', 50)
        
        # Historical features
        historical = event_data.get('historical', {})
        features[21] = historical.get('win_rate', 50)
        features[22] = historical.get('similar_count', 0)
        features[23] = historical.get('days_since_event', 30)
        
        # Options features
        options = event_data.get('options', {})
        features[24] = options.get('volume_ratio', 1.0)
        features[25] = options.get('put_call_ratio', 1.0)
        features[26] = options.get('iv_rank', 50)
        
        return features
    
    def predict_probability(self, event_data: Dict) -> Tuple[float, Dict]:
        """
        Predict probability of positive outcome
        
        Args:
            event_data: Event information
            
        Returns:
            (probability, explanation_dict)
        """
        if self.model is None:
            # Fallback to rule-based if model not trained
            return self._fallback_prediction(event_data)
        
        # Create feature vector
        features = self.create_feature_vector(event_data)
        features_scaled = self.scaler.transform([features])
        
        # Get raw prediction
        raw_pred = self.model.predict_proba(features_scaled)[0][1]
        
        # Calibrate if calibrator available
        if self.calibrator is not None:
            calibrated_pred = self.calibrator.predict_proba(features_scaled)[0][1]
        else:
            calibrated_pred = raw_pred
        
        # Calculate feature importance for this prediction
        explanation = self._explain_prediction(features_scaled)
        
        return calibrated_pred, explanation
    
    def _explain_prediction(self, features_scaled: np.ndarray) -> Dict:
        """
        Explain prediction using feature importance
        
        Returns dict of feature contributions
        """
        if self.feature_importance is None:
            return {}
        
        # Simple feature contribution (feature_value * importance)
        contributions = {}
        for i, col in enumerate(self.feature_columns):
            contribution = features_scaled[0][i] * self.feature_importance[i]
            contributions[col] = round(contribution, 4)
        
        # Group by category
        explanation = {
            'news_contribution': sum(v for k, v in contributions.items() if k.startswith('news')),
            'technical_contribution': sum(v for k, v in contributions.items() if k.startswith(('rsi', 'macd', 'trend', 'momentum', 'volume', 'volatility', 'atr', 'price'))),
            'market_contribution': sum(v for k, v in contributions.items() if k.startswith(('market', 'vix', 'advance', 'sector'))),
            'company_contribution': sum(v for k, v in contributions.items() if k.startswith(('market_cap', 'liquidity', 'beta', 'relative'))),
            'historical_contribution': sum(v for k, v in contributions.items() if k.startswith('historical')),
            'options_contribution': sum(v for k, v in contributions.items() if k.startswith('option')),
        }
        
        return explanation
    
    def train(self, training_data: pd.DataFrame, validation_data: pd.DataFrame = None):
        """
        Train ML ensemble on historical data
        
        Args:
            training_data: DataFrame with features and target (1 if profitable, 0 if not)
            validation_data: Optional out-of-sample validation data
        """
        if not HAS_SKLEARN:
            print("scikit-learn not available, skipping ML training")
            return
        
        # Prepare features and target
        X_train = training_data[self.feature_columns].values
        y_train = training_data['target'].values
        
        # Scale features
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        
        # Train gradient boosting model
        if HAS_LIGHTGBM:
            self.model = lgb.LGBMClassifier(
                n_estimators=500,
                learning_rate=0.01,
                max_depth=6,
                num_leaves=31,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                n_jobs=-1
            )
        else:
            self.model = GradientBoostingClassifier(
                n_estimators=200,
                learning_rate=0.01,
                max_depth=5,
                subsample=0.8,
                random_state=42
            )
        
        self.model.fit(X_train_scaled, y_train)
        
        # Calibrate probabilities using isotonic regression
        self.calibrator = CalibratedClassifierCV(
            self.model,
            method='isotonic',
            cv=5
        )
        self.calibrator.fit(X_train_scaled, y_train)
        
        # Extract feature importance
        self.feature_importance = self.model.feature_importances_
        
        # Validate on training data
        train_pred = self.model.predict_proba(X_train_scaled)[:, 1]
        train_brier = brier_score_loss(y_train, train_pred)
        train_auc = roc_auc_score(y_train, train_pred)
        
        print(f"Training Results:")
        print(f"  Brier Score: {train_brier:.4f}")
