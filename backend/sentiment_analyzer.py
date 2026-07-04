"""
FinBERT-India Sentiment Analyzer
Uses India-specific FinBERT model fine-tuned on Indian financial news
Provides fast sentiment classification (200ms per announcement)
"""

from typing import Dict, List, Optional, Tuple
try:
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    import torch
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

import numpy as np
from datetime import datetime

class FinBERTIndiaAnalyzer:
    """India-specific FinBERT sentiment analyzer for NSE/BSE announcements"""
    
    def __init__(self, model_name: str = "Vansh180/FinBERT-India-v1"):
        self.model_name = model_name
        if HAS_TRANSFORMERS:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = "cpu"
        self.pipeline = None
        self.tokenizer = None
        self.model = None
        self.loaded = False
        self.fallback_keywords = self._init_fallback_keywords()
        
    def _init_fallback_keywords(self) -> Dict[str, List[str]]:
        """Initialize fallback keyword-based classifier (used if model fails to load)"""
        return {
            "positive": [
                "award of contract", "order win", "received order", "bagged order",
                "execution of", "mou", "joint venture", "acquisition", "strategic investment",
                "secures", "lands", "contract from", "export order", "letter of award",
                "emerging as lowest bidder", "l1 bidder", "won order", "strategic partnership",
                "capacity expansion", "new plant", "commissioning", "debt reduction",
                "loan repayment", "credit rating upgrade", "dividend", "bonus issue",
                "stock split", "buyback", "insider buying", "promoter buying",
                "revenue growth", "profit increase", "margin expansion", "record high",
                "regulatory approval", "license received", "patent granted", "fda approval",
                "merger approval", "demerger", "listing", "index inclusion", "upgrade",
                "target price hike", "analyst upgrade", "positive outlook", "bagged",
                "received letter of award", "emerged as l1", "secured order",
                "won bid", "selected as", "awarded", "finalized", "approved"
            ],
            "negative": [
                "investigation", "show cause", "default", "delisting", "regulatory",
                "penalty", "fine", "fraud", "lawsuit", "legal notice", "forensic audit",
                "insider trading", "sebi notice", "compliance failure", "suspension",
                "trading ban", "price manipulation", "circuit filter", "lower circuit",
                "debt default", "loan default", "credit downgrade", "rating downgrade",
                "loss", "revenue decline", "margin contraction", "profit warning",
                "foreclosure", "insolvency", "liquidation", "winding up", "strike",
                "factory shutdown", "environmental notice", "pollution", "accident",
                "resignation", "ceo resignation", "cfo resignation", "auditor resignation",
                "pledge invocation", "promoter pledge", "encumbrance", "lien",
                "adverse", "warning", "caution", "risk", "uncertainty", "delay",
                "postponed", "cancelled", "terminated", "withdrawn", "rejected"
            ],
            "neutral": [
                "board meeting", "record date", "ex-date", "ex-dividend", "agm", "egm",
                "notice", "intimation", "disclosure", "filing", "compliance", "routine",
                "appointment", "re-appointment", "consolidation", "sub-division",
                "change in director", "kmp", "company secretary", "authorized signatory",
                "update", "information", "clarification", "corrigendum", "erratum"
            ]
        }
    
    def load_model(self) -> bool:
        """Load FinBERT-India model"""
        if not HAS_TRANSFORMERS:
            print("transformers or torch not installed. Falling back to keyword-based sentiment analysis")
            return False
        try:
            print(f"Loading FinBERT-India model from {self.model_name}...")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
            self.model.to(self.device)
            self.model.eval()
            
            self.pipeline = pipeline(
                "text-classification",
                model=self.model,
                tokenizer=self.tokenizer,
                device=0 if self.device == "cuda" else -1,
                truncation=True,
                max_length=512
            )
            
            self.loaded = True
            print(f"FinBERT-India loaded successfully on {self.device}")
            return True
            
        except Exception as e:
            print(f"Failed to load FinBERT-India model: {e}")
            print("Falling back to keyword-based sentiment analysis")
            return False
    
    def _fallback_sentiment(self, text: str) -> Dict[str, any]:
        """Keyword-based fallback sentiment analysis"""
        text_lower = text.lower()
        
        scores = {"positive": 0, "negative": 0, "neutral": 0}
        matched_keywords = {"positive": [], "negative": [], "neutral": []}
        
        for label, keywords in self.fallback_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    scores[label] += 1
                    matched_keywords[label].append(keyword)
        
        # Determine sentiment
        if scores["positive"] > scores["negative"]:
            if scores["positive"] > scores["neutral"]:
                sentiment = "Positive"
                confidence = min(0.95, 0.5 + scores["positive"] * 0.15)
            else:
                sentiment = "Neutral"
                confidence = 0.5 + abs(scores["positive"] - scores["neutral"]) * 0.05
        elif scores["negative"] > scores["positive"]:
            if scores["negative"] > scores["neutral"]:
                sentiment = "Negative"
                confidence = min(0.95, 0.5 + scores["negative"] * 0.15)
            else:
                sentiment = "Neutral"
                confidence = 0.5 + abs(scores["negative"] - scores["neutral"]) * 0.05
        else:
            sentiment = "Neutral"
            confidence = 0.5
        
        return {
            "label": sentiment,
            "score": round(confidence, 4),
            "matched_keywords": matched_keywords,
            "model_used": "fallback_keyword"
        }
    
    def analyze_sentiment(self, text: str, full_text: str = "") -> Dict[str, any]:
        """
        Analyze sentiment of announcement text
        
        Args:
            text: Headline or short text
            full_text: Optional full announcement text (from PDF)
            
        Returns:
            Dict with sentiment label, confidence score, and metadata
        """
        if not text:
            return {
                "label": "Neutral",
                "score": 0.5,
                "model_used": "empty_input"
            }
        
        # Use headline + first 500 chars of full text if available
        analysis_text = text
        if full_text:
            analysis_text = f"{text}\n\n{full_text[:500]}"
        
        # Try FinBERT model first
        if self.loaded and self.pipeline:
            try:
                result = self.pipeline(analysis_text[:1000])[0]  # Limit length
                return {
                    "label": result["label"],
                    "score": round(result["score"], 4),
                    "model_used": "finbert_india",
                    "inference_time_ms": None  # Could add timing
                }
            except Exception as e:
                print(f"FinBERT inference error: {e}")
                return self._fallback_sentiment(text)
        
        # Fallback to keyword-based
        return self._fallback_sentiment(text)
    
    def analyze_batch(self, announcements: List[Dict]) -> List[Dict]:
        """Analyze sentiment for a batch of announcements"""
        results = []
        for ann in announcements:
            sentiment = self.analyze_sentiment(
                ann.get("headline", ""),
                ann.get("full_text", "")
            )
            results.append({
                **ann,
                "finbert_sentiment": sentiment["label"],
                "finbert_confidence": sentiment["score"],
                "sentiment_model_used": sentiment["model_used"],
            })
        return results
    
    def get_embedding(self, text: str) -> Optional[np.ndarray]:
        """Get sentence embedding for historical similarity matching"""
        if not self.loaded or not self.model:
            return None
        
        try:
            inputs = self.tokenizer(
                text[:512],
                return_tensors="pt",
                truncation=True,
                padding=True,
                max_length=512
            ).to(self.device)
            
            with torch.no_grad():
                outputs = self.model(**inputs)
                # Use pooled output or mean of last hidden state
                embeddings = outputs.pooler_output if hasattr(outputs, 'pooler_output') else outputs.logits
            
            return embeddings.cpu().numpy()[0]
        except Exception as e:
            print(f"Embedding error: {e}")
            return None


# Global instance
_sentiment_analyzer: Optional[FinBERTIndiaAnalyzer] = None

def get_sentiment_analyzer() -> FinBERTIndiaAnalyzer:
    """Get or create global sentiment analyzer instance"""
    global _sentiment_analyzer
    if _sentiment_analyzer is None:
        _sentiment_analyzer = FinBERTIndiaAnalyzer()
        _sentiment_analyzer.load_model()
    return _sentiment_analyzer


def analyze_announcement_sentiment(headline: str, full_text: str = "") -> Dict:
    """Convenience function to analyze a single announcement"""
    analyzer = get_sentiment_analyzer()
    return analyzer.analyze_sentiment(headline, full_text)