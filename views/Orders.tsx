
import React, { useEffect, useMemo, useState } from "react";
import { Search, RefreshCcw, AlertTriangle, CheckCircle2, Clock3, Sparkles, ArrowRight, Calendar, Coins } from "lucide-react";
import { fetchOrders, analyzeOrder, Order, AnalysisItem } from "../services/orderService";

type AnalysisState = {
  loading: boolean;
  items: AnalysisItem[];
  error?: string;
};

// --- 工具函数 ---

function safeText(v: any) {
  return v == null ? "" : String(v);
}

function money(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "¥0";
  return `¥${n.toLocaleString()}`;
}

function fmtDate(v: any) {
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return safeText(v);
    return d.toLocaleDateString();
  } catch {
    return safeText(v);
  }
}

function getOrderKey(o: any) {
  return safeText(o?.OrderId ?? o?.orderId ?? "");
}

// 亮色系的状态标签颜色
function getDelayTag(items: AnalysisItem[]) {
  if (!items?.length) return { label: "未分析", cls: "bg-slate-100 text-slate-500 border-slate-200" };

  const hasDelay = items.some((x: any) => Number(x?.DelayHours ?? 0) > 0 || safeText(x?.Status).includes("延误"));
  if (hasDelay) return { label: "延误风险", cls: "bg-red-50 text-red-600 border-red-200" };

  return { label: "正常", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" };
}

// --- 组件：顶部统计卡片 (玻璃态) ---
const StatCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; hint?: string; colorClass?: string }> = ({
  label,
  value,
  icon,
  hint,
  colorClass = "text-blue-600 bg-blue-50 border-blue-100"
}) => (
  <div className="min-w-[200px] p-5 rounded-3xl border border-white/60 bg-white/40 backdrop-blur-xl shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-3">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      <div className={`p-2 rounded-xl border ${colorClass}`}>
        {icon}
      </div>
    </div>
    <div className="text-3xl font-black font-mono tracking-tight text-slate-800">{value}</div>
    {hint ? <div className="mt-2 text-xs text-slate-500 font-medium">{hint}</div> : null}
  </div>
);

