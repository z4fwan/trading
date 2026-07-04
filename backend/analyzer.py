"""
AI Categorization & Momentum Predictor for Corporate Announcements
Analyzes announcement headlines and provides trading signals based on:
- Keyword sentiment analysis
- PE ratio from yfinance
- Signal strength classification
"""

import yfinance as yf
from typing import Dict, List, Tuple, Optional
from datetime import datetime

# === Enhanced Keyword Classification for Indian Markets ===
# These keywords are specifically tuned for NSE/BSE corporate announcements

KEYWORDS_BUY = [
    # Order Wins & Contracts
    "award of contract", "order win", "received order", "bagged order",
    "execution of", "secures order", "lands order", "contract from",
    "export order", "letter of award", "letter of intent", "loi received",
    "emerging as lowest bidder", "l1 bidder", "won order", "won bid",
    "selected as", "awarded contract", "finalized order",
    
    # Partnerships & Strategic Moves
    "mou", "memorandum of understanding", "joint venture", "jv agreement",
    "strategic investment", "strategic partnership", "collaboration agreement",
    "tie-up", "partnership agreement", "alliance",
    
    # Corporate Actions (Positive)
    "acquisition", "acquires", "acquiring stake", "buyout",
    "capacity expansion", "new plant", "plant commissioning",
    "greenfield project", "brownfield expansion", "facility expansion",
    
    # Financial Improvements
    "debt reduction", "loan repayment", "debt free", "deleveraging",
    "credit rating upgrade", "rating upgrade", "upgrade in credit rating",
    "revenue growth", "profit increase", "profit surge", "profit jump",
    "margin expansion", "ebitda growth", "operating profit growth",
    "record high", "all time high", "best quarter", "record profit",
    
    # Shareholder Returns
    "dividend", "interim dividend", "final dividend", "special dividend",
    "bonus issue", "bonus shares", "stock split", "share buyback",
    "buyback offer", "insider buying", "promoter buying", "open offer",
    "increase in promoter holding", "promoter stake increase",
    
    # Regulatory & Approvals
    "regulatory approval", "license received", "patent granted",
    "fda approval", "usfda approval", "who-gmp", "certification received",
    "merger approval", "nclt approval", "demerger", "scheme approval",
    "listing", "listed on", "index inclusion", "nifty 50", "sensex",
    
    # Analyst Actions
    "target price hike", "analyst upgrade", "positive outlook",
    "outperform", "buy rating", "overweight", "add rating",
    "price target raised", "upgrade to buy",
    
    # Sector-Specific Positive
    "drug price control", "dpcO exemption", "orphan drug",
    "anda approval", "nda filing", "clinical trial success",
    "phase 3 trial", "trial results", "positive trial data",
    "mine allocation", "mining lease", "fuel supply agreement",
    "fsa signed", "power purchase agreement", "ppa signed",
    "sustainable growth", "strong pipeline", "robust growth"
]

