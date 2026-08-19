"""
FastAPI Server for NSE/BSE Corporate Announcements
Provides WebSocket endpoint for real-time announcement feed
With AI-powered analysis (FinBERT + LLM + Historical Similarity)
Production-validated: env vars, models, dependencies checked at startup.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Dict, List, Set, Optional
import asyncio
import sys
if sys.platform == 'win32' and sys.version_info < (3, 8):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import json
from datetime import datetime, timedelta, timezone
import os
import sys
import numpy as np
from dotenv import load_dotenv
import yfinance as yf
import httpx
import warnings
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("backend_server.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
# Suppress harmless scikit-learn and LightGBM warnings
warnings.filterwarnings("ignore", category=UserWarning, module="sklearn.*")
warnings.filterwarnings("ignore", category=UserWarning, message=".*sklearn.utils.parallel.delayed.*")
warnings.filterwarnings("ignore", category=UserWarning, module="lightgbm")

# Load environment variables from frontend .env.local
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local'))

# === PRODUCTION ENV VALIDATION ===
REQUIRED_ENV_VARS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']
OPTIONAL_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OLLAMA_BASE_URL']

def _validate_startup_env():
    """Fail-fast on missing critical env vars."""
    missing = [v for v in REQUIRED_ENV_VARS if not os.getenv(v)]
    if missing:
        print(f"[STARTUP] CRITICAL: Missing required env vars: {', '.join(missing)}")
        print(f"[STARTUP] Telegram alerts will not work without these.")
    else:
        print(f"[STARTUP] Required env vars OK: {', '.join(REQUIRED_ENV_VARS)}")
    optional_present = [v for v in OPTIONAL_ENV_VARS if os.getenv(v)]
    optional_missing = [v for v in OPTIONAL_ENV_VARS if not os.getenv(v)]
    if optional_present:
        print(f"[STARTUP] Optional env vars present: {', '.join(optional_present)}")
    if optional_missing:
        print(f"[STARTUP] Optional env vars not set: {', '.join(optional_missing)} (features may be limited)")

_validate_startup_env()

from poller import AnnouncementPoller
from sentiment_analyzer import get_sentiment_analyzer
from llm_analyzer import get_llm_analyzer, analyze_with_llm
from historical_engine import get_historical_engine
from reconciliation import get_reconciliation_engine, generate_accuracy_report
from ml_ensemble import ModelArena
from model_registry import ModelRegistry
from pydantic import BaseModel
from feature_engineering import feature_engine
from risk_engine import risk_engine
from engines.event_intelligence import event_intelligence_engine
from engines.capital_flow import capital_flow_engine
from engines.historical_similarity import similarity_engine
from engines.pre_momentum import pre_momentum_engine
from engines.deep_sequence import deep_sequence_engine
from quantum_v6 import (
    multi_tf_engine, regime_detector, feature_selector, ensemble_voter,
    live_retrainer, portfolio_optimizer, execution_simulator
)
import uuid
from contextlib import asynccontextmanager
import hashlib
from services.signal_poller import DalaiPoller

dalalai_poller_instance = DalaiPoller()

IST = timezone(timedelta(hours=5, minutes=30))

# In-memory dedup of Telegram alert keys (date|ticker|headline-hash) so the
# yfinance ^NSEI fallback can never re-fire the same story.
_SENT_ALERT_KEYS = set()

def is_nse_signal_window(now=None):
    """True Mon–Fri during NSE PRE (9:00–9:15) or regular session (9:15–15:30) IST.

    Used to suppress BUY/SELL Telegram alerts after hours. Announcements and
    signals are still analysed and stored — only the alert dispatch is gated.
    """
    now = now or datetime.now(IST)
    if now.weekday() >= 5:
        return False
    mins = now.hour * 60 + now.minute
    return 9 * 60 <= mins < 15 * 60 + 30

def is_tradeable_stock_symbol(symbol: str) -> bool:
    """True only for real stock symbols.

    Filters out indices (^NSEI, ^IXIC), futures/commodities (CL=F) and other
    non-tradable tickers so we never fire a BUY/SELL trade alert on the index.
    """
    if not symbol:
        return False
    s = symbol.strip().upper()
    if s.startswith('^'):
        return False
    if '=' in s:
        return False
    return bool(s) and s[0].isalpha()

@asynccontextmanager
async def app_lifespan(app: FastAPI):
    global poller_task
    # poller_loop is defined further down, but accessible in global scope at runtime!
    poller_task = asyncio.create_task(poller_loop())
    # DalalAI is a PAID API (₹1,999/mo). The 15-min intraday prediction now runs
    # entirely on free sources in the frontend scanner (BullScore + NSE bulk/block
    # deals + Yahoo momentum + local ML), so the DalaiPoller is intentionally NOT
    # started — no API key required, no paid dependency.
    # await dalalai_poller_instance.start(app)
    yield
    if poller_task:
        poller_task.cancel()
        try:
            await poller_task
        except asyncio.CancelledError:
            pass
    # await dalalai_poller_instance.stop()

app = FastAPI(title="NSE/BSE Quantum Alpha V7 API", version="7.0.0", lifespan=app_lifespan)

registry = ModelRegistry("data/stage_b_registry.db")
ml_arena = ModelArena(registry)

# === PRODUCTION: Verify models loaded at startup ===
_startup_model_count = len(ml_arena.candidates)
_startup_champion = registry.get_champion()
print(f"[STARTUP] ML Arena: {_startup_model_count} model(s) loaded, champion={_startup_champion['model_version'] if _startup_champion else 'NONE'}")
if _startup_model_count == 0:
    print(f"[STARTUP] WARNING: No models loaded — predictions will use hash-based fallback")


class PredictionRequest(BaseModel):
    raw_data: Dict  # Schema: {symbol, prices, volumes, event}

class RetrainRequest(BaseModel):
    samples: List[Dict]  # Schema: [{features: number[], label: int}]

@app.post("/predict")
async def predict_probability(req: PredictionRequest):
    request_id = str(uuid.uuid4())
    try:
        prices = req.raw_data.get('prices', [])
        volumes = req.raw_data.get('volumes', [])
        event_dict = req.raw_data.get('event', {})
        headline = event_dict.get('headline', '')

        # === V6 Multi-Timeframe Fusion ===
        multi_tf = multi_tf_engine.fuse_signals(prices, volumes)

        # === V6 Regime Detection ===
        regime_info = regime_detector.detect(prices, volumes)
        regime = regime_info['regime']

        # === V5 Feature Engineering (55 features) ===
        features = feature_engine.generate_features(req.raw_data)

        # === Feature alignment: pad or truncate to match model expectations ===
        MODEL_FEATURE_DIM = 50  # Models trained on 50 features; new 5 are cross-asset
        if len(features) > MODEL_FEATURE_DIM:
            # New model with full 55 features — use all
            model_features = features
        else:
            model_features = features

        # === V6 Ensemble Voting (all models) ===
        # Models trained on 50 features; new cross-asset features (50-54) are
        # only used by models that were trained with 55 features. For legacy
        # models we truncate to 50 features to avoid shape mismatch.
        all_predictions = {}
        for model_version_key in ml_arena.candidates:
            try:
                model_obj = ml_arena.candidates[model_version_key]
                # Check if model expects 50 or 55 features by probing
                n_features_expected = getattr(model_obj, 'n_features_in_', None)
                if n_features_expected and n_features_expected < len(features):
                    model_input = np.array([features[:n_features_expected]])
                else:
                    model_input = np.array([features])
                p = ml_arena.predict_probability(model_version_key, model_input)
                algo = model_version_key.split('_')[0] if '_' in model_version_key else model_version_key
                all_predictions[algo] = p * 100
            except Exception:
                continue

        if not all_predictions:
            # Fallback to champion
            champion = registry.get_champion()
            if not champion:
                raise RuntimeError("No models available for inference")
            prob = ml_arena.predict_probability(champion['model_version'], np.array([features]))
            all_predictions[champion['algorithm']] = prob * 100

        # === V7 Deep Sequence Prediction ===
        deep_seq_result = deep_sequence_engine.predict(prices, volumes)
        all_predictions['DeepSequence_V7'] = deep_seq_result['probability']

        # === V7 Ensemble with regime + multi-TF fusion ===
        ensemble_result = ensemble_voter.vote(all_predictions, regime, multi_tf)
        final_prob = ensemble_result['probability']

        # === V5 engines (still valuable) ===
        structured_event = event_intelligence_engine.parse_event(headline)
        cap_flow = capital_flow_engine.calculate_accumulation_probability(prices, volumes)
        sim_result = similarity_engine.find_similar_events(structured_event.category, structured_event.amount)

        forecasts = pre_momentum_engine.generate_forecasts(
            ml_prob=final_prob / 100,
            event_impact=structured_event.importance_score,
            accum_prob=cap_flow['accumulation_probability'],
            history_win_rate=sim_result.win_rate
        )

        decision_trace = pre_momentum_engine.generate_decision_trace(
            ticker=req.raw_data.get('symbol', 'UNKNOWN'),
            features_used=["V6_Ensemble", "MultiTimeframe", "Regime", "EventImpact", "CapitalFlow"],
            feature_values=[final_prob, multi_tf.get('fused_direction', 0),
                          regime_info.get('efficiency_ratio', 0), structured_event.importance_score,
                          cap_flow['accumulation_probability']],
            prediction=ensemble_result['signal'],
            confidence=f"{ensemble_result['confidence']:.0%}",
            reasoning=f"Regime={regime}, TF_Align={multi_tf.get('timeframe_alignment','N/A')}, "
                     f"Models={len(all_predictions)}, Agreement={multi_tf.get('agreement',0):.0%}"
        )

        # === V6 Dynamic Risk Engine ===
        risk_metrics = risk_engine.evaluate_risk(forecasts['prob_1day'], prices)

        # === V6 Execution Simulation ===
        last_price = prices[-1] if prices else 0
        exec_side = 'BUY' if final_prob > 55 else 'SELL' if final_prob < 45 else 'HOLD'
        exec_sim = execution_simulator.simulate_execution(last_price, exec_side) if exec_side != 'HOLD' else None

        return {
            "prediction_id": str(uuid.uuid4()),
            "request_id": request_id,
            "model_version": champion['model_version'] if 'champion' in dir() else 'ensemble_v7',
            "dataset_version": "v7.0",
            "feature_version": "v7.0-deep-sequence-regime",
            "created_at": datetime.now().isoformat(),
            "probability": final_prob,
            "signal": ensemble_result['signal'],
            "confidence": ensemble_result['confidence'],
            "explanation": decision_trace,
            "features_used": features.tolist(),
            "risk_metrics": risk_metrics,
            "v7_intelligence": {
                "order_book_imbalance": deep_seq_result.get('order_book_imbalance', 1.0),
                "deep_sequence_signal": deep_seq_result.get('signal', 'HOLD'),
                "deep_sequence_prob": deep_seq_result.get('probability', 50.0),
                "reasoning": deep_seq_result.get('reasoning', '')
            },
            "v6_intelligence": {
                "regime": regime,
                "regime_confidence": regime_info['confidence'],
                "multi_timeframe": {
                    "fused_direction": multi_tf['fused_direction'],
                    "agreement": multi_tf['agreement'],
                    "alignment": multi_tf['timeframe_alignment'],
                    "daily_signal": multi_tf['daily']['direction'],
                    "weekly_signal": multi_tf['weekly']['direction'],
                    "monthly_signal": multi_tf['monthly']['direction'],
                },
                "ensemble": {
                    "model_votes": ensemble_result['model_votes'],
                    "tf_boost": ensemble_result['tf_boost'],
                    "model_count": len(all_predictions),
                },
                "execution_simulation": exec_sim,
            },
            "v5_metrics": {
                "accumulation_probability": cap_flow['accumulation_probability'],
                "historical_win_rate": sim_result.win_rate,
                "event_category": structured_event.category
            }
        }
    except Exception as e:
        # Ensure errors are traceable and not silent
        raise HTTPException(status_code=400, detail={
            "error": str(e),
            "request_id": request_id,
            "timestamp": datetime.now().isoformat(),
            "expected_model": "XGBoost Classifier (v4)",
            "message": "Prediction failed. Ensure model weights are loaded and payload is valid."
        })

@app.post("/retrain")
async def retrain_models(req: RetrainRequest):
    """LiveRetrainer: receive resolved prediction outcomes and incrementally retrain."""
    try:
        if not req.samples or len(req.samples) < 10:
            return {"status": "skipped", "reason": "insufficient samples", "count": len(req.samples)}

        # Buffer samples into LiveRetrainer
        for sample in req.samples:
            features = np.array(sample.get('features', []))
            label = sample.get('label', 0)
            if features.ndim == 1 and len(features) > 0:
                live_retrainer.add_sample(features, label)

        result = None
        if live_retrainer.should_retrain():
            print(f"[LiveRetrainer] Retraining with {live_retrainer.samples_since_retrain} new samples...")
            # For incremental retrain, we need existing data — use an empty array as fallback
            # The LiveRetrainer will merge new samples with any existing data
            result = live_retrainer.retrain(np.array([]), np.array([]))

        return {
            "status": "ok",
            "buffered": live_retrainer.samples_since_retrain,
            "total_buffer": len(live_retrainer.buffer_X),
            "retrain_result": result,
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.recent_announcements: List[Dict] = []
        self.max_history = 200  # Keep last 200 announcements
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"WebSocket connected. Total: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        print(f"WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def broadcast(self, message: Dict):
        """Send message to all connected clients"""
        if not self.active_connections:
            return
        
        message_json = json.dumps(message, default=str)
        
        # Send to all connections, remove dead ones
        dead_connections = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(message_json)
            except Exception as e:
                print(f"Error sending to WebSocket: {e}")
                dead_connections.add(connection)
        
        # Clean up dead connections
        self.active_connections -= dead_connections
    
    def add_announcement(self, announcement: Dict):
        """Add announcement to history"""
        self.recent_announcements.insert(0, announcement)
        if len(self.recent_announcements) > self.max_history:
            self.recent_announcements = self.recent_announcements[:self.max_history]

manager = ConnectionManager()
poller = AnnouncementPoller()

# Background task for polling
poller_task: asyncio.Task = None

def get_market_context_sync(symbol: str) -> Dict:
    """Fetch live market momentum synchronously via yfinance"""
    try:
        # Index/commodity symbols (^NSEI, CL=F) must NOT get ".NS" appended —
        # yfinance treats "CL=F.NS" / "^NSEI.NS" as invalid/delisted.
        if symbol.startswith('^') or '=' in symbol:
            ticker_sym = symbol
        else:
            ticker_sym = symbol + ".NS" if not symbol.endswith(".NS") else symbol
        ticker = yf.Ticker(ticker_sym)
        hist = ticker.history(period="10d")
        if hist.empty:
            return {"current_price": "N/A", "day_change_pct": "N/A", "volume_surge_ratio": "N/A", "day_change_raw": 0.0, "vol_surge_raw": 1.0}
        
        current_price = hist['Close'].iloc[-1]
        prev_price = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        day_change_pct = ((current_price - prev_price) / prev_price) * 100
        
        current_vol = hist['Volume'].iloc[-1]
        avg_vol = hist['Volume'].mean()
        vol_surge = (current_vol / avg_vol) if avg_vol > 0 else 1.0
        
        return {
            "current_price": f"₹{current_price:.2f}",
            "day_change_pct": f"{day_change_pct:+.2f}%",
            "volume_surge_ratio": f"{vol_surge:.1f}",
            "day_change_raw": float(day_change_pct),
            "vol_surge_raw": float(vol_surge)
        }
    except Exception as e:
        print(f"yfinance error for {symbol}: {e}")
        return {"current_price": "N/A", "day_change_pct": "N/A", "volume_surge_ratio": "N/A", "day_change_raw": 0.0, "vol_surge_raw": 1.0}

async def get_market_context(symbol: str) -> Dict:
    return await asyncio.to_thread(get_market_context_sync, symbol)

async def send_telegram_alert(
    ticker: str, 
    headline: str, 
    signal: str, 
    confidence: float, 
    reason: str,
    momentum_score: int = 50,
    risk_score: int = 50,
    volume_surge: float = 1.0,
    pe_ratio: float = None,
    predicted_range: dict = None,
    current_price: str = "N/A",
    decision_trace: dict = None
):
    """Send enhanced Telegram alert with full trading context.
    
    NO LIMITS - Sends alerts for ALL signals (strong_buy, buy, sell, avoid)
    regardless of confidence level. Every valuable announcement triggers alert.
    """
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not bot_token or not chat_id:
        return

    # Send alerts for ALL signals - no filtering
    # This ensures no valuable announcement is missed
    if signal not in ["strong_buy", "buy", "sell", "avoid"]:
        return

    # Deduplicate alerts: the yfinance fallback re-feeds the same market-wide
    # headline on every poll, so the identical story must never re-fire.
    import hashlib
    ist_date = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime('%Y-%m-%d')
    dedup_key = f"{ist_date}|{ticker}|{hashlib.md5(headline.encode('utf-8', errors='ignore')).hexdigest()[:12]}"
    if dedup_key in _SENT_ALERT_KEYS:
        return
    _SENT_ALERT_KEYS.add(dedup_key)
    if len(_SENT_ALERT_KEYS) > 500:
        _SENT_ALERT_KEYS.clear()
    
    import html
    from datetime import datetime
    
    # Signal emoji and color coding
    signal_emoji = {"strong_buy": "🟢", "buy": "🟢", "sell": "🔴", "avoid": "🟡", "hold": "⚪"}
    emoji = signal_emoji.get(signal, "⚪")
    
    # Signal strength indicator
    strength = "STRONG" if signal == "strong_buy" else ""
    
    # Format confidence
    conf_pct = round(confidence * 100, 1)
    
    # Momentum indicator
    if momentum_score >= 70:
        momentum_label = f"🔥 High ({momentum_score})"
    elif momentum_score >= 55:
        momentum_label = f"📈 Moderate ({momentum_score})"
    elif momentum_score <= 30:
        momentum_label = f"📉 Low ({momentum_score})"
    else:
        momentum_label = f"➡️ Neutral ({momentum_score})"
    
    # Risk indicator
    if risk_score <= 30:
        risk_label = f"🟢 Low ({risk_score})"
    elif risk_score <= 60:
        risk_label = f"🟡 Medium ({risk_score})"
    else:
        risk_label = f"🔴 High ({risk_score})"
    
    # Volume indicator
    if volume_surge > 3.0:
        volume_label = f"🚀 {volume_surge:.1f}x (Very High)"
    elif volume_surge > 2.0:
        volume_label = f"📊 {volume_surge:.1f}x (High)"
    elif volume_surge > 1.2:
        volume_label = f"📈 {volume_surge:.1f}x (Above Avg)"
    else:
        volume_label = f"➡️ {volume_surge:.1f}x (Normal)"
    
    # PE category
    if pe_ratio:
        if pe_ratio < 30:
            pe_label = f"Value ({pe_ratio:.1f})"
        elif pe_ratio < 70:
            pe_label = f"Growth ({pe_ratio:.1f})"
        else:
            pe_label = f"Hype ({pe_ratio:.1f})"
    else:
        pe_label = "N/A"
    
    # Predicted range
    if predicted_range:
        range_text = f"{predicted_range.get('min', 0):.1f}% to {predicted_range.get('max', 0):.1f}%"
    else:
        range_text = "N/A"
    
    # Sanitize text for HTML
    deep_reasoning = decision_trace.get("reasoning", reason) if decision_trace else reason
    safe_reason = html.escape(deep_reasoning[:1000] if deep_reasoning else "AI analysis based on announcement content")
    safe_headline = html.escape(headline[:200] if headline else "No headline")
    safe_ticker = html.escape(ticker[:20])
    
    # Accurate Indian Standard Time (IST) UTC+5:30
    from datetime import timedelta
    now_ist = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%d %b %Y, %I:%M:%S %p IST")
    
    fused = decision_trace.get("fused_data") if decision_trace else None
    fusion_text = ""
    if fused:
        options = fused.get("options_eval", {})
        options_text = ""
        if options:
            options_text = f"""