// --- 组件：订单行 (圆角卡片 + 悬停果冻效果) ---
const OrderRow: React.FC<{
  order: Order;
  selected: boolean;
  tag: { label: string; cls: string };
  onClick: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
}> = ({ order, selected, tag, onClick, onAnalyze, analyzing }) => {
  const oid = (order as any).OrderId;
  const client = (order as any).ClientName;
  const date = (order as any).OrderDate;
  const amount = (order as any).TotalAmount;

  return (
    <div
      className={`
        group relative rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden
        ${selected 
          ? "bg-white border-blue-300 shadow-[0_8px_30px_rgba(59,130,246,0.15)] scale-[1.02] z-10" 
          : "bg-white/40 border-white/60 hover:bg-white/80 hover:border-blue-200 hover:shadow-lg hover:-translate-y-0.5"
        }
      `}
      onClick={onClick}
    >
      {/* 选中时的左侧蓝条指示器 */}
      {selected && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500"></div>}

      <div className="p-4 pl-5 flex flex-col gap-3">
        {/* 头部：单号 + 状态 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold font-mono text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded-lg border border-slate-200">
              {safeText(oid)}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tag.cls}`}>
              {tag.label}
            </span>
          </div>
          
          {/* 分析按钮 */}
          <button
            className={`
              shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all
              ${analyzing
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 active:scale-95"
              }
            `}
            onClick={(e) => {
              e.stopPropagation();
              onAnalyze();
            }}
            disabled={analyzing}
            title="智能分析"
          >
            {analyzing ? (
              <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>分析</span>
          </button>
        </div>

        {/* 客户名称 */}
        <div className="font-bold text-slate-800 text-base truncate pr-2 group-hover:text-blue-700 transition-colors">
           {safeText(client) || "（未知客户）"}
        </div>

        {/* 底部信息：交期 + 金额 */}
        <div className="flex items-center gap-2 text-xs mt-1">
           <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-500">
              <Calendar className="w-3.5 h-3.5 opacity-60"/>
              <span className="font-mono font-medium">{fmtDate(date)}</span>
           </div>
           <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-500">
              <Coins className="w-3.5 h-3.5 opacity-60"/>
              <span className="font-mono font-medium text-slate-700">{money(amount)}</span>
           </div>
        </div>
      </div>
    </div>
  );
};

// --- 组件：右侧分析详情 (清爽白底) ---
const AnalysisPanel: React.FC<{
  order?: Order;
  state?: AnalysisState;
  onRetry: () => void;
}> = ({ order, state, onRetry }) => {
  const oid = order ? getOrderKey(order) : "";
  const client = order ? safeText((order as any).ClientName) : "";

  return (
    <div className="h-full rounded-[2rem] border border-white/60 bg-white/40 backdrop-blur-2xl shadow-xl overflow-hidden flex flex-col relative">
      {/* 装饰背景圆 */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100/30 rounded-full blur-3xl -z-10 pointer-events-none"></div>

      {/* 头部 */}
      <div className="p-6 border-b border-white/50 bg-white/30 backdrop-blur-sm shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-md shadow-sm shadow-blue-200">
                APS 引擎
              </div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">智能分析报告</div>
            </div>
            
            <div className="mt-2 text-xl font-black text-slate-800 truncate leading-tight">
              {client || "请选择左侧订单"}
            </div>
            {oid && <div className="text-sm font-mono font-bold text-slate-400 mt-1">{oid}</div>}
          </div>

          {order && (
            <button
              onClick={onRetry}
              className="shrink-0 p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:shadow-md transition-all active:scale-95"
              title="重新计算"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto custom-scrollbar p-6">
        {!order ? (
           // 优化：未选择订单时的骨架背景与提示
           <div className="relative h-full">
              {/* 背景骨架 */}
              <div className="space-y-6 opacity-30 pointer-events-none blur-[1px]">
                 {[1,2,3].map(i => (
                     <div key={i} className="pl-6 relative border-l-2 border-slate-200">
                         <div className="h-32 rounded-2xl bg-white border border-slate-100"></div>
                     </div>
                 ))}
              </div>
              {/* 提示信息 */}
              <div className="absolute inset-0 flex items-center justify-center">
                 <div className="bg-white/90 backdrop-blur-xl p-8 rounded-[2rem] shadow-xl text-center border border-white/60 max-w-sm">
                     <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-500">
                         <Sparkles className="w-8 h-8" />
                     </div>
                     <h3 className="text-lg font-black text-slate-800">智能分析就绪</h3>
                     <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                         请在左侧选择一个订单<br/>APS 引擎将自动计算排程与延误风险
                     </p>
                 </div>
              </div>
           </div>
        ) : state?.loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-white/50 border border-white animate-pulse shadow-sm" />
            ))}
          </div>
        ) : state?.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
               <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-red-800">分析服务响应异常</h3>
            <p className="text-sm text-red-600/80 mt-1 mb-4">{state.error}</p>
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold shadow-md hover:bg-red-700 transition-all"
            >
              <RefreshCcw className="w-4 h-4" /> 重新尝试
            </button>
          </div>
        ) : (state?.items?.length ?? 0) === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-8 text-center text-slate-500">
            暂无分析数据（可能是该订单未进入排程池）。
          </div>
        ) : (
          <div className="relative pl-4 space-y-6 before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
            {state!.items.map((item: any, idx: number) => {
              const color = safeText(item?.Color) || "#22c55e"; // 后端传来的颜色
              const status = safeText(item?.Status);
              const delay = Number(item?.DelayHours ?? 0);
              const isDelayed = delay > 0;

              return (
                <div key={idx} className="relative pl-6">
                  {/* 左侧时间轴节点 */}
                  <div 
                    className="absolute left-0 top-6 w-[10px] h-[10px] rounded-full border-2 border-white shadow-sm z-10"
                    style={{ backgroundColor: color }}
                  />
                  
                  {/* 卡片本体 */}
                  <div className="rounded-2xl border border-white/60 bg-white/60 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group">
                    <div className="p-4 flex flex-col gap-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <h4 className="font-bold text-slate-800 text-base">{safeText(item?.ProductName) || "产品"}</h4>
                                <div className="text-xs font-mono text-slate-400 mt-0.5">{safeText(item?.ProcessRoute) || "无工艺路线"}</div>
                            </div>
                            <span 
                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm"
                                style={{ 
                                    color: isDelayed ? '#ef4444' : '#059669',
                                    backgroundColor: isDelayed ? '#fef2f2' : '#ecfdf5',
                                    borderColor: isDelayed ? '#fecaca' : '#a7f3d0'
                                }}
                            >
                                {status} {delay > 0 ? `+${delay}h` : ""}
                            </span>
                        </div>

                        {/* 进度条 */}
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full rounded-full transition-all duration-1000 ease-out opacity-80"
                                style={{ width: isDelayed ? "95%" : "70%", backgroundColor: color }}
                            />
                        </div>

                        {/* 底部详情格 */}
                        <div className="grid grid-cols-2 gap-2 mt-1">
                             <div className="bg-slate-50/80 rounded-lg p-2 border border-slate-100">
                                 <div className="text-[10px] text-slate-400 mb-0.5">最晚开工</div>
                                 <div className="font-mono font-bold text-xs text-slate-700">
                                     {safeText(item?.MustStartBy) || "--"}
                                 </div>
                             </div>
                             <div className="bg-slate-50/80 rounded-lg p-2 border border-slate-100">
                                 <div className="text-[10px] text-slate-400 mb-0.5">备注</div>
                                 <div className="text-xs text-slate-600 truncate" title={safeText(item?.Note)}>
                                     {safeText(item?.Note) || "-"}
                                 </div>
                             </div>
                        </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// --- 主页面 ---
const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState(""); 
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [selectedId, setSelectedId] = useState<string>("");
  const [analysisMap, setAnalysisMap] = useState<Record<string, AnalysisState>>({});

  const selectedOrder = useMemo(() => orders.find((o: any) => getOrderKey(o) === selectedId), [orders, selectedId]);

  const stats = useMemo(() => {
    // FIX: explicitly cast to AnalysisState[] to avoid TS unknown property error
    const values = Object.values(analysisMap) as AnalysisState[];
    const analyzed = values.filter((x) => (x.items?.length ?? 0) > 0);
    const delayed = analyzed.filter((x) => getDelayTag(x.items).label === "延误风险").length;
    
    return {
      total,
      analyzed: analyzed.length,
      delayed,
    };
  }, [analysisMap, total]);

  async function loadOrders() {
    setLoading(true);
    try {
      const data = await fetchOrders(page, query);
      setOrders((data as any)?.list || []);
      setTotal(Number((data as any)?.total || 0));

      const first = ((data as any)?.list || [])[0];
      if (first) {
        const firstId = getOrderKey(first);
        setSelectedId((prev) => (prev && ((data as any)?.list || []).some((x: any) => getOrderKey(x) === prev) ? prev : firstId));
      } else {
        setSelectedId("");
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function ensureAnalyze(id: string) {
    const cur = analysisMap[id];
    if (cur?.loading) return;

    setAnalysisMap((m) => ({ ...m, [id]: { loading: true, items: cur?.items ?? [] } }));
    try {
      const res: any = await analyzeOrder(id);
      const items: AnalysisItem[] = res?.Analysis || res?.analysis || [];
      setAnalysisMap((m) => ({ ...m, [id]: { loading: false, items } }));
    } catch (e: any) {
      setAnalysisMap((m) => ({ ...m, [id]: { loading: false, items: [], error: safeText(e?.message || e) } }));
    }
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query]);

  useEffect(() => {
    if (!selectedId) return;
    const st = analysisMap[selectedId];
    if (!st || ((st.items?.length ?? 0) === 0 && !st.loading && !st.error)) {
      ensureAnalyze(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selectedAnalysis = selectedId ? analysisMap[selectedId] : undefined;

  return (
    <div className="h-full flex flex-col gap-6 p-6 overflow-hidden max-w-[1920px] mx-auto w-full">
      
      {/* 顶部标题区与工具栏 */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 shrink-0">
        <div>
           <div className="flex items-center gap-2 mb-1">
             <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
             <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Order Management</span>
           </div>
           <h1 className="text-3xl font-black text-slate-800 tracking-tight">订单分析工作台</h1>
           <p className="text-slate-500 text-sm mt-1">实时监控订单排程状态，自动分析延误风险。</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setQuery(keyword.trim());
            }}
            className="relative w-full sm:w-[320px]"
          >
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索订单号 / 客户名..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-white/60 bg-white/50 backdrop-blur text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:bg-white/80 transition-all shadow-sm"
            />
          </form>

          <button
            onClick={() => loadOrders()}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-slate-800 text-white font-bold shadow-lg shadow-slate-300/50 hover:bg-slate-700 hover:-translate-y-0.5 transition-all active:translate-y-0"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 统计卡片区 */}
      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar shrink-0">
        <StatCard
          label="订单总数"
          value={stats.total}
          icon={<Clock3 className="w-5 h-5 text-blue-600" />}
          colorClass="bg-blue-50 border-blue-100"
          hint="当前查询条件下的总数"
        />
        <StatCard
          label="已分析"
          value={stats.analyzed}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          colorClass="bg-emerald-50 border-emerald-100"
          hint="含自动分析与手动分析"
        />
        <StatCard
          label="延误预警"
          value={stats.delayed}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          colorClass="bg-red-50 border-red-100"
          hint="系统推算存在延期风险"
        />
      </div>

      {/* 主体双栏布局 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-6">
        
        {/* 左侧：订单池 (独立卡片流) */}
        <div className="flex flex-col h-full rounded-[2rem] border border-white/60 bg-white/30 backdrop-blur-md shadow-sm overflow-hidden">
           <div className="p-5 border-b border-white/50 bg-white/40 backdrop-blur-md flex justify-between items-center z-10">
              <span className="font-bold text-slate-700">订单列表</span>
              <span className="text-xs font-mono text-slate-400 bg-white/50 px-2 py-1 rounded-lg">Page {page}</span>
           </div>

           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
             {loading && orders.length === 0 ? (
               <div className="space-y-4">
                 {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/50 rounded-2xl animate-pulse"></div>)}
               </div>
             ) : orders.length === 0 ? (
               // 优化：空订单列表时的骨架背景 + 提示
               <div className="relative h-full">
                  <div className="absolute inset-0 space-y-3 opacity-30 pointer-events-none">
                     {Array.from({length: 6}).map((_, i) => (
                         <div key={i} className="h-[120px] rounded-2xl border border-slate-200 bg-white"></div>
                     ))}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                       <div className="bg-white/80 backdrop-blur p-6 rounded-3xl shadow-lg text-center border border-white/50">
                            <Search className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <div className="font-bold text-slate-700">暂无订单</div>
                            <div className="text-xs text-slate-500 mt-1">尝试刷新或更换搜索词</div>
                       </div>
                  </div>
               </div>
             ) : (
               orders.map((o: any) => {
                 const id = getOrderKey(o);
                 const st = analysisMap[id];
                 const tag = st?.items ? getDelayTag(st.items) : { label: "未分析", cls: "bg-slate-100 text-slate-400 border-slate-200" };

                 return (
                   <OrderRow
                     key={id}
                     order={o}
                     selected={id === selectedId}
                     tag={tag}
                     analyzing={!!st?.loading}
                     onClick={() => setSelectedId(id)}
                     onAnalyze={() => ensureAnalyze(id)}
                   />
                 );
               })
             )}
           </div>

           {/* 分页栏 */}
           <div className="p-4 border-t border-white/50 bg-white/40 flex justify-between items-center z-10">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
              >
                上一页
              </button>
              <div className="text-xs text-slate-400">共 {total} 条</div>
              <button 
                onClick={() => setPage(p => p + 1)}
                disabled={loading || orders.length === 0}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
              >
                下一页
              </button>
           </div>
        </div>

        {/* 右侧：分析详情 */}
        <AnalysisPanel
          order={selectedOrder}
          state={selectedId ? selectedAnalysis : undefined}
          onRetry={() => selectedId && ensureAnalyze(selectedId)}
        />
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.3); border-radius: 99px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.5); }
      `}</style>
    </div>
  );
};

export default Orders;
