import { analyzeData } from '../../src/data/analyzer.js';
import { scrapeLatest, getAIPrediction } from './_shared.js';

export async function onRequestGet(context: any) {
  const { env } = context;

  try {
    // Passively refresh cache in KV if needed
    const lastCheckTimeStr = await env.MACAUJC_KV.get('last_check');
    const lastCheckTime = lastCheckTimeStr ? parseInt(lastCheckTimeStr, 10) : 0;
    
    if (Date.now() - lastCheckTime > 5 * 60 * 1000) {
      await env.MACAUJC_KV.put('last_check', Date.now().toString());
      await scrapeLatest(env);
    }

    const kvData = await env.MACAUJC_KV.get('history');
    const rawRecords = kvData ? JSON.parse(kvData) : [];
    
    if (rawRecords.length === 0) {
      return new Response(JSON.stringify({ status: 'error', message: 'No records available.' }), { status: 500 });
    }

    // --- NEW: Fetch permanent AI history from KV ---
    const historyKvData = await env.MACAUJC_KV.get('ai_history');
    const aiHistoryMap = historyKvData ? JSON.parse(historyKvData) : {};

    // Pass the fetched history map to analyzeData so it doesn't recalculate history
    const analysis = analyzeData(rawRecords, aiHistoryMap);
    
    const lastPredictions = analysis.predictions.length > 0 ? analysis.predictions[analysis.predictions.length - 1].predictedNumbers : [];
    const currentPeriod = rawRecords[0]?.period || '';
    
    // Check prediction cache in KV for the current waiting period
    let prediction = null;
    const cacheData = await env.MACAUJC_KV.get('prediction_cache');
    if (cacheData) {
      const parsed = JSON.parse(cacheData);
      if (parsed.period === currentPeriod) {
        prediction = parsed.prediction;
      }
    }

    if (!prediction) {
      prediction = await getAIPrediction(env, rawRecords, analysis.triggers, lastPredictions);
      
      // Save temporary cache
      await env.MACAUJC_KV.put('prediction_cache', JSON.stringify({ period: currentPeriod, prediction }));
      
      // --- NEW: Lock and save the generated prediction to permanent history! ---
      const nextP = (parseInt(currentPeriod, 10) + 1).toString();
      if (nextP && prediction.predictedNumbers) {
        aiHistoryMap[nextP] = prediction.predictedNumbers;
        await env.MACAUJC_KV.put('ai_history', JSON.stringify(aiHistoryMap));
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
