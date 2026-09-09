// server.ts
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { analyzeData, predictNextDraw } from './src/data/analyzer.js';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = 3000;

async function generateContentWithRetry(ai: any, request: any, maxRetriesPerModel = 2) {
  const models = ['gemini-3.6-flash', 'gemini-3.5-flash'];
  
  for (const model of models) {
    for (let i = 0; i < maxRetriesPerModel; i++) {
      try {
        const requestWithModel = { ...request, model };
        return await ai.models.generateContent(requestWithModel);
      } catch (err: any) {
        const isUnavailable = err.status === 503 || err.status === 'UNAVAILABLE' || (err.message && err.message.includes('503'));
        
        // If we exhausted retries for this model OR it's a non-503 error, break to next model
        if (i === maxRetriesPerModel - 1 || !isUnavailable) {
          console.warn(`Model ${model} failed (${err.message}). ${models.indexOf(model) < models.length - 1 ? 'Falling back to next model...' : ''}`);
          break; // Exit inner retry loop, proceed to next model in outer loop
        }
        
        console.warn(`Gemini API busy (503) for ${model}. Retrying in ${Math.pow(2, i + 1)}s...`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i + 1) * 1000));
      }
    }
  }
  
  throw new Error(`All Gemini models (${models.join(', ')}) failed.`);
}

// Prediction cache to avoid excessive API requests
const cacheFilePath = path.resolve('src/data/prediction_cache.json');

function getCachedPrediction(currentPeriod: string) {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const data = fs.readFileSync(cacheFilePath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && parsed.period === currentPeriod) {
        return parsed.prediction;
      }
    }
  } catch (error) {
    console.error('Error reading prediction cache path:', error);
  }
  return null;
}

