#!/usr/bin/env python3
"""
ML Model Training Script — Generates real feature data from Yahoo Finance
historical prices, labels them, and trains all candidate models.
Run from backend/ directory: python train_models.py
"""
import sys
import os
import time
import numpy as np
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from model_registry import ModelRegistry
from ml_ensemble import ModelArena
from feature_engineering import FeatureEngineering

TRAINING_TICKERS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ',
    'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'BAC', 'XOM', 'PFE', 'KO',
    'CSCO', 'NFLX', 'INTC', 'CRM', 'AMD', 'ORCL', 'COST', 'NKE', 'MRK', 'PEP',
    'TMO', 'ABBV', 'ACN', 'LLY', 'AVGO', 'TXN', 'QCOM', 'BA', 'GE', 'CAT',
    'CVX', 'WFC', 'GS', 'MS', 'BLK', 'ISRG', 'SNPS', 'CDNS', 'NOW', 'MCD',
    'AMGN', 'GILD', 'BKNG', 'PYPL', 'ADP', 'REGN', 'INTU', 'DECK', 'PLTR', 'UBER',
    'COIN', 'ARM', 'CRWD', 'ZS', 'SNOW', 'NET', 'DDOG', 'MSTR', 'SOFI', 'UPST',
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC',
    'KOTAKBANK', 'LT', 'WIPRO', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'TITAN', 'ASIANPAINT',
    'NTPC', 'POWERGRID', 'ONGC', 'ADANIENT', 'TATASTEEL', 'SUNPHARMA', 'HCLTECH',
    'ULTRACEMCO', 'BAJAJFINSV', 'TRENT', 'ADANIPORTS', 'COALINDIA', 'EICHERMOT', 'HEROMOTOCO',
]

INDIAN_TICKERS = set(TRAINING_TICKERS[70:])

def fetch_historical_prices(ticker: str, years: int = 3) -> list[dict]:
    try:
        import yfinance as yf
        import pandas as pd
        end = datetime.now()
        start = end - timedelta(days=years * 365)
        yf_ticker = f"{ticker}.NS" if ticker in INDIAN_TICKERS else ticker
        data = yf.download(yf_ticker, start=start, end=end, progress=False, auto_adjust=True)
        if data.empty:
            return []
        # Flatten MultiIndex columns if present (yfinance >= 0.2.40)
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)
        records = []
        for date, row in data.iterrows():
            records.append({
                'date': date.strftime('%Y-%m-%d'),
                'open': float(row['Open']),
                'high': float(row['High']),
                'low': float(row['Low']),
                'close': float(row['Close']),
                'volume': int(row['Volume']),
            })
        return records
    except Exception as e:
        print(f"  [WARN] Failed to fetch {ticker}: {e}")
        return []


def generate_training_data(ticker: str, prices: list[dict], fe_engine: FeatureEngineering) -> tuple[list, list]:
    X_samples = []
    y_samples = []

    if len(prices) < 60:
        return X_samples, y_samples

    closes = [p['close'] for p in prices]
    volumes = [p['volume'] for p in prices]

    LOOKBACK = 60
    FORWARD_DAYS = 5

    for i in range(LOOKBACK, len(prices) - FORWARD_DAYS):
        window_close = closes[i - LOOKBACK:i + 1]
        window_vol = volumes[i - LOOKBACK:i + 1]

        try:
            raw_data = {
                'symbol': ticker,
                'prices': window_close,
                'volumes': window_vol,
                'event': {'headline': '', 'llm_sentiment': 'NEUTRAL', 'llm_confidence': 50},
            }
            features = fe_engine.generate_features(raw_data)
        except Exception:
            continue

        if features is None or len(features) < 22:
            continue

        future_return = (closes[i + FORWARD_DAYS] - closes[i]) / closes[i]
        label = 1 if future_return > 0.01 else 0

        X_samples.append(features[:22])
        y_samples.append(label)

    return X_samples, y_samples


def main():
    print("=" * 70)
    print("QUANTUM ALPHA ML — Model Training Pipeline")
    print("=" * 70)

    os.makedirs("data", exist_ok=True)
    registry = ModelRegistry("data/stage_b_registry.db")
    arena = ModelArena(registry)
    fe_engine = FeatureEngineering()

    all_X = []
    all_y = []
    tickers_processed = 0

    print(f"\nTraining universe: {len(TRAINING_TICKERS)} tickers")
    print("Fetching 3 years of daily data...\n")

    for i, ticker in enumerate(TRAINING_TICKERS):
        print(f"  [{i+1}/{len(TRAINING_TICKERS)}] {ticker}...", end=" ", flush=True)
        prices = fetch_historical_prices(ticker, years=3)
        if not prices:
            print("SKIP (no data)")
            continue

        X, y = generate_training_data(ticker, prices, fe_engine)
        print(f"{len(prices)} days -> {len(X)} samples")

        all_X.extend(X)
        all_y.extend(y)
        tickers_processed += 1

        time.sleep(0.5)

    if not all_X:
        print("\n[ERROR] No training data generated. Check yfinance connection.")
        sys.exit(1)

    X_train = np.array(all_X)
    y_train = np.array(all_y)

    print(f"\n{'=' * 70}")
    print(f"Training dataset: {X_train.shape[0]} samples, {X_train.shape[1]} features")
    print(f"Positive rate: {y_train.mean():.1%} ({y_train.sum()}/{len(y_train)})")
    print(f"Tickers processed: {tickers_processed}/{len(TRAINING_TICKERS)}")
    print(f"{'=' * 70}\n")

    print("Training all candidate models...")
    results = arena.train_all_candidates(
        X_train=X_train,
        y_train=y_train,
        dataset_version=f"v1.0_{datetime.now().strftime('%Y%m%d')}",
        feature_version="v3.1",
    )

    print(f"\n{'=' * 70}")
    print("TRAINING RESULTS")
    print(f"{'=' * 70}")
    for model_name, metrics in results.items():
        print(f"  {model_name:20s} Brier={metrics.get('brier_score', 'N/A'):.4f}  AUC={metrics.get('roc_auc', 'N/A'):.4f}")

    champion = registry.get_champion()
    if champion:
        print(f"\nChampion: {champion.get('model_name', 'unknown')}")
    else:
        print("\nNo champion model registered")

    print(f"\nTraining complete. Models saved to data/stage_b_registry.db")


if __name__ == "__main__":
    main()
