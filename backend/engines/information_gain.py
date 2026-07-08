import numpy as np
import pandas as pd
from typing import Dict, List, Any
from sklearn.metrics import roc_auc_score, log_loss, brier_score_loss

class InformationGainEngine:
    """
    Evaluates whether a new feature provides out-of-sample predictive power.
    Professional quant firms remove more features than they add.
    """
    
    def __init__(self):
        pass
        
    def evaluate_feature_gain(self, base_model: Any, new_model: Any, X_test_base: np.ndarray, X_test_new: np.ndarray, y_test: np.ndarray) -> Dict:
        """
        Evaluate if adding a new feature actually improves out-of-sample metrics.
        Returns a dict of metric improvements.
        """
        # Baseline predictions
        base_preds = base_model.predict_proba(X_test_base)[:, 1]
        base_auc = roc_auc_score(y_test, base_preds)
        base_logloss = log_loss(y_test, base_preds)
        base_brier = brier_score_loss(y_test, base_preds)
        
        # New model predictions
        new_preds = new_model.predict_proba(X_test_new)[:, 1]
        new_auc = roc_auc_score(y_test, new_preds)
        new_logloss = log_loss(y_test, new_preds)
        new_brier = brier_score_loss(y_test, new_preds)
        
        # Calculate Gain
        # Note: Lower logloss/brier is better, so base - new is positive gain.
        gain = {
            'auc_improvement': new_auc - base_auc,
            'logloss_improvement': base_logloss - new_logloss,
            'brier_improvement': base_brier - new_brier
        }
        
        # A feature provides overall information gain if it improves AUC or significantly drops Log Loss
        gain['has_information_gain'] = (gain['auc_improvement'] > 0.005) or (gain['logloss_improvement'] > 0.01)
        
        return gain

info_gain_engine = InformationGainEngine()
