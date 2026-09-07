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

    const analysis = analyzeData(rawRecords);
    const lastPredictions = analysis.predictions.length > 0 ? analysis.predictions[analysis.predictions.length - 1].predictedNumbers : [];
    const currentPeriod = rawRecords[0]?.period || '';
    
    // Check prediction cache in KV
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
      await env.MACAUJC_KV.put('prediction_cache', JSON.stringify({ period: currentPeriod, prediction }));
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
