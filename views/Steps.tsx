
import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  addDays,
  addMinutes, 
  differenceInMinutes, 
  format, 
  isValid,
  eachDayOfInterval,
  isSameDay,
  differenceInCalendarDays,
  addMonths
} from "date-fns";
import {
  Layers,
  Calendar as CalendarIcon,
  Search,
  PlayCircle,
  ChevronDown,
  Filter,
  Package,
  Tag,
  ChevronRight,
  Hash,
  Clock,
  ArrowRight,
  Timer,
  Factory,
  ChevronLeft,
  ZoomIn,
  ZoomOut
} from "lucide-react";

// dnd-kit imports
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

import { fetchApsMonths, runApsSchedule, ApsMonthItem, ApsScheduleWarning } from "../services/apsScheduleService";

// ==========================================
// 1. 核心配置 & 样式常量
// ==========================================

const BASE_CONFIG = {
  hourColWidth: 60,       // 基准列宽
  rowHeight: 160,         // 基准行高 (详细模式)
  compactRowHeight: 56,   // 紧凑行高 (缩放模式)
  leftColWidth: 320,      // 左侧列表稍微收窄一点，留更多空间给甘特图
  headerHeight: 84,       
  viewDays: 7             
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const TIME_SLOTS = Array.from({ length: 12 }, (_, i) => i * 2); 

// ==========================================
// 2. 类型定义
// ==========================================

interface UiSegment {
  id: string;
  uniqueKey: string;
  name: string;      
  code: string;
  machine: string;
  start: Date;
  end: Date;
  durationMins: number;
  color: { 
    bgGradient: string;  
    shadow: string;      
    border: string;
    text: string;
  };
}

interface UiTask {
  id: string; // explicitly string for dnd-kit keys
  billNo: string;
  detailId: number;
  productId: string;   
  productName: string; 
  productSpec: string; 
  unit: string;
  processRoute: string[]; 
  qty: number;
  dueTime: Date;
  status: "NORMAL" | "DELAY" | "WARNING";
  segments: UiSegment[];
  start: Date;
  end: Date;
  totalMins: number;
  warnings: ApsScheduleWarning[];
}

interface GroupedSegment {
  name: string;
  totalMins: number;
  start: Date;
  end: Date;
  items: UiSegment[];
  isExpanded: boolean;
}

// ==========================================
// 3. 辅助工具
// ==========================================

function startOfDay(d: Date | number): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date | number): Date {
  const date = new Date(d);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function safeDate(d: any): Date {
  if (d instanceof Date && isValid(d)) return d;
  if (!d) return new Date();
  const parsed = new Date(d);
  return isValid(parsed) ? parsed : new Date();
}

function safeFormat(d: any, fmt: string = "HH:mm") {
  try {
    return format(safeDate(d), fmt);
  } catch {
    return "--";
  }
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}分`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}小时${mins}分` : `${hrs}小时`;
}

function getPropSmart(obj: any, keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
      const pascal = key.charAt(0).toUpperCase() + key.slice(1);
      if (obj[pascal] !== undefined && obj[pascal] !== null && obj[pascal] !== "") return obj[pascal];
  }
  return null;
}

function safeDiffMins(end: any, start: any) {
  return differenceInMinutes(safeDate(end), safeDate(start));
}

const getColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const palettes = [
    { bgGradient: "bg-gradient-to-r from-blue-500 to-cyan-400", shadow: "shadow-[0_4px_14px_rgba(6,182,212,0.4)]", border: "border-cyan-200/50", text: "text-white" },
    { bgGradient: "bg-gradient-to-r from-violet-500 to-fuchsia-400", shadow: "shadow-[0_4px_14px_rgba(192,38,211,0.4)]", border: "border-fuchsia-200/50", text: "text-white" },
    { bgGradient: "bg-gradient-to-r from-orange-500 to-amber-400", shadow: "shadow-[0_4px_14px_rgba(245,158,11,0.4)]", border: "border-amber-200/50", text: "text-white" },
    { bgGradient: "bg-gradient-to-r from-emerald-500 to-teal-400", shadow: "shadow-[0_4px_14px_rgba(20,184,166,0.4)]", border: "border-teal-200/50", text: "text-white" },
    { bgGradient: "bg-gradient-to-r from-pink-500 to-rose-400", shadow: "shadow-[0_4px_14px_rgba(244,63,94,0.4)]", border: "border-rose-200/50", text: "text-white" }
  ];
  return palettes[Math.abs(hash) % palettes.length];
};

