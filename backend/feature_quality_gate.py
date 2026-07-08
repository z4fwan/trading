import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

class FeatureQualityGate:
    """
    Mandatory gate before features are passed to training.
    Rejects feature sets containing NaNs, constants, or excessive correlations.
    """
    
    def __init__(self, X: pd.DataFrame):
        self.X = X
        self.errors = []
        
    def _check_nans_and_infinities(self):
        null_counts = self.X.isnull().sum()
        cols_with_nulls = null_counts[null_counts > 0]
        if len(cols_with_nulls) > 0:
            self.errors.append(f"NaN Values: Found NaNs in features {list(cols_with_nulls.index)}")
            
        inf_counts = np.isinf(self.X).sum()
        cols_with_infs = inf_counts[inf_counts > 0]
        if len(cols_with_infs) > 0:
            self.errors.append(f"Infinite Values: Found Infs in features {list(cols_with_infs.index)}")
            
    def _check_constant_features(self):
        variances = self.X.var()
        constant_cols = variances[variances == 0].index
        if len(constant_cols) > 0:
            self.errors.append(f"Constant Values: Features {list(constant_cols)} have zero variance.")
            
    def _check_correlations(self, threshold: float = 0.98):
        # We only check correlations if columns are numeric
        numeric_df = self.X.select_dtypes(include=[np.number])
        if numeric_df.empty:
            return
            
        corr_matrix = numeric_df.corr().abs()
        upper_triangle = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
        
        high_corr = [column for column in upper_triangle.columns if any(upper_triangle[column] > threshold)]
        if len(high_corr) > 0:
            self.errors.append(f"Excessive Correlation: Features {high_corr} have > {threshold} correlation with other features.")
            
    def run_all_checks(self) -> Tuple[bool, List[str]]:
        self.errors = []
        
        self._check_nans_and_infinities()
        self._check_constant_features()
        self._check_correlations()
        
        passed = len(self.errors) == 0
        return passed, self.errors

def run_feature_quality_gate(X: pd.DataFrame) -> bool:
    """Enforces Feature Quality Gate. Raises exception if failed."""
    gate = FeatureQualityGate(X)
    passed, errors = gate.run_all_checks()
    if not passed:
        raise ValueError(f"FeatureQualityGate FAILED:\n" + "\n".join(errors))
    print("FeatureQualityGate: PASSED")
    return True
