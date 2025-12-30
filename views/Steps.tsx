
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
  ChevronLeft
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

const VIEW_CONFIG = {
  dayColWidth: 240,      // 列宽
  leftColWidth: 400,     // 左侧固定列宽度
  headerHeight: 76,      // 顶部日期栏高度
  rowHeight: 180,        // 行高
  workStartHour: 8,      // 08:00
  workEndHour: 20,       // 20:00
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
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
// 这是一个纯展示组件，用于 DragOverlay 中，不需要 Sortable 的逻辑
const DragActiveCard: React.FC<{ task: UiTask }> = ({ task }) => {
  const isDelay = task.status === 'DELAY';

  return (
    <div
      className={`
        w-full rounded-2xl overflow-hidden flex flex-col border
        bg-white border-blue-400 shadow-2xl ring-2 ring-blue-500/30 scale-105
        relative h-[180px]
      `}
    >
      {/* 侧边状态条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-[5px] z-20 ${
          isDelay ? 'bg-rose-500' : (task.status === 'WARNING' ? 'bg-amber-400' : 'bg-emerald-400')
      }`} />

      {/* 拖拽时的抓手视觉 (放大) */}
      <div
         className="absolute top-12 right-6 w-24 h-24 border-4 border-dashed rounded-full flex items-center justify-center z-30
           cursor-grabbing border-blue-400 bg-blue-50/50 opacity-100"
      >
          <span className="text-5xl font-black select-none text-blue-600">
             #
          </span>
      </div>

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
      
      <div className="relative z-10 mt-auto h-[48px] bg-slate-50/80 border-t border-slate-100 overflow-hidden flex items-center pointer-events-none">
          <div className="w-full overflow-x-auto no-scrollbar flex items-center px-4 gap-2">
            {task.processRoute.map((step, idx) => (
                <React.Fragment key={idx}>
                    <div className={`
                        shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap shadow-sm
                        ${idx === 0 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-white text-slate-600 border-slate-200'}
                    `}>
                        {step}
                    </div>
                    {idx < task.processRoute.length - 1 && (
                        <ArrowRight size={10} className="text-slate-300 shrink-0" />
                    )}
                </React.Fragment>
            ))}
          </div>
      </div>
    </div>
  );
};

// ==========================================
// 5. Sortable Task Item (列表中的卡片)
// ==========================================

interface SortableTaskItemProps {
  task: UiTask;
  index: number;
  isSelected: boolean;
  isDraggable: boolean;
  onClick: () => void;
}

const SortableTaskItem = React.memo(({ task, index, isSelected, isDraggable, onClick }: SortableTaskItemProps) => {
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
    height: VIEW_CONFIG.rowHeight,
    zIndex: isDragging ? 0 : (isSelected ? 20 : 1), // Dragging item (ghost) has low z-index
    position: 'relative' as const,
  };

  const isDelay = task.status === 'DELAY';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        w-full rounded-2xl overflow-hidden flex flex-col transition-all duration-200 border group
        ${isDragging 
            ? 'opacity-30 grayscale border-dashed border-slate-300 bg-slate-50' // Ghost style
            : isSelected 
                ? 'bg-blue-50 border-blue-400 shadow-xl' 
                : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200'
        }
      `}
      onClick={onClick}
    >
      {/* Side Status Bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-[5px] z-20 ${
          isDelay ? 'bg-rose-500' : (task.status === 'WARNING' ? 'bg-amber-400' : 'bg-emerald-400')
      }`} />

      {/* Drag Handle */}
      <div 
         className={`
           absolute top-12 right-6 w-24 h-24 border-4 border-dashed rounded-full flex items-center justify-center 
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
          <span className={`text-5xl font-black select-none ${isDraggable ? 'text-slate-500 group-hover:text-blue-600' : 'text-slate-400'}`}>
              {(index + 1).toString().padStart(2, '0')}
          </span>
      </div>

      <div className="relative z-10 px-5 pt-4 pb-2 flex justify-between items-start pointer-events-none">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Hash size={12} className="text-slate-400"/>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">生产单号</span>
            </div>
            <div className="text-xl font-black font-mono text-slate-800 tracking-tight leading-none truncate w-[220px]" title={task.billNo}>
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
      
      <div className="relative z-10 mt-auto h-[48px] bg-slate-50/80 border-t border-slate-100 overflow-hidden flex items-center pointer-events-none">
          <div className="w-full overflow-x-auto no-scrollbar flex items-center px-4 gap-2">
            {task.processRoute.map((step, idx) => (
                <React.Fragment key={idx}>
                    <div className={`
                        shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap shadow-sm
                        ${idx === 0 
                            ? 'bg-blue-600 text-white border-blue-600' 
                            : 'bg-white text-slate-600 border-slate-200'}
                    `}>
                        {step}
                    </div>
                    {idx < task.processRoute.length - 1 && (
                        <ArrowRight size={10} className="text-slate-300 shrink-0" />
                    )}
                </React.Fragment>
            ))}
          </div>
      </div>
    </div>
  );
});

// ==========================================
// 6. 任务详情抽屉
// ==========================================
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
                   <div className="relative pl-12 pt-2 opacity-60">
                      <div className="absolute left-[48px] top-3 -translate-x-1/2 w-3 h-3 rounded-full bg-slate-300 z-20"></div>
                      <div className="text-sm font-bold text-slate-400 italic pl-1">流程结束</div>
                   </div>
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
  
  // 视图范围：45天
  const viewEnd = useMemo(() => {
     return addDays(viewStart, 45);
  }, [viewStart]);
  
  const days = useMemo(() => {
    if (!isValid(viewStart) || !isValid(viewEnd) || viewEnd < viewStart) return [];
    return eachDayOfInterval({ start: viewStart, end: viewEnd });
  }, [viewStart, viewEnd]);

  const ganttTotalWidth = days.length * VIEW_CONFIG.dayColWidth;

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
    setLoading(true); // Ensure loading state is set
    try {
      const res = await runApsSchedule({ 
        fromMc: selectedMonth,
        detailOrder: orderedIds // 传入排序后的 ID
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
      
      // 补充 map 中有但 orderedIds 中没有的 (防止数据丢失)
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
           id: String(did), // dnd-kit uses string IDs
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
         // Only reset view on initial load, not on reorder
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

  useEffect(() => { loadSchedule(); }, [selectedMonth]);

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
        
        // 触发后端排程更新
        const newDetailIds = newOrder.map(t => t.detailId);
        
        // 💡 立即设置 Loading 状态，让用户感知到排程正在重算
        setLoading(true);
        // 使用 setTimeout 稍微延后一点点请求，避免 UI 动画卡顿，
        // 但确保 loadSchedule 真正被调用并传递了 ID
        setTimeout(() => {
            loadSchedule(newDetailIds);
        }, 50);

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

  // Can only drag if we are viewing the full list (no filters active)
  const isDragEnabled = !keyword && !onlyDelayed;

  const getSegmentStyle = (segStart: Date, segEnd: Date) => {
    const startH = segStart.getHours() + segStart.getMinutes() / 60;
    const endH = segEnd.getHours() + segEnd.getMinutes() / 60;
    
    // 工作时间标准化 (0-1)
    const totalH = VIEW_CONFIG.workEndHour - VIEW_CONFIG.workStartHour;
    
    // 裁剪视图
    const visibleStartH = Math.max(VIEW_CONFIG.workStartHour, Math.min(VIEW_CONFIG.workEndHour, startH));
    const visibleEndH = Math.max(VIEW_CONFIG.workStartHour, Math.min(VIEW_CONFIG.workEndHour, endH));
    
    if (visibleEndH <= visibleStartH) return null; 

    const leftPercent = (visibleStartH - VIEW_CONFIG.workStartHour) / totalH;
    const widthPercent = (visibleEndH - visibleStartH) / totalH;
    
    return { 
        leftPercent: leftPercent * 100, 
        widthPercent: widthPercent * 100 
    };
  };

  const getPosPx = (date: Date) => {
    const dayInd = differenceInCalendarDays(date, viewStart);
    if (dayInd < 0 || dayInd >= days.length) return -9999;

    const h = date.getHours() + date.getMinutes() / 60;
    const totalH = VIEW_CONFIG.workEndHour - VIEW_CONFIG.workStartHour;
    let p = (h - VIEW_CONFIG.workStartHour) / totalH;
    p = Math.max(0, Math.min(1, p));
    
    return (dayInd + p) * VIEW_CONFIG.dayColWidth;
  };

  const handlePrevMonth = () => {
    const d = addMonths(viewStart, -1);
    setViewStart(startOfMonth(d));
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    setSelectedMonth(`${y}年${m}月`);
  };

  const handleNextMonth = () => {
    const d = addMonths(viewStart, 1);
    setViewStart(startOfMonth(d));
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    setSelectedMonth(`${y}年${m}月`);
  };

  return (
    <div className="h-full flex flex-col font-sans text-slate-700 overflow-hidden relative bg-white/50">
      
      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />

      {/* --- 顶部工具栏 --- */}
      <div className="relative flex items-center justify-between px-6 py-4 shrink-0 z-50 h-[76px] border-b border-white/40">
         <div className="absolute inset-x-0 top-0 bottom-0 bg-white/40 backdrop-blur-xl -z-10"></div>

         <div className="flex items-center gap-4">
            
            {/* 合并后的日期选择器 */}
            <div className="relative" ref={dropdownRef}>
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm transition-shadow hover:shadow-md hover:border-blue-200">
                    <button onClick={handlePrevMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" title="上个月">
                        <ChevronLeft size={16}/>
                    </button>
                    
                    {/* 中间区域：显示当前月份，点击展开下拉 */}
                    <div 
                        onClick={() => setIsMonthSelectorOpen(!isMonthSelectorOpen)}
                        className="px-4 py-1.5 flex flex-col items-center cursor-pointer hover:bg-slate-50 rounded-lg group select-none transition-colors min-w-[120px]"
                    >
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 group-hover:text-blue-500 transition-colors">
                            当前排程周期
                        </div>
                        <div className="flex items-center gap-2 text-sm font-black font-mono text-slate-700 group-hover:text-blue-700 transition-colors">
                            <span>{selectedMonth || format(viewStart, 'yyyy年MM月')}</span>
                            <ChevronDown size={12} className={`opacity-40 group-hover:opacity-100 transition-all ${isMonthSelectorOpen ? 'rotate-180' : ''}`}/>
                        </div>
                    </div>

                    <button onClick={handleNextMonth} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors" title="下个月">
                        <ChevronRight size={16}/>
                    </button>
                </div>

                {/* 下拉面板 */}
                {isMonthSelectorOpen && (
                 <div className="absolute top-full left-0 mt-3 w-64 bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl shadow-slate-200/50 p-2 z-50 animate-in fade-in zoom-in-95 origin-top-left ring-1 ring-slate-100">
                    <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1">
                        可用 APS 排程周期
                    </div>
                    <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                       {months.length > 0 ? months.map(m => (
                          <div 
                            key={m.mc} 
                            onClick={() => handleSelectMonth(m.mc)} 
                            className={`
                                px-3 py-2.5 rounded-xl text-xs cursor-pointer flex justify-between items-center transition-all mb-1
                                ${selectedMonth === m.mc 
                                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' 
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}
                            `}
                          >
                             <div className="flex items-center gap-2">
                                <CalendarIcon size={14} className={selectedMonth === m.mc ? 'text-blue-500' : 'text-slate-400'}/>
                                <span className="font-bold">{m.mc}</span>
                             </div>
                             <span className={`text-[10px] px-2 py-0.5 rounded-md border ${selectedMonth === m.mc ? 'bg-white text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                {m.orderCount || 0}单
                             </span>
                          </div>
                       )) : (
                           <div className="p-4 text-center text-xs text-slate-400">暂无排程数据</div>
                       )}
                    </div>
                 </div>
               )}
            </div>

            <div className="h-6 w-px bg-slate-200 mx-2"></div>

            <div className="relative group">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
               <input value={keyword} onChange={e => setKeyword(e.target.value)} className="pl-10 pr-4 py-2 w-64 bg-white border border-slate-200 rounded-xl text-sm font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all outline-none shadow-sm" placeholder="搜索单号..." />
            </div>

            <button onClick={() => setOnlyDelayed(!onlyDelayed)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-bold transition-all shadow-sm ${onlyDelayed ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
               <Filter size={14} /> <span>只看延误</span>
            </button>
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
            {/* 1. 左侧固定列表 (Task List) */}
            <div 
                className="shrink-0 h-full flex flex-col bg-white/60 border-r border-slate-200 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)]" 
                style={{ width: VIEW_CONFIG.leftColWidth }}
            >
                {/* Header */}
                <div className="h-[76px] shrink-0 border-b border-white/50 flex items-center px-6 bg-white/50 backdrop-blur-md">
                   <div className="flex items-center gap-2 text-slate-700 font-black tracking-tight text-lg">
                      <Layers className="text-blue-600" size={20}/>
                      排程任务
                      <span className="ml-2 bg-blue-100 text-blue-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full shadow-sm">{filteredTasks.length}</span>
                      {loading && <span className="text-xs text-blue-500 animate-pulse ml-2">正在排程...</span>}
                   </div>
                </div>
                
                {/* List Body [Modified for Sync & Hidden Scroll] */}
                <div 
                   id="left-panel-scroll"
                   className="flex-1 overflow-hidden" 
                   onWheel={(e) => {
                       const right = document.getElementById('right-panel-scroll');
                       if (right) right.scrollTop += e.deltaY;
                   }}
                >
                   <div className="py-3 space-y-4 px-4">
                     <SortableContext 
                        items={filteredTasks.map(t => t.id)}
                        strategy={verticalListSortingStrategy}
                     >
                       {filteredTasks.map((task, index) => (
                          <SortableTaskItem 
                             key={task.id}
                             task={task}
                             index={index}
                             isSelected={selectedTask?.id === task.id}
                             isDraggable={isDragEnabled}
                             onClick={() => setSelectedTask(task)}
                          />
                       ))}
                     </SortableContext>
                     <div className="h-20"></div>
                   </div>
                </div>
            </div>
         </DndContext>

         {/* 2. 右侧甘特图 (Gantt Chart) - 可横向滚动 */}
         <div 
            id="right-panel-scroll"
            className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/30"
            onScroll={(e) => {
               const leftPanel = document.getElementById('left-panel-scroll');
               if(leftPanel) leftPanel.scrollTop = e.currentTarget.scrollTop;
            }}
         >
            <div style={{ width: Math.max(1000, ganttTotalWidth), minHeight: '100%' }} className="relative">
               
               {/* A. 顶部日期头 (Sticky) */}
               <div className="sticky top-0 z-40 flex border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm h-[76px]">
                   {days.map((day, i) => {
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isToday = isSameDay(day, new Date());
                      return (
                        <div 
                          key={i} 
                          className={`
                            shrink-0 flex flex-col justify-center items-center relative border-r border-slate-200
                            ${isWeekend ? 'bg-slate-100/60' : 'bg-white/40'}
                          `}
                          style={{ width: VIEW_CONFIG.dayColWidth, height: '100%' }}
                        >
                           <div className={`text-[10px] font-bold uppercase mb-1 ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                             {WEEKDAYS[day.getDay()]}
                           </div>
                           <div className={`text-xl font-black font-mono leading-none tracking-tight ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>
                             {format(day, "MM-dd")}
                           </div>
                           {isToday && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500"></div>}
                        </div>
                      );
                   })}
               </div>

               {/* B. 甘特条区域 */}
               <div className="relative py-3 space-y-4 px-0">
                  {/* 背景网格列 - 加深分割线 & 周末深色背景 */}
                  <div className="absolute inset-0 flex pointer-events-none z-0 pt-[10px]"> 
                     {days.map((d, i) => {
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div 
                             key={i} 
                             className={`h-full border-r border-slate-300/60 ${isWeekend ? 'bg-slate-100/50' : ''}`} 
                             style={{ width: VIEW_CONFIG.dayColWidth }} 
                          />
                        )
                     })}
                  </div>

                  {filteredTasks.map((task) => {
                     const taskStartPx = getPosPx(task.start);
                     const taskEndPx = getPosPx(task.end);
                     
                     const validStart = taskStartPx > -5000;
                     const validEnd = taskEndPx > -5000;
                     const connectionWidth = (validStart && validEnd) ? (taskEndPx - taskStartPx) : 0;

                     return (
                        <div 
                           key={task.id} 
                           className="relative w-full"
                           style={{ height: VIEW_CONFIG.rowHeight }}
                        >
                           {/* 连接线 */}
                           <div className="absolute top-1/2 left-0 h-4 w-full pointer-events-none" style={{ transform: 'translateY(-50%)' }}>
                               {connectionWidth > 0 && (
                                  <div 
                                    className="absolute h-full z-0 flex items-center" 
                                    style={{ left: taskStartPx, width: connectionWidth }}
                                  >
                                     <div className="absolute inset-x-0 h-[4px] bg-slate-200/60 rounded-full"></div>
                                  </div>
                               )}
                           </div>

                           {/* 工序段 Segments [视觉回归：鲜艳流光] */}
                           {task.segments.map(seg => {
                                 const dayIndex = differenceInCalendarDays(seg.start, viewStart);
                                 if (dayIndex < 0 || dayIndex >= days.length) return null;

                                 const style = getSegmentStyle(seg.start, seg.end);
                                 if (!style) return null;

                                 const baseLeft = dayIndex * VIEW_CONFIG.dayColWidth;
                                 const pixelOffset = (VIEW_CONFIG.dayColWidth * style.leftPercent) / 100;
                                 const pixelWidth = Math.max(4, (VIEW_CONFIG.dayColWidth * style.widthPercent) / 100);

                                 return (
                                    <div 
                                       key={seg.uniqueKey}
                                       className="absolute top-1/2 -translate-y-1/2 h-[64px] z-10 transition-all duration-300 hover:z-20 hover:scale-105 group/bar"
                                       style={{
                                          left: baseLeft + pixelOffset,
                                          width: pixelWidth,
                                       }}
                                    >
                                       <div 
                                          className={`
                                            w-full h-full rounded-2xl cursor-pointer pointer-events-auto
                                            ${seg.color.bgGradient} ${seg.color.shadow} ${seg.color.border}
                                            border flex flex-col items-center justify-center
                                            relative overflow-hidden backdrop-blur-sm
                                          `}
                                          onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                                       >
                                          {/* 顶部高光 (Shiny Top) */}
                                          <div className="absolute inset-x-0 top-0 h-[40%] bg-white/20 rounded-t-2xl pointer-events-none"></div>
                                          
                                          {pixelWidth > 30 && (
                                             <div className="relative z-10 px-1 text-center w-full overflow-hidden flex flex-col items-center justify-center h-full">
                                                <div className={`text-[11px] font-black drop-shadow-sm truncate w-full px-1 ${seg.color.text}`}>{seg.name}</div>
                                                {pixelWidth > 60 && (
                                                    <div className={`text-[9px] font-mono font-bold opacity-90 scale-95 truncate mt-0.5 ${seg.color.text}`}>
                                                        {safeFormat(seg.start)}
                                                    </div>
                                                )}
                                             </div>
                                          )}
                                       </div>
                                       
                                       {/* Tooltip */}
                                       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-slate-800/90 backdrop-blur text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-xl opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-opacity z-50">
                                          {seg.name} ({formatDuration(seg.durationMins)})
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
        <DragOverlay
          modifiers={[snapCenterToCursor]}
          dropAnimation={{
            sideEffects: defaultDropAnimationSideEffects({
              styles: { active: { opacity: '0.3' } },
            }),
          }}
          className="z-[9999] cursor-grabbing pointer-events-none"
        >
          {activeTask ? <DragActiveCard task={activeTask} /> : null}
        </DragOverlay>,
        document.body
      )}
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 12px; height: 14px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(241, 245, 249, 0.5); }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
           background: #cbd5e1; border: 3px solid transparent; 
           background-clip: content-box; border-radius: 99px; 
           transition: background 0.2s;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        .custom-scrollbar::-webkit-scrollbar-corner { background: transparent; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
