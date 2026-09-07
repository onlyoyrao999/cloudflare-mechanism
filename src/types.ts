// src/types.ts

export interface DrawRecord {
  period: string;
  numbers: number[]; // 7 numbers
}

export interface TriggerEvent {
  period: string;       // Period N
  position: number;     // 1-indexed (1 to 7)
  targetNumber: number; // Number X
  sandwichNumber: number; // Number Y in period N-1
  basePosition: number; // Position P (1 to 7)
  trackingWindow: string[]; // Periods from N+1 to N+8
  status: 'In Progress' | 'Hit' | 'Miss';
  hitPeriodIndex?: number; // 0 to 7 (corresponding to N+1 to N+8)
  hitPeriod?: string;   // Exact period that hit
  hitPosition?: number; // Position where it hit
}

export interface ExclusionPrediction {
  period: string;              // For which period this prediction is made
  predictedNumbers: number[];  // 6 numbers
  actualNumbers?: number[];     // Actual numbers drawn in this period (if available)
  isSuccessful?: boolean;      // True if NONE of the 6 predicted numbers appeared in actualNumbers
  hitNumbers?: number[];       // Numbers that actually appeared (should be empty for success)
}

export interface FrequencyStats {
  number: number;
  frequency: number;
  omission: number;
  lastSeenPeriod: string;
}

export interface AnalysisSummary {
  totalDraws: number;
  totalTriggers: number;
  totalHits: number;
  totalHit1To4: number;
  totalHit5To8: number;
  totalMisses: number;
  totalInProgress: number;
  overallHitRate: number; // totalHits / (totalHits + totalMisses)
  hitRate1To4: number;    // totalHit1To4 / totalHits
  hitRate5To8: number;    // totalHit5To8 / totalHits
  exclusionSuccessRate: number; // % of predictions where 0 predicted numbers appeared
}

export interface PredictionResult {
  predictedNumbers: number[];
  activeTargets: { number: number; period: string; basePos: number; remainingPeriods: number }[];
  reasoning: {
    triggerLocking: string;
    edgeDeduction: string;
    omissionConclusion: string;
  };
  isAIPowered?: boolean;
}

export interface AnalyzeAPIResponse {
  latestDraw: DrawRecord;
  summary: AnalysisSummary;
  triggers: TriggerEvent[];
  predictions: ExclusionPrediction[];
  frequencyStats: FrequencyStats[];
  prediction: PredictionResult;
  totalCount: number;
}
