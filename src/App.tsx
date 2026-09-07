import { useState, useEffect, useMemo } from 'react';
import { 
  RefreshCw, 
  Activity, 
  TrendingDown, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Database, 
  Calendar, 
  Compass, 
  Sparkles, 
  AlertCircle,
  FileText,
  Clock,
  BookOpen,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DrawRecord, TriggerEvent, ExclusionPrediction, FrequencyStats, AnalyzeAPIResponse } from './types.js';

// Removed Firebase Integrations for simpler UI

export default function App() {
  const [data, setData] = useState<AnalyzeAPIResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // AI report state
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [generatingAi, setGeneratingAi] = useState<boolean>(false);

  // Fetch all analyzer data from our Express server API
  const fetchAnalysis = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze');
      if (!response.ok) {
        throw new Error(`分析初始化失败: HTTP ${response.status}`);
      }
      const rawData: AnalyzeAPIResponse = await response.json();
      setData(rawData);
      
      // Data successfully set
    } catch (err: any) {
      console.error(err);
      setError(err.message || '获取分析模型失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, []);

  // Force scraping updates from targets
  const forceRefreshScraper = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || '强制更新抓取失败');
      }
      // Re-fetch analyzer models after successful scrape
      await fetchAnalysis(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '强制同步服务器数据失败');
      setRefreshing(false);
    }
  };

  // Generate Gemini AI narrative report
  const requestAiReport = async () => {
    if (!data) return;
    setGeneratingAi(true);
    setAiReport(null);
    try {
      const res = await fetch('/api/ai-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prediction: data.prediction,
          summary: data.summary,
          latestDraw: data.latestDraw,
        }),
      });
      if (!res.ok) {
        throw new Error('AI 生成报告失败');
      }
      const result = await res.json();
      setAiReport(result.content);
    } catch (err: any) {
      console.error(err);
      setAiReport(`### ❌ 报告生成失败\n\n${err.message || '无法联系 Gemini 专家模型。请确保网络畅通，或在 AI Studio "Secrets" 页面中绑定正确的 GEMINI_API_KEY。'}`);
    } finally {
      setGeneratingAi(false);
    }
  };

  // Average prediction individual escaping rate (Accuracy per number)
  const averageIndividualAccuracy = useMemo(() => {
    if (!data || !data.predictions || data.predictions.length === 0) return 0;
    const totalPredictions = data.predictions.length;
    let sumHitRatio = 0;
    data.predictions.forEach(p => {
      // ratio of non-appearing numbers = (6 - hits) / 6
      const hitCount = p.hitNumbers ? p.hitNumbers.length : 0;
      sumHitRatio += (6 - hitCount) / 6;
    });
    return (sumHitRatio / totalPredictions) * 100;
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center max-w-sm text-center">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full mb-6"
          />
          <h2 className="text-xl font-medium tracking-tight text-white mb-2">正在初始化数据模型</h2>
          <p className="text-sm text-slate-400">正在分析大盘开奖轨迹，解压环形边缘矩阵并归置冷态频率指数...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md text-center shadow-xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">加载模型出错</h2>
          <p className="text-slate-400 text-sm mb-6">{error || '未找到历史数据'}</p>
          <button 
            onClick={() => fetchAnalysis()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition cursor-pointer"
          >
            重试重置
          </button>
        </div>
      </div>
    );
  }

  const { latestDraw, summary, prediction, predictions, triggers } = data;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      
      {/* BACKGROUND EFFECTS */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-indigo-950/20 via-slate-950/0 to-slate-950/0 pointer-events-none" />

      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo Title */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-lg font-bold tracking-tight text-white">MacauJC 赛马数字轨迹分析系统</h1>
              <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">Expert V1.2</span>
            </div>
            <p className="text-xs text-slate-400">
              采用隔期跳跃触发机制锁定夹心变动，通过环形邻轨排除策略精炼 6 位不出现号码
            </p>
          </div>

          {/* Sync Stats & Triggers */}
          <div className="flex items-center justify-between md:justify-end gap-3 flex-wrap">
            <div className="flex items-center gap-3 text-[11px] font-mono bg-slate-900 border border-slate-850 px-3 py-1.5 rounded-lg text-slate-400">
              <div className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-blue-400" />
                <span>大盘数: <strong>{data.latestDraw?.period ? (parseInt(data.latestDraw.period.slice(4), 10) + 1) : data.totalCount}</strong> 期</span>
              </div>
              <span className="text-slate-800">|</span>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>更新周期: <strong>每日 21:35 PM</strong></span>
              </div>
            </div>

            <button
              onClick={forceRefreshScraper}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-xs font-medium text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? '正在抓取同步...' : '极速强制同步'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ERROR MESSAGE NOTIFICATION */}
      {error && (
        <div className="bg-rose-950/40 border-b border-rose-900/50 text-rose-300 text-xs py-3 px-4 md:px-8">
          <div className="max-w-7xl mx-auto flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* D盘主布局 */}
      <main className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ======================= LEFT METRICS BLOCK (4 COLS) ======================= */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          
          {/* LATEST DRAW DISPLAY */}
          <div className="bg-slate-900/50 border border-slate-900 p-5 rounded-2xl">
            <h3 className="text-xs font-mono font-medium tracking-wider text-slate-400 uppercase mb-3 flex items-center justify-between">
              <span>最新开奖归档</span>
              <span className="text-indigo-400">第 {latestDraw.period} 期</span>
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              {latestDraw.numbers.map((num, idx) => (
                <div 
                  key={idx} 
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-sm shadow-inner transition ${
                    idx === 6 
                      ? 'bg-rose-950/50 border border-rose-900 text-rose-300' // Special number/Bonus 
                      : 'bg-slate-950 border border-slate-800 text-white'
                  }`}
                >
                  {num.toString().padStart(2, '0')}
                </div>
              ))}
            </div>
            {latestDraw.numbers.length > 6 && (
              <p className="text-[10px] text-slate-500 mt-2 font-mono flex justify-end">
                前 6 位为常规名次，第 7 位为隔期对冲名次
              </p>
            )}
          </div>

          {/* TRAJECTORY ACCURACY METER */}
          <div className="bg-slate-900/50 border border-slate-900 p-5 rounded-2xl flex flex-col gap-4">
            
            <div>
              <h3 className="text-xs font-mono font-medium text-slate-400 mb-1 uppercase tracking-wider">
                轨迹回补回测精度
              </h3>
              <p className="text-[11px] text-slate-500">
                观察目标号 X 在隔期跳跃触发后，于随后 8 期内回补高几率区
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/60 border border-slate-900 p-3 rounded-xl text-center">
                <span className="text-2xl font-bold font-mono tracking-tight text-indigo-400">
                  {(summary.overallHitRate * 100).toFixed(1)}%
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5">闭合总回补率</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-900 p-3 rounded-xl text-center">
                <span className="text-2xl font-bold font-mono tracking-tight text-emerald-400">
                  {(summary.hitRate1To4 * 100).toFixed(1)}%
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5">1-4期高发占比</span>
              </div>
            </div>

            {/* BAR COMPASS */}
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-400">轨迹触发样本数</span>
                <span className="text-slate-300 font-semibold">{summary.totalTriggers} 次</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  1-4期快速追进
                </span>
                <span className="text-slate-300 font-semibold">{summary.totalHit1To4} 次</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-blue-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  5-8期延迟回补
                </span>
                <span className="text-slate-300 font-semibold">{summary.totalHit5To8} 次</span>
              </div>
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-rose-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  未回补出界 (Miss)
                </span>
                <span className="text-slate-300 font-semibold">{summary.totalMisses} 次</span>
              </div>
            </div>

            {/* STAT PROGRESS VISUALIZER */}
            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden flex border border-slate-905">
              <div 
                style={{ width: `${(summary.totalHit1To4 / summary.totalTriggers) * 100}%` }}
                className="bg-emerald-500 h-full"
                title={`1-4期: ${summary.totalHit1To4} 次`}
              />
              <div 
                style={{ width: `${(summary.totalHit5To8 / summary.totalTriggers) * 100}%` }}
                className="bg-blue-500 h-full"
                title={`5-8期: ${summary.totalHit5To8} 次`}
              />
              <div 
                style={{ width: `${(summary.totalMisses / summary.totalTriggers) * 100}%` }}
                className="bg-rose-500/80 h-full"
                title={`未回补: ${summary.totalMisses} 次`}
              />
            </div>
          </div>

          {/* EXCLUSION ENGINE EFFICIENCY */}
          <div className="bg-slate-900/50 border border-slate-900 p-5 rounded-2xl flex flex-col gap-4">
            <div>
              <h3 className="text-xs font-mono font-medium text-slate-400 mb-1 uppercase tracking-wider">
                专家排除算法绩效
              </h3>
              <p className="text-[11px] text-slate-500">
                双重对冲防线下的 6 号排除算法在 49 期历史中的真实准确性
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/60 border border-slate-900 p-3 rounded-xl text-center">
                <span className="text-2xl font-bold font-mono tracking-tight text-indigo-400">
                  {averageIndividualAccuracy.toFixed(1)}%
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5">单号排除成功率</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-900 p-3 rounded-xl text-center">
                <span className="text-2xl font-bold font-mono tracking-tight text-white">
                  {(summary.exclusionSuccessRate * 100).toFixed(1)}%
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5">6码全面成功率</span>
              </div>
            </div>

            <div className="bg-indigo-950/20 border border-indigo-900/30 p-3 rounded-xl flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-400 space-y-1">
                <p><strong>防共振对冲保驾</strong>：每一期预测都将剔除当前活跃在追逐路径上的号码目标；并强制在最近期排除名单过滤，契合严密。每期皆 100% 自动对碰复盘。</p>
              </div>
            </div>
          </div>

        </section>

        {/* ======================= RIGHT CONTENT CANVAS (8 COLS) ======================= */}
        <section className="lg:col-span-8 flex flex-col gap-6">

          {/* PRIMARY PREDICTION CARD */}
          <div className="bg-slate-900/40 border border-indigo-950/50 p-6 rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <span className="text-[10px] font-mono tracking-widest text-indigo-400 font-bold uppercase block mb-1">
                  UPCOMING DRAW PREDICTION
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white tracking-tight">
                    新一期极低概率（排除） 6 个号码
                  </h2>
                  {prediction.isAIPowered ? (
                    <span className="text-[10.5px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      Gemini 3.5 智能预测
                    </span>
                  ) : (
                    <span className="text-[10.5px] bg-slate-950 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-medium">
                      高精度数理对冲运算
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">预测下期目标</span>
                <span className="block text-sm font-mono font-bold text-indigo-400">
                  第 {(parseInt(latestDraw.period, 10) + 1).toString()} 期
                </span>
              </div>
            </div>

            {/* THE 6 EXCLUDED BALLS */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
              {prediction.predictedNumbers.map((num, idx) => (
                <div 
                  key={idx} 
                  className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center shadow-lg group hover:border-slate-700/80 transition"
                >
                  <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center font-mono text-lg font-extrabold text-slate-300 mb-2 shadow-inner group-hover:text-indigo-400 transition">
                    {num.toString().padStart(2, '0')}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">不可能出现</span>
                </div>
              ))}
            </div>

            {/* RULES MET */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs border-t border-slate-850 pt-5">
              <div className="flex gap-2 text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div>
                  <strong className="text-slate-200 block mb-0.5">防重叠排除</strong>
                  <p className="text-[10px] text-slate-500">已自动核对并排除第 {latestDraw.period} 期的名单，确保上一期预测不重复。</p>
                </div>
              </div>
              <div className="flex gap-2 text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <strong className="text-slate-200 block mb-0.5">数理对冲屏蔽</strong>
                  <p className="text-[10px] text-slate-500">检测出 {prediction.activeTargets.length} 个正在追赶变移路径上的活跃重叠号并自动加锁，100%不入排除池。</p>
                </div>
              </div>
              <div className="flex gap-2 text-slate-400">
                <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div>
                  <strong className="text-slate-200 block mb-0.5">冷热平衡偏向</strong>
                  <p className="text-[10px] text-slate-500">对历史冷指标进行扫描，聚焦于当前失衡的极端冷滞号码和被套遗漏波峰号码。</p>
                </div>
              </div>
            </div>
          </div>

          {/* THREE REASONING TABS */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4.5 h-4.5 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">
                {prediction.isAIPowered ? "Gemini AI 高阶数理推理分析" : "高阶算法数理推理报告"} (Reasoning Log)
              </h3>
            </div>

            <div className="bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden divide-y divide-slate-900">
              <div className="p-5">
                <h4 className="text-xs font-mono font-bold text-slate-200 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                  触发特征与号码锁定
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                  {prediction.reasoning.triggerLocking}
                </p>
              </div>

              <div className="p-5">
                <h4 className="text-xs font-mono font-bold text-slate-200 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                  边缘算法与路径推演
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                  {prediction.reasoning.edgeDeduction}
                </p>
              </div>

              <div className="p-5">
                <h4 className="text-xs font-mono font-bold text-slate-200 mb-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                  遗漏分析与排除结论
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                  {prediction.reasoning.omissionConclusion}
                </p>
              </div>
            </div>
          </div>

          {/* RECENT 10 DRAWS HISTORY (KV BACKTESTING FEEDBACK) */}
          <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-3xl relative overflow-hidden mt-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>最近 10 期历史回测记录 (KV Storage)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  用于检视模型排除命中率，自动反馈至下一期策略
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* PENDING PREDICTION (Next Draw) */}
              <div key="pending" className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500/50" />
                <div className="flex-shrink-0 w-28">
                  <span className="text-xs font-mono font-bold text-slate-300 block mb-1">
                    第 {(parseInt(latestDraw.period, 10) + 1).toString()} 期
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                    <Clock className="w-3 h-3" />
                    待回测
                  </span>
                </div>
                
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">系统排除名单:</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {prediction.predictedNumbers.map((num, idx) => (
                          <span 
                            key={idx} 
                            className="w-6 h-6 flex items-center justify-center rounded text-[11px] font-mono font-bold border bg-slate-900 border-slate-800 text-slate-400 shadow-sm"
                          >
                            {num.toString().padStart(2, '0')}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">实际开奖结果:</span>
                      <div className="flex gap-1 flex-wrap opacity-60">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-800 border-dashed flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                          等待公布...
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {data.predictions.slice(-10).reverse().map((pred) => {
                const isSuccess = pred.isSuccessful;
                const hitCount = pred.hitNumbers ? pred.hitNumbers.length : 0;
                
                return (
                  <div key={pred.period} className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-shrink-0 w-28">
                      <span className="text-xs font-mono font-bold text-slate-300 block mb-1">
                        第 {pred.period} 期
                      </span>
                      {isSuccess ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="w-3 h-3" />
                          完全排除
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded">
                          <XCircle className="w-3 h-3" />
                          误杀 {hitCount} 码
                        </span>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                        <div>
                          <span className="text-[10px] text-slate-500 block mb-1">系统排除名单:</span>
                          <div className="flex gap-1.5 flex-wrap">
                            {pred.predictedNumbers.map((num, idx) => {
                              const isHit = pred.hitNumbers?.includes(num);
                              return (
                                <span 
                                  key={idx} 
                                  className={`w-6 h-6 flex items-center justify-center rounded text-[11px] font-mono font-bold border ${
                                    isHit 
                                      ? 'bg-rose-950/80 border-rose-900 text-rose-400' 
                                      : 'bg-slate-900 border-slate-800 text-slate-400'
                                  }`}
                                >
                                  {num.toString().padStart(2, '0')}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                        
                        {pred.actualNumbers && (
                          <div>
                            <span className="text-[10px] text-slate-500 block mb-1">实际开奖结果:</span>
                            <div className="flex gap-1 flex-wrap opacity-60">
                              {pred.actualNumbers.map((num, idx) => (
                                <span key={idx} className="text-[10px] font-mono text-slate-300 bg-slate-900 px-1 rounded">
                                  {num.toString().padStart(2, '0')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 mt-16 text-center text-xs text-slate-500 font-mono px-4">
        <div className="max-w-7xl mx-auto space-y-2">
          <p>
            MacauJC 赛马轨迹分析客户端. 所有深度推导逻辑由 Gemini 3.5 人工智能大模型强力驱动，回测轨迹归档于 KV 边缘网络。
          </p>
          <p className="text-[10px] text-slate-650">
            © 2026 混沌数理概率研究组。本系统仅用作学术算法之研究及概率模型回测，不包含任何商业性推广行为。
          </p>
        </div>
      </footer>

    </div>
  );
}
