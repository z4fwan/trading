"""
Quantum Alpha V3 - Execution Intelligence Engine
Optimizes trade execution with spread analysis, slippage estimation, and smart order routing
"""

import sqlite3
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

@dataclass
class ExecutionQuality:
    """Execution quality metrics for a trade"""
    ticker: str
    order_size: int
    recommended_order_type: str  # MARKET, LIMIT, VWAP
    recommended_participation_rate: float  # % of volume
    spread_cost: float  # %
    slippage_estimate: float  # %
    liquidity_score: float  # 0-100
    market_impact: float  # %
    auction_period_active: bool
    circuit_filter_active: bool
    execution_urgency: str  # LOW, MEDIUM, HIGH
    recommended_timing: str  # IMMEDIATE, WAIT, GRADUAL

class ExecutionIntelligence:
    """
    Optimize trade execution:
    1. Spread analysis
    2. Liquidity assessment
    3. Slippage estimation
    4. Auction period detection
    5. Circuit filter awareness
    6. Market impact modeling
    """
    
    def __init__(self, db_path: str = "data/execution_intelligence.db"):
        self.db_path = db_path
        self._init_database()
        
        # Execution thresholds
        self.LIQUIDITY_THRESHOLDS = {
            'high': 1000000,   # > 1M avg daily volume
            'medium': 200000,  # 200K-1M
            'low': 50000       # < 200K
        }
        
        self.SPREAD_THRESHOLDS = {
            'tight': 0.05,     # < 0.05%
            'normal': 0.15,    # 0.05-0.15%
            'wide': 0.30       # > 0.15%
        }
        
    def _init_database(self):
        """Initialize SQLite database for execution intelligence"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Historical execution data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS execution_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                execution_date TEXT NOT NULL,
                order_type TEXT NOT NULL,
                order_size INTEGER NOT NULL,
                execution_price REAL NOT NULL,
                expected_price REAL,
                spread_cost REAL,
                slippage REAL,
                market_impact REAL,
                participation_rate REAL,
                liquidity_score REAL,
                execution_quality REAL,
                created_at TEXT
            )
        """)
        
        # Liquidity profiles
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS liquidity_profiles (
                ticker TEXT PRIMARY KEY,
                avg_daily_volume REAL,
                avg_spread REAL,
                avg_slippage REAL,
                market_impact_coefficient REAL,
                best_execution_time TEXT,
                worst_execution_time TEXT,
                updated_at TEXT
            )
        """)
        
        # Circuit filter history
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS circuit_filter_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                circuit_status TEXT NOT NULL,
                price_change_percent REAL,
                detected_at TEXT
            )
        """)
        
        # Indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_execution_ticker ON execution_history(ticker)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_execution_date ON execution_history(execution_date)")
        
        conn.commit()
        conn.close()
    
    def assess_execution_quality(
        self,
        ticker: str,
        order_size: int,
        current_price: float,
        market_data: Dict = None
    ) -> ExecutionQuality:
        """
        Assess execution quality for a potential trade.
        
        Args:
            ticker: Stock symbol
            order_size: Number of shares to trade
            current_price: Current market price
            market_data: Optional market data (volume, spread, etc.)
            
        Returns:
            ExecutionQuality object with recommendations
        """
        # Get liquidity profile
        liquidity_profile = self._get_liquidity_profile(ticker)
        
        # Calculate spread cost
        spread_cost = self._estimate_spread_cost(ticker, market_data)
        
        # Calculate slippage estimate
        slippage_estimate = self._estimate_slippage(
            ticker, order_size, current_price, liquidity_profile
        )
        
        # Calculate liquidity score
        liquidity_score = self._calculate_liquidity_score(
            ticker, order_size, current_price, liquidity_profile
        )
        
        # Calculate market impact
        market_impact = self._calculate_market_impact(
            ticker, order_size, current_price, liquidity_profile
        )
        
        # Check auction period
        auction_active = self._is_auction_period()
        
        # Check circuit filter
        circuit_active, circuit_status = self._check_circuit_filter(ticker, market_data)
        
        # Determine recommended order type
        order_type = self._recommend_order_type(
            spread_cost, liquidity_score, order_size, liquidity_profile
        )
        
        # Determine participation rate
        participation_rate = self._recommend_participation_rate(
            order_size, liquidity_profile, liquidity_score
        )
        
        # Determine execution urgency
        execution_urgency = self._determine_execution_urgency(
            spread_cost, liquidity_score, circuit_active
        )
        
        # Determine recommended timing
        recommended_timing = self._recommend_timing(
            auction_active, circuit_active, execution_urgency
        )
        
        return ExecutionQuality(
            ticker=ticker,
            order_size=order_size,
            recommended_order_type=order_type,
            recommended_participation_rate=participation_rate,
            spread_cost=round(spread_cost, 4),
            slippage_estimate=round(slippage_estimate, 4),
            liquidity_score=round(liquidity_score, 2),
            market_impact=round(market_impact, 4),
            auction_period_active=auction_active,
            circuit_filter_active=circuit_active,
            execution_urgency=execution_urgency,
            recommended_timing=recommended_timing
        )
    
    def _get_liquidity_profile(self, ticker: str) -> Dict:
        """Get historical liquidity profile for a ticker"""
        conn = sqlite3.connect(self.db_path)
        
        query = """
            SELECT * FROM liquidity_profiles WHERE ticker = ?
        """
        
        df = pd.read_sql_query(query, conn, params=[ticker])
        conn.close()
        
        if df.empty:
            # Default profile for unknown tickers
            return {
                'avg_daily_volume': 100000,
                'avg_spread': 0.10,
                'avg_slippage': 0.15,
                'market_impact_coefficient': 0.0001,
                'best_execution_time': '10:30',
                'worst_execution_time': '15:00'
            }
        
        row = df.iloc[0]
        return {
            'avg_daily_volume': row['avg_daily_volume'],
            'avg_spread': row['avg_spread'],
            'avg_slippage': row['avg_slippage'],
            'market_impact_coefficient': row['market_impact_coefficient'],
            'best_execution_time': row['best_execution_time'],
            'worst_execution_time': row['worst_execution_time']
        }
    
    def _estimate_spread_cost(self, ticker: str, market_data: Dict = None) -> float:
        """Estimate spread cost as percentage"""
        if market_data and 'spread' in market_data:
            return market_data['spread']
        
        # Use historical average
        profile = self._get_liquidity_profile(ticker)
        return profile['avg_spread']
    
    def _estimate_slippage(
        self, ticker: str, order_size: int, current_price: float, 
        liquidity_profile: Dict
    ) -> float:
        """Estimate slippage as percentage"""
        avg_volume = liquidity_profile['avg_daily_volume']
        
        # Participation rate (order size / avg daily volume)
        participation = order_size / avg_volume if avg_volume > 0 else 1.0
        
        # Slippage increases with participation rate
        # Base slippage + additional for market impact
        base_slippage = liquidity_profile['avg_slippage']
        
        # Additional slippage based on participation
        if participation < 0.01:  # < 1% of volume
            slippage_multiplier = 1.0
        elif participation < 0.05:  # 1-5% of volume
            slippage_multiplier = 1.5
        elif participation < 0.10:  # 5-10% of volume
            slippage_multiplier = 2.5
        else:  # > 10% of volume
            slippage_multiplier = 4.0
        
        return base_slippage * slippage_multiplier
    
    def _calculate_liquidity_score(
        self, ticker: str, order_size: int, current_price: float,
        liquidity_profile: Dict
    ) -> float:
        """Calculate liquidity score (0-100)"""
        avg_daily_value = liquidity_profile['avg_daily_volume'] * current_price
        order_value = order_size * current_price
        
        # Participation rate
        participation = order_value / avg_daily_value if avg_daily_value > 0 else 1.0
        
        # Score based on participation (lower is better)
        if participation < 0.001:  # < 0.1% of daily value
            return min(100, 95)
        elif participation < 0.005:  # 0.1-0.5%
            return min(100, 85)
        elif participation < 0.01:  # 0.5-1%
            return min(100, 75)
        elif participation < 0.05:  # 1-5%
            return min(100, 60)
        elif participation < 0.10:  # 5-10%
            return min(100, 40)
        else:  # > 10%
            return max(0, min(100, 20))
    
    def _calculate_market_impact(
        self, ticker: str, order_size: int, current_price: float,
        liquidity_profile: Dict
    ) -> float:
        """Calculate expected market impact as percentage"""
        avg_volume = liquidity_profile['avg_daily_volume']
        coefficient = liquidity_profile['market_impact_coefficient']
        
        # Simple market impact model
        participation = order_size / avg_volume if avg_volume > 0 else 1.0
        
        # Market impact = coefficient * sqrt(participation) * 100
        impact = coefficient * np.sqrt(participation) * 100
        
        return min(impact, 2.0)  # Cap at 2%
    
    def _is_auction_period(self) -> bool:
        """Check if current time is during auction period"""
        now = datetime.now()
        hour = now.hour
        minute = now.minute
        
        # NSE auction periods:
        # Pre-open: 9:00 - 9:08
        # Regular: 9:15 - 15:30
        # Post-close: 15:40 - 16:00
        
        if 9 <= hour < 9.15 or 15.30 <= hour < 15.67:
            return True
        
        return False
    
    def _check_circuit_filter(
        self, ticker: str, market_data: Dict = None
    ) -> Tuple[bool, str]:
        """Check if circuit filter is active"""
        if market_data and 'price_change_percent' in market_data:
            change = abs(market_data['price_change_percent'])
            
            if change >= 20:
                return True, 'UPPER_LOWER_CIRCUIT'
            elif change >= 15:
                return True, 'INTERMEDIATE_CIRCUIT'
            elif change >= 10:
                return True, 'CAUTION_CIRCUIT'
            else:
                return False, 'NORMAL'
        
        # Default to normal if no data
        return False, 'NORMAL'
    
    def _recommend_order_type(
        self, spread_cost: float, liquidity_score: float,
        order_size: int, liquidity_profile: Dict
    ) -> str:
        """Recommend optimal order type"""
        # High liquidity, tight spread -> MARKET
        if liquidity_score >= 80 and spread_cost <= 0.05:
            return 'MARKET'
        
        # Medium liquidity or wider spread -> LIMIT
        if liquidity_score >= 50 or spread_cost <= 0.15:
            return 'LIMIT'
        
        # Large order size relative to volume -> VWAP
        avg_volume = liquidity_profile['avg_daily_volume']
        participation = order_size / avg_volume if avg_volume > 0 else 1.0
        
        if participation > 0.05:
            return 'VWAP'
        
        return 'LIMIT'
    
    def _recommend_participation_rate(
        self, order_size: int, liquidity_profile: Dict, liquidity_score: float
    ) -> float:
        """Recommend participation rate as percentage of volume"""
        avg_volume = liquidity_profile['avg_daily_volume']
        
        # Base participation rate
        if liquidity_score >= 80:
            base_rate = 0.20  # 20% of volume
        elif liquidity_score >= 60:
            base_rate = 0.15  # 15% of volume
        elif liquidity_score >= 40:
            base_rate = 0.10  # 10% of volume
        else:
            base_rate = 0.05  # 5% of volume
        
        # Adjust for order size
        max_participation = min(0.25, order_size / (avg_volume * 0.1) if avg_volume > 0 else 0.05)
        
        return min(base_rate, max_participation)
    
    def _determine_execution_urgency(
        self, spread_cost: float, liquidity_score: float, circuit_active: bool
    ) -> str:
        """Determine execution urgency"""
        # High urgency if circuit is active (price moving fast)
        if circuit_active:
            return 'HIGH'
        
        # Urgency based on spread and liquidity
        if spread_cost <= 0.05 and liquidity_score >= 80:
            return 'LOW'
        elif spread_cost <= 0.15 and liquidity_score >= 60:
            return 'MEDIUM'
        else:
            return 'HIGH'
    
    def _recommend_timing(
        self, auction_active: bool, circuit_active: bool, urgency: str
    ) -> str:
        """Recommend execution timing"""
        if auction_active:
            return 'WAIT'  # Wait for regular trading
        
        if circuit_active:
            return 'WAIT'  # Wait for circuit to clear
        
        if urgency == 'LOW':
            return 'GRADUAL'  # Execute gradually over time
        elif urgency == 'MEDIUM':
            return 'GRADUAL'
        else:
            return 'IMMEDIATE'
    
    def record_execution(
        self,
        ticker: str,
        order_size: int,
        execution_price: float,
        expected_price: float,
        order_type: str = 'MARKET',
        spread_cost: float = None,
        slippage: float = None,
        market_impact: float = None,
        participation_rate: float = None,
        liquidity_score: float = None
    ) -> int:
        """Record actual execution data for future analysis"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Calculate metrics if not provided
        if spread_cost is None:
            spread_cost = abs(execution_price - expected_price) / expected_price * 100
        
        if slippage is None:
            slippage = spread_cost * 0.5  # Estimate
        
        if market_impact is None:
            market_impact = spread_cost * 0.3  # Estimate
        
        if participation_rate is None:
            participation_rate = 0.10  # Default
        
        if liquidity_score is None:
            liquidity_score = 70  # Default
        
        # Calculate execution quality (0-100, higher is better)
        total_cost = spread_cost + slippage + market_impact
        execution_quality = max(0, min(100, 100 - (total_cost * 100)))
        
        cursor.execute("""
            INSERT INTO execution_history (
                ticker, execution_date, order_type, order_size,
                execution_price, expected_price, spread_cost, slippage,
                market_impact, participation_rate, liquidity_score,
                execution_quality, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ticker, datetime.now().isoformat(), order_type, order_size,
            execution_price, expected_price, spread_cost, slippage,
            market_impact, participation_rate, liquidity_score,
            execution_quality, datetime.now().isoformat()
        ))
        
        execution_id = cursor.rowid
        
        # Update liquidity profile
        self._update_liquidity_profile(ticker, spread_cost, slippage, market_impact)
        
        conn.commit()
        conn.close()
        
        return execution_id
    
    def _update_liquidity_profile(
        self, ticker: str, spread: float, slippage: float, market_impact: float
    ):
        """Update liquidity profile with new execution data"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get existing profile
        cursor.execute("""
            SELECT * FROM liquidity_profiles WHERE ticker = ?
        """, (ticker,))
        
        existing = cursor.fetchone()
        
        if existing:
            # Update with moving average
            cursor.execute("""
                UPDATE liquidity_profiles 
                SET avg_spread = (avg_spread * 0.8 + ? * 0.2),
                    avg_slippage = (avg_slippage * 0.8 + ? * 0.2),
                    market_impact_coefficient = (market_impact_coefficient * 0.8 + ? * 0.2),
                    updated_at = ?
                WHERE ticker = ?
            """, (spread, slippage, market_impact, datetime.now().isoformat(), ticker))
        else:
            # Insert new profile
            cursor.execute("""
                INSERT INTO liquidity_profiles (
                    ticker, avg_spread, avg_slippage, market_impact_coefficient, updated_at
                ) VALUES (?, ?, ?, ?, ?)
            """, (ticker, spread, slippage, market_impact, datetime.now().isoformat()))
        
        conn.commit()
        conn.close()
    
    def get_execution_statistics(self, ticker: str = None, days: int = 30) -> Dict:
        """Get execution statistics for analysis"""
        conn = sqlite3.connect(self.db_path)
        
        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()
        
        query = """
            SELECT 
                COUNT(*) as total_executions,
                AVG(spread_cost) as avg_spread,
                AVG(slippage) as avg_slippage,
                AVG(market_impact) as avg_market_impact,
                AVG(liquidity_score) as avg_liquidity_score,
                AVG(execution_quality) as avg_execution_quality,
                MIN(execution_quality) as min_execution_quality,
                MAX(execution_quality) as max_execution_quality
            FROM execution_history
            WHERE execution_date >= ?
        """
        
        params = [cutoff_date]
        if ticker:
            query += " AND ticker = ?"
            params.append(ticker)
        
        df = pd.read_sql_query(query, conn, params=params)
        
        # Get order type breakdown
        type_query = """
            SELECT order_type, COUNT(*) as count, AVG(execution_quality) as avg_quality
            FROM execution_history
            WHERE execution_date >= ?
        """
        
        params2 = [cutoff_date]
        if ticker:
            type_query += " AND ticker = ?"
            params2.append(ticker)
        
        type_query += " GROUP BY order_type"
        
        type_df = pd.read_sql_query(type_query, conn, params=params2)
        
        conn.close()
        
        return {
            'summary': df.iloc[0].to_dict() if not df.empty else {},
            'by_order_type': type_df.to_dict('records') if not type_df.empty else []
        }

# Example usage
if __name__ == "__main__":
    # Initialize execution intelligence
    engine = ExecutionIntelligence()
    
    # Example: Assess execution quality
    quality = engine.assess_execution_quality(
        ticker="RELIANCE",
        order_size=1000,
        current_price=2450.00,
        market_data={
            'spread': 0.08,
            'price_change_percent': 1.2
        }
    )
    
    print(f"Execution Quality Assessment:")
    print(f"  Order Type: {quality.recommended_order_type}")
    print(f"  Spread Cost: {quality.spread_cost:.4f}%")
    print(f"  Slippage Estimate: {quality.slippage_estimate:.4f}%")
    print(f"  Liquidity Score: {quality.liquidity_score}/100")
    print(f"  Market Impact: {quality.market_impact:.4f}%")
    print(f"  Timing: {quality.recommended_timing}")
    
    print("\nExecution Intelligence Engine ready for optimal trade execution")