KEYWORDS_CAUTION = [
    # Legal & Regulatory Issues
    "investigation", "show cause", "show cause notice", "scn issued",
    "regulatory action", "penalty imposed", "fine levied", "monetary penalty",
    "fraud", "alleged fraud", "misstatement", "window dressing",
    "lawsuit", "legal notice", "forensic audit", "forensic audit ordered",
    "insider trading", "sebi notice", "sebi order", "sebi directive",
    "compliance failure", "non-compliance", "violation of norms",
    
    # Trading Restrictions
    "suspension", "trading suspension", "trade to trade", "t2t segment",
    "trading ban", "price manipulation", "circuit filter", "lower circuit",
    "upper circuit", "ASM framework", "GSM framework", "surveillance measure",
    
    # Financial Distress
    "debt default", "loan default", "default on payment", "overdue payment",
    "credit downgrade", "rating downgrade", "downgrade in credit rating",
    "loss", "net loss", "quarterly loss", "annual loss",
    "revenue decline", "profit decline", "margin contraction",
    "profit warning", "earnings warning", "guidance cut",
    
    # Corporate Distress
    "foreclosure", "insolvency", "insolvency proceedings", "ibcir",
    "liquidation", "winding up", "winding up petition", "strike off",
    "corporate debt restructuring", "cdr", "debt restructuring",
    
    # Operational Issues
    "strike", "labour strike", "factory shutdown", "plant shutdown",
    "production halt", "operational issues", "force majeure",
    "environmental notice", "pollution notice", "pcb notice",
    "accident", "fatal accident", "industrial accident",
    
    # Management Issues
    "resignation", "ceo resignation", "cfo resignation", "auditor resignation",
    "independent director resignation", "whole time director resignation",
    "pledge invocation", "promoter pledge", "encumbrance created",
    "lien on shares", "shares pledged", "pledge of shares",
    "adverse remark", "qualified opinion", "adverse audit opinion",
    
    # Other Negative
    "delay", "project delay", "commissioning delay", "postponed",
    "cancelled", "terminated", "withdrawn", "rejected",
    "discontinuation", "discontinue", "exit business",
    "asset sale", "divestment", "stake sale", "reduction in stake"
]

KEYWORDS_NEUTRAL = [
    # Routine Filings
    "board meeting", "board meeting agenda", "record date", "ex-date",
    "ex-dividend", "agm", "annual general meeting", "egm", "extraordinary general meeting",
    "notice", "intimation", "disclosure", "filing", "compliance",
    "routine filing", "regulatory filing", "secretarial compliance",
    
    # Appointments
    "appointment", "re-appointment", "consolidation", "sub-division",
    "change in director", "change in kmp", "kmp appointment",
    "company secretary", "authorized signatory", "ceo appointment",
    "cfo appointment", "managing director", "whole time director",
    
    # Administrative
    "change in registered office", "address change", "name change",
    "isin", "dematerialization", "demat", "share certificate",
    "book closure", "closure of trading window", "trading window",
    
    # Financial Reporting (Routine)
    "financial results", "quarterly results", "annual results",
    "standalone results", "consolidated results", "audited results",
    "unaudited results", "limited review",
    
    # Corporate Actions (Neutral)
    "scheme of arrangement", "compromise", "arrangement",
    "capital restructuring", "reorganization",
    
    # Sector-Specific Neutral
    "price revision", "price increase", "price decrease", "revision in price",
    "tariff revision", "rate revision", "periodic review"
]

# === Sector-Specific Keyword Boosts ===
# These keywords get extra weight when analyzing sector-specific announcements

SECTOR_BOOST_KEYWORDS = {
    "IT": ["order win", "contract", "deal", "client", "revenue", "guidance", "margin"],
    "Pharma": ["fda", "approval", "anda", "nda", "trial", "patent", "drug", "generic"],
    "Banking": ["npa", "provision", "credit growth", "deposit", "advance", "capital adequacy"],
    "Auto": ["sales", "production", "dispatch", "oem", "export", "launch", "model"],
    "FMCG": ["volume growth", "rural", "urban", "distribution", "launch", "market share"],
    "Metal": ["production", "capacity", "realization", "export", "duty", "allocation"],
    "Oil_Gas": ["production", "reserve", "drilling", "exploration", "fsa", "ppa"],
    "Telecom": ["subscriber", "aru", "data usage", "tariff", "spectrum", "rollout"],
    "Real_Estate": ["launch", "booking", "sales", "completion", "possession", "launch"],
    "Power": ["generation", "plf", "capacity", "ppa", "coal", "tariff"]
}

