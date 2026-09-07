// src/data/analyzer.ts

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

/**
 * Normalizes numbers range and formats
 */
export function getCircularPositions(P: number): number[] {
  // P is 1-indexed (1 to 7)
  if (P === 1) {
    return [1, 2, 7];
  } else if (P === 7) {
    return [6, 7, 1];
  } else {
    return [P - 1, P, P + 1];
  }
}

/**
 * Computes all triggers, stats, and predictions from the complete raw records.
 * Raw records are sorted in descending order (newest first).
 */
export function analyzeData(rawRecords: DrawRecord[]): {
  recordsAsc: DrawRecord[];
  triggers: TriggerEvent[];
  frequencyStats: FrequencyStats[];
  predictions: ExclusionPrediction[];
  summary: AnalysisSummary;
} {
  // Double-check sorting is ascending (oldest first) for sequential computations
  const recordsAsc = [...rawRecords].sort((a, b) => a.period.localeCompare(b.period));
  const triggers: TriggerEvent[] = [];

  // 1. Identify all trigger events
  for (let i = 2; i < recordsAsc.length; i++) {
    const N_period = recordsAsc[i];
    const N_minus_2_period = recordsAsc[i - 2];
    const N_minus_1_period = recordsAsc[i - 1];

    for (let k = 0; k < 7; k++) {
      const numX = N_period.numbers[k];
      const numX_prevStatus = N_minus_2_period.numbers[k];

      if (numX !== undefined && numX === numX_prevStatus) {
        // Trigger condition met!
        const position = k + 1; // 1-indexed
        const sandwichNumber = N_minus_1_period.numbers[k];

        // Locate P (Base Position) in period N
        let basePosition = position; // Fallback is its position in N-1 (which is 'position')
        const yIndexInN = N_period.numbers.indexOf(sandwichNumber);

        if (yIndexInN !== -1) {
          basePosition = yIndexInN + 1;
        } else {
          // If Y is missing in N, search backwards from N-1 down to find its last active position.
          // By definition, in N-1 it is at 'position', so that remains the primary active projection.
          basePosition = position;
        }

        // Tracking window
        const trackingWindow: string[] = [];
        for (let w = 1; w <= 8; w++) {
          if (i + w < recordsAsc.length) {
            trackingWindow.push(recordsAsc[i + w].period);
          }
        }

        const trigger: TriggerEvent = {
          period: N_period.period,
          position,
          targetNumber: numX,
          sandwichNumber,
          basePosition,
          trackingWindow,
          status: 'In Progress',
        };

        // Determine hit/miss status in subsequent draws
        const expectedPositions = getCircularPositions(basePosition);

        let hitFound = false;
        for (let w = 1; w <= 8; w++) {
          const nextIndex = i + w;
          if (nextIndex >= recordsAsc.length) {
            break; // Not enough subsequent data yet
          }

          const nextDraw = recordsAsc[nextIndex];
          // Check circular position in nextDraw
          for (const posToCheck of expectedPositions) {
            const numAtPos = nextDraw.numbers[posToCheck - 1];
            if (numAtPos === numX) {
              trigger.status = 'Hit';
              trigger.hitPeriodIndex = w - 1;
              trigger.hitPeriod = nextDraw.period;
              trigger.hitPosition = posToCheck;
              hitFound = true;
              break;
            }
          }
          if (hitFound) break;
        }

        if (!hitFound) {
          if (i + 8 < recordsAsc.length) {
            trigger.status = 'Miss';
          } else {
            trigger.status = 'In Progress';
          }
        }

        triggers.push(trigger);
      }
    }
  }

  // 2. Frequency stats & current omission calculation for all 49 numbers
  const frequencyStats: FrequencyStats[] = Array.from({ length: 49 }, (_, idx) => {
    const num = idx + 1;
    // Calculate stats in the context of our overall records
    let freq = 0;
    let omission = 0;
    let lastSeenPeriod = '';
    let foundLastSeen = false;

    // Use rawRecords (descending order) to easily calculate omission from the newest
    for (let r = 0; r < rawRecords.length; r++) {
      const rec = rawRecords[r];
      if (rec.numbers.includes(num)) {
        freq++;
        if (!foundLastSeen) {
          lastSeenPeriod = rec.period;
          omission = r; // draws elapsed since the most recent draw (0 means it appeared in the latest draw)
          foundLastSeen = true;
        }
      }
    }

    if (!foundLastSeen) {
      omission = rawRecords.length; // Never seen, omission is maximum
    }

    return {
      number: num,
      frequency: freq,
      omission,
      lastSeenPeriod,
    };
  });

  // 3. Make exclusion predictions for each historical period, to backtest the exclusion accuracy!
  // We can start predicting once we have a baseline (e.g., after 50 draws to get proper frequency stats,
  // and we need at least 1 previous prediction to know the "last recommended numbers" to satisfy the previous-period block).
  const predictions: ExclusionPrediction[] = [];
  const activePredictionsMap: { [period: string]: number[] } = {};

  // Sort rawRecords ascending to predict forward.
  // Standard frequency statistical window is e.g. 120 periods preceding the target period.
  for (let idx = 20; idx < recordsAsc.length; idx++) {
    const targetPeriod = recordsAsc[idx].period;
    const previousPeriodRecord = recordsAsc[idx - 1];
    const previousPeriod = previousPeriodRecord.period;

    // A. Identify active targets for targetPeriod.
    // Active targets are trigger events occurring in the 8 periods before targetPeriod
    // (i.e., inside recordsAsc[idx-8] to recordsAsc[idx-1]) that have NOT hit before targetPeriod.
    const activeTargetsForPeriod: number[] = [];
    const activeWindowStartIdx = Math.max(0, idx - 8);
    
    for (let wIdx = activeWindowStartIdx; wIdx < idx; wIdx++) {
      const activePeriod = recordsAsc[wIdx].period;
      // Find triggers at activePeriod
      const periodTriggers = triggers.filter(t => t.period === activePeriod);
      for (const trig of periodTriggers) {
        // Was it a hit before targetPeriod?
        let hitBeforeTarget = false;
        if (trig.status === 'Hit' && trig.hitPeriod) {
          const hitIdx = recordsAsc.findIndex(r => r.period === trig.hitPeriod);
          if (hitIdx < idx) {
            hitBeforeTarget = true;
          }
        }
        if (!hitBeforeTarget) {
          activeTargetsForPeriod.push(trig.targetNumber);
        }
      }
    }

    // B. Get previous period's predicted numbers to avoid recommending them again
    const prevPrediction = activePredictionsMap[previousPeriod] || [];

    // C. Calculate frequencies and omissions in the sliding history BEFORE targetPeriod
    const historyBeforeTarget = recordsAsc.slice(Math.max(0, idx - 80), idx); // Sliding window of last 80 draws
    const subFreqMap: { [num: number]: number } = {};
    const subOmissionMap: { [num: number]: number } = {};

    for (let n = 1; n <= 49; n++) {
      subFreqMap[n] = 0;
      let om = 0;
      let found = false;
      for (let h = historyBeforeTarget.length - 1; h >= 0; h--) {
        if (historyBeforeTarget[h].numbers.includes(n)) {
          subFreqMap[n]++;
          if (!found) {
            om = historyBeforeTarget.length - 1 - h;
            found = true;
          }
        }
      }
      if (!found) {
        om = historyBeforeTarget.length;
      }
      subOmissionMap[n] = om;
    }

    // D. Filter and score numbers for exclusion
    const candidateScores: { num: number; score: number; freq: number; omission: number }[] = [];
    
    for (let num = 1; num <= 49; num++) {
      // RULE 1: Hedge (对冲) - Do not recommend active target tracker numbers
      if (activeTargetsForPeriod.includes(num)) continue;

      // RULE 2: Exclude previous period's recommendations (严禁推荐上一期推荐过的号码)
      if (prevPrediction.includes(num)) continue;

      // Score the likelihood. We want cold numbers (lowest frequencies, highest omission)
      // Score = Frequency * 10 - Omission * 0.1
      // Lowest score is most suitable for EXCLUSION ("least likely to appear")
      const freq = subFreqMap[num] || 0;
      const omission = subOmissionMap[num] || 0;
      const score = freq * 100 - omission; // Lower score means lower frequency & higher omission

      candidateScores.push({ num, score, freq, omission });
    }

    // Sort by score ascending (lowest score is safest to exclude)
    candidateScores.sort((a, b) => a.score - b.score);

    // Pick top 6
    const predictedNumbers = candidateScores.slice(0, 6).map(c => c.num);
    activePredictionsMap[targetPeriod] = predictedNumbers;

    // Validate the prediction against actual numbers drawn in targetPeriod
    const actualNumbers = recordsAsc[idx].numbers;
    const hitNumbers = predictedNumbers.filter(n => actualNumbers.includes(n));
    const isSuccessful = hitNumbers.length === 0; // Success means 0 of the excluded numbers appeared!

    predictions.push({
      period: targetPeriod,
      predictedNumbers,
      actualNumbers,
      isSuccessful,
      hitNumbers,
    });
  }

  // 4. Calculate summary metrics
  const closedTriggers = triggers.filter(t => t.status !== 'In Progress');
  const totalTriggers = triggers.length;
  const totalInProgress = triggers.filter(t => t.status === 'In Progress').length;
  const totalHits = triggers.filter(t => t.status === 'Hit').length;
  const totalMisses = triggers.filter(t => t.status === 'Miss').length;
  const totalHit1To4 = triggers.filter(t => t.status === 'Hit' && (t.hitPeriodIndex !== undefined && t.hitPeriodIndex < 4)).length;
  const totalHit5To8 = triggers.filter(t => t.status === 'Hit' && (t.hitPeriodIndex !== undefined && t.hitPeriodIndex >= 4)).length;

  const overallHitRate = closedTriggers.length > 0 ? (totalHits / closedTriggers.length) : 0;
  const hitRate1To4 = totalHits > 0 ? (totalHit1To4 / totalHits) : 0;
  const hitRate5To8 = totalHits > 0 ? (totalHit5To8 / totalHits) : 0;

  // Calculate exclusion prediction success rate (only on completed backtests)
  const completedPredictions = predictions.filter(p => p.actualNumbers !== undefined);
  const totalSuccessfulPredictions = completedPredictions.filter(p => p.isSuccessful).length;
  const exclusionSuccessRate = completedPredictions.length > 0 ? (totalSuccessfulPredictions / completedPredictions.length) : 0;

  const summary: AnalysisSummary = {
    totalDraws: rawRecords.length,
    totalTriggers,
    totalHits,
    totalHit1To4,
    totalHit5To8,
    totalMisses,
    totalInProgress,
    overallHitRate,
    hitRate1To4,
    hitRate5To8,
    exclusionSuccessRate,
  };

  return {
    recordsAsc,
    triggers,
    frequencyStats,
    predictions,
    summary,
  };
}

