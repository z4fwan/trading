"""
Reconciliation Engine - Auto-Learning Loop
Runs daily to calculate accuracy and update the model with actual outcomes
"""

import asyncio
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import sqlite3
from historical_engine import get_historical_engine, SQLITE_DB_PATH

# Configuration
RECONCILIATION_TIME = "16:00"  # 4:00 PM IST (15 min after market close)
MIN_DAYS_FOR_ACCURACY = 7  # Minimum days of data before calculating accuracy
ACCURACY_THRESHOLD = 60  # Alert if accuracy drops below this %


class ReconciliationEngine:
    """Daily reconciliation and auto-learning engine"""
    
    def __init__(self):
        self.historical_engine = get_historical_engine()
        self.db_path = SQLITE_DB_PATH
        
    def _get_yahoo_symbol(self, ticker: str, exchange: str) -> str:
        """Convert NSE/BSE ticker to Yahoo Finance symbol"""
        if exchange == "NSE":
            return f"{ticker}.NS"
        elif exchange == "BSE":
            return f"{ticker}.BO"
        return ticker
    
    def get_price_change(self, symbol: str, exchange: str, date: str, days_ahead: int) -> Optional[float]:
        """
        Get price change from announcement date to N days ahead
        
        Args:
            symbol: Stock symbol
            exchange: NSE or BSE
            date: Announcement date (ISO format)
            days_ahead: Number of trading days to look ahead
            
        Returns:
            Percentage change or None if data unavailable
        """
        try:
            yahoo_symbol = self._get_yahoo_symbol(symbol, exchange)
            start_date = datetime.fromisoformat(date)
            end_date = start_date + timedelta(days=days_ahead + 5)  # Buffer for weekends
            
            # Fetch historical data
            data = yf.download(yahoo_symbol, start=start_date, end=end_date, progress=False)
            
            if data.empty or len(data) < 2:
                return None
            
            # Get closing price on announcement day and N days later
            start_price = data['Close'].iloc[0]
            
            # Get price N trading days later
            if len(data) > days_ahead:
                end_price = data['Close'].iloc[min(days_ahead, len(data) - 1)]
            else:
                end_price = data['Close'].iloc[-1]
            
            pct_change = ((end_price - start_price) / start_price) * 100
            return round(float(pct_change), 2)
            
        except Exception as e:
            print(f"Error fetching price change for {symbol}: {e}")
            return None
    
    def reconcile_announcement(self, ann_id: str, symbol: str, exchange: str, date: str) -> Dict:
        """
        Reconcile a single announcement with actual price outcomes
        
        Returns:
            Dict with actual outcomes and whether prediction was correct
        """
        # Get actual price changes
        actual_1d = self.get_price_change(symbol, exchange, date, 1)
        actual_5d = self.get_price_change(symbol, exchange, date, 5)
        actual_20d = self.get_price_change(symbol, exchange, date, 20)
        
        # Get predicted direction from database
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT predicted_direction, ensemble_signal 
            FROM announcements WHERE id = ?
        """, (ann_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row or actual_1d is None:
            return {"error": "No prediction or price data available"}
        
        predicted_direction = row[0] or ""
        ensemble_signal = row[1] or ""
        
        # Determine actual direction
        if actual_1d is not None:
            if actual_1d > 0.5:
                actual_direction = "up"
            elif actual_1d < -0.5:
                actual_direction = "down"
            else:
                actual_direction = "flat"
        else:
            actual_direction = "unknown"
        
        # Check if prediction was correct
        prediction_correct = False
        if predicted_direction == actual_direction:
            prediction_correct = True
        elif predicted_direction in ["up", "down"] and actual_direction == "flat":
            prediction_correct = True  # Close enough
        
        # Update database
        self.historical_engine.update_actual_outcomes(
            ann_id=ann_id,
            actual_1d_change=actual_1d if actual_1d is not None else 0,
            actual_5d_change=actual_5d if actual_5d is not None else 0,
            actual_20d_change=actual_20d if actual_20d is not None else 0,
            prediction_correct=prediction_correct
        )
        
        return {
            "ann_id": ann_id,
            "symbol": symbol,
            "predicted_direction": predicted_direction,
            "actual_direction": actual_direction,
            "actual_1d_change": actual_1d,
            "actual_5d_change": actual_5d,
            "actual_20d_change": actual_20d,
            "prediction_correct": prediction_correct,
        }
    
    def run_daily_reconciliation(self, date: Optional[str] = None) -> Dict:
        """
        Run daily reconciliation for all announcements from the given date
        
        Args:
            date: Date to reconcile (ISO format). Defaults to yesterday.
            
        Returns:
            Summary of reconciliation results
        """
        if date is None:
            date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        print(f"\n{'='*50}")
        print(f"Running daily reconciliation for: {date}")
        print(f"{'='*50}\n")
        
        # Get all announcements from the date
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, symbol, source, announcement_date 
            FROM announcements 
            WHERE date(announcement_date) = ? 
              AND (actual_1d_change IS NULL OR prediction_correct IS NULL)
        """, (date,))
        
        announcements = cursor.fetchall()
        conn.close()
        
        if not announcements:
            print(f"No unreconciled announcements for {date}")
            return {"date": date, "reconciled": 0, "results": []}
        
        print(f"Found {len(announcements)} announcements to reconcile\n")
        
        results = []
        for ann_id, symbol, exchange, ann_date in announcements:
            print(f"  Reconciling: {symbol} - {ann_id[:50]}...")
            result = self.reconcile_announcement(ann_id, symbol, exchange, ann_date)
            results.append(result)
            
            if "error" in result:
                print(f"    Error: {result['error']}")
            else:
                status = "✓" if result["prediction_correct"] else "✗"
                print(f"    {status} Predicted: {result['predicted_direction']}, "
                      f"Actual: {result['actual_direction']}, "
                      f"1D: {result['actual_1d_change']:.2f}%")
        
        # Calculate accuracy stats
        correct = sum(1 for r in results if r.get("prediction_correct", False))
        total = len(results)
        accuracy = (correct / total * 100) if total > 0 else 0
        
        print(f"\n{'='*50}")
        print(f"Reconciliation Complete for {date}")
        print(f"  Total: {total}")
        print(f"  Correct: {correct}")
        print(f"  Accuracy: {accuracy:.1f}%")
        print(f"{'='*50}\n")
        
        # Check if accuracy is below threshold
        if accuracy < ACCURACY_THRESHOLD and total >= MIN_DAYS_FOR_ACCURACY:
            print(f"⚠️  WARNING: Accuracy ({accuracy:.1f}%) is below threshold ({ACCURACY_THRESHOLD}%)!")
            print("Consider adjusting analysis parameters or reviewing recent misses.")
        
        return {
            "date": date,
            "total_reconciled": total,
            "correct_predictions": correct,
            "accuracy_rate": round(accuracy, 2),
            "below_threshold": accuracy < ACCURACY_THRESHOLD and total >= MIN_DAYS_FOR_ACCURACY,
            "results": results,
        }
    
    def generate_accuracy_report(self, days: int = 30) -> Dict:
        """Generate accuracy report for the past N days"""
        stats = self.historical_engine.get_prediction_stats(days=days)
        
        # Get sector-specific accuracy
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get accuracy by signal type
        cursor.execute("""
            SELECT ensemble_signal, COUNT(*) as total, SUM(prediction_correct) as correct
            FROM announcements 
            WHERE prediction_correct IS NOT NULL 
              AND announcement_date > datetime('now', ?)
            GROUP BY ensemble_signal
        """, (f'-{days} days',))
        
        signal_accuracy = {}
        for row in cursor.fetchall():
            signal = row[0] or "unknown"
            signal_accuracy[signal] = {
                "total": row[1],
                "correct": row[2] or 0,
                "accuracy_rate": round((row[2] or 0) / row[1] * 100, 2) if row[1] > 0 else 0,
            }
        
        conn.close()
        
        return {
            "overall_stats": stats,
            "signal_accuracy": signal_accuracy,
            "period_days": days,
            "generated_at": datetime.now().isoformat(),
        }


# Global instance
_reconciliation_engine: Optional[ReconciliationEngine] = None

def get_reconciliation_engine() -> ReconciliationEngine:
    """Get or create global reconciliation engine instance"""
    global _reconciliation_engine
    if _reconciliation_engine is None:
        _reconciliation_engine = ReconciliationEngine()
    return _reconciliation_engine


async def run_reconciliation(date: Optional[str] = None) -> Dict:
    """Convenience function to run reconciliation"""
    engine = get_reconciliation_engine()
    return engine.run_daily_reconciliation(date)


def generate_accuracy_report(days: int = 30) -> Dict:
    """Convenience function to generate accuracy report"""
    engine = get_reconciliation_engine()
    return engine.generate_accuracy_report(days)


if __name__ == "__main__":
    # Run reconciliation for yesterday
    import sys
    
    date = sys.argv[1] if len(sys.argv) > 1 else None
    result = asyncio.run(run_reconciliation(date))
    print(f"\nFinal Result: {json.dumps(result, indent=2)}")