# === Phrase Patterns (More sophisticated than single keywords) ===
POSITIVE_PHRASE_PATTERNS = [
    r"bagged\s+(an?\s+)?order",
    r"won\s+(the\s+)?order",
    r"secured\s+(an?\s+)?contract",
    r"emerged\s+as\s+l1",
    r"letter\s+of\s+intent",
    r"letter\s+of\s+award",
    r"(positive|strong|robust)\s+(growth|performance|results)",
    r"(significant|substantial)\s+(increase|growth|improvement)",
    r"beat\s+(expectations|estimates)",
    r"upgrade\s+(to\s+)?(buy|outperform|overweight)",
    r"raise(s|d)?\s+(price\s+)?target",
    r"promoter(s)?\s+(increase|buy|acquire)",
    r"debt\s+(free|reduction|repaid)",
    r"record\s+(high|profit|revenue|performance)",
    r"best\s+(ever|quarter|performance)",
    r"capacity\s+(expansion|enhancement|increase)",
    r"strategic\s+(partnership|investment|tie-up|alliance)",
    r"regulatory\s+approval",
    r"(fda|usfda|who)\s+approval",
    r"clinical\s+trial\s+success",
    r"phase\s+3\s+trial\s+(success|positive)",
]

NEGATIVE_PHRASE_PATTERNS = [
    r"(show\s+cause|scn)\s+notice",
    r"(sebi|regulatory)\s+notice",
    r"(investigation|probe|inquiry)\s+(ordered|initiated)",
    r"(debt|loan)\s+default",
    r"credit\s+downgrade",
    r"(forensic|special)\s+audit",
    r"(trading|share)\s+suspension",
    r"(lower|upper)\s+circuit",
    r"promoter(s)?\s+(pledge|encumbrance)",
    r"(ceo|cfo|auditor)\s+resignation",
    r"(loss|decline|contraction)\s+in\s+(profit|revenue|margin)",
    r"profit\s+warning",
    r"(insolvency|liquidation|winding\s+up)",
    r"qualified\s+opinion",
    r"adverse\s+(remark|opinion)",
    r"(strike|shutdown|halt)\s+in\s+production",
    r"(terminated|cancelled|withdrawn)\s+(order|contract|agreement)",
]

# PE Ratio Thresholds
PE_VALUE_THRESHOLD = 30
PE_GROWTH_THRESHOLD = 70


def get_yahoo_symbol(ticker: str, exchange: str) -> str:
    """Convert NSE/BSE ticker to Yahoo Finance symbol"""
    if exchange == "NSE":
        return f"{ticker}.NS"
    elif exchange == "BSE":
        return f"{ticker}.BO"
    return ticker


def fetch_pe_ratio(ticker: str, exchange: str) -> Optional[float]:
    """Fetch PE ratio from yfinance"""
    try:
        symbol = get_yahoo_symbol(ticker, exchange)
        stock = yf.Ticker(symbol)
        info = stock.info
        pe = info.get('trailingPE') or info.get('forwardPE')
        if pe and pe > 0:
            return round(float(pe), 2)
    except Exception as e:
        print(f"Error fetching PE for {ticker}: {e}")
    return None


