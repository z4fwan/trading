"""
LLM Deep Analysis Engine
Uses local LLM (Llama 3.1 8B or Qwen2.5 7B via Ollama) for deep understanding
Falls back to cloud-based LLM (Groq/OpenRouter) when Ollama unavailable
Catches sarcasm, vague language, hidden implications, sector context
"""

import json
import re
import asyncio
import os
from typing import Dict, List, Optional
import httpx
from datetime import datetime

# LLM configuration
DEFAULT_LLM_MODEL = "llama3.1:8b"  # or "qwen2.5:7b" for faster inference
OLLAMA_BASE_URL = "http://localhost:11434"

# Cloud fallback configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

DEEP_ANALYSIS_PROMPT = """You are an expert Indian stock market analyst. Analyze this corporate announcement and output ONLY valid JSON.

ANNOUNCEMENT:
Company: {symbol}
Headline: {headline}
Full Text: {full_text}
Category: {category}
Current PE Ratio: {pe_ratio}
Sector: {sector}
Current Price: {current_price}
Today's Change %: {day_change_pct}
Volume Surge (vs avg): {volume_surge_ratio}x

Analyze at these levels:
1. LITERAL MEANING: What did the company actually say?
2. HIDDEN SIGNAL: What does this imply that the company didn't explicitly state?
3. MARKET IMPACT: How will institutions likely react? Consider PE context and TODAY'S MOMENTUM. If it's already heavily up on huge volume, the news might be fully priced in.
4. HISTORICAL PATTERN: Does this resemble past announcements that moved the stock?
5. MAGNITUDE ESTIMATE: Expected % move range

Output JSON (no markdown, no code blocks):
{
  "sentiment": "strongly_positive|positive|neutral|negative|strongly_negative",
  "sentiment_score": 0.0-1.0,
  "confidence": 0.0-1.0,
  "predicted_price_direction": "up|down|flat",
  "predicted_magnitude_range": {{"min": -5.0, "max": 8.0}},
  "momentum_signal": "strong_buy|buy|hold|avoid|sell",
  "signal_strength": 0.0-1.0,
  "reasoning": "Brief 1-sentence explanation",
  "key_phrases_detected": ["order win", "government contract"],
  "risk_flags": ["margin pressure", "one-time event"],
  "time_horizon": "intraday|swing|long_term"
}"""


