"""
Quantum Alpha V3 - Decision Governance Layer
Every trade must pass a comprehensive checklist before execution
"""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum

class CheckStatus(Enum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    WARNING = "WARNING"
    SKIPPED = "SKIPPED"

@dataclass
class GovernanceCheck:
    """Individual governance check"""
    name: str
    status: CheckStatus
    value: any
    threshold: any
    message: str
    critical: bool

@dataclass
class GovernanceDecision:
    """Final governance decision"""
    trade_allowed: bool
    signal: str
    probability: float
    checks_passed: int
    checks_failed: int
    critical_failures: List[str]
    warnings: List[str]
    recommendation: str
    timestamp: str

class DecisionGovernanceLayer:
    """
    Decision Governance Layer - Every trade must pass this checklist:
    
    1. Is probability calibrated?
    2. Is expected value positive after estimated costs?
    3. Is liquidity sufficient?
    4. Is portfolio exposure within limits?
    5. Is there conflicting macro news?
    6. Is there an upcoming earnings announcement?
    7. Is the market regime suitable?
    8. Is confidence above threshold?
    """
    
    def __init__(self, config: Dict = None):
        self.config = config or {}
        
        # Default thresholds
        self.MIN_CALIBRATED_PROBABILITY = 0.60
        self.MIN_EXPECTED_VALUE = 0.005  # 0.5% after costs
        self.MIN_LIQUIDITY_SCORE = 40
        self.MAX_PORTFOLIO_EXPOSURE = 0.30  # 30% max exposure
        self.MIN_CONFIDENCE = 0.65
        self.MAX_EARNINGS_PROXIMITY_DAYS = 7
        
    def evaluate_trade(self, prediction: Dict, context: Dict) -> GovernanceDecision:
        """
        Evaluate a trade against all governance checks
        
        Args:
            prediction: ML prediction with probability, signal, etc.
            context: Market context (portfolio, macro, earnings, etc.)
            
        Returns:
            GovernanceDecision with trade_allowed flag
        """
        checks = []
        critical_failures = []
        warnings = []
        
        # 1. Is probability calibrated?
        calibration_check = self._check_calibration(prediction)
        checks.append(calibration_check)
        if calibration_check.status == CheckStatus.FAILED and calibration_check.critical:
            critical_failures.append(calibration_check.name)
        
        # 2. Is expected value positive after estimated costs?
        ev_check = self._check_expected_value(prediction, context)
        checks.append(ev_check)
        if ev_check.status == CheckStatus.FAILED and ev_check.critical:
            critical_failures.append(ev_check.name)
        
        # 3. Is liquidity sufficient?
        liquidity_check = self._check_liquidity(context)
        checks.append(liquidity_check)
        if liquidity_check.status == CheckStatus.FAILED and liquidity_check.critical:
            critical_failures.append(liquidity_check.name)
        
        # 4. Is portfolio exposure within limits?
        exposure_check = self._check_portfolio_exposure(context)
        checks.append(exposure_check)
        if exposure_check.status == CheckStatus.FAILED and exposure_check.critical:
            critical_failures.append(exposure_check.name)
        
        # 5. Is there conflicting macro news?
        macro_check = self._check_macro_news(context)
        checks.append(macro_check)
        if macro_check.status == CheckStatus.WARNING:
            warnings.append(macro_check.message)
        
        # 6. Is there an upcoming earnings announcement?
        earnings_check = self._check_earnings_proximity(context)
        checks.append(earnings_check)
        if earnings_check.status == CheckStatus.WARNING:
            warnings.append(earnings_check.message)
        
        # 7. Is the market regime suitable?
        regime_check = self._check_market_regime(context)
        checks.append(regime_check)
        if regime_check.status == CheckStatus.WARNING:
            warnings.append(regime_check.message)
        
        # 8. Is confidence above threshold?
        confidence_check = self._check_confidence(prediction)
        checks.append(confidence_check)
        if confidence_check.status == CheckStatus.FAILED and confidence_check.critical:
            critical_failures.append(confidence_check.name)
        
        # Count results
        passed = sum(1 for c in checks if c.status == CheckStatus.PASSED)
        failed = sum(1 for c in checks if c.status == CheckStatus.FAILED)
        
        # Determine final decision
        trade_allowed = len(critical_failures) == 0
        
        # Generate recommendation
        if trade_allowed:
            if len(warnings) > 0:
                recommendation = "PROCEED_WITH_CAUTION"
            else:
                recommendation = "APPROVED"
        else:
            recommendation = "REJECTED"
        
        return GovernanceDecision(
            trade_allowed=trade_allowed,
            signal=prediction.get('signal', 'UNKNOWN'),
            probability=prediction.get('probability', 0),
            checks_passed=passed,
            checks_failed=failed,
            critical_failures=critical_failures,
            warnings=warnings,
            recommendation=recommendation,
            timestamp=datetime.now().isoformat()
        )
    
    def _check_calibration(self, prediction: Dict) -> GovernanceCheck:
        """Check if probability is calibrated"""
        probability = prediction.get('probability', 0)
        calibration_status = prediction.get('calibration_status', 'UNKNOWN')
        
        if calibration_status == 'CALIBRATED':
            if probability >= self.MIN_CALIBRATED_PROBABILITY:
                return GovernanceCheck(
                    name="Probability Calibration",
                    status=CheckStatus.PASSED,
                    value=probability,
                    threshold=self.MIN_CALIBRATED_PROBABILITY,
                    message=f"Probability {probability:.2%} is calibrated and above threshold",
                    critical=True
                )
            else:
                return GovernanceCheck(
                    name="Probability Calibration",
                    status=CheckStatus.FAILED,
                    value=probability,
                    threshold=self.MIN_CALIBRATED_PROBABILITY,
                    message=f"Probability {probability:.2%} is calibrated but below threshold {self.MIN_CALIBRATED_PROBABILITY:.2%}",
                    critical=True
                )
        else:
            return GovernanceCheck(
                name="Probability Calibration",
                status=CheckStatus.WARNING,
                value=probability,
                threshold=self.MIN_CALIBRATED_PROBABILITY,
                message="Probability calibration status unknown - use with caution",
                critical=False
            )
    
    def _check_expected_value(self, prediction: Dict, context: Dict) -> GovernanceCheck:
        """Check if expected value is positive after costs"""
        expected_value = prediction.get('expected_return', 0)
        trading_costs = context.get('trading_costs', 0.004)  # 0.4% round trip
        
        net_ev = expected_value - (trading_costs * 2)  # Both sides
        
        if net_ev > self.MIN_EXPECTED_VALUE:
            return GovernanceCheck(
                name="Expected Value",
                status=CheckStatus.PASSED,
                value=round(net_ev, 4),
                threshold=self.MIN_EXPECTED_VALUE,
                message=f"Net EV: {net_ev:.4f} after {trading_costs*2:.4f} costs",
                critical=True
            )
        else:
            return GovernanceCheck(
                name="Expected Value",
                status=CheckStatus.FAILED,
                value=round(net_ev, 4),
                threshold=self.MIN_EXPECTED_VALUE,
                message=f"Net EV: {net_ev:.4f} is below minimum {self.MIN_EXPECTED_VALUE:.4f}",
                critical=True
            )
    
    def _check_liquidity(self, context: Dict) -> GovernanceCheck:
        """Check if liquidity is sufficient"""
        liquidity_score = context.get('liquidity_score', 0)
        avg_daily_volume = context.get('avg_daily_volume', 0)
        
        if liquidity_score >= self.MIN_LIQUIDITY_SCORE and avg_daily_volume >= 100000:
            return GovernanceCheck(
                name="Liquidity",
                status=CheckStatus.PASSED,
                value=liquidity_score,
                threshold=self.MIN_LIQUIDITY_SCORE,
                message=f"Liquidity score: {liquidity_score}, Volume: {avg_daily_volume}",
                critical=True
            )
        elif liquidity_score >= 30:
            return GovernanceCheck(
                name="Liquidity",
                status=CheckStatus.WARNING,
                value=liquidity_score,
                threshold=self.MIN_LIQUIDITY_SCORE,
                message=f"Liquidity score {liquidity_score} is marginal - consider smaller position",
                critical=False
            )
        else:
            return GovernanceCheck(
                name="Liquidity",
                status=CheckStatus.FAILED,
                value=liquidity_score,
                threshold=self.MIN_LIQUIDITY_SCORE,
                message=f"Liquidity score {liquidity_score} too low - avoid illiquid stocks",
                critical=True
            )
    
    def _check_portfolio_exposure(self, context: Dict) -> GovernanceCheck:
        """Check if portfolio exposure is within limits"""
        current_exposure = context.get('current_exposure', 0)
        proposed_position_size = context.get('proposed_position_size', 0)
        total_exposure = current_exposure + proposed_position_size
        
        if total_exposure <= self.MAX_PORTFOLIO_EXPOSURE:
            return GovernanceCheck(
                name="Portfolio Exposure",
                status=CheckStatus.PASSED,
                value=round(total_exposure, 4),
                threshold=self.MAX_PORTFOLIO_EXPOSURE,
                message=f"Total exposure: {total_exposure:.2%} within limit {self.MAX_PORTFOLIO_EXPOSURE:.2%}",
                critical=True
            )
        else:
            return GovernanceCheck(
                name="Portfolio Exposure",
                status=CheckStatus.FAILED,
                value=round(total_exposure, 4),
                threshold=self.MAX_PORTFOLIO_EXPOSURE,
                message=f"Total exposure {total_exposure:.2%} exceeds limit {self.MAX_PORTFOLIO_EXPOSURE:.2%}",
                critical=True
            )
    
    def _check_macro_news(self, context: Dict) -> GovernanceCheck:
        """Check for conflicting macro news"""
        macro_sentiment = context.get('macro_sentiment', 'NEUTRAL')
        signal = context.get('signal', 'UNKNOWN')
        
        # Check for conflicting signals
        if macro_sentiment == 'BEARISH' and signal == 'BUY':
            return GovernanceCheck(
                name="Macro News",
                status=CheckStatus.WARNING,
                value=macro_sentiment,
                threshold='NEUTRAL',
                message="Bearish macro environment conflicts with BUY signal",
                critical=False
            )
        elif macro_sentiment == 'BULLISH' and signal == 'SELL':
            return GovernanceCheck(
                name="Macro News",
                status=CheckStatus.WARNING,
                value=macro_sentiment,
                threshold='NEUTRAL',
                message="Bullish macro environment conflicts with SELL signal",
                critical=False
            )
        else:
            return GovernanceCheck(
                name="Macro News",
                status=CheckStatus.PASSED,
                value=macro_sentiment,
                threshold='NEUTRAL',
                message=f"Macro sentiment ({macro_sentiment}) aligns with signal",
                critical=False
            )
    
    def _check_earnings_proximity(self, context: Dict) -> GovernanceCheck:
        """Check for upcoming earnings announcement"""
        days_to_earnings = context.get('days_to_earnings', 30)
        
        if days_to_earnings <= self.MAX_EARNINGS_PROXIMITY_DAYS:
            return GovernanceCheck(
                name="Earnings Proximity",
                status=CheckStatus.WARNING,
                value=days_to_earnings,
                threshold=self.MAX_EARNINGS_PROXIMITY_DAYS,
                message=f"Earnings in {days_to_earnings} days - elevated volatility risk",
                critical=False
            )
        else:
            return GovernanceCheck(
                name="Earnings Proximity",
                status=CheckStatus.PASSED,
                value=days_to_earnings,
                threshold=self.MAX_EARNINGS_PROXIMITY_DAYS,
                message=f"Next earnings in {days_to_earnings} days - safe",
                critical=False
            )
    
    def _check_market_regime(self, context: Dict) -> GovernanceCheck:
        """Check if market regime is suitable"""
        regime = context.get('market_regime', 'UNKNOWN')
        signal = context.get('signal', 'UNKNOWN')
        
        # Define suitable regimes for each signal
        bullish_regimes = ['STRONG_BULL', 'BULL', 'SIDEWAYS']
        bearish_regimes = ['STRONG_BEAR', 'WEAK_BEAR']
        avoid_regimes = ['HIGH_VOLATILITY', 'EVENT_DRIVEN']
        
        if regime in avoid_regimes:
            return GovernanceCheck(
                name="Market Regime",
                status=CheckStatus.WARNING,
                value=regime,
                threshold='NORMAL',
                message=f"Market regime '{regime}' - elevated risk, consider reducing position",
                critical=False
            )
        elif (signal == 'BUY' and regime in bullish_regimes) or \
             (signal == 'SELL' and regime in bearish_regimes):
            return GovernanceCheck(
                name="Market Regime",
                status=CheckStatus.PASSED,
                value=regime,
                threshold='NORMAL',
                message=f"Regime '{regime}' suitable for {signal} signal",
                critical=False
            )
        else:
            return GovernanceCheck(
                name="Market Regime",
                status=CheckStatus.PASSED,
                value=regime,
                threshold='NORMAL',
                message=f"Regime '{regime}' - proceed with standard caution",
                critical=False
            )
    
    def _check_confidence(self, prediction: Dict) -> GovernanceCheck:
        """Check if confidence is above threshold"""
        confidence = prediction.get('confidence', 0)
        signal_quality = prediction.get('signal_quality', 'C')
        
        # Convert signal quality to numeric
        quality_map = {'A+': 0.95, 'A': 0.85, 'A-': 0.75, 'B+': 0.65, 'B': 0.55, 'B-': 0.45, 'C': 0.35}
        quality_score = quality_map.get(signal_quality, 0.5)
        
        if quality_score >= self.MIN_CONFIDENCE:
            return GovernanceCheck(
                name="Confidence",
                status=CheckStatus.PASSED,
                value=quality_score,
                threshold=self.MIN_CONFIDENCE,
                message=f"Signal quality '{signal_quality}' ({quality_score:.2f}) above threshold",
                critical=True
            )
        else:
            return GovernanceCheck(
                name="Confidence",
                status=CheckStatus.FAILED,
                value=quality_score,
                threshold=self.MIN_CONFIDENCE,
                message=f"Signal quality '{signal_quality}' ({quality_score:.2f}) below threshold {self.MIN_CONFIDENCE:.2f}",
                critical=True
            )
    
    def generate_governance_report(self, decisions: List[GovernanceDecision]) -> Dict:
        """Generate comprehensive governance report"""
        total = len(decisions)
        approved = sum(1 for d in decisions if d.recommendation == "APPROVED")
        caution = sum(1 for d in decisions if d.recommendation == "PROCEED_WITH_CAUTION")
        rejected = sum(1 for d in decisions if d.recommendation == "REJECTED")
        
        # Most common failure reasons
        failure_reasons = []
        for d in decisions:
            failure_reasons.extend(d.critical_failures)
        
        from collections import Counter
        common_failures = Counter(failure_reasons).most_common(5)
        
        return {
            'total_evaluations': total,
            'approved': approved,
            'approved_rate': round(approved / total * 100, 2) if total > 0 else 0,
            'proceed_with_caution': caution,
            'rejected': rejected,
            'rejection_rate': round(rejected / total * 100, 2) if total > 0 else 0,
            'common_failure_reasons': common_failures,
            'avg_probability_approved': round(
                sum(d.probability for d in decisions if d.trade_allowed) / max(approved + caution, 1), 4
            )
        }


# Example usage
if __name__ == "__main__":
    governance = DecisionGovernanceLayer()
    
    # Example evaluation
    prediction = {
        'signal': 'BUY',
        'probability': 0.78,
        'expected_return': 0.032,
        'confidence': 0.85,
        'signal_quality': 'A',
        'calibration_status': 'CALIBRATED'
    }
    
    context = {
        'trading_costs': 0.004,
        'liquidity_score': 85,
        'avg_daily_volume': 1500000,
        'current_exposure': 0.15,
        'proposed_position_size': 0.05,
        'macro_sentiment': 'BULLISH',
        'days_to_earnings': 25,
        'market_regime': 'BULL',
        'signal': 'BUY'
    }
    
    decision = governance.evaluate_trade(prediction, context)
    
    print(f"Trade Allowed: {decision.trade_allowed}")
    print(f"Recommendation: {decision.recommendation}")
    print(f"Checks Passed: {decision.checks_passed}/{decision.checks_passed + decision.checks_failed}")
    if decision.warnings:
        print(f"Warnings: {decision.warnings}")
    if decision.critical_failures:
        print(f"Critical Failures: {decision.critical_failures}")