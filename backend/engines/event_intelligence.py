from typing import Dict, List, Any
from dataclasses import dataclass
from datetime import datetime

@dataclass
class StructuredEvent:
    category: str
    subtype: str
    amount: float
    importance_score: float
    confidence: float
    source_reliability: float

class EventIntelligenceEngine:
    """
    Builds a hierarchical event ontology.
    Extracts structured events from raw text and filings.
    """
    
    def __init__(self):
        # Base ontology mappings
        self.ontology = {
            "Order Win": {
                "keywords": ["order", "contract", "tender", "loa", "letter of acceptance"],
                "base_importance": 0.8
            },
            "Results": {
                "keywords": ["q1", "q2", "q3", "q4", "financial results", "earnings"],
                "base_importance": 0.9
            },
            "Corporate Action": {
                "keywords": ["buyback", "bonus", "split", "dividend", "rights issue"],
                "base_importance": 0.7
            },
            "Fund Raising": {
                "keywords": ["preferential", "qip", "debt", "fund raising"],
                "base_importance": 0.6
            }
        }
        
    def parse_event(self, raw_text: str, source_rel: float = 0.9) -> StructuredEvent:
        """Parse raw announcement text into a StructuredEvent"""
        raw_text_lower = raw_text.lower()
        
        detected_category = "Unknown"
        importance = 0.1
        
        for cat, details in self.ontology.items():
            if any(kw in raw_text_lower for kw in details["keywords"]):
                detected_category = cat
                importance = details["base_importance"]
                break
                
        # Basic amount extraction (placeholder for NLP)
        amount = 0.0
        if "cr" in raw_text_lower:
            try:
                # Naive extraction just for structure
                words = raw_text_lower.split()
                idx = words.index("cr")
                if idx > 0:
                    val = words[idx-1].replace("₹", "").replace("rs", "").replace(",", "")
                    amount = float(val)
            except:
                pass
                
        return StructuredEvent(
            category=detected_category,
            subtype=detected_category, # Could be more granular
            amount=amount,
            importance_score=importance,
            confidence=0.85, # Base confidence
            source_reliability=source_rel
        )

event_intelligence_engine = EventIntelligenceEngine()
