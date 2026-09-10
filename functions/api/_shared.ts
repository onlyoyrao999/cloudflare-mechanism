import { GoogleGenAI, Type } from '@google/genai';
import { predictNextDraw } from '../../src/data/analyzer.js';

export async function scrapeLatest(env: any) {
  try {
    const url = 'https://macaujc.ddcdn.cloudns.org/';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const text = await res.text();
    const lines = text.split('\n');
    const recordsMap = new Map<string, number[]>();

    // Load existing records from KV
    let existing = [];
    const kvData = await env.MACAUJC_KV.get('history');
    if (kvData) {
      existing = JSON.parse(kvData);
    }

    for (const r of existing) {
      recordsMap.set(r.period, r.numbers);
    }

    let addedCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(\d+):\s*\[(.*?)\]/);
      if (match) {
        const period = match[1];
        const numsStr = match[2];
        const numbers = numsStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
          if (!recordsMap.has(period)) {
            // Only consider it added if it is NEWER than the newest record we already have, or if we have no existing records
            if (existing.length === 0 || parseInt(period, 10) > parseInt(existing[0].period, 10)) {
              addedCount++;
            }
          }
          recordsMap.set(period, numbers);
        }
      }
    }

    const mergedList = Array.from(recordsMap.entries()).map(([period, numbers]) => ({
      period, numbers,
    }));
    mergedList.sort((a, b) => b.period.localeCompare(a.period));
    
    // 强制截断，只保留最新的 50 期记录（对应过去代码中的 49 期历史 + 最新 1 期）
    if (mergedList.length > 50) {
      mergedList.length = 50;
    }

    await env.MACAUJC_KV.put('history', JSON.stringify(mergedList));
    
    return {
      success: true,
      count: mergedList.length,
      message: addedCount > 0 ? `Successfully integrated ${addedCount} new drawing records.` : 'Data is already up to date.',
    };
  } catch (err: any) {
    console.error('Background scrape failed:', err);
    return { success: false, count: 0, message: err.message };
  }
}

