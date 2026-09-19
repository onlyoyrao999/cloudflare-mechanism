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

async function generateContentWithRetry(apiKey: string, ai: any, prompt: string, baseUrl?: string) {
  const models = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of models) {
    // 1. 优先尝试 @google/genai SDK 结构化推演
    try {
      console.log(`[Cloudflare Worker] 正在使用 ${model} 引擎进行预测推演...`);
      const reqConfig = {
        model,
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              predictedNumbers: { type: Type.ARRAY, items: { type: Type.INTEGER } },
              reasoning: {
                type: Type.OBJECT,
                properties: { 
                  triggerLocking: { type: Type.STRING }, 
                  edgeDeduction: { type: Type.STRING }, 
                  omissionConclusion: { type: Type.STRING } 
                },
                required: ['triggerLocking', 'edgeDeduction', 'omissionConclusion'],
              },
            },
            required: ['predictedNumbers', 'reasoning'],
          },
        },
      };

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Model ${model} 请求超时 (9s)`)), 9000)
      );

      const response = await Promise.race([
        ai.models.generateContent(reqConfig),
        timeoutPromise
      ]) as any;

      if (response && response.text) {
        console.log(`[Cloudflare Worker] SDK 引擎 ${model} 成功响应！`);
        return { text: response.text, usedModel: model };
      }
    } catch (sdkErr: any) {
      console.warn(`[Cloudflare Worker] SDK ${model} 调用波动 (${sdkErr?.message || sdkErr})，尝试原生 REST Fetch 保障通路...`);
      
      // 2. 备用原生 REST Fetch（Edge Worker 原生运行时完全兼容）
      try {
        const host = baseUrl || 'https://generativelanguage.googleapis.com';
        const url = `${host}/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        
        const fetchRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        });
        clearTimeout(timer);

        if (fetchRes.ok) {
          const fetchJson: any = await fetchRes.json();
          const text = fetchJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            console.log(`[Cloudflare Worker] 原生 REST Fetch ${model} 成功响应！`);
            return { text, usedModel: model };
          }
        } else {
          const errText = await fetchRes.text().catch(() => '');
          console.warn(`[Cloudflare Worker] REST Fetch ${model} HTTP ${fetchRes.status}: ${errText.slice(0, 100)}`);
        }
      } catch (fetchErr: any) {
        lastError = fetchErr;
        console.warn(`[Cloudflare Worker] REST Fetch ${model} 异常: ${fetchErr?.message || fetchErr}`);
      }
    }
  }

  throw lastError || new Error(`所有候选 Gemini 模型 (${models.join(', ')}) 均调用失败`);
}

export async function getAIPrediction(env: any, rawRecords: any[], triggers: any[], lastPredictions: number[]) {
  const latestDraw = rawRecords[0];
  const mathPredict = predictNextDraw(rawRecords, triggers, lastPredictions);
  const activeTargets = mathPredict.activeTargets;
  const activeNumbers = activeTargets.map((t: any) => t.number);

  const apiKey = env?.GEMINI_API_KEY || env?.GOOGLE_API_KEY || env?.GEMINI_KEY || env?.GOOGLE_GENAI_API_KEY || env?.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('未在 Cloudflare Pages 环境变量中检测到 GEMINI_API_KEY，启用本地高精度精算算法');
    return {
      ...mathPredict,
      isAIPowered: false,
      model: 'local-math',
    };
  }

  const baseUrl = env.GEMINI_BASE_URL || env.GOOGLE_GEMINI_BASE_URL;
  const ai = new GoogleGenAI({
    apiKey: apiKey,
    ...(baseUrl ? { httpOptions: { baseUrl } } : {}),
  });
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

  try {
    const { text, usedModel } = await generateContentWithRetry(apiKey, ai, prompt, baseUrl);
    const body = JSON.parse(text?.trim() || '{}');
    let predicted = (body.predictedNumbers || []).map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n) && n >= 1 && n <= 49);
    predicted = Array.from(new Set(predicted)).slice(0, 6);
    
    if (predicted.length === 6) {
      predicted.sort((a: number, b: number) => a - b);
      const safeSet = new Set<number>();
      
      // 1. Add Gemini's numbers if they are safe
      for (const num of predicted) {
        if (!activeNumbers.includes(num)) {
          safeSet.add(num);
        }
      }
      
      // 2. 如果万一与活跃号重叠，从 1-49 中填充安全号码补齐到 6 个
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
          triggerLocking: body.reasoning.triggerLocking,
          edgeDeduction: body.reasoning.edgeDeduction,
          omissionConclusion: body.reasoning.omissionConclusion,
        },
        isAIPowered: true,
        model: usedModel,
      };
    }
  } catch (err: any) {
    console.warn('Gemini AI 调用未成功，无缝切换为本地高精度精算模型保底:', err?.message || err);
  }

  // 终极安全保底：本地高精度概率统计算法，确保系统永不崩溃、网页秒开
  return {
    ...mathPredict,
    isAIPowered: false,
    model: 'local-math',
  };
}
