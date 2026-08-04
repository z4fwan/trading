import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

BASE_URL = "https://dalalai.com/api/v1"


class DalalAIClient:
    """
    Real DalalAI REST API Client (https://dalalai.com/docs/api).

    All endpoints require an `X-API-Key` header. The key is read from the
    DALALAI_API_KEY env var at construction time. If no key is configured the
    client is inert (all methods return empty payloads) so the poller simply
    idles instead of emitting fake predictions.
    """

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or os.getenv("DALALAI_API_KEY", "")
        self._last_etag = None
        self.calls_this_month = 0

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    async def _get(self, endpoint: str, params: Optional[Dict] = None) -> Tuple[int, dict, str]:
        """GET an endpoint with X-API-Key + conditional ETag. Returns (status, json, etag)."""
        if not self.enabled:
            return 200, {}, ""
        try:
            import httpx
            headers = {"X-API-Key": self.api_key}
            if self._last_etag:
                headers["If-None-Match"] = self._last_etag
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{BASE_URL}/{endpoint}", params=params, headers=headers)
            etag = resp.headers.get("ETag", "")
            if resp.status_code == 304:
                return 304, {}, etag
            if resp.status_code == 429:
                logger.warning("DalalAI API: rate limit exceeded")
                return 429, {}, etag
            if resp.status_code == 403:
                logger.warning("DalalAI API: quota exhausted or tier restriction (%s)", endpoint)
                return 403, {}, etag
            resp.raise_for_status()
            return resp.status_code, resp.json(), etag
        except Exception as e:
            logger.warning("DalalAI API request failed (%s): %s", endpoint, e)
            return 500, {}, ""

    async def get_predictions(self, if_none_match: Optional[str] = None) -> Tuple[int, Dict, str]:
        """
        GET /api/v1/convergence — multi-signal convergence scores (0-100).
        Returns: (status_code, {"data": [ {symbol, prediction, confidence, convergence, dvm_score} ]}, etag)
        """
        if not self.enabled:
            return 200, {"data": []}, ""
        self.calls_this_month += 1
        if if_none_match:
            self._last_etag = if_none_match
        status, body, etag = await self._get("convergence", params={"limit": 50})
        if status == 304:
            return 304, {}, etag
        data = []
        raw = (body or {}).get("data", {})
        rows = raw.get("top_20", []) if isinstance(raw, dict) else []
        for row in rows:
            symbol = (row.get("symbol") or "").upper()
            if not symbol:
                continue
            convergence = float(row.get("convergence_score", 0) or 0)
            confidence = float(row.get("confidence", convergence) or convergence)
            # DVM-style direction proxy: high convergence leans bullish, low bearish
            prediction = "BULLISH" if convergence >= 70 else "BEARISH"
            data.append({
                "symbol": symbol,
                "prediction": prediction,
                "confidence": min(confidence, 95),
                "dvm_score": convergence,
                "convergence": convergence,
                "signals_active": int(row.get("signals_active", 0) or 0),
            })
        return status, {"data": data}, etag

    async def get_options_flow(self, symbol: str) -> Dict:
        """GET /api/v3/options-flow/{symbol} (Enterprise tier). Falls back to empty dict."""
        if not self.enabled:
            return {}
        status, body, _ = await self._get(f"options-flow/{symbol}")
        if status == 304:
            return {}
        return (body or {}).get("data", body) or {}

    async def get_convergence(self) -> Dict:
        """GET /api/v1/convergence — raw response passthrough."""
        if not self.enabled:
            return {"status": "ok", "message": "DalalAI not configured (DALALAI_API_KEY missing)"}
        status, body, _ = await self._get("convergence")
        return body or {}