// ==========================================
// 4. DragActiveCard (拖拽时的“飞行”卡片)
// ==========================================
const DragActiveCard: React.FC<{ task: UiTask; isCompact: boolean; rowHeight: number }> = ({ task, isCompact, rowHeight }) => {
  const isDelay = task.status === 'DELAY';

  return (
    <div
      className={`
        w-full rounded-xl overflow-hidden flex flex-col border
        bg-white border-blue-400 shadow-2xl ring-2 ring-blue-500/30 scale-105
        relative transition-all duration-300
      `}
      style={{ height: rowHeight }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[5px] z-20 ${
          isDelay ? 'bg-rose-500' : (task.status === 'WARNING' ? 'bg-amber-400' : 'bg-emerald-400')
      }`} />

      {/* 紧凑模式下不显示 # 抓手，节省空间 */}
      {!isCompact && (
        <div
           className="absolute top-10 right-6 w-20 h-20 border-4 border-dashed rounded-full flex items-center justify-center z-30
             cursor-grabbing border-blue-400 bg-blue-50/50 opacity-100"
        >
            <span className="text-4xl font-black select-none text-blue-600">#</span>
        </div>
      )}

      {isCompact ? (
         // --- 紧凑模式布局 (只显示单号+产品) ---
         <div className="relative z-10 px-4 flex items-center h-full gap-3">
             <div className="flex flex-col min-w-0 flex-1 justify-center">
                 <div className="text-sm font-black font-mono text-slate-800 truncate leading-none mb-1">
                   {task.billNo}
                 </div>
                 <div className="flex items-center gap-1.5 overflow-hidden">
                    <Tag size={10} className="text-blue-500 shrink-0"/>
                    <span className="text-[10px] font-bold text-slate-500 truncate">{task.productId}</span>
                 </div>
             </div>
             <div className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black border leading-none ${isDelay ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-emerald-100 text-emerald-600 border-emerald-200'}`}>
                {isDelay ? '延' : '正'}
             </div>
         </div>
      ) : (
         // --- 完整模式布局 ---
         <>
          <div className="relative z-10 px-5 pt-4 pb-2 flex justify-between items-start pointer-events-none">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Hash size={12} className="text-slate-400"/>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">生产单号</span>
                </div>
                <div className="text-xl font-black font-mono text-slate-800 tracking-tight leading-none truncate w-[220px]">
                  {task.billNo}
                </div>
              </div>
              <div className={`px-2 py-1 rounded-lg text-[10px] font-black border leading-none shadow-sm ${isDelay ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-emerald-100 text-emerald-600 border-emerald-200'}`}>
                  {isDelay ? '延误' : '正常'}
              </div>
          </div>

          <div className="relative z-10 px-5 flex-1 flex flex-col gap-2 min-h-0 pointer-events-none">
              <div className="flex items-center gap-2 overflow-hidden">
                  <div className="p-1 bg-slate-100 text-blue-600 rounded">
                    <Tag size={12}/>
                  </div>
                  <span className="text-sm font-bold font-mono text-blue-700 truncate">{task.productId || "N/A"}</span>
              </div>
              <div className="bg-slate-50/80 rounded-xl p-2 border border-slate-100 backdrop-blur-sm mt-1">
                  <div className="font-mono text-sm font-black text-slate-700">
                    {task.qty} <span className="text-[10px] font-medium text-slate-400">{task.unit}</span>
                  </div>
              </div>
          </div>
         </>
      )}
    </div>
  );
};

// ==========================================
// 5. Sortable Task Item
// ==========================================

interface SortableTaskItemProps {
  task: UiTask;
  index: number;
  isSelected: boolean;
  isDraggable: boolean;
  isCompact: boolean;
  rowHeight: number;
  onClick: () => void;
}