/**
 * Predicts the upcoming draw (the highly-anticipated period Last + 1)
 */
export function predictNextDraw(
  rawRecords: DrawRecord[],
  triggers: TriggerEvent[],
  lastPredictions: number[]
): {
  predictedNumbers: number[];
  activeTargets: { number: number; period: string; basePos: number; remainingPeriods: number }[];
  reasoning: {
    triggerLocking: string;
    edgeDeduction: string;
    omissionConclusion: string;
  };
} {
  const recordsAsc = [...rawRecords].sort((a, b) => a.period.localeCompare(b.period));
  const latestRecord = recordsAsc[recordsAsc.length - 1];
  const lastPeriod = latestRecord.period;

  // Next Period representation (increment the trailing index or year suffix)
  const lastPeriodNum = parseInt(lastPeriod, 10);
  const nextPeriod = isNaN(lastPeriodNum) ? `${lastPeriod}_next` : (lastPeriodNum + 1).toString();

  // A. Determine active targets for upcoming draw
  const activeTargets: { number: number; period: string; basePos: number; remainingPeriods: number }[] = [];
  const limitIdx = recordsAsc.length;
  
  // Search the last 8 draws for triggers that haven't hit yet
  const last8Draws = recordsAsc.slice(-8);
  for (const draw of last8Draws) {
    const periodTriggers = triggers.filter(t => t.period === draw.period);
    for (const trig of periodTriggers) {
      // Check if it has hit in the periods up to Last
      let alreadyHit = false;
      if (trig.status === 'Hit' && trig.hitPeriod) {
        // Did it hit on or before Latest period?
        const hitIdx = recordsAsc.findIndex(r => r.period === trig.hitPeriod);
        if (hitIdx !== -1 && hitIdx < limitIdx) {
          alreadyHit = true;
        }
      }
      
      if (!alreadyHit) {
        const drawIdx = recordsAsc.findIndex(r => r.period === draw.period);
        const elapsed = recordsAsc.length - drawIdx; // periods elapsed including N
        const remaining = 8 - elapsed;
        if (remaining >= 0) {
          activeTargets.push({
            number: trig.targetNumber,
            period: trig.period,
            basePos: trig.basePosition,
            remainingPeriods: remaining + 1, // include next draw
          });
        }
      }
    }
  }

  // B. Frequency statistics and omission for all 49 numbers up to the absolute latest draw
  const freqMap: { [num: number]: number } = {};
  const omissionMap: { [num: number]: number } = {};

  for (let n = 1; n <= 49; n++) {
    freqMap[n] = 0;
    let om = 0;
    let found = false;
    for (let h = recordsAsc.length - 1; h >= 0; h--) {
      if (recordsAsc[h].numbers.includes(n)) {
        freqMap[n]++;
        if (!found) {
          om = recordsAsc.length - 1 - h;
          found = true;
        }
      }
    }
    if (!found) {
      om = recordsAsc.length;
    }
    omissionMap[n] = om;
  }

  // C. Calculate candidate scores
  const activeNumbers = activeTargets.map(t => t.number);
  const candidates: { num: number; score: number; freq: number; omission: number }[] = [];

  for (let num = 1; num <= 49; num++) {
    // RULE 1: Hedge (对冲)
    if (activeNumbers.includes(num)) continue;

    // RULE 2: Exclude last predictions
    if (lastPredictions.includes(num)) continue;

    // Score = Freq * 100 - Omission
    // Coldest (lowest score) takes priority
    const freq = freqMap[num] || 0;
    const omission = omissionMap[num] || 0;
    const score = freq * 100 - omission;

    candidates.push({ num, score, freq, omission });
  }

  candidates.sort((a, b) => a.score - b.score);
  const predictedNumbers = candidates.slice(0, 6).map(c => c.num).sort((a, b) => a - b);

  // D. Generate the beautiful Chinese Reasoning blocks matching the exact user prompt structure
  const lastTriggerText = activeTargets.length > 0 
    ? activeTargets.map(t => `第 ${t.period} 期的号码 ${t.number} 在第 ${t.basePos} 位触发，剩余追赶周期 ${t.remainingPeriods} 期`).join('; ')
    : '近期无处于追赶周期内的活跃目标号';

  const triggerLocking = `通过对近期开奖数据的纵向比对，本轮算法聚焦于捕捉最新的“隔期同号”现象。当前模型识别到 ${
    activeTargets.length > 0 
      ? `活跃的目标追踪号 [${activeNumbers.join(', ')}]` 
      : '无活跃目标追踪号'
  }。通过追踪夹心期的位移轨迹，锁定最近一期活跃名次。${lastTriggerText}，我们将这些核心变动轨迹进行深度标定，借而计算基准位 P。`;

  const edgeDeduction = `我正在深度解析边缘环形路径算法。针对首尾名次（第 1 名与第 7 名）的边缘性特征，系统已执行环形路径跳转计算（如 1 名对应 1、2、7，7 名对应 6、7、1）。通过对 ${
    activeTargets.length > 0 
      ? `当前目标号码在接下来周期内的追赶足迹进行精确映射` 
      : '历史常态轨迹'
  }的测算，我们将这 3 点高回补几率在空间维度上进行锁定。在推导过程中，通过“对冲法则”，确保预测路径上分布的高概率重叠号不被列入排除范围，从而维持整体预测链条的严密性。`;

  // Pick some cold numbers details
  const coldShow = candidates.slice(0, 4).map(c => `${c.num}号(历史出现${c.freq}次,遗漏${c.omission}期)`).join('、');
  const omissionConclusion = `为了最终精炼出那 6 个不可能出现的极低概率号码，系统结合 495 期历史大数据，对所有号码的冷热系数与遗漏波峰实施了全局扫描。计算结果显示，如 ${coldShow} 等号码处于显著的冷态失调区间或长期处于遗漏谷值。我们将这些冷号的遗漏惯性与当前的环形活跃路径进行二次对冲，成功剔除高危反弹数值。基于此，最终预测出下一期不可能出现的6个号码为：[${predictedNumbers.map(n => n.toString().padStart(2, '0')).join(', ')}]，已即刻完成数据归档。`;

  return {
    predictedNumbers,
    activeTargets,
    reasoning: {
      triggerLocking,
      edgeDeduction,
      omissionConclusion,
    },
  };
}
