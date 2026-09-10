import { analyzeData } from '../../src/data/analyzer.js';
import { scrapeLatest, getAIPrediction } from './_shared.js';

export async function onRequestGet(context: any) {
  const { env } = context;

  try {
    // 1. 被动刷新大盘数据机制
    const lastCheckTimeStr = await env.MACAUJC_KV.get('last_check');
    const lastCheckTime = lastCheckTimeStr ? parseInt(lastCheckTimeStr, 10) : 0;
    
    if (Date.now() - lastCheckTime > 5 * 60 * 1000) {
      await env.MACAUJC_KV.put('last_check', Date.now().toString());
      await scrapeLatest(env);
    }

    // 2. 提取大盘历史记录
    const kvData = await env.MACAUJC_KV.get('history');
    const rawRecords = kvData ? JSON.parse(kvData) : [];
    
    if (rawRecords.length === 0) {
      return new Response(JSON.stringify({ status: 'error', message: 'No records available.' }), { status: 500 });
    }

    // 3. 提取永久 AI 历史库，并送入引擎回测
    const historyKvData = await env.MACAUJC_KV.get('ai_history');
    const aiHistoryMap = historyKvData ? JSON.parse(historyKvData) : {};
    const analysis = analyzeData(rawRecords, aiHistoryMap);
    
    const lastPredictions = analysis.predictions.length > 0 ? analysis.predictions[analysis.predictions.length - 1].predictedNumbers : [];
    const currentPeriod = rawRecords[0]?.period || '';
    
    // 【关键修复点】：精准计算“即将开奖的下一期”的真实期号
    const targetPeriodForPrediction = (parseInt(currentPeriod, 10) + 1).toString();
    
    // 4. 读取缓存，但加入“严苛的期号对齐校验”
    let prediction = null;
    const cacheData = await env.MACAUJC_KV.get('prediction_cache');
    if (cacheData) {
      const parsed = JSON.parse(cacheData);
      // 如果缓存的期号，就是我们需要推算的下一期期号，才允许复用缓存！
      // 否则（比如大盘到了 253，缓存却还是 252 甚至是 251 的旧数据），直接作废不用，强制重新算。
      if (parsed.period === targetPeriodForPrediction) {
        prediction = parsed.prediction;
      }
    }

    // 5. 如果没有有效缓存，生成新预测并双重落库
    if (!prediction) {
      const generatedPrediction = await getAIPrediction(env, rawRecords, analysis.triggers, lastPredictions);
      
      const doubleCheckCache = await env.MACAUJC_KV.get("prediction_cache");
      let otherWorkerAlreadySaved = false;
      if (doubleCheckCache) {
        const parsed = JSON.parse(doubleCheckCache);
        if (parsed.period === targetPeriodForPrediction && parsed.prediction) {
          prediction = parsed.prediction;
          otherWorkerAlreadySaved = true;
        }
      }
      
      if (!otherWorkerAlreadySaved) {
        prediction = generatedPrediction;
        
        await env.MACAUJC_KV.put("prediction_cache", JSON.stringify({
           period: targetPeriodForPrediction,
           prediction
         }));
        
        if (prediction.predictedNumbers) {
          const currentHistoryKv = await env.MACAUJC_KV.get("ai_history");
          const currentAiHistoryMap = currentHistoryKv ? JSON.parse(currentHistoryKv) : {};
          currentAiHistoryMap[targetPeriodForPrediction] = prediction.predictedNumbers;
          await env.MACAUJC_KV.put("ai_history", JSON.stringify(currentAiHistoryMap));
        }
      }
    }
      

    return new Response(JSON.stringify({
      latestDraw: rawRecords[0],
      summary: analysis.summary,
      triggers: analysis.triggers.slice(-50),
      predictions: analysis.predictions.slice(-30),
      frequencyStats: analysis.frequencyStats,
      prediction,
      totalCount: rawRecords.length,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
  }
}