const SortableTaskItem = React.memo(({ task, index, isSelected, isDraggable, isCompact, rowHeight, onClick }: SortableTaskItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: rowHeight,
    zIndex: isDragging ? 0 : (isSelected ? 20 : 1),
    position: 'relative' as const,
  };

  const isDelay = task.status === 'DELAY';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        w-full rounded-xl overflow-hidden flex flex-col transition-all duration-300 border group
        ${isDragging 
            ? 'opacity-30 grayscale border-dashed border-slate-300 bg-slate-50' 
            : isSelected 
                ? 'bg-blue-50 border-blue-400 shadow-xl' 
                : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200'
        }
      `}
      onClick={onClick}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[5px] z-20 ${
          isDelay ? 'bg-rose-500' : (task.status === 'WARNING' ? 'bg-amber-400' : 'bg-emerald-400')
      }`} />

      {/* Drag Handle - 仅在非紧凑模式显示大号抓手 */}
      {!isCompact && (
        <div 
           className={`
             absolute top-10 right-4 w-16 h-16 border-4 border-dashed rounded-full flex items-center justify-center 
             z-30 transition-all duration-300
             ${isDraggable 
                 ? 'cursor-grab active:cursor-grabbing border-slate-300 hover:border-blue-400 hover:bg-blue-50/50 hover:scale-110 opacity-40 hover:opacity-100' 
                 : 'pointer-events-none border-slate-300/60 opacity-15 rotate-12'
             }
           `}
           {...attributes} 
           {...listeners}
           title={isDraggable ? "拖拽此处调整优先级" : "筛选模式下不可排序"}
        >
            <span className={`text-3xl font-black select-none ${isDraggable ? 'text-slate-500 group-hover:text-blue-600' : 'text-slate-400'}`}>
                {(index + 1).toString().padStart(2, '0')}
            </span>
        </div>
      )}

      {/* 隐形抓手：在紧凑模式下，整个卡片右侧边缘可以作为抓手，或者简单点，整个卡片需要按住特定区域 */}
      {isCompact && isDraggable && (
         <div className="absolute right-0 top-0 bottom-0 w-8 z-30 cursor-grab active:cursor-grabbing hover:bg-slate-50 flex items-center justify-center border-l border-dashed border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity" {...attributes} {...listeners}>
            <span className="text-[10px] font-bold text-slate-300">#{(index + 1)}</span>
         </div>
      )}

      {isCompact ? (
         // === 紧凑模式内容 ===
         <div className="relative z-10 px-4 flex items-center h-full gap-3 pointer-events-none">
             <div className="flex flex-col min-w-0 flex-1 justify-center">
                 <div className="flex items-baseline gap-2">
                    <span className="text-sm font-black font-mono text-slate-800 truncate leading-none" title={task.billNo}>
                       {task.billNo}
                    </span>
                 </div>
                 <div className="flex items-center gap-1.5 overflow-hidden mt-1 opacity-70">
                    <Tag size={10} className="text-blue-500 shrink-0"/>
                    <span className="text-[10px] font-bold text-slate-600 truncate" title={task.productId}>{task.productId}</span>
                 </div>
             </div>
             <div className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black border leading-none ${isDelay ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-emerald-100 text-emerald-600 border-emerald-200'}`}>
                {isDelay ? '延' : '正'}
             </div>
         </div>
      ) : (
         // === 完整模式内容 ===
         <>
          <div className="relative z-10 px-5 pt-4 pb-2 flex justify-between items-start pointer-events-none">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Hash size={12} className="text-slate-400"/>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">生产单号</span>
                </div>
                <div className="text-lg font-black font-mono text-slate-800 tracking-tight leading-none truncate w-[220px]" title={task.billNo}>
                  {task.billNo}
                </div>
              </div>
              <div className={`px-2 py-1 rounded-lg text-[10px] font-black border leading-none shadow-sm ${isDelay ? 'bg-rose-100 text-rose-600 border-rose-200' : 'bg-emerald-100 text-emerald-600 border-emerald-200'}`}>
                  {isDelay ? '延误' : '正常'}
              </div>
          </div>

          <div className="relative z-10 px-5 flex-1 flex flex-col gap-3 min-h-0 pointer-events-none">
              <div className="flex items-center gap-2 overflow-hidden">
                  <div className="p-1 bg-slate-100 text-blue-600 rounded">
                    <Tag size={12}/>
                  </div>
                  <span className="text-sm font-bold font-mono text-blue-700 truncate">{task.productId || "N/A"}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-1">
                <div className="bg-slate-50/80 rounded-xl p-2 border border-slate-100 backdrop-blur-sm">
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase mb-0.5">
                      <Package size={10}/> 数量
                    </div>
                    <div className="font-mono text-sm font-black text-slate-700">
                      {task.qty} <span className="text-[10px] font-medium text-slate-400">{task.unit}</span>
                    </div>
                </div>

                <div className={`rounded-xl p-2 border backdrop-blur-sm ${isDelay ? 'bg-rose-50/50 border-rose-100' : 'bg-slate-50/80 border-slate-100'}`}>
                    <div className={`flex items-center gap-1 text-[10px] font-bold uppercase mb-0.5 ${isDelay ? 'text-rose-400' : 'text-slate-400'}`}>
                      <Clock size={10}/> 交货日期
                    </div>
                    <div className={`font-mono text-sm font-black ${isDelay ? 'text-rose-600' : 'text-slate-700'}`}>
                      {safeFormat(task.dueTime, "yyyy-MM-dd")}
                    </div>
                </div>
              </div>
          </div>
         </>
      )}
    </div>
  );
});