export async function getAIPrediction(env: any, rawRecords: any[], triggers: any[], lastPredictions: number[]) {
  const latestDraw = rawRecords[0];
  const mathPredict = predictNextDraw(rawRecords, triggers, lastPredictions);
  const activeTargets = mathPredict.activeTargets;
  const activeNumbers = activeTargets.map((t: any) => t.number);

  if (!env.GEMINI_API_KEY) {
    return { ...mathPredict, isAIPowered: false };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const recordsText = rawRecords.slice(0, 49).map((r: any) => `${r.period}: [${r.numbers.join(',')}]`).join('\n');

    let feedbackContext = "";
    if (lastPredictions && lastPredictions.length > 0) {
      const failedExclusions = lastPredictions.filter(num => latestDraw.numbers.includes(num));
      if (failedExclusions.length > 0) {
        feedbackContext = `\n⚠️ 【AI自我修正警告：上期预测回测失败】 ⚠️\n在上一期（第 ${latestDraw.period} 期），预测排除 [${lastPredictions.join(', ')}]，但实际开出了 [${failedExclusions.join(', ')}]。必须引入修正权重避免重复失误！`;
      } else {
        feedbackContext = `\n✅ 【AI自我修正回测反馈：上期预测成功】\n上一期排除了 [${lastPredictions.join(', ')}] 且完全命中（未开出）。请保持当前权重。`;
      }
    }

    const prompt = `您是一位高等概率论专家和赛马彩票混沌学学者。
现在我们将向您提供澳门赛马会最近的 49 期开奖历史数据。每一期包含 7 个开奖号码（范围从 01 到 49）。
${feedbackContext}
 
【重要分析理论与对冲规则】：
1. 隔期同号轨迹（Hedge 对冲防线）：当前有些号码正处于活跃的轨迹追逐周期中。这些号码在接下来的开奖中出现概率极高。
   - 处于追逐周期中的活跃目标号：[${activeNumbers.join(', ')}]
   - ⚠️【绝对禁区】：在您预测的“不可能开出的6个号码”中，**绝对不能**包含这几个活跃目标号码！因为它们随时可能反弹回补。
 
2. 防止推荐重复（上一期排除重合限制）：
   - 上一期已排除的6个号码是：[${lastPredictions.join(', ')}]
   - ⚠️【限制】：确保本期的预测名单与上一期的 [${lastPredictions.join(', ')}] 不完全相同，让排除名单具有周期时效变化。
 
3. 遗漏与冷热对冲：
   - 您应该评估 49 码的总体出现频次、近期遗漏周期，并结合混沌理论推演下一期（第 ${parseInt(latestDraw.period, 10) + 1} 期）最不可能出现的 6 个号码。
 
以下是前面49期开奖数据（最新期在最上面）：
${recordsText}
 
请在进行高精度数理逻辑推演后，计算出下一期最不可能出现的6个号码（范围为 1 到 49，必须是 6 个互不相同的整数，按升序排列）。
 
您必须返回符合以下 JSON 结构的预测：
{
  "predictedNumbers": [number, number, number, number, number, number],
  "reasoning": {
    "triggerLocking": "根据隔期特征，讨论排除名单中对当前活跃追踪目标号 [${activeNumbers.join(', ')}] 执行的安全加锁与防回弹屏障过程，使用极具专业度的中文描绘",
    "edgeDeduction": "详细阐释首尾边缘环形运算下对高回补落点的绕道对冲策略（如果上期失败，需阐述本次的修正方案），使用极具专业度的中文描绘",
    "omissionConclusion": "结合49期大盘冷态指标及遗漏波峰，全面推导论述此 6 个号码不可能出现的必然逻辑，使用极具专业度的中文描绘"
  }
}`;

    const reqConfig = {
      contents: prompt,
      config: {
        temperature: 0.1, // 强行降低随机性，确保同一个 prompt 并发产出几乎完全一致的结果
        topP: 0.1,
        topK: 1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictedNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            reasoning: {
              type: Type.OBJECT,
              properties: { triggerLocking: { type: Type.STRING }, edgeDeduction: { type: Type.STRING }, omissionConclusion: { type: Type.STRING } },
              required: ['triggerLocking', 'edgeDeduction', 'omissionConclusion'],
            },
          },
          required: ['predictedNumbers', 'reasoning'],
        },
      },
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        ...reqConfig
      });
    } catch (err36: any) {
      console.warn('gemini-3.6-flash 调用失败，自动降级为 gemini-3.5-flash:', err36.message);
      response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        ...reqConfig
      });
    }

    const body = JSON.parse(response.text?.trim() || '{}');
    let predicted = (body.predictedNumbers || []).map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n) && n >= 1 && n <= 49);
    predicted = Array.from(new Set(predicted)).slice(0, 6);
    
    if (predicted.length !== 6) return { ...mathPredict, isAIPowered: false };

    predicted.sort((a: number, b: number) => a - b);
    const safeSet = new Set<number>();
    
    // 1. Add Gemini's numbers if they are safe
    for (const num of predicted) {
      if (!activeNumbers.includes(num)) {
        safeSet.add(num);
      }
    }
    
    // 2. Fill the rest with mathPredict if safe
    for (const num of mathPredict.predictedNumbers) {
      if (safeSet.size >= 6) break;
      if (!activeNumbers.includes(num)) {
        safeSet.add(num);
      }
    }
    
    // 3. If STILL not 6, fill with any valid number 1-49
    let candidate = 1;
    while (safeSet.size < 6 && candidate <= 49) {
      if (!activeNumbers.includes(candidate)) {
        safeSet.add(candidate);
      }
      candidate++;
    }
    
    const safePrediction = Array.from(safeSet).sort((a, b) => a - b);

    return {
      predictedNumbers: safePrediction,
      activeTargets: activeTargets,
      reasoning: {
        triggerLocking: body.reasoning.triggerLocking || mathPredict.reasoning.triggerLocking,
        edgeDeduction: body.reasoning.edgeDeduction || mathPredict.reasoning.edgeDeduction,
        omissionConclusion: body.reasoning.omissionConclusion || mathPredict.reasoning.omissionConclusion,
      },
      isAIPowered: true,
    };
  } catch (err: any) {
    console.error('Gemini error:', err);
    return { 
      ...mathPredict, 
      isAIPowered: false,
      reasoning: {
        triggerLocking: `[AI 接口调用失败: ${err.message}] 系统已自动降级为本地高精度统计算法。\n` + mathPredict.reasoning.triggerLocking,
        edgeDeduction: mathPredict.reasoning.edgeDeduction,
        omissionConclusion: mathPredict.reasoning.omissionConclusion
      }
    };
  }
}
