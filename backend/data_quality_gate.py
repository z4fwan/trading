import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

class DataQualityGate:
    """
    Mandatory gate before any dataset enters training.
    Rejects the dataset entirely if ANY critical check fails.
    """
    
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.errors = []
        
    def _check_missing_values(self):
        null_counts = self.df.isnull().sum()
        critical_cols = ['open', 'high', 'low', 'close', 'volume', 'date', 'ticker']
        for col in critical_cols:
            if col in self.df.columns and null_counts[col] > 0:
                self.errors.append(f"Missing Values: {null_counts[col]} NaNs found in '{col}'.")
                
    def _check_duplicates(self):
        if 'date' in self.df.columns and 'ticker' in self.df.columns:
            dupes = self.df.duplicated(subset=['date', 'ticker']).sum()
            if dupes > 0:
                self.errors.append(f"Duplicate Rows: {dupes} identical (date, ticker) rows found.")
                
    def _check_ohlc_validity(self):
        if all(col in self.df.columns for col in ['open', 'high', 'low', 'close']):
            invalid = self.df[
                (self.df['high'] < self.df['low']) | 
                (self.df['high'] < self.df['open']) | 
                (self.df['high'] < self.df['close']) | 
                (self.df['low'] > self.df['open']) | 
                (self.df['low'] > self.df['close'])
            ]
            if len(invalid) > 0:
                self.errors.append(f"OHLC Validity: {len(invalid)} rows have impossible High/Low bounds.")
                
    def _check_volume(self):
        if 'volume' in self.df.columns:
            negative_vol = len(self.df[self.df['volume'] < 0])
            if negative_vol > 0:
                self.errors.append(f"Volume Validation: {negative_vol} rows have negative volume.")
                
    def run_all_checks(self) -> Tuple[bool, List[str]]:
        """Run all data quality checks. Returns (Passed, List of Errors)"""
        self.errors = []
        
        self._check_missing_values()
        self._check_duplicates()
        self._check_ohlc_validity()
        self._check_volume()
        # Add checks for corporate actions, timezone consistency, etc. as data matures
        
        passed = len(self.errors) == 0
        return passed, self.errors

def run_data_quality_gate(df: pd.DataFrame) -> bool:
    """Enforces Data Quality Gate. Raises exception if failed."""
    gate = DataQualityGate(df)
    passed, errors = gate.run_all_checks()
    if not passed:
        raise ValueError(f"DataQualityGate FAILED:\n" + "\n".join(errors))
    print("DataQualityGate: PASSED")
    return True
