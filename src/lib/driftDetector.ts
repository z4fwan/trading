import { getAllPredictions, StoredPrediction } from './predictionStore';

export interface DriftAlert {
  driftDetected: boolean;
  severity: 'NONE' | 'LOW' | 'HIGH';
  currentAccuracy: number;
  baselineAccuracy: number;
  message: string;
  rootCauseAnalysis?: string;
}

export function runDriftDetection(): DriftAlert {
  const predictions = getAllPredictions();
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  
  // 1. Current Month Window
  const currentMonth = predictions.filter((p: StoredPrediction) => 
    p.resolved === true && 
    (now - p.createdAt) <= THIRTY_DAYS_MS
  );

  // 2. Baseline Window (Previous 6 Months)
  const baseline = predictions.filter((p: StoredPrediction) => 
    p.resolved === true && 
    (now - p.createdAt) > THIRTY_DAYS_MS &&
    (now - p.createdAt) <= 6 * THIRTY_DAYS_MS
  );

  if (currentMonth.length < 20 || baseline.length < 50) {
    return {
      driftDetected: false,
      severity: 'NONE',
      currentAccuracy: 0,
      baselineAccuracy: 0,
      message: 'Insufficient resolved data for drift detection.'
    };
  }

  const currentAcc = currentMonth.filter((p: StoredPrediction) => p.accuracyPercent && p.accuracyPercent > 0).length / currentMonth.length;
  const baselineAcc = baseline.filter((p: StoredPrediction) => p.accuracyPercent && p.accuracyPercent > 0).length / baseline.length;

  const drop = baselineAcc - currentAcc;

  if (drop > 0.15) { // 15% drop in accuracy
    // Diagnose Root Cause by checking versions
    const latestVersion = currentMonth[currentMonth.length - 1]?.modelVersion;
    const baselineVersion = baseline[baseline.length - 1]?.modelVersion;
    
    let rootCause = 'Unknown';
    if (latestVersion && baselineVersion) {
      if (latestVersion.promptVersion !== baselineVersion.promptVersion) rootCause = 'News Model Drifted: LLM Prompt changed.';
      else if (latestVersion.ensembleWeights !== baselineVersion.ensembleWeights) rootCause = 'Ensemble Drifted: Weights updated.';
      else if (latestVersion.technicalModel !== baselineVersion.technicalModel) rootCause = 'Technical Model Drifted.';
      else rootCause = 'Market Regime Shift (Models identical).';
    }

    return {
      driftDetected: true,
      severity: 'HIGH',
      currentAccuracy: currentAcc,
      baselineAccuracy: baselineAcc,
      message: `CRITICAL DRIFT: Accuracy dropped by ${(drop*100).toFixed(1)}%. Trigger Model Retraining.`,
      rootCauseAnalysis: rootCause
    };
  } else if (drop > 0.05) { // 5% drop
    return {
      driftDetected: true,
      severity: 'LOW',
      currentAccuracy: currentAcc,
      baselineAccuracy: baselineAcc,
      message: `MINOR DRIFT: Accuracy dropped by ${(drop*100).toFixed(1)}%. Monitor closely.`
    };
  }

  return {
    driftDetected: false,
    severity: 'NONE',
    currentAccuracy: currentAcc,
    baselineAccuracy: baselineAcc,
    message: 'Model is stable.'
  };
}
