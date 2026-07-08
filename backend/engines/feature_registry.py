from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class RegisteredFeature:
    name: str
    version: str
    description: str
    created_at: str
    importance: float
    leakage_tested: bool
    is_stable: bool
    used_by: List[str]

class AlphaFeatureRegistry:
    """
    Registry for all alpha features.
    Every feature must register itself before being used in the Model Arena.
    """
    
    def __init__(self):
        self.features: Dict[str, RegisteredFeature] = {}
        
    def register_feature(self, name: str, version: str, description: str, used_by: List[str]) -> None:
        """Register a new feature into the system"""
        self.features[name] = RegisteredFeature(
            name=name,
            version=version,
            description=description,
            created_at=datetime.now().isoformat(),
            importance=0.0, # Computed later via Information Gain Engine
            leakage_tested=False, # Needs explicit validation pass
            is_stable=True,
            used_by=used_by
        )
        
    def update_importance(self, name: str, importance: float) -> None:
        if name in self.features:
            self.features[name].importance = importance
            
    def mark_leakage_tested(self, name: str) -> None:
        if name in self.features:
            self.features[name].leakage_tested = True
            
    def get_active_features(self) -> List[RegisteredFeature]:
        """Return features that are stable and have proven importance"""
        return [f for f in self.features.values() if f.is_stable and (f.importance > 0.0 or not f.leakage_tested)]
        
    def remove_useless_features(self, min_importance: float = 0.001) -> List[str]:
        """Strip features that fail to provide information gain"""
        removed = []
        for name, feat in list(self.features.items()):
            if feat.leakage_tested and feat.importance < min_importance:
                feat.is_stable = False
                removed.append(name)
        return removed

# Global singleton
feature_registry = AlphaFeatureRegistry()
