import asyncio
import logging
import random
from datetime import datetime
from backend.dalalai_client import DalalAIClient
from backend.engines.options_engine import options_engine

logger = logging.getLogger(__name__)

class DalaiPoller:
    def __init__(self):
        self._task = None
        self.client = DalalAIClient()
        self.last_etag = None
        
        # Simulated trailing 30-day accuracy for dynamic weighting (Layer 9)
        self.v7_acc = 0.74
        self.dalalai_acc = 0.62
        
        # Reasoning templates provided by user
        self.reasoning_templates = {
            "CONFIRMED_HIGH": (
                "V7 deep sequence engine detected {direction} momentum on {symbol}, "
                "and DalalAI's 15-model ensemble confirms with {dalalai_confidence}% confidence "
                "and a convergence score of {convergence}/100 — strong multi-model alignment."
            ),
            "CONFIRMED_MED": (
                "V7 shows {direction} setup on {symbol} at {price}. "
                "DalalAI aligns {direction} ({dalalai_confidence}% confident) but convergence is "
                "only {convergence}/100 — moderate conviction."
            ),
            "CONFLICT": (
                "⚠️ Signal divergence on {symbol}: V7 reads {v7_direction} at {v7_confidence}% "
                "but DalalAI predicts {dalalai_direction} ({dalalai_confidence}%). "
                "Convergence score {convergence}/100 — manual review recommended."
            ),
            "BREAKOUT": (
                "🚀 Breakout signal on {symbol} detected by DalalAI's scanner. "
                "Current price {price} with volume {volume}. "
                "V7 engine confirms {direction} setup — confluence at {confidence}%."
            )
        }

    async def start(self, app=None):
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("DalaiPoller started")

    async def stop(self):
        if self._task:
            self._task.cancel()
        logger.info("DalaiPoller stopped")

    def fuse_signals(self, v7_signal: dict, dalalai_signal: dict, options_eval: dict = None) -> dict:
        """
        v7_signal: {"direction": "BULLISH"/"BEARISH", "confidence": float}
        dalalai_signal: {"prediction": "BULLISH"/"BEARISH", "confidence": float, "convergence": int}
        """
        # LAYER 9: Dynamic Model Weights
        total_acc = self.v7_acc + self.dalalai_acc
        v7_weight = self.v7_acc / total_acc if total_acc > 0 else 0.6
        dalalai_weight = self.dalalai_acc / total_acc if total_acc > 0 else 0.4
        
        combined_confidence = (
            v7_signal["confidence"] * v7_weight +
            dalalai_signal["confidence"] * dalalai_weight
        )
        
        # LAYER 6: Options Intelligence Boost
        if options_eval:
            combined_confidence += (options_eval["confidence_boost"] * 100)
        
        v7_direction = v7_signal["direction"].upper()
        dalalai_direction = dalalai_signal["prediction"].upper()
        
        tiebreaker_used = False
        winner = None
        
        if v7_direction == dalalai_direction:
            # CONFIRMED
            combined_confidence = min(combined_confidence * 1.25, 100)
            agreement = "CONFIRMED"
        else:
            # CONFLICT -> LAYER 9 Tiebreaker Model
            agreement = "CONFLICT"
            tiebreaker_used = True
            
            # Tertiary Referees (Simulated FinBERT & Options Flow)
            v7_votes = 0
            dalalai_votes = 0
            
            # 1. Options Flow Direction
            if options_eval and "BULLISH" in options_eval["signal"]:
                if v7_direction == "BULLISH": v7_votes += 1
                elif dalalai_direction == "BULLISH": dalalai_votes += 1
            elif options_eval and "BEARISH" in options_eval["signal"]:
                if v7_direction == "BEARISH": v7_votes += 1
                elif dalalai_direction == "BEARISH": dalalai_votes += 1
                
            # 2. Simulated FinBERT Sentiment (Mocked randomly for now)
            finbert_bullish = random.random() > 0.5
            if finbert_bullish:
                if v7_direction == "BULLISH": v7_votes += 1
                elif dalalai_direction == "BULLISH": dalalai_votes += 1
            else:
                if v7_direction == "BEARISH": v7_votes += 1
                elif dalalai_direction == "BEARISH": dalalai_votes += 1
                
            # Evaluate Tiebreaker
            if v7_votes > dalalai_votes:
                winner = "V7"
                combined_confidence = v7_signal["confidence"] * 0.8  # Still penalize slightly
                v7_direction = v7_direction # Stays V7
            elif dalalai_votes > v7_votes:
                winner = "DalalAI"
                combined_confidence = dalalai_signal["confidence"] * 0.8
                v7_direction = dalalai_direction # Override V7
            else:
                winner = "SPLIT"
                combined_confidence *= 0.5
            
        return {
            "symbol": v7_signal["symbol"],
            "direction": v7_direction,
            "confidence": min(round(combined_confidence, 1), 100),
            "agreement": agreement,
            "v7_confidence": v7_signal["confidence"],
            "v7_weight": v7_weight,
            "dalalai_prediction": dalalai_direction,
            "dalalai_confidence": dalalai_signal["confidence"],
            "dalalai_weight": dalalai_weight,
            "convergence_score": dalalai_signal.get("convergence", 0),
            "tiebreaker_used": tiebreaker_used,
            "tiebreaker_winner": winner
        }

    async def fetch_predictions(self):
        status, response, etag = await self.client.get_predictions(if_none_match=self.last_etag)
        if status == 304:
            logger.info("DalalAI API: 304 Not Modified. Skipping fusion.")
            return []
        if status == 429 or status == 403:
            logger.warning("DalalAI API: quota/rate restricted (%s). Skipping fusion.", status)
            return []
        if status == 304:
            return []
            
        self.last_etag = etag
        return response.get("data", [])

    async def _poll_loop(self):
        # Allow server to fully start
        await asyncio.sleep(10)
        
        # Late import to prevent circular dependency
        from backend.main import predict_probability, PredictionRequest, get_market_context, send_telegram_alert, is_nse_signal_window
        
        if not self.client.enabled:
            logger.info("DalalAI poller idle: DALALAI_API_KEY not configured (mock disabled, no alerts will be sent).")
            return
        
        # Only alert each ticker once per NSE session (prevents 15-min repeat spam).
        alerted_today = set()
        
        while True:
            try:
                dalalai_data = await self.fetch_predictions()
                
                # We only want to process top signals (e.g. convergence > 70 or conflicts)
                # to avoid spamming alerts for all 50 stocks.
                for sig in dalalai_data:
                    # Filter for interesting setups
                    is_breakout = sig.get("convergence", 0) > 85
                    is_strong = sig.get("confidence", 0) > 75 and sig.get("convergence", 0) > 70
                    
                    if not (is_breakout or is_strong):
                        continue
                        
                    symbol = sig["symbol"]
                    if symbol in alerted_today:
                        logger.info(f"Dalai poll: {symbol} already alerted this session — skipping.")
                        continue
                    market_context = await get_market_context(symbol)
                    prices = market_context.get("recent_prices", [])
                    volumes = market_context.get("recent_volumes", [])
                    
                    if not prices or len(prices) < 10:
                        continue
                        
                    # LAYER 6: Fetch Options Flow
                    options_raw = await self.client.get_options_flow(symbol)
                    options_eval = options_engine.evaluate_options_flow(options_raw)
                        
                    # Request V7 prediction
                    req = PredictionRequest(raw_data={
                        "symbol": symbol,
                        "prices": prices,
                        "volumes": volumes,
                        "event": {"headline": "DalalAI Triggered Analysis"}
                    })
                    
                    v7_res = await predict_probability(req)
                    v7_dir = "BULLISH" if v7_res["probability"] > 50 else "BEARISH"
                    
                    v7_sig = {
                        "symbol": symbol,
                        "direction": v7_dir,
                        "confidence": v7_res.get("confidence", 50.0) * 100
                    }
                    
                    fused = self.fuse_signals(v7_sig, sig, options_eval)
                    
                    # Store options data in fusion for Telegram rendering
                    fused["options_eval"] = options_eval
                    
                    # Generate reasoning string
                    if is_breakout:
                        template = self.reasoning_templates["BREAKOUT"]
                    elif fused["agreement"] == "CONFIRMED":
                        if fused["convergence_score"] > 70:
                            template = self.reasoning_templates["CONFIRMED_HIGH"]
                        else:
                            template = self.reasoning_templates["CONFIRMED_MED"]
                    else:
                        template = self.reasoning_templates["CONFLICT"]
                        
                    reasoning = template.format(
                        direction=fused["direction"],
                        symbol=symbol,
                        dalalai_confidence=fused["dalalai_confidence"],
                        convergence=fused["convergence_score"],
                        price=market_context.get("current_price", "N/A"),
                        v7_direction=v7_sig["direction"],
                        v7_confidence=round(v7_sig["confidence"], 1),
                        dalalai_direction=fused["dalalai_prediction"],
                        volume=market_context.get("volume_surge_ratio", "1.0x"),
                        confidence=fused["confidence"]
                    )
                    
                    # Store fusion data into a dict for formatting the new alert template
                    decision_trace = {
                        "reasoning": reasoning,
                        "fused_data": fused
                    }
                    
                    # Send alert — only during a tradeable NSE window; after
                    # hours this poller would spam BUY/SELL on stale data.
                    if not is_nse_signal_window():
                        logger.info(f"Dalai poll: {symbol} signal suppressed (market closed)")
                        continue

                    # Require real multi-model agreement: only alert when V7 and
                    # DalalAI agree AND final fused confidence clears 65. This
                    # kills the noisy one-sided picks that used to flood in.
                    if fused["agreement"] != "CONFIRMED" or fused["confidence"] < 65:
                        logger.info(f"Dalai poll: {symbol} no agreement (agreement={fused['agreement']}, conf={fused['confidence']}) — skipping.")
                        continue

                    signal_mapped = "strong_buy" if fused["direction"] == "BULLISH" and fused["confidence"] > 75 else "buy"
                    if fused["direction"] == "BEARISH":
                        signal_mapped = "sell"
                        
                    await send_telegram_alert(
                        ticker=symbol,
                        headline="DalalAI Live Prediction Triggered",
                        signal=signal_mapped,
                        confidence=fused["confidence"] / 100.0,
                        reason=reasoning,
                        momentum_score=int(fused["confidence"]),
                        risk_score=50,
                        volume_surge=market_context.get("vol_surge_raw", 1.0),
                        current_price=market_context.get("current_price", "N/A"),
                        decision_trace=decision_trace
                    )
                    alerted_today.add(symbol)
                    
                    # Sleep slightly between alerts to avoid Telegram rate limits
                    await asyncio.sleep(2)
                    
            except Exception as e:
                logger.error(f"Dalai poll failed: {e}")
                
            # Sleep 15 minutes before polling again
            await asyncio.sleep(900)

    async def run_on_demand_fusion(self, symbol: str) -> dict:
        from backend.main import predict_probability, PredictionRequest, get_market_context

        # Fetch DalalAI prediction (bypass ETag to force data)
        status, response, etag = await self.client.get_predictions(if_none_match=None)
        all_preds = response.get("data", [])
        
        # If symbol not in the real DalalAI feed, do not fabricate a signal.
        sig = next((s for s in all_preds if s["symbol"] == symbol), None)
        if not sig:
            return {
                "symbol": symbol,
                "direction": "UNKNOWN",
                "confidence": 0.0,
                "agreement": "NO_DATA",
                "error": f"{symbol} not present in DalalAI convergence feed"
            }

        market_context = await get_market_context(symbol)
        prices = market_context.get("recent_prices", [])
        volumes = market_context.get("recent_volumes", [])
        
        if not prices or len(prices) < 10:
            prices = [100.0 + (i * 0.1) for i in range(10)]
            volumes = [1000 for _ in range(10)]
            
        options_raw = await self.client.get_options_flow(symbol)
        options_eval = options_engine.evaluate_options_flow(options_raw)
            
        req = PredictionRequest(raw_data={
            "symbol": symbol,
            "prices": prices,
            "volumes": volumes,
            "event": {"headline": f"On Demand API request for {symbol}"}
        })
        
        v7_res = await predict_probability(req)
        v7_dir = "BULLISH" if v7_res["probability"] > 50 else "BEARISH"
        
        v7_sig = {
            "symbol": symbol,
            "direction": v7_dir,
            "confidence": v7_res.get("confidence", 50.0) * 100
        }
        
        fused = self.fuse_signals(v7_sig, sig, options_eval)
        fused["options_eval"] = options_eval
        return fused