def classify_announcement(headline: str, ticker: str, exchange: str) -> Dict:
    """
    Classify announcement and generate trading signal
    
    Returns:
        dict with sentiment, signal, confidence, pe_ratio, reasoning
    """
    hl_lower = headline.lower()
    
    # Check for caution keywords first (they override)
    caution_matches = [kw for kw in KEYWORDS_CAUTION if kw in hl_lower]
    buy_matches = [kw for kw in KEYWORDS_BUY if kw in hl_lower]
    neutral_matches = [kw for kw in KEYWORDS_NEUTRAL if kw in hl_lower]
    
    # Determine base sentiment
    if caution_matches:
        sentiment = "negative"
    elif buy_matches:
        sentiment = "positive"
    elif neutral_matches:
        sentiment = "neutral"
    else:
        sentiment = "neutral"
    
    # Fetch PE ratio
    pe_ratio = fetch_pe_ratio(ticker, exchange)
    
    # Generate signal based on sentiment and PE
    signal = "HOLD"
    confidence = 50
    reasoning = []
    
    if sentiment == "positive":
        if pe_ratio is None:
            signal = "MODERATE_BUY"
            confidence = 55
            reasoning.append("Positive announcement but PE data unavailable")
        elif pe_ratio < PE_VALUE_THRESHOLD:
            signal = "STRONG_BUY"
            confidence = 80
            reasoning.append(f"Positive news + Value zone (PE: {pe_ratio})")
        elif pe_ratio < PE_GROWTH_THRESHOLD:
            signal = "MODERATE_BUY"
            confidence = 65
            reasoning.append(f"Positive news + Growth zone (PE: {pe_ratio})")
        else:
            signal = "SPECULATIVE_BUY"
            confidence = 45
            reasoning.append(f"Positive news but High PE ({pe_ratio}) - speculative")
        
        if buy_matches:
            reasoning.append(f"Matched keywords: {', '.join(buy_matches[:3])}")
    
    elif sentiment == "negative":
        if pe_ratio and pe_ratio < PE_VALUE_THRESHOLD:
            signal = "CAUTION"
            confidence = 70
            reasoning.append(f"Negative news but stock in value zone (PE: {pe_ratio})")
        else:
            signal = "AVOID"
            confidence = 80
            reasoning.append("Negative announcement - avoid or reduce position")
        
        if caution_matches:
            reasoning.append(f"Warning keywords: {', '.join(caution_matches[:3])}")
    
    else:  # neutral
        signal = "HOLD"
        confidence = 50
        if neutral_matches:
            reasoning.append(f"Routine filing ({', '.join(neutral_matches[:2])})")
        else:
            reasoning.append("No significant keywords detected")
    
    # Calculate momentum impact score (0-100)
    momentum_impact = calculate_momentum_impact(signal, confidence, pe_ratio)
    
    return {
        "sentiment": sentiment,
        "signal": signal,
        "confidence": confidence,
        "pe_ratio": pe_ratio,
        "reasoning": reasoning,
        "momentum_impact": momentum_impact,
        "buy_keywords": buy_matches,
        "caution_keywords": caution_matches,
        "neutral_keywords": neutral_matches,
    }


def calculate_momentum_impact(signal: str, confidence: int, pe_ratio: Optional[float]) -> int:
    """Calculate expected momentum impact score (0-100)"""
    base_scores = {
        "STRONG_BUY": 85,
        "MODERATE_BUY": 65,
        "SPECULATIVE_BUY": 45,
        "HOLD": 50,
        "CAUTION": 35,
        "AVOID": 20,
    }
    
    base = base_scores.get(signal, 50)
    
    # Adjust by confidence
    confidence_factor = confidence / 100
    impact = base * confidence_factor
    
    # PE adjustment
    if pe_ratio:
        if pe_ratio < 20:
            impact += 5  # Deep value bonus
        elif pe_ratio > 100:
            impact -= 10  # Extreme overvaluation penalty
    
    return min(100, max(0, int(impact)))


def get_pe_category(pe_ratio: Optional[float]) -> Tuple[str, str]:
    """Get PE category label and color"""
    if pe_ratio is None:
        return "N/A", "bg-slate-500/20 text-slate-400 border-slate-500/30"
    if pe_ratio < PE_VALUE_THRESHOLD:
        return f"Value ({pe_ratio:.1f})", "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    if pe_ratio < PE_GROWTH_THRESHOLD:
        return f"Growth ({pe_ratio:.1f})", "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    return f"Hype ({pe_ratio:.1f})", "bg-red-500/20 text-red-400 border-red-500/30"


def analyze_batch(announcements: List[Dict]) -> List[Dict]:
    """Analyze a batch of announcements"""
    results = []
    for ann in announcements:
        analysis = classify_announcement(
            ann.get("headline", ""),
            ann.get("symbol", ann.get("ticker", "")),
            ann.get("exchange", "NSE")
        )
        results.append({
            **ann,
            **analysis,
            "analyzed_at": datetime.now().isoformat()
        })
    return results