import { scrapeLatest } from './_shared.js';

export async function onRequestPost(context: any) {
  const { env } = context;

  const result = await scrapeLatest(env);
  
  if (result.success) {
    // Invalidate prediction cache
    await env.MACAUJC_KV.delete('prediction_cache');
    return new Response(JSON.stringify({ status: 'success', message: result.message }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    return new Response(JSON.stringify({ status: 'error', message: result.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