function savePredictionCache(period: string, prediction: any) {
  try {
    const dir = path.dirname(cacheFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cacheFilePath, JSON.stringify({ period, prediction }, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving prediction cache:', error);
  }
}

function clearCachedPredictionFile() {
  try {
    if (fs.existsSync(cacheFilePath)) {
      fs.unlinkSync(cacheFilePath);
    }
  } catch (error) {
    console.error('Error clearing prediction cache file:', error);
  }
}


const aiHistoryFilePath = path.resolve('src/data/ai_history.json');

function getAIHistoryMap(): Record<string, number[]> {
  try {
    if (fs.existsSync(aiHistoryFilePath)) {
      const data = fs.readFileSync(aiHistoryFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading AI history:', error);
  }
  return {};
}

function saveAIPredictionToHistory(targetPeriod: string, predictedNumbers: number[]) {
  try {
    const historyMap = getAIHistoryMap();
    historyMap[targetPeriod] = predictedNumbers;
    const dir = path.dirname(aiHistoryFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(aiHistoryFilePath, JSON.stringify(historyMap, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving AI prediction to history:', error);
  }
}

app.use(express.json());

// ---------------------------------------------------------------------------------
// ☁️ CLOUDFLARE KV MIGRATION GUIDE:
// Currently, this app uses Node.js `fs` to store historical data locally (history.json).
// When you export this project and deploy to **Cloudflare Pages**, Node's `fs` won't work.
// You will need to use Cloudflare KV. 
//
// To migrate:
// 1. Create a KV namespace in your Cloudflare dashboard (e.g., `MACAUJC_KV`).
// 2. Bind it to your Pages project in the dashboard settings.
// 3. Replace these `fs` functions with KV calls. For example:
//
//    async function getRecords(env) {
//      const data = await env.MACAUJC_KV.get('history');
//      return data ? JSON.parse(data) : [];
//    }
//
//    async function saveRecords(env, records) {
//      await env.MACAUJC_KV.put('history', JSON.stringify(records));
//    }
// ---------------------------------------------------------------------------------

// Path to data file
const historyFilePath = path.resolve('src/data/history.json');

// Ensure history file directory exists and has a baseline
function getRecords() {
  try {
    if (fs.existsSync(historyFilePath)) {
      const data = fs.readFileSync(historyFilePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading history file:', error);
  }
  return [];
}

function saveRecords(records: any[]) {
  try {
    const dir = path.dirname(historyFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(historyFilePath, JSON.stringify(records, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving history file:', error);
  }
}

// Scrape helper
async function scrapeLatest(): Promise<{ success: boolean; count: number; message: string }> {
  try {
    const url = 'https://macaujc.ddcdn.cloudns.org/';
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const text = await res.text();
    const lines = text.split('\n');
    const recordsMap = new Map<string, number[]>();

    // Load existing records first to merge
    const existing = getRecords();
    for (const r of existing) {
      recordsMap.set(r.period, r.numbers);
    }

    let addedCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Format: "202649: [11,47,09,49,02,01,03]" or similar
      const match = trimmed.match(/^(\d+):\s*\[(.*?)\]/);
      if (match) {
        const period = match[1];
        const numsStr = match[2];
        const numbers = numsStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
          if (!recordsMap.has(period)) {
            addedCount++;
          }
          recordsMap.set(period, numbers);
        }
      }
    }

    // Convert map to list and sort descending
    const mergedList = Array.from(recordsMap.entries()).map(([period, numbers]) => ({
      period,
      numbers,
    }));
    mergedList.sort((a, b) => b.period.localeCompare(a.period));

    if (addedCount > 0) {
      saveRecords(mergedList);
    }
    
    return {
      success: true,
      count: mergedList.length,
      message: addedCount > 0 ? `Successfully integrated ${addedCount} new drawing records.` : 'Data is already up to date.',
    };
  } catch (err: any) {
    console.error('Background scrape failed:', err);
    return {
      success: false,
      count: 0,
      message: `Failed to fetch live data: ${err.message}. Showing cached results.`,
    };
  }
}

/**
 * Perform predictive analysis using Gemini 3.5-flash with structural JSON guidance,
 * including a self-correcting feedback loop for historical misses.
 */
async function getAIPrediction(
  rawRecords: any[],
  triggers: any[],
  lastPredictions: number[]
): Promise<any> {
  const latestDraw = rawRecords[0];
  const mathPredict = predictNextDraw(rawRecords, triggers, lastPredictions);
  const activeTargets = mathPredict.activeTargets;
  const activeNumbers = activeTargets.map((t: any) => t.number);

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('API连接异常: 未配置 GEMINI_API_KEY');
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Provide the 49 lottery periods as statistical text context
    const recordsText = rawRecords
      .slice(0, 49)
      .map((r) => `${r.period}: [${r.numbers.join(',')}]`)
      .join('\n');

    // Self-correcting feedback loop logic: Evaluate if the LAST prediction failed
    let feedbackContext = "";
    if (lastPredictions && lastPredictions.length > 0) {
      const failedExclusions = lastPredictions.filter(num => latestDraw.numbers.includes(num));
      if (failedExclusions.length > 0) {
        feedbackContext = `
⚠️ 【AI自我修正警告：上期预测回测失败】 ⚠️
在上一期（第 ${latestDraw.period} 期），模型预测排除的号码是 [${lastPredictions.join(', ')}]。
但实际开奖号码是 [${latestDraw.numbers.join(', ')}]。
其中，号码 [${failedExclusions.join(', ')}] 被错误地排除了（它在最新一期开出了）。
请深刻反思上一期计算模型中的参数偏差（可能是对冷号回补的估计不足，或者是对冲轨迹未被正确识别）。在本次针对第 ${parseInt(latestDraw.period, 10) + 1} 期的预测中，必须引入修正权重，避免重复相同的判断失误！`;
      } else {
        feedbackContext = `
✅ 【AI自我修正回测反馈：上期预测成功】
在上一期（第 ${latestDraw.period} 期），模型成功排除了 [${lastPredictions.join(', ')}]，这些号码确实没有开出。请继续保持当前的参数权重，继续推演下一期。`;
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
   - 重点考虑长期极度冷态、出现频次极低、或者近期遗漏处于极值不符合反弹走势的号码。

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

    console.log('Requesting Gemini AI prediction...');
    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictedNumbers: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: '6 unique numbers from 1 to 49 that are least likely to appear',
            },
            reasoning: {
              type: Type.OBJECT,
              properties: {
                triggerLocking: { type: Type.STRING },
                edgeDeduction: { type: Type.STRING },
                omissionConclusion: { type: Type.STRING },
              },
              required: ['triggerLocking', 'edgeDeduction', 'omissionConclusion'],
            },
          },
          required: ['predictedNumbers', 'reasoning'],
        },
      },
    });

    const textResult = response.text || '';
    const body = JSON.parse(textResult.trim());
    
    // Validate the prediction bounds
    let predicted = (body.predictedNumbers || [])
      .map((n: any) => parseInt(n, 10))
      .filter((n: number) => !isNaN(n) && n >= 1 && n <= 49);
      
    // Dedup and slice
    predicted = Array.from(new Set(predicted)).slice(0, 6);
    
    // If invalid or less than 6, fallback to math prediction
    if (predicted.length !== 6) {
      console.error('Gemini generated invalid prediction length:', predicted);
      return { ...mathPredict, isAIPowered: false };
    }

    predicted.sort((a, b) => a - b);

    // Make sure we did not include any active numbers
    const safePrediction: number[] = [];
    for (const num of predicted) {
      if (activeNumbers.includes(num)) {
        // Swap with the mathematical safe suggestion
        for (const replacement of mathPredict.predictedNumbers) {
          if (!predicted.includes(replacement) && !activeNumbers.includes(replacement) && !safePrediction.includes(replacement)) {
            safePrediction.push(replacement);
            break;
          }
        }
      } else {
        safePrediction.push(num);
      }
    }

    // Fill up if somehow less than 6
    while (safePrediction.length < 6) {
      for (const replacement of mathPredict.predictedNumbers) {
        if (!safePrediction.includes(replacement) && !activeNumbers.includes(replacement)) {
          safePrediction.push(replacement);
          break;
        }
      }
    }

    safePrediction.sort((a, b) => a - b);

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
    console.error('Gemini prediction generation failed:', err);
    throw new Error('API连接异常: ' + err.message);
  }
}

// 1. API: Get full analytical model
app.get('/api/analyze', async (req, res) => {
  // Unconditionally fetch latest records on every page load
  try {
    console.log('Passively refreshing lottery drawings check on page load...');
    await scrapeLatest();
  } catch (e) {
    console.error('Passive scrape error:', e);
  }

  const rawRecords = getRecords();
  if (rawRecords.length === 0) {
    return res.status(500).json({ status: 'error', message: 'No records available.' });
  }

  const analysis = analyzeData(rawRecords, getAIHistoryMap());
  
  // Predict next period based on computed results and history
  const lastPredictions = analysis.predictions.length > 0 
    ? analysis.predictions[analysis.predictions.length - 1].predictedNumbers 
    : [];

  const currentPeriod = rawRecords[0]?.period || '';
  let prediction = getCachedPrediction(currentPeriod);
  if (!prediction) {
    try {
      prediction = await getAIPrediction(rawRecords, analysis.triggers, lastPredictions);
      savePredictionCache(currentPeriod, prediction); const nextP = (parseInt(currentPeriod, 10)+1).toString(); if (nextP && prediction.predictedNumbers) { saveAIPredictionToHistory(nextP, prediction.predictedNumbers); }
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'AI 预测失败' });
    }
  }

  res.json({
    latestDraw: rawRecords[0],
    summary: analysis.summary,
    triggers: analysis.triggers.slice(-50), // Send last 50 triggers to avoid bloat
    predictions: analysis.predictions.slice(-30), // Send last 30 historical predictions
    frequencyStats: analysis.frequencyStats,
    prediction,
    totalCount: rawRecords.length,
  });
});

// 2. API: Force scrape
app.post('/api/refresh', async (req, res) => {
  console.log('Force checking lottery results...');
  const result = await scrapeLatest();
  if (result.success) {
    // Invalidate cache to guarantee a fresh Gemini prediction is made based on the new data
    clearCachedPredictionFile();
    res.json({ status: 'success', message: result.message });
  } else {
    res.status(502).json({ status: 'error', message: result.message });
  }
});

// 3. API: Generate smart AI explanation essay using @google/genai
app.post('/api/ai-report', async (req, res) => {
  try {
    const { prediction, summary, latestDraw } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(200).json({
        content: `### ⚠️ API连接异常

服务器端未检测到有效的 \`GEMINI_API_KEY\` 密钥，无法连接至 AI 引擎。

*(提示：请检查环境变量配置，确保系统能正常访问 Gemini 接口。)*`,
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const numShow = (prediction?.predictedNumbers || []).map((n: number) => n.toString().padStart(2, '0')).join(', ');
    const activeShow = (prediction?.activeTargets || []).map((t: any) => `号码 ${t.number} 在第 ${t.basePos} 位触发`).join('、');

    const prompt = `你是一个澳门赛马数据分析专家、高等概率论与彩票混沌学学者。
请根据以下真实的数理分析模型计算出的结果，生成一封专业、权威、高智商感觉的预测与排除评估报告。

当前期数数据:
- 最新开奖期: ${latestDraw?.period || '最新'}
- 最新开奖号: [${(latestDraw?.numbers || []).join(', ')}]
- 当前回测大盘数据总样本: ${summary?.totalDraws || 49} 期
- 轨迹触发器总触发事件: ${summary?.totalTriggers || 0} 次
- 基准位P极速回补轨迹总命中: ${summary?.totalHits || 0} 次
- 1-4期快速补位命中占比: ${summary?.hitRate1To4 ? (summary.hitRate1To4 * 100).toFixed(1) : '100'}%
- 当前在追赶周期中的活跃目标号: [${activeShow || '无'}]
- 专家排除算法回测完全成功率: ${summary?.exclusionSuccessRate ? (summary.exclusionSuccessRate * 100).toFixed(1) : '80'}%
- 系统使用排除法推导出的下一期不可能出现的6个号码: [${numShow}]

请根据这些数据，写一封深度的澳门赛马彩票分析。内容必须覆盖以下三个方面，并使用以下特定的专业小标题，展示你的学术深度和严密逻辑：

一、触发特征与号码锁定
详细阐释“隔期同号”在本次预测中的最新触发动作，计算目标号和夹心号，分析它们和最新期活跃度的数理相关性。

二、边缘算法与路径推演
详细讨论边缘环形跳转逻辑（如第1名和第7名遇到边缘时的跳转）及在这三个预测落点位置上的分布情况。阐述如何利用对冲防线确保排除的6个号码不在高概率回补路径中。

三、遗漏分析与排除结论
通过大盘冷热度以及遗漏值，论述为什么推导出的这6个号码 [${numShow}] 是下一期最不可能出现的，并说明你的数据归档策略。

字数要求在800字左右，语气要理性、冷静、充满高净值学者风范。必须使用 Markdown 格式输出，文字排版优雅精美。不要使用废话，直奔主题。`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: prompt,
    });

    res.json({ content: response.text });
  } catch (err: any) {
    console.error('Gemini API call failed:', err);
    res.status(200).json({
      content: `### ⚠️ API连接异常

当前网络请求超时或所有 AI 接口连接失败。

**错误信息:**
\`${err.message}\`

*(提示：请检查服务器网络状态或重试请求。)*`
    });
  }
});

// Configure Vite or Static Files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