// ==========================================
// 6. 任务详情抽屉
// ==========================================
// (此处保持不变)
const TaskDetailDrawer: React.FC<{ task: UiTask | null; onClose: () => void }> = ({ task, onClose }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    setIsVisible(!!task);
    if (task) setExpandedIndices(new Set()); 
  }, [task]);

  const toggleGroup = (index: number) => {
    const newSet = new Set(expandedIndices);
    if (newSet.has(index)) newSet.delete(index);
    else newSet.add(index);
    setExpandedIndices(newSet);
  };

  const groupedSegments = useMemo(() => {
    if (!task) return [];
    const groups: GroupedSegment[] = [];
    let currentGroup: GroupedSegment | null = null;

    task.segments.forEach((seg) => {
      if (currentGroup && currentGroup.name === seg.name) {
        currentGroup.items.push(seg);
        currentGroup.end = seg.end; 
        currentGroup.totalMins += seg.durationMins;
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          name: seg.name,
          start: seg.start,
          end: seg.end,
          totalMins: seg.durationMins,
          items: [seg],
          isExpanded: false
        };
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [task]);

  return createPortal(
    <>
      <div 
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9998] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div 
        className={`
          fixed top-0 right-0 bottom-0 w-[600px] max-w-[95vw] 
          bg-white shadow-2xl z-[9999] border-l border-slate-100
          transform transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1) flex flex-col
          ${isVisible ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {task && (
          <div className="flex flex-col h-full bg-slate-50">
             <div className="p-8 pb-8 bg-white border-b border-slate-200 shadow-[0_4px_20px_-12px_rgba(0,0,0,0.1)] relative z-20">
                <div className="flex items-center justify-between mb-6">
                   <div className="flex items-center gap-3">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wide border shadow-sm ${task.status === 'DELAY' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                         {task.status === 'DELAY' ? '已延误' : '正常进行'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                         ID: {task.detailId}
                      </span>
                   </div>
                   <button 
                     onClick={onClose} 
                     className="p-3 -mr-3 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all active:scale-95"
                   >
                      <ChevronRight size={28} />
                   </button>
                </div>
                
                <div className="mb-8">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                     <Hash size={12}/> 生产单号
                  </div>
                  <h2 className="text-[2rem] font-black text-slate-800 font-mono tracking-tight leading-none break-all select-text">
                     {task.billNo}
                  </h2>
                </div>
                
                <div className="grid grid-cols-2 gap-5">
                   <div className="p-5 bg-blue-50/60 rounded-[1.25rem] border border-blue-100/80 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-blue-500 text-white rounded-lg shadow-sm shadow-blue-300">
                           <Tag size={16}/>
                        </div>
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">产品编码</span>
                      </div>
                      <div className="text-lg font-black text-slate-700 font-mono truncate" title={task.productId}>
                         {task.productId}
                      </div>
                   </div>
                   <div className="p-5 bg-purple-50/60 rounded-[1.25rem] border border-purple-100/80 flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-2">
                         <div className="p-1.5 bg-purple-500 text-white rounded-lg shadow-sm shadow-purple-300">
                           <Package size={16}/>
                         </div>
                         <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">计划数量</span>
                      </div>
                      <div className="text-lg font-black text-slate-700 font-mono">
                         {task.qty} <span className="text-sm text-purple-400 font-bold ml-0.5">{task.unit}</span>
                      </div>
                   </div>
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative bg-slate-50">
                <div className="space-y-10 relative z-10 pb-10">
                   {groupedSegments.map((group, groupIndex) => {
                      const isExpanded = expandedIndices.has(groupIndex);
                      const isMulti = group.items.length > 1;

                      return (
                        <div key={groupIndex} className="relative pl-12 group">
                           <div className="absolute left-[48px] top-7 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-[5px] border-blue-500 shadow-lg z-20 group-hover:scale-110 transition-transform"></div>
                           <div className="bg-white border border-slate-200/80 rounded-[1.5rem] p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-5px_rgba(0,0,0,0.08)] transition-all duration-300">
                              <div 
                                className={`flex flex-col gap-4 ${isMulti ? 'cursor-pointer select-none' : ''}`}
                                onClick={() => isMulti && toggleGroup(groupIndex)}
                              >
                                 <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 flex items-center justify-center bg-slate-800 text-white rounded-xl shadow-lg shadow-slate-200 text-sm font-black font-mono">
                                           {String(groupIndex + 1).padStart(2, '0')}
                                        </div>
                                        <div>
                                            <h3 className="font-black text-xl text-slate-800 tracking-tight">{group.name}</h3>
                                            {isMulti && (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                                        <Layers size={10} /> {group.items.length} 个阶段
                                                    </span>
                                                    <span className={`text-[10px] font-bold text-slate-400 flex items-center gap-0.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                                        <ChevronDown size={12} /> {isExpanded ? '收起详情' : '展开详情'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200">
                                        <Timer size={14} className="text-slate-400"/>
                                        <span className="text-sm font-black text-slate-700 font-mono">{formatDuration(group.totalMins)}</span>
                                    </div>
                                 </div>
                                 {isMulti && (
                                     <div className="relative mt-2 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between group-hover:bg-blue-50/30 transition-colors">
                                         <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-slate-200 -z-10 border-t border-dashed border-slate-300"></div>
                                         <div className="flex flex-col items-center bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm z-10">
                                            <span className="text-[10px] font-bold text-emerald-500 uppercase mb-0.5">开始</span>
                                            <span className="font-mono text-sm font-black text-slate-800">{safeFormat(group.start, "MM-dd HH:mm")}</span>
                                         </div>
                                         <div className="flex flex-col items-center bg-white px-3 py-1 rounded-lg border border-slate-100 shadow-sm z-10">
                                            <span className="text-[10px] font-bold text-rose-500 uppercase mb-0.5">结束</span>
                                            <span className="font-mono text-sm font-black text-slate-800">{safeFormat(group.end, "MM-dd HH:mm")}</span>
                                         </div>
                                     </div>
                                 )}
                              </div>
                              <div className={`
                                  ${isMulti ? 'mt-6 pl-4 border-l-2 border-dashed border-slate-200 space-y-6' : 'mt-4'}
                                  ${isMulti && !isExpanded ? 'hidden' : 'block'}
                              `}>
                                 {group.items.map((seg, i) => (
                                    <div key={i} className="relative">
                                       {isMulti && (
                                          <div className="absolute -left-[21px] top-3 w-3 h-3 bg-slate-200 rounded-full border-2 border-white"></div>
                                       )}
                                       <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                                           <div className="flex items-center gap-2 mb-4">
                                               <div className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500 shadow-sm">
                                                   <Factory size={16} />
                                               </div>
                                               <span className="text-base font-bold text-slate-700">
                                                   {seg.machine.replace('#', '')} 号机台
                                               </span>
                                               {isMulti && (
                                                   <span className="ml-auto text-[10px] font-bold bg-slate-200 text-slate-500 px-2 py-0.5 rounded">
                                                       阶段 {i + 1}
                                                   </span>
                                               )}
                                           </div>
                                           <div className="grid grid-cols-2 gap-4">
                                               <div className="bg-white p-3 rounded-xl border border-emerald-100/50 shadow-sm flex flex-col">
                                                   <span className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                                                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> 开始
                                                   </span>
                                                   <span className="font-mono text-lg font-black text-slate-800 tracking-tight">
                                                       {safeFormat(seg.start, "MM-dd HH:mm")}
                                                   </span>
                                               </div>
                                               <div className="bg-white p-3 rounded-xl border border-rose-100/50 shadow-sm flex flex-col items-end text-right">
                                                   <span className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1 flex-row-reverse">
                                                       <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> 结束
                                                   </span>
                                                   <span className="font-mono text-lg font-black text-slate-800 tracking-tight">
                                                       {safeFormat(seg.end, "MM-dd HH:mm")}
                                                   </span>
                                               </div>
                                           </div>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                      );
                   })}
                </div>
             </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

// ==========================================
// 7. 主页面
// ==========================================

export default function ApsSchedulingPage() {
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState<ApsMonthItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(""); 
  const [isMonthSelectorOpen, setIsMonthSelectorOpen] = useState(false);
  
  // 缩放状态 (0.4 ~ 1.0)
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => {
     const isCompact = zoom < 0.6; // 缩放到 0.6 以下进入紧凑模式
     return {
        isCompact,
        hourWidth: BASE_CONFIG.hourColWidth * zoom, // 列宽等比缩放
        dayWidth: BASE_CONFIG.hourColWidth * 24 * zoom,
        rowHeight: isCompact ? BASE_CONFIG.compactRowHeight : BASE_CONFIG.rowHeight, // 行高阶梯变化
        leftColWidth: BASE_CONFIG.leftColWidth // 左侧宽度固定
     }
  }, [zoom]);

  // 拖拽状态
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = useMemo(() => tasks.find((t) => t.id === activeId), [activeId, tasks]);

  // 视图起始时间
  const [viewStart, setViewStart] = useState<Date>(startOfMonth(new Date()));
  
  const [keyword, setKeyword] = useState("");
  const [onlyDelayed, setOnlyDelayed] = useState(false); 
  const [selectedTask, setSelectedTask] = useState<UiTask | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Avoid accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 视图范围：仅 7 天
  const days = useMemo(() => {
    if (!isValid(viewStart)) return [];
    const end = addDays(viewStart, BASE_CONFIG.viewDays);
    return eachDayOfInterval({ start: viewStart, end: addDays(end, -1) });
  }, [viewStart]);

  const ganttTotalWidth = days.length * layout.dayWidth;

  useEffect(() => {
    fetchApsMonths().then(res => {
      setMonths(res);
      if (res.length > 0) {
          const firstMc = res[0].mc;
          handleSelectMonth(firstMc);
      }
    }).catch(console.error);

    const closeDropdown = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
            setIsMonthSelectorOpen(false);
        }
    };
    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, []);

  const handleSelectMonth = (mc: string) => {
    setSelectedMonth(mc);
    setIsMonthSelectorOpen(false);
    const match = mc.match(/(\d{4})年(\d{1,2})月/);
    if (match) {
        const y = parseInt(match[1]);
        const m = parseInt(match[2]) - 1; 
        const d = new Date(y, m, 1);
        setViewStart(d);
    }
  };

  const loadSchedule = async (orderedIds?: number[]) => {
    if (!selectedMonth) return;
    setLoading(true);
    try {
      const res = await runApsSchedule({ 
        fromMc: selectedMonth,
        detailOrder: orderedIds 
      });
      const map = new Map<number, UiSegment[]>();
      const warns = new Map<number, ApsScheduleWarning[]>();
      
      (res.warnings || []).forEach(w => {
         const did = Number(getPropSmart(w, ['detailId', 'DetailId', 'did']));
         if (!warns.has(did)) warns.set(did, []);
         warns.get(did)?.push(w);
      });

      let earliestStart = Infinity; 

      (res.segments || []).forEach(s => {
         const did = Number(getPropSmart(s, ['detailId', 'DetailId', 'did']));
         if (!map.has(did)) map.set(did, []);
         const start = safeDate(getPropSmart(s, ['startTime', 'Start', 'start']));
         const endRaw = getPropSmart(s, ['endTime', 'End', 'end']);
         const mins = Number(getPropSmart(s, ['minutes', 'Minutes', 'mins']) || 0);
         const end = endRaw ? safeDate(endRaw) : addMinutes(start, mins);
         const name = getPropSmart(s, ['processName', 'ProcessName', 'name']) || "工序";

         if (start.getTime() < earliestStart) {
             earliestStart = start.getTime();
         }

         map.get(did)?.push({
           id: `${did}_${Math.random()}`,
           uniqueKey: `${did}_${Math.random()}`,
           name,
           code: getPropSmart(s, ['processNo', 'ProcessNo', 'code']) || "",
           machine: `${getPropSmart(s, ['machineIndex', 'MachineIndex', 'machine']) || '?'}#`,
           start,
           end,
           durationMins: safeDiffMins(end, start),
           color: getColor(name)
         });
      });

      let taskIds: number[] = [];
      if (orderedIds && orderedIds.length > 0) {
         taskIds = orderedIds;
      } else {
         taskIds = Array.from(map.keys());
      }
      
      const allMapKeys = Array.from(map.keys());
      const missingKeys = allMapKeys.filter(k => !taskIds.includes(k));
      taskIds = [...taskIds, ...missingKeys];

      const newTasks: UiTask[] = [];

      taskIds.forEach(did => {
         const segs = map.get(did);
         if (!segs || segs.length === 0) return;

         segs.sort((a, b) => a.start.getTime() - b.start.getTime());

         const myWarns = warns.get(did) || [];
         let status: UiTask["status"] = "NORMAL";
         if (myWarns.some(w => w.level === "ERROR")) status = "DELAY";
         else if (myWarns.some(w => w.level === "WARN")) status = "WARNING";

         const detailInfo = res.details?.find(d => Number(getPropSmart(d, ['detailId', 'DetailId', 'did'])) === did);
         newTasks.push({
           id: String(did),
           billNo: getPropSmart(detailInfo, ['billNo', 'BillNo']) || "无单号",
           detailId: did,
           productId: getPropSmart(detailInfo, ['productId', 'ProductId']) || "N/A", 
           productName: getPropSmart(detailInfo, ['productName', 'ProductName', 'ProductDescrip']) || "未命名产品",
           productSpec: getPropSmart(detailInfo, ['spec', 'Spec', 'model']) || "",
           unit: getPropSmart(detailInfo, ['unit', 'Unit']) || "PCS",
           processRoute: Array.from(new Set(segs.map(s => s.name))),
           qty: Number(getPropSmart(detailInfo, ['planQty', 'PlanQty']) || 0),
           dueTime: safeDate(getPropSmart(detailInfo, ['dueTime', 'DueTime'])),
           status,
           segments: segs,
           start: segs[0].start,
           end: segs[segs.length - 1].end,
           totalMins: safeDiffMins(segs[segs.length - 1].end, segs[0].start),
           warnings: myWarns
         });
      });
      
      setTasks(newTasks);

      if (earliestStart !== Infinity && !orderedIds) {
         const d = new Date(earliestStart);
         if (selectedMonth) {
             const match = selectedMonth.match(/(\d{4})年(\d{1,2})月/);
             if (match) {
                 const mY = parseInt(match[1]);
                 const mM = parseInt(match[2]) - 1;
                 if (d.getFullYear() === mY && (d.getMonth() === mM || d.getMonth() === mM + 1)) {
                     setViewStart(startOfDay(d));
                 }
             }
         }
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        const newDetailIds = newOrder.map(t => t.detailId);
        setLoading(true);
        setTimeout(() => { loadSchedule(newDetailIds); }, 50);
        return newOrder;
      });
    }
    setActiveId(null);
  };

  const filteredTasks = useMemo(() => {
    let res = tasks;
    if (keyword) {
      const lower = keyword.toLowerCase();
      res = res.filter(t => t.billNo.toLowerCase().includes(lower) || t.productName.toLowerCase().includes(lower));
    }
    if (onlyDelayed) res = res.filter(t => t.status !== 'NORMAL');
    return res;
  }, [tasks, keyword, onlyDelayed]);

  const isDragEnabled = !keyword && !onlyDelayed;

  // New Linear Position Calculation
  const getPosPx = (date: Date) => {
    const diffDays = differenceInCalendarDays(date, viewStart);
    if (diffDays < 0 || diffDays >= days.length) return -9999;

    const hours = date.getHours();
    const mins = date.getMinutes();
    const totalHours = hours + (mins / 60);

    const dayStartPx = diffDays * layout.dayWidth;
    const hourPx = totalHours * layout.hourWidth;

    return dayStartPx + hourPx;
  };

  const handlePrevRange = () => {
    const d = addDays(viewStart, -7);
    setViewStart(d);
  };

  const handleNextRange = () => {
    const d = addDays(viewStart, 7);
    setViewStart(d);
  };

  return (
    <div className="h-full flex flex-col font-sans text-slate-700 overflow-hidden relative bg-white/50">
      
      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />

      {/* --- 顶部工具栏 --- */}
      <div className="relative flex items-center justify-between px-6 py-4 shrink-0 z-50 h-[76px] border-b border-white/40">
         <div className="absolute inset-x-0 top-0 bottom-0 bg-white/40 backdrop-blur-xl -z-10"></div>
         <div className="flex items-center gap-4">
            <div className="relative" ref={dropdownRef}>
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm transition-shadow hover:shadow-md hover:border-blue-200">
                    <button onClick={handlePrevRange} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" title="上一周">
                        <ChevronLeft size={16}/>
                    </button>
                    
                    <div 
                        onClick={() => setIsMonthSelectorOpen(!isMonthSelectorOpen)}
                        className="px-4 py-1.5 flex flex-col items-center cursor-pointer hover:bg-slate-50 rounded-lg group select-none transition-colors min-w-[140px]"
                    >
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 group-hover:text-blue-500 transition-colors">
                            {selectedMonth || '当前周期'}
                        </div>
                        <div className="flex items-center gap-2 text-sm font-black font-mono text-slate-700 group-hover:text-blue-700 transition-colors">
                            <span>{format(viewStart, 'MM/dd')} - {format(addDays(viewStart, 6), 'MM/dd')}</span>
                            <ChevronDown size={12} className={`opacity-40 group-hover:opacity-100 transition-all ${isMonthSelectorOpen ? 'rotate-180' : ''}`}/>
                        </div>
                    </div>

                    <button onClick={handleNextRange} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" title="下一周">
                        <ChevronRight size={16}/>
                    </button>
                </div>
                {/* Month Selector Dropdown (Existing logic) */}
                {isMonthSelectorOpen && (
                 <div className="absolute top-full left-0 mt-3 w-64 bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl shadow-slate-200/50 p-2 z-50 animate-in fade-in zoom-in-95 origin-top-left ring-1 ring-slate-100">
                    <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1">APS 周期选择</div>
                    <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                       {months.length > 0 ? months.map(m => (
                          <div key={m.mc} onClick={() => handleSelectMonth(m.mc)} className={`px-3 py-2.5 rounded-xl text-xs cursor-pointer flex justify-between items-center transition-all mb-1 ${selectedMonth === m.mc ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                             <div className="flex items-center gap-2">
                                <CalendarIcon size={14} className={selectedMonth === m.mc ? 'text-blue-500' : 'text-slate-400'}/>
                                <span className="font-bold">{m.mc}</span>
                             </div>
                          </div>
                       )) : <div className="p-4 text-center text-xs text-slate-400">暂无数据</div>}
                    </div>
                 </div>
               )}
            </div>
            
            {/* 缩放控制器 */}
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm gap-1">
               <button 
                  onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} 
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" 
                  title="缩小视图 (宏观)"
                  disabled={zoom <= 0.4}
                >
                  <ZoomOut size={16}/>
               </button>
               <div className="w-10 text-center text-xs font-mono font-bold text-slate-600 select-none">
                  {Math.round(zoom * 100)}%
               </div>
               <button 
                  onClick={() => setZoom(z => Math.min(1.0, z + 0.2))} 
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" 
                  title="放大视图 (详细)"
                  disabled={zoom >= 1.0}
               >
                  <ZoomIn size={16}/>
               </button>
            </div>

            <div className="h-6 w-px bg-slate-200 mx-2"></div>
            <div className="relative group">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
               <input value={keyword} onChange={e => setKeyword(e.target.value)} className="pl-10 pr-4 py-2 w-56 bg-white border border-slate-200 rounded-xl text-sm font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all outline-none shadow-sm" placeholder="搜索单号..." />
            </div>
         </div>
         <button onClick={() => loadSchedule()} disabled={loading} className="flex items-center gap-2 px-6 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 shadow-lg shadow-slate-400/30 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all">
            <PlayCircle size={16} className={loading ? "animate-spin" : ""} /> 
            <span className="text-sm font-bold">开始排程</span>
         </button>
      </div>

      {/* --- 主滚动区域 --- */}
      <div className="flex-1 flex overflow-hidden relative">
         <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
         >
            {/* 1. 左侧列表 */}
            <div className="shrink-0 h-full flex flex-col bg-white/60 border-r border-slate-200 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300" style={{ width: layout.leftColWidth }}>
                <div className="h-[84px] shrink-0 border-b border-white/50 flex items-center px-6 bg-white/50 backdrop-blur-md">
                   <div className="flex items-center gap-2 text-slate-700 font-black tracking-tight text-lg">
                      <Layers className="text-blue-600" size={20}/> 排程任务
                      <span className="ml-2 bg-blue-100 text-blue-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shadow-sm">{filteredTasks.length}</span>
                      {loading && <span className="text-xs text-blue-500 animate-pulse ml-2">排程计算中...</span>}
                   </div>
                </div>
                <div id="left-panel-scroll" className="flex-1 overflow-hidden" onWheel={(e) => { const right = document.getElementById('right-panel-scroll'); if (right) right.scrollTop += e.deltaY; }}>
                   <div className="py-3 space-y-2 px-3">
                     <SortableContext items={filteredTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                       {filteredTasks.map((task, index) => (
                          <SortableTaskItem 
                             key={task.id} 
                             task={task} 
                             index={index} 
                             isSelected={selectedTask?.id === task.id} 
                             isDraggable={isDragEnabled} 
                             isCompact={layout.isCompact}
                             rowHeight={layout.rowHeight}
                             onClick={() => setSelectedTask(task)} 
                          />
                       ))}
                     </SortableContext>
                     <div className="h-20"></div>
                   </div>
                </div>
            </div>
         </DndContext>

         {/* 2. 右侧 7 天 x 24 小时 甘特图 */}
         <div id="right-panel-scroll" className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/30" onScroll={(e) => { const leftPanel = document.getElementById('left-panel-scroll'); if(leftPanel) leftPanel.scrollTop = e.currentTarget.scrollTop; }}>
            <div style={{ width: ganttTotalWidth, minHeight: '100%' }} className="relative transition-all duration-300">
               
               {/* A. Sticky Header (2 Rows) */}
               <div className="sticky top-0 z-40 flex bg-white/90 backdrop-blur-md shadow-sm h-[84px] border-b border-slate-200">
                   {days.map((day, i) => {
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isToday = isSameDay(day, new Date());
                      return (
                        <div key={i} className="shrink-0 flex flex-col border-r border-slate-300/80 transition-all duration-300" style={{ width: layout.dayWidth }}>
                           {/* Row 1: Date */}
                           <div className={`h-10 flex items-center justify-center gap-2 border-b border-slate-100 ${isToday ? 'bg-blue-50/50 text-blue-700' : (isWeekend ? 'bg-slate-100/40 text-slate-600' : 'text-slate-700')}`}>
                              <span className="text-xs font-bold uppercase tracking-wider opacity-70">{WEEKDAYS[day.getDay()]}</span>
                              <span className="text-base font-black font-mono tracking-tight">{format(day, "MM-dd")}</span>
                              {isToday && layout.dayWidth > 100 && <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded">TODAY</span>}
                           </div>
                           {/* Row 2: Hours (2-hour slots) */}
                           <div className="flex h-[44px]">
                              {TIME_SLOTS.map(h => (
                                 <div 
                                   key={h} 
                                   className="flex-1 border-r border-slate-200 flex items-center justify-center text-[11px] font-mono font-bold text-slate-400 last:border-0 hover:bg-slate-50 transition-colors cursor-crosshair bg-slate-50/30 overflow-hidden" 
                                   title={`${h}:00 - ${h+2}:00`}
                                 >
                                     {layout.hourWidth > 20 ? `${h.toString().padStart(2, '0')}` : ''}
                                 </div>
                              ))}
                           </div>
                        </div>
                      );
                   })}
               </div>

               {/* B. Grid & Tasks */}
               <div className="relative py-3 space-y-2 px-0">
                  {/* Background Grid Lines */}
                  <div className="absolute inset-0 flex pointer-events-none z-0 pt-[12px]"> 
                     {days.map((d, i) => (
                        <div key={i} className="h-full flex border-r-2 border-slate-300 transition-all duration-300" style={{ width: layout.dayWidth }}>
                           {TIME_SLOTS.map(h => (
                               <div 
                                 key={h} 
                                 className="h-full flex-1 border-r border-dashed border-slate-300/60 first:border-l-0 last:border-r-0 hover:bg-slate-50/10"
                               ></div>
                           ))}
                        </div>
                     ))}
                  </div>

                  {/* Tasks Rows */}
                  {filteredTasks.map((task) => {
                     const taskStartPx = getPosPx(task.start);
                     const taskEndPx = getPosPx(task.end);
                     const isValid = taskStartPx > -5000 && taskEndPx > -5000;
                     const width = isValid ? Math.max(0, taskEndPx - taskStartPx) : 0;

                     return (
                        <div key={task.id} className="relative w-full transition-all duration-300" style={{ height: layout.rowHeight }}>
                           {/* Connection Line */}
                           {width > 0 && !layout.isCompact && (
                              <div className="absolute top-1/2 left-0 h-4 w-full pointer-events-none -translate-y-1/2">
                                  <div className="absolute h-[4px] bg-slate-200/50 rounded-full" style={{ left: taskStartPx, width: width }} />
                              </div>
                           )}

                           {/* Segments */}
                           {task.segments.map(seg => {
                                 const startPx = getPosPx(seg.start);
                                 const endPx = getPosPx(seg.end);
                                 if (startPx < -5000 || endPx < -5000) return null;
                                 
                                 const segWidth = Math.max(2, endPx - startPx);

                                 return (
                                    <div 
                                       key={seg.uniqueKey}
                                       className={`absolute top-1/2 -translate-y-1/2 z-10 transition-all duration-300 hover:z-20 hover:scale-105 group/bar ${layout.isCompact ? 'h-[24px]' : 'h-[64px]'}`}
                                       style={{ left: startPx, width: segWidth }}
                                    >
                                       <div 
                                          className={`w-full h-full ${layout.isCompact ? 'rounded' : 'rounded-lg'} cursor-pointer pointer-events-auto ${seg.color.bgGradient} ${seg.color.shadow} ${seg.color.border} border flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-sm`}
                                          onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                                       >
                                          {!layout.isCompact && <div className="absolute inset-x-0 top-0 h-[40%] bg-white/20 rounded-t-lg pointer-events-none"></div>}
                                          {segWidth > 30 && (
                                             <div className="relative z-10 px-1 text-center w-full overflow-hidden flex flex-col items-center justify-center h-full">
                                                {!layout.isCompact && <div className={`text-[10px] font-black drop-shadow-sm truncate w-full px-0.5 ${seg.color.text}`}>{seg.name}</div>}
                                                {/* 紧凑模式下如果宽度够，显示极简信息，否则不显示 */}
                                             </div>
                                          )}
                                       </div>
                                       {/* Tooltip */}
                                       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-slate-800/90 backdrop-blur text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-opacity z-50">
                                          {seg.name} ({formatDuration(seg.durationMins)})
                                          <div className="font-mono text-[9px] opacity-75 mt-0.5 text-center">{safeFormat(seg.start)} - {safeFormat(seg.end)}</div>
                                          <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800/90 rotate-45"></div>
                                       </div>
                                    </div>
                                 );
                              })}
                        </div>
                     );
                  })}
                  <div className="h-20"></div>
               </div>
            </div>
         </div>
      </div>

      {createPortal(
        <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.3' } } }) }} className="z-[9999] cursor-grabbing pointer-events-none">
          {activeTask ? <DragActiveCard task={activeTask} isCompact={layout.isCompact} rowHeight={layout.rowHeight} /> : null}
        </DragOverlay>,
        document.body
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(241, 245, 249, 0.5); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border: 3px solid transparent; background-clip: content-box; border-radius: 99px; transition: background 0.2s; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        .custom-scrollbar::-webkit-scrollbar-corner { background: transparent; }
      `}</style>
    </div>
  );
}