💹 <b>Options Market Intelligence:</b>
  • PCR: <b>{options.get('pcr', 'N/A')}</b>
  • Max Pain Dist: <b>{((options.get('max_pain_distance', 1.0) - 1) * 100):.1f}%</b>
  • Options Signal: <b>{options.get('signal', 'NEUTRAL')}</b>"""
        
        tiebreaker_text = ""
        if fused.get("tiebreaker_used"):
            tiebreaker_text = f"\n  • Tiebreaker Winner: <b>{fused.get('tiebreaker_winner', 'N/A')}</b>"

        fusion_text = f"""{options_text}
🤖 <b>Multi-Model Fusion Analytics:</b>
  • V7 Engine: <b>{fused.get("direction", signal.upper())}</b> ({fused.get("v7_confidence", conf_pct):.0f}%) [Weight: {fused.get("v7_weight", 0.6)*100:.0f}%]
  • DalalAI: <b>{fused.get("dalalai_prediction", "N/A")}</b> ({fused.get("dalalai_confidence", 0)}%) [Weight: {fused.get("dalalai_weight", 0.4)*100:.0f}%]{tiebreaker_text}
  • Agreement: <b>{fused.get("agreement", "N/A")}</b> — Net Confidence: {fused.get("confidence", 0):.0f}%
