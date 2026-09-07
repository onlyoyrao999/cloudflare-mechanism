const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const startIndex = code.indexOf('          {/* INNER NAVIGATION TABS */}');
const endIndex = code.indexOf('        </section>\n\n      </main>');

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `          {/* PRIMARY PREDICTION CARD */}
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
                                  className={\`w-6 h-6 flex items-center justify-center rounded text-[11px] font-mono font-bold border \${
                                    isHit 
                                      ? 'bg-rose-950/80 border-rose-900 text-rose-400' 
                                      : 'bg-slate-900 border-slate-800 text-slate-400'
                                  }\`}
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
`;

  code = code.substring(0, startIndex) + replacement + '\n' + code.substring(endIndex);
  fs.writeFileSync('src/App.tsx', code);
  console.log('App.tsx updated successfully.');
} else {
  console.log('Could not find start or end tokens.');
}