class LLMDeepAnalyzer:
    """LLM-based deep analysis using local Ollama models"""
    
    def __init__(self, model: str = DEFAULT_LLM_MODEL, base_url: str = OLLAMA_BASE_URL):
        self.model = model
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=120.0)  # Long timeout for LLM
        self.available = False
        self.checked = False
        # Limit concurrent inference to prevent Ollama from crashing
        self.semaphore = asyncio.Semaphore(1)
        
    async def check_availability(self) -> bool:
        """Check if Ollama is running and model is available"""
        if self.checked:
            return self.available
            
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                model_names = [m.get("name", "") for m in models]
                self.available = any(self.model in name for name in model_names)
                if not self.available:
                    print(f"Model '{self.model}' not found. Available: {model_names}")
                    print("Run: ollama pull {self.model}")
            else:
                print(f"Ollama not responding at {self.base_url}")
                print("Start Ollama: ollama serve")
        except Exception as e:
            print(f"Failed to connect to Ollama: {e}")
            print("Start Ollama: ollama serve")
            
        self.checked = True
        return self.available
    
    def _extract_json(self, text: str) -> Optional[Dict]:
        """Extract JSON from LLM response (handles markdown code blocks)"""
        # Try to find JSON between curly braces
        json_match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Try to find JSON in markdown code block
        code_match = re.search(r'```json\s*([\s\S]*?)\s*```', text)
        if code_match:
            try:
                return json.loads(code_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try to parse entire text as JSON
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None
    
    async def analyze(self, 
                     symbol: str, 
                     headline: str, 
                     full_text: str = "",
                     category: str = "",
                     pe_ratio: Optional[float] = None,
                     sector: str = "",
                     current_price: str = "N/A",
                     day_change_pct: str = "N/A",
                     volume_surge_ratio: str = "N/A") -> Optional[Dict]:
        """
        Perform deep LLM analysis of an announcement
        
        Returns:
            Dict with LLM analysis results or None if analysis fails
        """
        # Try local Ollama first
        if await self.check_availability():
            return await self._analyze_with_ollama(
                symbol, headline, full_text, category, pe_ratio, sector,
                current_price, day_change_pct, volume_surge_ratio
            )
        
        # Fallback to cloud-based LLM
        return await self._analyze_with_cloud(
            symbol, headline, full_text, category, pe_ratio, sector,
            current_price, day_change_pct, volume_surge_ratio
        )
    
    async def _analyze_with_ollama(self,
                     symbol: str, 
                     headline: str, 
                     full_text: str = "",
                     category: str = "",
                     pe_ratio: Optional[float] = None,
                     sector: str = "",
                     current_price: str = "N/A",
                     day_change_pct: str = "N/A",
                     volume_surge_ratio: str = "N/A") -> Optional[Dict]:
        """Analyze using local Ollama instance"""
        
        # Prepare prompt
        prompt = DEEP_ANALYSIS_PROMPT.format(
            symbol=symbol,
            headline=headline[:500],
            full_text=full_text[:1000] if full_text else "No additional text available",
            category=category or "General",
            pe_ratio=pe_ratio if pe_ratio else "N/A",
            sector=sector or "Unknown",
            current_price=current_price,
            day_change_pct=day_change_pct,
            volume_surge_ratio=volume_surge_ratio
        )
        
        try:
            async with self.semaphore:
                response = await self.client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",  # Request JSON output
                        "options": {
                            "temperature": 0.1,  # Low temp for consistent analysis
                            "top_p": 0.9,
                            "num_predict": 500,
                        }
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    response_text = result.get("response", "")
                    
                    # Extract JSON from response
                    analysis = self._extract_json(response_text)
                    
                    if analysis:
                        return self._validate_analysis(analysis)
                    else:
                        print(f"Failed to extract JSON from Ollama response: {response_text[:200]}")
                else:
                    print(f"Ollama API error: {response.status_code} - {response.text[:200]}")
                    
        except Exception as e:
            print(f"Ollama analysis error: {e}")
        
        return None
    
    async def _analyze_with_cloud(self,
                     symbol: str, 
                     headline: str, 
                     full_text: str = "",
                     category: str = "",
                     pe_ratio: Optional[float] = None,
                     sector: str = "",
                     current_price: str = "N/A",
                     day_change_pct: str = "N/A",
                     volume_surge_ratio: str = "N/A") -> Optional[Dict]:
        """Fallback cloud-based LLM analysis using Groq or OpenRouter"""
        
        # Prepare prompt
        prompt = DEEP_ANALYSIS_PROMPT.format(
            symbol=symbol,
            headline=headline[:500],
            full_text=full_text[:1000] if full_text else "No additional text available",
            category=category or "General",
            pe_ratio=pe_ratio if pe_ratio else "N/A",
            sector=sector or "Unknown",
            current_price=current_price,
            day_change_pct=day_change_pct,
            volume_surge_ratio=volume_surge_ratio
        )
        
        # Try Groq first (faster, free tier available)
        if GROQ_API_KEY:
            return await self._analyze_with_groq(prompt)
        
        # Try OpenRouter as backup
        if OPENROUTER_API_KEY:
            return await self._analyze_with_openrouter(prompt)
        
        # No cloud API keys configured
        print("No cloud LLM API keys configured. LLM analysis unavailable. Using structural fallback.")
        return {
            "sentiment": "neutral",
            "confidence": 0.5,
            "summary": "LLM Analysis unavailable. Default structural fallback applied.",
            "impact_analysis": {"short_term": "Neutral", "long_term": "Neutral"},
            "key_factors": ["LLM Unavailable", "Awaiting manual review"],
            "risk_assessment": "Moderate",
            "trading_strategy": "Hold / Await signals"
        }
    
    async def _analyze_with_groq(self, prompt: str) -> Optional[Dict]:
        """Analyze using Groq API (fast, free tier)"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": "llama-3.1-8b-instant",
                        "messages": [
                            {"role": "system", "content": "You are an expert Indian stock market analyst. Output ONLY valid JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 500
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    analysis = self._extract_json(content)
                    if analysis:
                        print(f"[Groq] LLM analysis successful")
                        return self._validate_analysis(analysis)
                else:
                    print(f"[Groq] API error: {response.status_code}")
        except Exception as e:
            print(f"[Groq] Error: {e}")
        
        return None
    
    async def _analyze_with_openrouter(self, prompt: str) -> Optional[Dict]:
        """Analyze using OpenRouter API (supports multiple models)"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://github.com/z4fwan/trading",
                        "X-Title": "Trading AI Analyzer"
                    },
                    json={
                        "model": "meta-llama/llama-3.1-8b-instruct:free",
                        "messages": [
                            {"role": "system", "content": "You are an expert Indian stock market analyst. Output ONLY valid JSON."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.1,
                        "max_tokens": 500
                    }
                )
                
                if response.status_code == 200:
                    result = response.json()
                    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                    analysis = self._extract_json(content)
                    if analysis:
                        print(f"[OpenRouter] LLM analysis successful")
                        return self._validate_analysis(analysis)
                else:
                    print(f"[OpenRouter] API error: {response.status_code}")
        except Exception as e:
            print(f"[OpenRouter] Error: {e}")
        
        return None
    
    def _validate_analysis(self, analysis: Dict) -> Dict:
        """Validate and add defaults for missing fields in LLM analysis"""
        analysis.setdefault("sentiment", "neutral")
        analysis.setdefault("sentiment_score", 0.5)
        analysis.setdefault("confidence", 0.5)
        analysis.setdefault("predicted_price_direction", "flat")
        analysis.setdefault("predicted_magnitude_range", {"min": -2.0, "max": 2.0})
        analysis.setdefault("momentum_signal", "hold")
        analysis.setdefault("signal_strength", 0.5)
        analysis.setdefault("reasoning", "No analysis provided")
        analysis.setdefault("key_phrases_detected", [])
        analysis.setdefault("risk_flags", [])
        analysis.setdefault("time_horizon", "swing")
        
        # Ensure numeric fields are valid
        analysis["sentiment_score"] = max(0, min(1, float(analysis.get("sentiment_score", 0.5))))
        analysis["confidence"] = max(0, min(1, float(analysis.get("confidence", 0.5))))
        analysis["signal_strength"] = max(0, min(1, float(analysis.get("signal_strength", 0.5))))
        
        return analysis
    
    async def analyze_batch(self, announcements: List[Dict]) -> List[Dict]:
        """Analyze a batch of announcements with LLM"""
        results = []
        for ann in announcements:
            analysis = await self.analyze(
                symbol=ann.get("symbol", ""),
                headline=ann.get("headline", ""),
                full_text=ann.get("full_text", ""),
                category=ann.get("category", ""),
                pe_ratio=ann.get("pe_ratio"),
                sector=ann.get("sector", "")
            )
            
            if analysis:
                results.append({
                    **ann,
                    "llm_analysis": analysis,
                    "llm_model_used": self.model,
                })
            else:
                results.append(ann)
        
        return results


# Global instance
_llm_analyzer: Optional[LLMDeepAnalyzer] = None

def get_llm_analyzer(model: str = DEFAULT_LLM_MODEL) -> LLMDeepAnalyzer:
    """Get or create global LLM analyzer instance"""
    global _llm_analyzer
    if _llm_analyzer is None or _llm_analyzer.model != model:
        _llm_analyzer = LLMDeepAnalyzer(model)
    return _llm_analyzer


async def analyze_with_llm(symbol: str, headline: str, **kwargs) -> Optional[Dict]:
    """Convenience function for LLM analysis"""
    analyzer = get_llm_analyzer()
    return await analyzer.analyze(symbol, headline, **kwargs)