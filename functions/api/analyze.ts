import { analyzeData } from '../../src/data/analyzer.js';
import { scrapeLatest, getAIPrediction } from './_shared.js';

export async function onRequestGet(context: any) {
  const { env } = context;

  try {
    // 1. 被动刷新大盘数据机制：每天 21:35 后只拉取一次
    const nowUtc = new Date();
    const nowUtc8 = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000);
    const todayDateStr = `${nowUtc8.getUTCFullYear()}-${String(nowUtc8.getUTCMonth() + 1).padStart(2, '0')}-${String(nowUtc8.getUTCDate()).padStart(2, '0')}`;
    const hours = nowUtc8.getUTCHours();
    const minutes = nowUtc8.getUTCMinutes();

    // 当时间超过 21:35 时，检查今天是否已经拉取过
    if (hours > 21 || (hours === 21 && minutes >= 35)) {
      const lastScrapeDate = await env.MACAUJC_KV.get('last_scrape_date');
      if (lastScrapeDate !== todayDateStr) {
        await env.MACAUJC_KV.put('last_scrape_date', todayDateStr);
        await scrapeLatest(env);
      }
    }

    // 2. 提取大盘历史记录
    let kvData = await env.MACAUJC_KV.get('history');
    let rawRecords = kvData ? JSON.parse(kvData) : [];
    
    if (rawRecords.length === 0) {
      console.log('KV 中暂无数据，立即触发首次数据抓取...');
      await scrapeLatest(env);
      kvData = await env.MACAUJC_KV.get('history');
      rawRecords = kvData ? JSON.parse(kvData) : [];
    }
    
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
    
    // 4. 读取缓存，但加入“严苛的期号对齐校验”与“本地降级脏数据过滤清洗”
    let prediction = null;
    const cacheData = await env.MACAUJC_KV.get('prediction_cache');
    if (cacheData) {
      try {
        const parsed = JSON.parse(cacheData);
        if (parsed && parsed.period === targetPeriodForPrediction && parsed.prediction) {
          const triggerText = parsed.prediction?.reasoning?.triggerLocking || '';
          const isPolluted = triggerText.includes('降级') || triggerText.includes('失败');
          if (!isPolluted) {
            prediction = parsed.prediction;
          } else {
            console.warn('检测到历史残留的脏缓存，立即清除作废...');
            await env.MACAUJC_KV.delete('prediction_cache');
          }
        }
      } catch (e) {
        console.warn('解析缓存失败，清理:', e);
        await env.MACAUJC_KV.delete('prediction_cache');
      }
    }

    // 5. 如果没有有效缓存，生成新预测并双重落库
    if (!prediction) {
      const generatedPrediction = await getAIPrediction(env, rawRecords, analysis.triggers, lastPredictions);
      prediction = generatedPrediction;

      // 无论是 AI 还是本地精算保底，只要产生有效预测就存入缓存，实现秒开网页
      if (generatedPrediction && generatedPrediction.predictedNumbers?.length === 6) {
        const doubleCheckCache = await env.MACAUJC_KV.get("prediction_cache");
        let otherWorkerAlreadySaved = false;
        if (doubleCheckCache) {
          try {
            const parsed = JSON.parse(doubleCheckCache);
            if (parsed.period === targetPeriodForPrediction && parsed.prediction) {
              prediction = parsed.prediction;
              otherWorkerAlreadySaved = true;
            }
          } catch (e) {
            // ignore
          }
        }
        
        if (!otherWorkerAlreadySaved) {
          await env.MACAUJC_KV.put("prediction_cache", JSON.stringify({
             period: targetPeriodForPrediction,
             prediction
          }));
          
          if (prediction.isAIPowered) {
            const currentHistoryKv = await env.MACAUJC_KV.get("ai_history");
            const currentAiHistoryMap = currentHistoryKv ? JSON.parse(currentHistoryKv) : {};
            currentAiHistoryMap[targetPeriodForPrediction] = prediction.predictedNumbers;
            await env.MACAUJC_KV.put("ai_history", JSON.stringify(currentAiHistoryMap));
          }
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