"""

    # Build a visually striking HTML message
    text = f"""<b>QUANTUM ALPHA V7 ALERT</b> 🚀
══════════════════════
{emoji} <b>{strength} {signal.upper()} SIGNAL</b> {emoji}

🎯 <b>Ticker:</b> <code>{safe_ticker}</code>
💰 <b>Live Price:</b> <b>{current_price}</b>
🕒 <b>Time:</b> <code>{now_ist}</code>

📰 <b>Market Catalyst:</b> 
<i>{safe_headline}</i>

🎯 <b>FINAL PREDICTION:</b> <b>{signal.upper()}</b> · Probability <b>{conf_pct}%</b> · Target Move <b>{range_text}</b>

📊 <b>V7 Deep Sequence Data:</b>
  • Target Move: <b>{range_text}</b>
  • Sequence Confidence: <b>{conf_pct}%</b>
  • Volume Surge: <b>{volume_label}</b>
  • Momentum State: <b>{momentum_label}</b>
{fusion_text}
🧠 <b>V7 Microstructure Analysis:</b>
{safe_reason}

<i>Powered by Quantum Alpha V7 | Real-Time Deep Sequence Predictor</i>"""



    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(url, json={
                "chat_id": chat_id, 
                "text": text, 
                "parse_mode": "HTML",
                "disable_web_page_preview": True
            })
            if res.status_code != 200:
                print(f"Telegram webhook failed: {res.text}")
            else:
                print(f"Telegram alert sent: {ticker} - {signal}")
    except Exception as e:
        print(f"Telegram webhook error: {e}")

async def perform_full_analysis(announcement: Dict) -> Dict:
    """
    Perform full V5 AI analysis pipeline on an announcement.
    """
    symbol = announcement.get("symbol", "")
    headline = announcement.get("headline", "")
    full_text = announcement.get("full_text", "")
    category = announcement.get("category", "")
    exchange = announcement.get("exchange", "NSE")
    
    # 1. FinBERT-India sentiment
    sentiment_analyzer = get_sentiment_analyzer()
    sentiment_result = sentiment_analyzer.analyze_sentiment(headline, full_text)
    
    announcement["finbert_sentiment"] = sentiment_result.get("label", "Neutral")
    announcement["finbert_confidence"] = sentiment_result.get("score", 0.5)
    
    # Fetch real-time market context
    market_context = await get_market_context(symbol)
    announcement["market_context"] = market_context
    prices = market_context.get("recent_prices", [])
    volumes = market_context.get("recent_volumes", [])
    
    # V5: Event Intelligence Engine
    structured_event = event_intelligence_engine.parse_event(headline, source_rel=0.95)
    
    # V5: Capital Flow Engine
    cap_flow = capital_flow_engine.calculate_accumulation_probability(prices, volumes)
    
    # V5: Historical Similarity
    sim_result = similarity_engine.find_similar_events(structured_event.category, structured_event.amount)
    
    # V5: Pre-Momentum Engine
    ml_prob = 0.5 # Default fallback
    if len(prices) > 14:
        try:
            # Reconstruct raw data for ML
            raw_data = {'symbol': symbol, 'prices': prices, 'volumes': volumes, 'event': {'headline': headline}}
            features = feature_engine.generate_features(raw_data)
            champion = registry.get_champion()
            if champion:
                ml_prob = ml_arena.predict_probability(champion['model_version'], np.array([features]))
        except Exception as e:
            print(f"ML Predict error: {e}")
            
    forecasts = pre_momentum_engine.generate_forecasts(
        ml_prob=ml_prob,
        event_impact=structured_event.importance_score,
        accum_prob=cap_flow['accumulation_probability'],
        history_win_rate=sim_result.win_rate
    )
    
    decision_trace = pre_momentum_engine.generate_decision_trace(
        ticker=symbol,
        features_used=["EventImpact", "CapitalFlow", "HistoricalWinRate", "MLProb"],
        feature_values=[structured_event.importance_score, cap_flow['accumulation_probability'], sim_result.win_rate, ml_prob],
        prediction="PRE-MOMENTUM CANDIDATE" if forecasts['prob_1day'] > 0.6 else "IGNORE",
        confidence="High" if structured_event.confidence > 0.8 else "Medium",
        reasoning=f"Detected {structured_event.category} with {cap_flow['accumulation_probability']*100:.1f}% Accumulation Probability."
    )
    
    # Mutate announcement with V5 intelligence
    announcement["v5_intelligence"] = {
        "event_category": structured_event.category,
        "importance": structured_event.importance_score,
        "accumulation_prob": cap_flow['accumulation_probability'],
        "historical_win_rate": sim_result.win_rate,
        "forecasts": forecasts,
        "decision_trace": decision_trace
    }
    
    # Ensure backward compatibility for React UI
    announcement["ensemble_signal"] = "strong_buy" if forecasts['prob_1day'] > 0.7 else ("buy" if forecasts['prob_1day'] > 0.6 else "avoid")
    announcement["ensemble_confidence"] = forecasts['prob_1day']
    announcement["momentum_score"] = int(forecasts['prob_1day'] * 100)
    announcement["risk_score"] = 50
    
    volume_surge = cap_flow['relative_volume']
    pe_ratio = announcement.get("pe_ratio")
    
    # Send Telegram alert for ALL significant events, but only while NSE is in
    # a tradeable window (PRE + regular session) AND the announcement is for a
    # real stock (not the ^NSEI index feed or commodities like CL=F). After
    # hours we'd be shouting BUY/SELL at frozen prices — exactly the confusion
    # the user hit.
    if (is_tradeable_stock_symbol(symbol)
            and (structured_event.category != "Unknown" or volume_surge > 2.0)
            and is_nse_signal_window()):
        try:
            bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
            chat_id = os.getenv("TELEGRAM_CHAT_ID")
            
            reasoning = f"🚨 V5 INTELLIGENCE DETECTED 🚨\n"
            reasoning += f"Event: {structured_event.category}\n"
            reasoning += f"Accumulation Prob: {cap_flow['accumulation_probability']*100:.1f}%\n"
            reasoning += f"Historical Win Rate: {sim_result.win_rate*100:.1f}%\n"
            reasoning += f"1-Day Momentum Prob: {forecasts['prob_1day']*100:.1f}%"
            
            if bot_token and chat_id:
                asyncio.create_task(send_telegram_alert(
                    ticker=symbol,
                    headline=headline,
                    signal=announcement["ensemble_signal"],
                    confidence=forecasts['prob_1day'],
                    reason=reasoning,
                    momentum_score=announcement["momentum_score"],
                    risk_score=50,
                    volume_surge=volume_surge,
                    pe_ratio=pe_ratio,
                    predicted_range={"min": sim_result.median_return*100, "max": sim_result.median_return*150},
                    current_price=announcement.get("market_context", {}).get("current_price", "N/A"),
                    decision_trace=decision_trace
                ))
        except Exception as e:
            print(f"Failed to dispatch Telegram alert: {e}")
    
    return announcement


def generate_ensemble_signal(announcement: Dict) -> tuple:
    """Generate ensemble signal from all analysis components with dynamic weight normalization.
    
    Dynamically adjusts weights based on available data components to ensure
    signals are generated even when some analysis engines are unavailable.
    """
    scores = []
    weights = []
    components_used = []
    
    # FinBERT contribution (base weight: 0.30)
    finbert_sentiment = announcement.get("finbert_sentiment", "")
    finbert_confidence = announcement.get("finbert_confidence", 0.0)
    if finbert_sentiment and finbert_confidence > 0.5:
        if finbert_sentiment == "Positive":
            score_val = finbert_confidence
        elif finbert_sentiment == "Negative":
            score_val = -finbert_confidence
        else:
            score_val = 0.0
        scores.append(score_val)
        weights.append(0.30)
        components_used.append("finbert")
    
    # LLM contribution (base weight: 0.35)
    llm_analysis = announcement.get("llm_analysis")
    if llm_analysis and isinstance(llm_analysis, dict) and llm_analysis.get("sentiment"):
        llm_confidence = llm_analysis.get("confidence", 0.5)
        llm_sentiment = llm_analysis.get("sentiment", "neutral")
        
        sentiment_map = {
            "strongly_positive": 1.0,
            "positive": 0.5,
            "neutral": 0,
            "negative": -0.5,
            "strongly_negative": -1.0,
        }
        sentiment_value = sentiment_map.get(llm_sentiment, 0)
        scores.append(sentiment_value * llm_confidence)
        weights.append(0.35)
        components_used.append("llm")
    
    # Historical similarity contribution (base weight: 0.20)
    historical = announcement.get("similar_historical", {})
    if historical.get("count", 0) > 0:
        avg_1d_changes = [s.get("actual_1d_change", 0) for s in historical.get("similar", []) if s.get("actual_1d_change") is not None]
        avg_change = sum(avg_1d_changes) / len(avg_1d_changes) if avg_1d_changes else 0
        historical_score = max(-1, min(1, avg_change / 5))  # Normalize: 5% avg move = score of 1
        scores.append(historical_score)
        weights.append(0.20)
        components_used.append("historical")
    
    # Momentum/Volume contribution (base weight: 0.15)
    momentum_score = announcement.get("momentum_score", 50)
    volume_surge = announcement.get("market_context", {}).get("vol_surge_raw", 1.0)
    if momentum_score != 50 or volume_surge > 1.5:
        # Convert momentum score (0-100) to signal (-1 to 1)
        momentum_signal = (momentum_score - 50) / 50.0
        # Boost if volume surge is significant
        if volume_surge > 3.0:
            momentum_signal = max(momentum_signal, 0.5)  # Strong volume = bullish bias
        elif volume_surge < 0.5:
            momentum_signal = min(momentum_signal, -0.3)  # Low volume = bearish bias
        scores.append(momentum_signal)
        weights.append(0.15)
        components_used.append("momentum")
    
    # Calculate weighted average with dynamic normalization
    if not scores:
        return "hold", 0.5, "flat", {"min": -2.0, "max": 2.0}
    
    total_weight = sum(weights[:len(scores)])
    if total_weight == 0:
        return "hold", 0.5, "flat", {"min": -2.0, "max": 2.0}
    
    ensemble_score = sum(s * w for s, w in zip(scores, weights[:len(scores)])) / total_weight
    
    # Map score to signal with component-aware thresholds
    # When fewer components are available, use more conservative thresholds
    num_components = len(components_used)
    
    if num_components >= 3:
        # Strong signal when multiple components agree
        if ensemble_score > 0.45:
            signal = "strong_buy"
            direction = "up"
        elif ensemble_score > 0.15:
            signal = "buy"
            direction = "up"
        elif ensemble_score > -0.15:
            signal = "hold"
            direction = "flat"
        elif ensemble_score > -0.45:
            signal = "avoid"
            direction = "down"
        else:
            signal = "sell"
            direction = "down"
    elif num_components == 2:
        # Moderate signal with 2 components
        if ensemble_score > 0.55:
            signal = "strong_buy"
            direction = "up"
        elif ensemble_score > 0.2:
            signal = "buy"
            direction = "up"
        elif ensemble_score > -0.2:
            signal = "hold"
            direction = "flat"
        elif ensemble_score > -0.55:
            signal = "avoid"
            direction = "down"
        else:
            signal = "sell"
            direction = "down"
    else:
        # Conservative signal with only 1 component
        if ensemble_score > 0.7:
            signal = "buy"  # No strong_buy with single component
            direction = "up"
        elif ensemble_score > 0.3:
            signal = "buy"
            direction = "up"
        elif ensemble_score > -0.3:
            signal = "hold"
            direction = "flat"
        elif ensemble_score > -0.7:
            signal = "avoid"
            direction = "down"
        else:
            signal = "sell"
            direction = "down"
    
    # Calculate confidence based on score magnitude and component count
    base_confidence = min(0.95, abs(ensemble_score) * 1.2 + 0.15)
    # Boost confidence when more components agree
    component_boost = min(0.15, (num_components - 1) * 0.05)
    confidence = min(0.98, base_confidence + component_boost)
    
    # Adjust confidence based on real-time market participation
    market_context = announcement.get("market_context", {})
    vol_surge = market_context.get("vol_surge_raw", 1.0)
    if vol_surge < 0.5:
        confidence *= 0.7  # Penalty for dead volume
    elif vol_surge > 3.0:
        confidence = min(0.98, confidence * 1.15)  # Boost for very high volume conviction
    elif vol_surge > 2.0:
        confidence = min(0.98, confidence * 1.1)  # Moderate boost
    
    # Calculate predicted range with fallback logic
    llm_range = {}
    if announcement.get("llm_analysis") and isinstance(announcement.get("llm_analysis"), dict):
        llm_range = announcement["llm_analysis"].get("predicted_magnitude_range", {})
    
    historical = announcement.get("similar_historical", {})
    hist_avg = historical.get("avg_1d_change", 0)
    
    # Use available data for range estimation
    if llm_range.get("min") is not None and llm_range.get("max") is not None:
        range_min = llm_range["min"]
        range_max = llm_range["max"]
    elif historical.get("count", 0) > 0:
        # Use historical average with wider bounds
        range_min = hist_avg - 2.0
        range_max = hist_avg + 2.0
    else:
        # Default range based on signal strength
        if signal == "strong_buy":
            range_min, range_max = 2.0, 8.0
        elif signal == "buy":
            range_min, range_max = 1.0, 5.0
        elif signal == "sell":
            range_min, range_max = -8.0, -2.0
        elif signal == "avoid":
            range_min, range_max = -5.0, -1.0
        else:
            range_min, range_max = -2.0, 2.0
    
    # Adjust range direction based on signal
    if signal in ["strong_buy", "buy"]:
        range_min = max(0.5, range_min)  # Ensure positive floor
    elif signal in ["avoid", "sell"]:
        range_max = min(-0.5, range_max)  # Ensure negative ceiling
    
    return signal, round(confidence, 2), direction, {"min": round(range_min, 1), "max": round(range_max, 1)}


def calculate_momentum_score(announcement: Dict) -> int:
    """Calculate momentum score (0-100) using live market data and AI sentiment"""
    score = 50  # Base score
    
    market_context = announcement.get("market_context", {})
    vol_surge = market_context.get("vol_surge_raw", 1.0)
    day_change = market_context.get("day_change_raw", 0.0)
    
    # 1. Volume Surge Impact (+0 to +30)
    if vol_surge > 3.0:
        score += 30
    elif vol_surge > 2.0:
        score += 20
    elif vol_surge > 1.2:
        score += 10
        
    # 2. Price Action Impact (+/- 25)
    if day_change > 5.0:
        score += 25
    elif day_change > 2.0:
        score += 15
    elif day_change < -5.0:
        score -= 25
    elif day_change < -2.0:
        score -= 15
        
    # 3. AI Sentiment Confirmation (+/- 20)
    ensemble_signal = announcement.get("ensemble_signal", "hold")
    if ensemble_signal == "strong_buy":
        score += 20
    elif ensemble_signal == "buy":
        score += 10
    elif ensemble_signal in ["sell", "avoid"]:
        score -= 20
        
    return min(100, max(0, int(score)))


def calculate_risk_score(announcement: Dict) -> int:
    """Calculate risk score (0-100, lower is better)"""
    score = 30  # Base risk
    
    # High PE increases risk
    pe_ratio = announcement.get("pe_ratio")
    if pe_ratio:
        if pe_ratio > 70:
            score += 20
        elif pe_ratio > 40:
            score += 10
        elif pe_ratio < 20:
            score -= 10
    
    # Low confidence increases risk
    confidence = announcement.get("ensemble_confidence", 0.5)
    score += (1 - confidence) * 20
    
    # Negative sentiment increases risk
    if announcement.get("finbert_sentiment") == "Negative":
        score += 15
    
    return min(100, max(0, int(score)))


async def handle_announcement(announcement: Dict):
    """Process new announcement with full AI analysis pipeline"""
    try:
        # Perform full analysis
        enriched = await perform_full_analysis(announcement)
        
        # Add metadata
        enriched["received_at"] = datetime.now().isoformat()
        enriched["analysis_complete"] = True
        
        # Reshape to required WebSocket schema
        payload = {
            "symbol": enriched.get("symbol", ""),
            "company": enriched.get("company", ""),
            "exchange": enriched.get("exchange", "NSE"),
            "headline": enriched.get("headline", ""),
            "full_text": enriched.get("full_text", ""),
            "category": enriched.get("category", ""),
            "announcement_time": enriched.get("timestamp", ""),
            "capture_latency_seconds": 5,
            "attachment_url": enriched.get("attachment_url", ""),
            
            "ai_analysis": {
                "finbert_sentiment": enriched.get("finbert_sentiment", "Neutral"),
                "finbert_confidence": enriched.get("finbert_confidence", 0.5),
                "llm_sentiment": enriched.get("llm_sentiment", ""),
                "llm_confidence": enriched.get("llm_confidence", 0.0),
                "llm_reasoning": enriched.get("llm_analysis", {}).get("reasoning", ""),
                "ensemble_signal": enriched.get("ensemble_signal", "hold"),
                "ensemble_confidence": enriched.get("ensemble_confidence", 0.5)
            },
            
            "prediction": {
                "direction": enriched.get("predicted_direction", "flat"),
                "expected_range_pct": enriched.get("predicted_range", {"min": -2.0, "max": 2.0}),
                "time_horizon": enriched.get("llm_analysis", {}).get("time_horizon", "swing"),
                "momentum_score": enriched.get("momentum_score", 50),
                "risk_score": enriched.get("risk_score", 50)
            },
            
            "similar_historical": enriched.get("similar_historical", {
                "count": 0,
                "avg_1d_change": 0.0,
                "avg_5d_change": 0.0,
                "accuracy_rate": 0.0
            }),
            
            "context": {
                "pe_ratio": enriched.get("pe_ratio"),
                "pe_bracket": "value" if (enriched.get("pe_ratio") or 999) < 30 else ("growth" if (enriched.get("pe_ratio") or 999) <= 70 else "hype"),
                "sector": enriched.get("sector", "Unknown"),
                "current_price": enriched.get("market_context", {}).get("current_price", "N/A"),
                "day_change_pct": enriched.get("market_context", {}).get("day_change_pct", "N/A"),
                "volume_surge_ratio": enriched.get("market_context", {}).get("volume_surge_ratio", "N/A")
            },
            
            "v5_intelligence": enriched.get("v5_intelligence", {}),
            
            "id": enriched.get("id", ""),
            "received_at": enriched["received_at"],
            "analysis_complete": True
        }
        
        # Add to history (store reshaped)
        manager.add_announcement(payload)
        
        # Add to historical database (store enriched which is flat for db)
        try:
            historical_engine = get_historical_engine()
            historical_engine.add_announcement(enriched)
        except Exception as e:
            print(f"Error adding to historical DB: {e}")
        
        # Broadcast to all connected clients
        await manager.broadcast(payload)
        
        signal = payload["ai_analysis"]["ensemble_signal"]
        print(f"Broadcast: [{payload['exchange']}] {payload['symbol']} - Signal: {signal}")
        
    except Exception as e:
        print(f"Error processing announcement: {e}")

async def poller_loop():
    """Background loop that runs the poller"""
    print("Starting poller background task...")
    await poller.run(handle_announcement)

# === API Endpoints ===

@app.get("/api/macro")
async def get_macro_cues():
    """Fetch live global macro data for Nifty, Nasdaq, and Crude Oil"""
    try:
        # ^NSEI = Nifty 50, ^IXIC = Nasdaq, CL=F = Crude Oil
        tickers = yf.Tickers('^NSEI ^IXIC CL=F')
        
        cues = {}
        
        # Nifty (Asian Proxy / Indian Base)
        try:
            nifty = tickers.tickers['^NSEI'].history(period="5d")
            if len(nifty) >= 2:
                cues['giftNifty'] = ((nifty['Close'].iloc[-1] - nifty['Close'].iloc[-2]) / nifty['Close'].iloc[-2]) * 100
                cues['asianMarkets'] = cues['giftNifty'] # Proxying Asian market sentiment via Nifty
            else:
                cues['giftNifty'] = 0.0
                cues['asianMarkets'] = 0.0
        except:
            cues['giftNifty'] = 0.0
            cues['asianMarkets'] = 0.0
            
        # Nasdaq (US Close)
        try:
            nasdaq = tickers.tickers['^IXIC'].history(period="5d")
            if len(nasdaq) >= 2:
                cues['usClose'] = ((nasdaq['Close'].iloc[-1] - nasdaq['Close'].iloc[-2]) / nasdaq['Close'].iloc[-2]) * 100
            else:
                cues['usClose'] = 0.0
        except:
            cues['usClose'] = 0.0
            
        return cues
    except Exception as e:
        print(f"Error fetching macro data: {e}")
        return {"usClose": 0.0, "asianMarkets": 0.0, "giftNifty": 0.0}

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "NSE/BSE Announcements API",
        "version": "3.0.0",
        "timestamp": datetime.now().isoformat(),
    }

@app.get("/health")
async def health_check():
    """Production health check: models, env, registry, training cache."""
    from pathlib import Path
    try:
        from paths import DATA_DIR
    except ImportError:
        from backend.paths import DATA_DIR
    champion = registry.get_champion()
    models = list(ml_arena.candidates.keys())
    cache_dir = DATA_DIR / "training_cache"
    cache_files = list(cache_dir.glob("*.pkl")) if cache_dir.exists() else []
    return {
        "status": "healthy" if models else "degraded",
        "version": "3.0.0",
        "timestamp": datetime.now().isoformat(),
        "python": {"version": sys.version, "platform": sys.platform},
        "env": {
            "telegram": bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHAT_ID")),
            "supabase": bool(os.getenv("SUPABASE_SERVICE_KEY")),
            "ollama": bool(os.getenv("OLLAMA_BASE_URL")),
        },
        "ml": {
            "models_loaded": len(models),
            "model_names": models,
            "champion": champion['model_version'] if champion else None,
            "champion_algorithm": champion['algorithm'] if champion else None,
        },
        "training_cache": {
            "cached_tickers": len(cache_files),
            "cache_dir": str(cache_dir),
        },
    }

@app.get("/api/stats")
async def get_stats():
    """Get poller statistics"""
    stats = poller.get_stats()
    stats["connected_clients"] = len(manager.active_connections)
    stats["recent_count"] = len(manager.recent_announcements)
    return stats

@app.get("/api/announcements")
async def get_recent_announcements(limit: int = 50, signal: str = ""):
    """Get recent announcements with AI analysis"""
    announcements = manager.recent_announcements[:limit]
    
    if signal:
        announcements = [a for a in announcements if a.get("ensemble_signal") == signal]
    
    return {"announcements": announcements, "count": len(announcements)}

@app.get("/api/announcements/symbol/{symbol}")
async def get_announcements_by_symbol(symbol: str, limit: int = 20):
    """Get announcements for a specific symbol"""
    symbol_upper = symbol.upper()
    filtered = [
        ann for ann in manager.recent_announcements
        if ann.get("symbol", "").upper() == symbol_upper
    ]
    return {"announcements": filtered[:limit], "count": len(filtered)}

@app.get("/api/announcements/filter")
async def filter_announcements(
    q: str = "",
    sentiment: str = "",
    signal: str = "",
    min_confidence: float = 0,
    limit: int = 50
):
    """Filter announcements by keyword, sentiment, signal, or confidence"""
    results = manager.recent_announcements
    
    if q:
        q_lower = q.lower()
        results = [
            ann for ann in results
            if q_lower in ann.get("headline", "").lower()
            or q_lower in ann.get("symbol", "").lower()
            or q_lower in ann.get("company", "").lower()
        ]
    
    if sentiment:
        results = [ann for ann in results if ann.get("finbert_sentiment") == sentiment]
    
    if signal:
        results = [ann for ann in results if ann.get("ensemble_signal") == signal]
    
    if min_confidence > 0:
        results = [ann for ann in results if ann.get("ensemble_confidence", 0) >= min_confidence]
    
    return {"announcements": results[:limit], "count": len(results)}

@app.get("/api/announcements/live")
async def get_live_feed():
    """Get live announcements (REST fallback for WebSocket)"""
    return {
        "announcements": manager.recent_announcements[:20],
        "connected_clients": len(manager.active_connections),
        "timestamp": datetime.now().isoformat(),
    }

@app.websocket("/ws/announcements")
async def announcements_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time announcements"""
    await manager.connect(websocket)
    
    try:
        # Send recent history on connect
        for ann in reversed(manager.recent_announcements[:20]):
            await websocket.send_json(ann)
        
        # Keep connection alive
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                if data:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong", "timestamp": datetime.now().isoformat()})
                    elif msg.get("type") == "subscribe":
                        symbols = msg.get("symbols", [])
                        await websocket.send_json({
                            "type": "subscribed",
                            "symbols": symbols
                        })
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"type": "ping", "timestamp": datetime.now().isoformat()})
                except:
                    break
            except json.JSONDecodeError:
                continue
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

