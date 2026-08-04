#!/usr/bin/env python3
"""Quick training: 30 tickers, 3yr data, all models."""
import sys, os, time, numpy as np
from datetime import datetime, timedelta
import pandas as pd
import yfinance as yf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_registry import ModelRegistry
from ml_ensemble import ModelArena
from feature_engineering import FeatureEngineering

FAST_TICKERS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ',
    'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'BAC', 'XOM', 'PFE', 'KO',
    'NFLX', 'CRM', 'AMD', 'COST', 'NKE', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
]
INDIAN = {'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK'}

os.makedirs('data', exist_ok=True)
registry = ModelRegistry('data/stage_b_registry.db')
arena = ModelArena(registry)
fe_engine = FeatureEngineering()
all_X, all_y = [], []

for i, ticker in enumerate(FAST_TICKERS):
    print(f'  [{i+1}/{len(FAST_TICKERS)}] {ticker}...', end=' ', flush=True)
    try:
        end = datetime.now()
        start = end - timedelta(days=3 * 365)
        yf_ticker = f'{ticker}.NS' if ticker in INDIAN else ticker
        data = yf.download(yf_ticker, start=start, end=end, progress=False, auto_adjust=True)
        if data.empty:
            print('SKIP')
            continue
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)
        closes = [float(row['Close']) for _, row in data.iterrows()]
        volumes = [int(row['Volume']) for _, row in data.iterrows()]
        if len(closes) < 66:
            print(f'too few ({len(closes)})')
            continue
        count = 0
        for j in range(60, len(closes) - 5):
            try:
                raw = {
                    'symbol': ticker,
                    'prices': closes[j - 60:j + 1],
                    'volumes': volumes[j - 60:j + 1],
                    'event': {'headline': '', 'llm_sentiment': 'NEUTRAL', 'llm_confidence': 50},
                }
                feats = fe_engine.generate_features(raw)
                if feats is not None and len(feats) >= 22:
                    label = 1 if (closes[j + 5] - closes[j]) / closes[j] > 0.01 else 0
                    all_X.append(feats[:22])
                    all_y.append(label)
                    count += 1
            except Exception:
                continue
        print(f'{len(closes)}d -> {count} samples')
        time.sleep(0.3)
    except Exception as e:
        print(f'ERR: {e}')

X = np.array(all_X)
y = np.array(all_y)
print(f'\nDataset: {X.shape[0]} samples, {X.shape[1]} features, {y.mean():.1%} positive')

results = arena.train_all_candidates(
    X_train=X, y_train=y,
    dataset_version=f'v1.0_{datetime.now().strftime("%Y%m%d")}',
    feature_version='v3.1',
)

print('\nRESULTS:')
for name, m in results.items():
    print(f'  {name:20s} Brier={m["brier_score"]:.4f}  AUC={m["roc_auc"]:.4f}')

champion = registry.get_champion()
print(f'\nChampion: {champion.get("model_name", "none") if champion else "none"}')
print('Done.')
