import { analyzeData } from '../../src/data/analyzer.js';
import { scrapeLatest, getAIPrediction } from './_shared.js';

export async function onRequestGet(context: any) {
  const { env } = context;
  const url = new URL(context.request.url);
  const forceAi = url.searchParams.get('forceAi') === 'true' || url.searchParams.get('force') === 'true';
  const kv = env.MACAUJC_KV || env.PREDICTIONS_KV || env.KV;

  try {
    // 1. 被动刷新大盘数据机制：每天 21:35 后只拉取一次
    const nowUtc = new Date();
    const nowUtc8 = new Date(nowUtc.getTime() + 8 * 60 * 60 * 1000);
    const todayDateStr = `${nowUtc8.getUTCFullYear()}-${String(nowUtc8.getUTCMonth() + 1).padStart(2, '0')}-${String(nowUtc8.getUTCDate()).padStart(2, '0')}`;
    const hours = nowUtc8.getUTCHours();
    const minutes = nowUtc8.getUTCMinutes();

    // 当时间超过 21:35 时，检查今天是否已经拉取过
    if (kv && (hours > 21 || (hours === 21 && minutes >= 35))) {
      const lastScrapeDate = await kv.get('last_scrape_date');
      if (lastScrapeDate !== todayDateStr) {
        await kv.put('last_scrape_date', todayDateStr);
        await scrapeLatest(env);
      }
    }

    // 2. 提取大盘历史记录
    let kvData = kv ? await kv.get('history') : null;
    let rawRecords = kvData ? JSON.parse(kvData) : [];
    
    if (rawRecords.length === 0) {
      console.log('KV 中暂无数据，立即触发首次数据抓取...');
      await scrapeLatest(env);
      kvData = kv ? await kv.get('history') : null;
      rawRecords = kvData ? JSON.parse(kvData) : [];
    }
    
    if (rawRecords.length === 0) {
      return new Response(JSON.stringify({ status: 'error', message: 'No records available.' }), { status: 500 });
    }

    // 3. 提取永久 AI 历史库，并送入引擎回测
    const historyKvData = kv ? await kv.get('ai_history') : null;
    const aiHistoryMap = historyKvData ? JSON.parse(historyKvData) : {};
    const analysis = analyzeData(rawRecords, aiHistoryMap);
    
    const lastPredictions = analysis.predictions.length > 0 ? analysis.predictions[analysis.predictions.length - 1].predictedNumbers : [];
    const currentPeriod = rawRecords[0]?.period || '';
    
    // 【关键修复点】：精准计算“即将开奖的下一期”的真实期号
    const targetPeriodForPrediction = (parseInt(currentPeriod, 10) + 1).toString();
    
    // 4. 读取缓存：核心原则【这玩意儿应该存到 KV，如果是高精度数理对冲运算保底，必须自动重新调用 AI 模型】
    let prediction = null;
    if (!forceAi && kv) {
      const cacheData = await kv.get('prediction_cache');
      if (cacheData) {
        try {
          const parsed = JSON.parse(cacheData);
          if (parsed && parsed.period === targetPeriodForPrediction && parsed.prediction) {
            // 核心判断：只有真实的 Gemini AI 预测 (isAIPowered === true) 才是合格的 KV 缓存！
            // 如果缓存中包含“高精度数理对冲运算”或非 AI 保底，立刻从 KV 物理抹除，强制重新调用 AI 引擎！
            if (parsed.prediction.isAIPowered === true) {
              prediction = parsed.prediction;
            } else {
              console.warn('[Cloudflare KV] 缓存中发现非 AI 保底数据（高精度数理对冲运算），立即从 KV 抹除并自动重新调用 AI 模型...');
              await kv.delete('prediction_cache');
            }
          }
        } catch (e) {
          console.warn('解析缓存失败，清理:', e);
          await kv.delete('prediction_cache');
        }
      }
    }

    // 5. 如果没有有效 AI 预测（或强制要求 AI 重算），立即调用 Gemini AI 模型推演
    if (!prediction || !prediction.isAIPowered || forceAi) {
      console.log(`[Cloudflare] 触发 Gemini AI 模型推演 (目标期号: ${targetPeriodForPrediction}, forceAi=${forceAi})...`);
      const generatedPrediction = await getAIPrediction(env, rawRecords, analysis.triggers, lastPredictions);
      
      if (generatedPrediction && generatedPrediction.isAIPowered) {
        prediction = generatedPrediction;
        
        // 核心指令：这玩意儿应该存到 KV！只要是真正的 AI 预测，立即存入 KV 缓存和永久 AI 历史库
        if (kv && prediction.predictedNumbers?.length === 6) {
          await kv.put("prediction_cache", JSON.stringify({
            period: targetPeriodForPrediction,
            prediction
          }));
          
          const currentHistoryKv = await kv.get("ai_history");
          const currentAiHistoryMap = currentHistoryKv ? JSON.parse(currentHistoryKv) : {};
          currentAiHistoryMap[targetPeriodForPrediction] = prediction.predictedNumbers;
          await kv.put("ai_history", JSON.stringify(currentAiHistoryMap));
          console.log(`[Cloudflare KV] 第 ${targetPeriodForPrediction} 期 Gemini AI 预测推演成功并已永久存入 KV！`);
        }
      } else {
        // 若本次 AI 调用异常，返回保底推算，但绝对不能存入 KV，等待前端自动重新发起重试
        if (!prediction) {
          prediction = generatedPrediction;
        }
        console.warn(`[Cloudflare] 本次 AI 调用未完成，返回保底推算（绝不存入 KV），等待自动重新调用`);
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