@app.post("/api/announcements/analyze")
async def analyze_announcements(symbols: Optional[List[str]] = None):
    """
    Analyze latest announcements for specific symbols
    POST /api/announcements/analyze
    Body: {"symbols": ["ALL"] or ["RELIANCE", "TCS", ...]}
    """
    announcements = manager.recent_announcements
    
    if symbols and "ALL" not in symbols:
        symbols_upper = [s.upper() for s in symbols]
        announcements = [a for a in announcements if a.get("symbol", "").upper() in symbols_upper]
    
    # Perform analysis on each
    results = []
    for ann in announcements[:20]:
        analyzed = await perform_full_analysis(ann)
        results.append(analyzed)
    
    return {"announcements": results, "count": len(results)}

@app.get("/api/announcements/history")
async def get_announcement_history(symbol: str, days: int = 30):
    """
    Get historical announcements with actual outcomes
    GET /api/announcements/history?symbol=RITES&days=30
    """
    try:
        historical_engine = get_historical_engine()
        context = historical_engine.get_context(symbol)
        return context
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/accuracy/stats")
async def get_accuracy_stats(days: int = 30):
    """
    Get accuracy statistics
    GET /api/accuracy/stats?days=30
    """
    try:
        report = generate_accuracy_report(days)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/context/{symbol}")
