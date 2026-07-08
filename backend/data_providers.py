from abc import ABC, abstractmethod
from typing import Dict, List, Optional
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

class DataProvider(ABC):
    """
    Agnostic interface for fetching historical and real-time market data.
    Future-proofs the system against dependency on any single data source.
    """
    
    @abstractmethod
    def fetch_historical_data(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """Fetch OHLCV data for a specific ticker and date range"""
        pass
        
    @abstractmethod
    def fetch_events(self, ticker: str, start_date: str, end_date: str) -> List[Dict]:
        """Fetch historical events (news, earnings) for a specific ticker"""
        pass
        
    @abstractmethod
    def get_realtime_quote(self, ticker: str) -> Dict:
        """Fetch current realtime quote for execution/risk sizing"""
        pass


class SimulatedProvider(DataProvider):
    """
    Generates simulated data exclusively for validating the research framework.
    Never used for actual strategy validation.
    """
    
    def __init__(self, seed: int = 42):
        self.seed = seed
        np.random.seed(seed)
        
    def fetch_historical_data(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        """Generates random walk OHLCV data with some simulated drift/volatility"""
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)
        days = (end - start).days
        
        # Generate random walk
        returns = np.random.normal(0.0005, 0.015, days) # slight positive drift, 1.5% daily vol
        price = 1000 * np.exp(np.cumsum(returns))
        
        dates = pd.date_range(start=start_date, periods=days, freq='D')
        
        # Generate base prices
        base_open = price * np.random.uniform(0.99, 1.01, days)
        base_close = price
        
        # Ensure high/low are valid
        actual_high = np.maximum(base_open, base_close) * np.random.uniform(1.0, 1.02, days)
        actual_low = np.minimum(base_open, base_close) * np.random.uniform(0.98, 1.0, days)
        
        df = pd.DataFrame({
            'date': dates,
            'open': base_open,
            'high': actual_high,
            'low': actual_low,
            'close': base_close,
            'volume': np.random.normal(1e6, 2e5, days).astype(int),
            'ticker': ticker
        })
        
        # Keep only weekdays
        df = df[df['date'].dt.dayofweek < 5].reset_index(drop=True)
        return df
        
    def fetch_events(self, ticker: str, start_date: str, end_date: str) -> List[Dict]:
        """Generate random events for testing leakage and pipeline alignment"""
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)
        days = (end - start).days
        
        events = []
        # Simulate an event every ~30 days
        for i in range(0, days, 30):
            event_date = start + timedelta(days=i + np.random.randint(0, 10))
            if event_date > end:
                continue
                
            sentiment = np.random.choice(['BULLISH', 'BEARISH', 'NEUTRAL'])
            events.append({
                'date': event_date.isoformat(),
                'ticker': ticker,
                'headline': f"Simulated {sentiment} event for {ticker}",
                'event_type': np.random.choice(['EARNINGS', 'MACRO', 'NEWS']),
                'sentiment_score': 0.8 if sentiment == 'BULLISH' else 0.2 if sentiment == 'BEARISH' else 0.5,
                'urgency': np.random.randint(20, 100),
                'relevance': np.random.randint(50, 100)
            })
            
        return events
        
    def get_realtime_quote(self, ticker: str) -> Dict:
        return {
            'ticker': ticker,
            'price': float(np.random.normal(1000, 5)),
            'bid': float(np.random.normal(999, 5)),
            'ask': float(np.random.normal(1001, 5)),
            'volume': int(np.random.normal(10000, 1000)),
            'timestamp': datetime.now().isoformat()
        }


# Stubs for future implementations
class YahooProvider(DataProvider):
    def fetch_historical_data(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError("YahooProvider will be implemented in Stage B")
    def fetch_events(self, ticker: str, start_date: str, end_date: str) -> List[Dict]:
        raise NotImplementedError("YahooProvider will be implemented in Stage B")
    def get_realtime_quote(self, ticker: str) -> Dict:
        raise NotImplementedError("YahooProvider will be implemented in Stage B")

class NSEProvider(DataProvider):
    def fetch_historical_data(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        raise NotImplementedError("NSEProvider will be implemented in Stage B")
    def fetch_events(self, ticker: str, start_date: str, end_date: str) -> List[Dict]:
        raise NotImplementedError("NSEProvider will be implemented in Stage B")
    def get_realtime_quote(self, ticker: str) -> Dict:
        raise NotImplementedError("NSEProvider will be implemented in Stage B")
        
class YahooProvider(DataProvider):
    """
    Fetches real historical OHLCV data using yfinance.
    Data is split and dividend adjusted by default.
    """
    
    def fetch_historical_data(self, ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
        import yfinance as yf
        
        # yfinance expects YYYY-MM-DD
        start_date_str = pd.to_datetime(start_date).strftime('%Y-%m-%d')
        end_date_str = pd.to_datetime(end_date).strftime('%Y-%m-%d')
        
        # Use NS suffix for Indian stocks if no suffix is provided
        yf_ticker = f"{ticker}.NS" if not '.' in ticker else ticker
        
        df = yf.download(yf_ticker, start=start_date_str, end=end_date_str, progress=False)
        
        if df.empty:
            raise ValueError(f"YahooProvider returned empty dataset for {ticker}")
            
        # yf.download sometimes returns MultiIndex columns if multiple tickers. Clean it up.
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
            
        df = df.reset_index()
        
        # Standardize column names to lowercase
        df = df.rename(columns={
            'Date': 'date',
            'Open': 'open',
            'High': 'high',
            'Low': 'low',
            'Close': 'close',
            'Volume': 'volume'
        })
        
        df['ticker'] = ticker
        
        # Ensure correct types and handle missing values by forward filling
        numeric_cols = ['open', 'high', 'low', 'close', 'volume']
        df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors='coerce')
        df = df.dropna(subset=['close'])
        df[numeric_cols] = df[numeric_cols].ffill().bfill()
        
        return df[['date', 'open', 'high', 'low', 'close', 'volume', 'ticker']]
        
    def fetch_events(self, ticker: str, start_date: str, end_date: str) -> List[Dict]:
        # yfinance doesn't easily provide historical news going back 10 years
        # For Stage B strategy validation, we return empty events unless explicit sentiment data is loaded.
        return []
        
    def get_realtime_quote(self, ticker: str) -> Dict:
        import yfinance as yf
        yf_ticker = f"{ticker}.NS" if not '.' in ticker else ticker
        ticker_obj = yf.Ticker(yf_ticker)
        data = ticker_obj.fast_info
        
        return {
            'ticker': ticker,
            'price': data.last_price,
            'timestamp': datetime.now().isoformat(),
            'volume': data.last_volume,
        }
