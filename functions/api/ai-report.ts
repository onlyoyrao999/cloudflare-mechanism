import { GoogleGenAI } from '@google/genai';

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const { prediction, summary, latestDraw } = await request.json();

    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({
        content: `### 🤖 AI辅助分析报告 (Gemini API 离线状态)
本系统正处于运行状态，由于服务器端未检测到 \`GEMINI_API_KEY\` 密钥，系统已自动转入【高精度数理逻辑引擎】本地运行。
*(提示：请在 Cloudflare Pages 的 Settings -> Variables 中配置 GEMINI_API_KEY)*`
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const numShow = (prediction?.predictedNumbers || []).map((n: number) => n.toString().padStart(2, '0')).join(', ');
    const activeShow = (prediction?.activeTargets || []).map((t: any) => `号码 ${t.number} 在第 ${t.basePos} 位触发`).join('、');

    const prompt = `你是一个澳门赛马数据分析专家、高等概率论与彩票混沌学学者。
当前期数数据:
- 最新开奖期: ${latestDraw?.period || '最新'}
- 系统使用排除法推导出的下一期不可能出现的6个号码: [${numShow}]
请根据这些数据，写一封深度的澳门赛马彩票分析。内容必须覆盖以下三个方面，展示学术深度：
一、触发特征与号码锁定
二、边缘算法与路径推演
三、遗漏分析与排除结论
字数要求在800字左右，必须使用 Markdown 格式输出。`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    return new Response(JSON.stringify({ content: response.text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