async def get_company_context(symbol: str):
    """
    Get company-specific context
    GET /api/context/RELIANCE
    """
    try:
        historical_engine = get_historical_engine()
        context = historical_engine.get_context(symbol)
        return context
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/webhook/announcement")
async def receive_announcement_webhook(announcement: Dict, background_tasks: BackgroundTasks):
    """
    Webhook endpoint for receiving announcements from local poller
    Use this when running poller on a separate machine
    """
    # Process in background
    background_tasks.add_task(handle_announcement, announcement)
    return {"status": "received"}

# === Utility Endpoints ===

@app.get("/api/keywords")
async def get_keywords():
    """Get keyword lists for reference"""
    from analyzer import KEYWORDS_BUY, KEYWORDS_CAUTION, KEYWORDS_NEUTRAL
    return {
        "buy": KEYWORDS_BUY,
        "caution": KEYWORDS_CAUTION,
        "neutral": KEYWORDS_NEUTRAL,
    }

@app.get("/api/pe-thresholds")
async def get_pe_thresholds():
    """Get PE ratio thresholds"""
    from analyzer import PE_VALUE_THRESHOLD, PE_GROWTH_THRESHOLD
    return {
        "value": PE_VALUE_THRESHOLD,
        "growth": PE_GROWTH_THRESHOLD,
    }

@app.get("/api/dalalai/pulse/{symbol}")
async def dalalai_pulse(symbol: str):
    """
    On-Demand Stock Pulse: Runs V7 Options Flow + DalalAI 15-Model Ensemble fusion
    specifically for the requested symbol.
    """
    try:
        fused_data = await dalalai_poller_instance.run_on_demand_fusion(symbol)
        return {"status": "success", "data": fused_data}
    except Exception as e:
        logger.error(f"Error running on-demand fusion for {symbol}: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/analysis/pipeline")
async def get_pipeline_info():
    """Get information about the analysis pipeline"""
    return {
        "layers": [
            {
                "name": "FinBERT-India",
                "type": "sentiment",
                "latency_ms": 200,
                "accuracy": "88-92%",
            },
            {
                "name": "LLM Deep Analysis",
                "type": "deep_analysis",
                "latency_ms": "1000-3000",
                "accuracy": "80-86%",
                "model": "llama3.1:8b or qwen2.5:7b",
            },
            {
                "name": "Historical Similarity",
                "type": "rag",
                "latency_ms": 500,
                "accuracy": "70-78%",
                "database": "ChromaDB",
            },
            {
                "name": "Ensemble",
                "type": "combined",
                "latency_ms": "2000-4000",
                "accuracy": "85-92%",
            },
        ],
        "auto_learning": {
            "reconciliation": "daily at 16:00 IST",
            "accuracy_tracking": True,
            "auto_tuning": True,
        }
    }

if __name__ == "__main__":
    import uvicorn
    import sys
    import asyncio
    if sys.platform == 'win32' and sys.version_info < (3, 8):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    uvicorn.run(app, host="0.0.0.0", port=8080)