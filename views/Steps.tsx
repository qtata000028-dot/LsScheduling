
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom"; 
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
  Box,
  Package,
  Cpu,
  Tag,
  ChevronRight,
  Hash,
  Clock,
  Zap,
  ChevronLeft,
  ArrowRight,
  Timer,
  GripVertical,
  FileDigit,
  UserCircle,
  AlertTriangle,
  X,
  LocateFixed,
  AlertCircle,
  LogOut,
  Upload,
  PauseCircle,
  Lock,
  MousePointer2,
  XCircle,
  Eye,
  MoreHorizontal,
  ArrowUpRight
} from "lucide-react";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
  DropAnimation
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
import { DashboardContextType } from "../layouts/DashboardLayout"; 

// ==========================================
// 1. 核心配置 & 样式常量 (智能分辨率适配)
// ==========================================

const isCompactScreen = typeof window !== 'undefined' && window.innerWidth <= 1920;

const VIEW_CONFIG = {
  dayColWidth: isCompactScreen ? 540 : 720,      
  leftColWidth: isCompactScreen ? 360 : 420,     
  headerHeight: isCompactScreen ? 68 : 80,      
  rowHeight: isCompactScreen ? 164 : 180,        
  workStartHour: 0,      
  workEndHour: 24,       
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
  id: string;
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

interface ActiveContextData {
  segment: UiSegment;
  task: UiTask;
  rect: DOMRect;
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
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
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

function startOfMonthDate(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(0);
  return d;
}

function startOfDayDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(0);
  d.setSeconds(0);
  d.setMilliseconds(0);
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
// 4. 组件 - 抽屉系列
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
        className={`fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[9998] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div 
        className={`
          fixed top-2 right-2 bottom-2 w-[520px] max-w-[calc(100vw-16px)]
          bg-white shadow-2xl z-[9999] rounded-2xl flex flex-col overflow-hidden ring-1 ring-slate-900/5
          transform transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1)
          ${isVisible ? 'translate-x-0' : 'translate-x-[110%]'}
        `}
      >
        {task && (
          <div className="flex flex-col h-full bg-slate-50/50 relative">
             <div className="shrink-0 p-6 bg-white/90 backdrop-blur-md border-b border-slate-100 z-10 relative">
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-2">
                      <span className="text-xs font-black font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                        #{task.detailId}
                      </span>
                      {task.status === 'DELAY' && (
                        <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full border border-rose-100 flex items-center gap-1">
                           <Zap size={14} fill="currentColor" /> 已延误
                        </span>
                      )}
                   </div>
                   <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all">
                      <ChevronRight size={24} />
                   </button>
                </div>
                
                <h2 className="text-3xl font-black text-slate-800 font-mono tracking-tight leading-snug mb-6 select-text">
                   {task.billNo}
                </h2>
                
                <div className="flex gap-4">
                   <div className="flex-1 bg-blue-50/60 rounded-xl p-4 border border-blue-100/60 flex items-center gap-3 shadow-sm">
                      <div className="p-3 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
                        <Tag size={20} strokeWidth={2.5}/>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-blue-500 font-bold uppercase tracking-wider mb-1">产品编号</div>
                        <div className="text-base font-bold text-slate-800 font-mono truncate" title={task.productId}>{task.productId}</div>
                      </div>
                   </div>
                   <div className="flex-1 bg-purple-50/60 rounded-xl p-4 border border-purple-100/60 flex items-center gap-3 shadow-sm">
                      <div className="p-3 bg-purple-100 text-purple-600 rounded-lg shadow-sm">
                        <Package size={20} strokeWidth={2.5}/>
                      </div>
                      <div>
                        <div className="text-xs text-purple-500 font-bold uppercase tracking-wider mb-1">计划数量</div>
                        <div className="text-base font-bold text-slate-800 font-mono">{task.qty} <span className="text-sm font-medium text-slate-500">{task.unit}</span></div>
                      </div>
                   </div>
                </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative">
                <div className="absolute left-[34px] top-6 bottom-6 w-[2px] bg-slate-200 z-0 rounded-full"></div>
                <div className="space-y-8 relative z-10">
                   {groupedSegments.map((group, groupIndex) => {
                      const isExpanded = expandedIndices.has(groupIndex);
                      const isMulti = group.items.length > 1;
                      return (
                        <div key={groupIndex} className="relative pl-10 group">
                           <div className="absolute left-[35px] top-[28px] -translate-x-1/2 w-[16px] h-[16px] rounded-full bg-white border-[4px] border-blue-500 shadow-sm z-20 group-hover:scale-110 group-hover:border-blue-600 transition-all duration-300"></div>
                           <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
                              <div 
                                className={`flex items-center justify-between p-5 ${isMulti ? 'cursor-pointer hover:bg-slate-50/50 transition-colors' : ''}`}
                                onClick={() => isMulti && toggleGroup(groupIndex)}
                              >
                                 <div className="flex items-center gap-4">
                                     <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 font-mono border border-slate-200">
                                       {(groupIndex + 1).toString().padStart(2, '0')}
                                     </div>
                                     <div>
                                        <h3 className="font-bold text-lg text-slate-800">{group.name}</h3>
                                        <div className="text-xs text-slate-500 font-medium mt-0.5">工序组</div>
                                     </div>
                                 </div>
                                 <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm">
                                        <Timer size={14} strokeWidth={2.5} />
                                        <span className="text-sm font-bold font-mono">{formatDuration(group.totalMins)}</span>
                                    </div>
                                    {isMulti && (
                                       <div className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                           <ChevronDown size={20} />
                                       </div>
                                    )}
                                 </div>
                              </div>
                              {isMulti && !isExpanded && (
                                 <div className="px-5 pb-5">
                                   <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleGroup(groupIndex)}>
                                       <div className="flex items-center gap-2">
                                           <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">{group.items.length} 个分段</span>
                                           <span className="text-sm text-slate-500">点击展开</span>
                                       </div>
                                       <div className="font-mono font-bold text-slate-600 text-sm">
                                           {safeFormat(group.start, "MM-dd")} <ArrowRight size={14} className="inline mx-1"/> {safeFormat(group.end, "MM-dd")}
                                       </div>
                                   </div>
                                 </div>
                              )}
                              <div className={`${isMulti && !isExpanded ? 'hidden' : 'block'} ${isMulti ? 'bg-slate-50/50 border-t border-slate-100' : ''}`}>
                                 {group.items.map((seg, i) => (
                                    <div key={i} className={`relative px-5 py-4 ${i > 0 ? 'border-t border-slate-100 border-dashed' : ''} hover:bg-blue-50/30 transition-colors group/item`}>
                                       {isMulti && <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-blue-300/30 group-hover/item:bg-blue-400 transition-colors"></div>}
                                       <div className="flex items-center justify-between mb-3">
                                          <div className="flex items-center gap-2">
                                              <div className="p-1.5 bg-white border border-slate-200 rounded-md text-slate-500 shadow-sm">
                                                <Cpu size={16} />
                                              </div>
                                              <span className="text-base font-bold text-slate-800">
                                                 {seg.machine.replace('#', '')} <span className="text-sm font-normal text-slate-500">号机台</span>
                                              </span>
                                          </div>
                                          {isMulti && (
                                             <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                                                分段 {i + 1}
                                             </span>
                                          )}
                                       </div>
                                       <div className="flex items-center w-full shadow-sm rounded-xl overflow-hidden border border-slate-200/60 bg-white">
                                           <div className="flex-1 bg-emerald-50/50 text-emerald-900 px-4 py-2 border-r border-dashed border-emerald-100 flex flex-col items-center justify-center">
                                              <span className="text-[10px] font-bold uppercase text-emerald-600/70 mb-0.5">Start</span>
                                              <span className="text-sm font-mono font-bold">{safeFormat(seg.start, "MM-dd HH:mm")}</span>
                                           </div>
                                           <div className="w-10 bg-white flex items-center justify-center text-slate-300">
                                              <ArrowRight size={16} />
                                           </div>
                                           <div className="flex-1 bg-rose-50/50 text-rose-900 px-4 py-2 border-l border-dashed border-rose-100 flex flex-col items-center justify-center">
                                              <span className="text-[10px] font-bold uppercase text-rose-600/70 mb-0.5">End</span>
                                              <span className="text-sm font-mono font-bold">{safeFormat(seg.end, "HH:mm")}</span> 
                                              {(!isSameDay(seg.start, seg.end)) && (
                                                  <span className="text-[10px] text-rose-500 font-bold block -mt-1">
                                                      (+{differenceInCalendarDays(seg.end, seg.start)}d)
                                                  </span>
                                              )}
                                           </div>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                      );
                   })}
                   <div className="relative pl-10 pt-2 pb-8">
                      <div className="absolute left-[35px] top-3 -translate-x-1/2 w-4 h-4 rounded-full bg-slate-800 z-20 ring-4 ring-white shadow-md"></div>
                      <div className="ml-3 flex flex-col">
                          <span className="text-sm font-black text-slate-700 tracking-wider uppercase">全流程结束</span>
                          <span className="text-xs text-slate-500 font-bold mt-1">总周期: {formatDuration(task.totalMins)}</span>
                      </div>
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

const ErrorListDrawer: React.FC<{ isOpen: boolean; onClose: () => void; tasks: UiTask[]; onLocate: (taskId: string) => void; }> = ({ isOpen, onClose, tasks, onLocate }) => {
    const errorTasks = useMemo(() => {
        return tasks.filter(t => t.status === 'DELAY' || t.status === 'WARNING').sort((a, b) => (a.status === 'DELAY' ? -1 : 1));
    }, [tasks]);

    return createPortal(
        <>
           <div 
             className={`fixed inset-0 bg-slate-900/10 backdrop-blur-[1px] z-[9998] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
             onClick={onClose}
           />
           <div 
             className={`
               fixed top-4 bottom-4 right-4 w-[380px] max-w-[calc(100vw-32px)]
               bg-white/95 backdrop-blur-2xl shadow-2xl z-[9999] rounded-2xl flex flex-col overflow-hidden ring-1 ring-slate-900/5
               transform transition-transform duration-500 cubic-bezier(0.2, 0.8, 0.2, 1)
               ${isOpen ? 'translate-x-0' : 'translate-x-[120%]'}
             `}
           >
              <div className="shrink-0 p-5 bg-gradient-to-br from-rose-50/80 to-white border-b border-rose-100 z-10">
                  <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl shadow-sm relative overflow-hidden">
                             <AlertTriangle size={20} className="relative z-10"/>
                             <div className="absolute inset-0 bg-rose-200/50 blur-lg transform scale-150"></div>
                         </div>
                         <div>
                             <h3 className="text-lg font-black text-slate-900 leading-tight">异常监控</h3>
                             <p className="text-xs text-rose-600 font-bold mt-0.5">
                                 共发现 {errorTasks.length} 项风险
                             </p>
                         </div>
                      </div>
                      <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><X size={20} /></button>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
                  {errorTasks.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400">
                          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-3">
                              <Box size={32} className="text-emerald-300" />
                          </div>
                          <p className="font-bold text-base text-slate-600">运行平稳</p>
                          <p className="text-xs mt-1 text-slate-400">当前排程无延误或预警</p>
                      </div>
                  ) : (
                      <div className="space-y-3">
                          {errorTasks.map((t, i) => (
                              <div 
                                key={t.id}
                                className="group relative bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1"
                                onClick={() => onLocate(t.id)}
                              >
                                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${t.status === 'DELAY' ? 'bg-rose-500' : 'bg-amber-400'}`}></div>
                                  <div className="p-3 pl-5">
                                      <div className="flex items-start justify-between mb-1.5">
                                          <div className="min-w-0 pr-2">
                                              <div className="flex items-center gap-1.5 mb-1">
                                                  <span className="text-[10px] text-slate-500 font-bold font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                      #{t.billNo}
                                                  </span>
                                                  {t.status === 'DELAY' && (
                                                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">延误</span>
                                                  )}
                                              </div>
                                              <div className="text-base font-black text-slate-900 truncate leading-snug tracking-tight" title={t.productName}>{t.productName}</div>
                                          </div>
                                      </div>
                                      <div className={`rounded-lg p-2 text-xs font-medium border flex gap-2 items-start leading-relaxed ${
                                          t.status === 'DELAY' ? 'bg-rose-50 text-rose-900 border-rose-100' : 'bg-amber-50 text-amber-900 border-amber-100'
                                      }`}>
                                          <AlertCircle size={14} className={`shrink-0 mt-0.5 ${t.status === 'DELAY' ? 'text-rose-600' : 'text-amber-600'}`}/>
                                          <span>{t.warnings.length > 0 ? t.warnings[0].message : "系统检测到交期风险，建议立即检查工序排程。"}</span>
                                      </div>
                                      <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-lg hover:scale-110 transition-transform"><LocateFixed size={16} /></div>
                                      </div>
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
           </div>
        </>
    , document.body);
};

const LongPressOverlay: React.FC<{ active: ActiveContextData | null; onClose: () => void; onAction: (type: string, task: UiTask) => void; }> = ({ active, onClose, onAction }) => {
    useEffect(() => {
        if (active) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [active]);

    if (!active) return null;

    const { rect, segment, task } = active;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const menuWidth = 240; 
    const estimatedMenuHeight = 220;
    const spaceBelow = screenH - rect.bottom;
    const showAbove = spaceBelow < estimatedMenuHeight + 20; 
    const idealLeft = rect.left + rect.width / 2 - menuWidth / 2;
    const menuLeft = Math.max(20, Math.min(screenW - menuWidth - 20, idealLeft));
    const transformOriginX = ((rect.left + rect.width / 2) - menuLeft) / menuWidth * 100;
    const transformOrigin = showAbove ? `${transformOriginX}% 100%` : `${transformOriginX}% 0%`;
    const menuStyle: React.CSSProperties = showAbove 
        ? { bottom: screenH - rect.top + 16, left: menuLeft, transformOrigin, '--origin': transformOrigin } as any
        : { top: rect.bottom + 16, left: menuLeft, transformOrigin, '--origin': transformOrigin } as any;

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-500 animate-in fade-in" onClick={onClose}></div>
            <div 
                className="absolute z-[10001] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, transform: 'scale(1.05)', boxShadow: '0 25px 60px -12px rgba(0,0,0,0.4)' }}
            >
                <div className={`w-full h-full rounded-2xl cursor-default pointer-events-none ${segment.color.bgGradient} ${segment.color.shadow} border-0 ring-2 ring-white/60 flex flex-col items-center justify-center relative overflow-hidden`}>
                    <div className="absolute inset-x-0 top-0 h-[40%] bg-white/30 rounded-t-2xl pointer-events-none mix-blend-overlay"></div>
                    {rect.width > 30 && (
                        <div className="relative z-10 px-1 text-center w-full overflow-hidden flex flex-col items-center justify-center h-full">
                        <div className={`text-[11px] font-black drop-shadow-sm truncate w-full px-1 ${segment.color.text}`}>{segment.name}</div>
                        {rect.width > 60 && (
                            <div className={`text-[9px] font-mono font-bold opacity-90 scale-95 truncate mt-0.5 ${segment.color.text}`}>{safeFormat(segment.start)}</div>
                        )}
                        </div>
                    )}
                </div>
            </div>
            <div className="absolute z-[10002] flex flex-col w-[240px] animate-menu-spring" style={menuStyle}>
                <div className="bg-white/85 backdrop-blur-3xl backdrop-saturate-150 rounded-[24px] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.3)] ring-1 ring-white/40 border border-white/20 p-2.5 flex flex-col gap-1.5">
                    <div className="px-3.5 py-2 flex items-center justify-between opacity-50 border-b border-black/5 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-800">Actions</span>
                        <MoreHorizontal size={14} />
                    </div>
                    <button onClick={() => { onAction('details', task); onClose(); }} className="flex items-center gap-4 w-full px-3.5 py-3 rounded-2xl hover:bg-black/5 active:bg-black/10 transition-colors group text-left relative overflow-hidden">
                        <div className="relative shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-300">
                            <Eye size={18} strokeWidth={2.5}/>
                            <div className="absolute inset-0 bg-white/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </div>
                        <div className="flex flex-col"><span className="text-[15px] font-bold text-slate-800 leading-tight">查看详情</span></div>
                        <ArrowUpRight size={16} className="ml-auto text-slate-400 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                    </button>
                    <div className="h-px bg-slate-400/10 mx-4"></div>
                    <button onClick={() => onClose()} className="flex items-center gap-4 w-full px-3.5 py-3 rounded-2xl hover:bg-black/5 active:bg-black/10 transition-colors group text-left relative overflow-hidden">
                        <div className="relative shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/30 ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-300">
                            <PauseCircle size={18} strokeWidth={2.5}/>
                        </div>
                        <div className="flex flex-col"><span className="text-[15px] font-bold text-slate-800 leading-tight">暂停排程</span></div>
                    </button>
                    <div className="h-px bg-slate-400/10 mx-4"></div>
                    <button onClick={() => onClose()} className="flex items-center gap-4 w-full px-3.5 py-3 rounded-2xl hover:bg-black/5 active:bg-black/10 transition-colors group text-left relative overflow-hidden">
                        <div className="relative shrink-0 w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/30 ring-1 ring-white/20 group-hover:scale-105 transition-transform duration-300">
                            <Lock size={18} strokeWidth={2.5}/>
                        </div>
                        <div className="flex flex-col"><span className="text-[15px] font-bold text-slate-800 leading-tight">锁定工序</span></div>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// 5. 任务卡片组件 (优化后)
const TaskCard: React.FC<{
  task: UiTask;
  index: number;
  isSelected?: boolean;
  isFocused?: boolean; 
  isDragging?: boolean;
  onClick?: () => void;
  dragHandleProps?: any; 
}> = React.memo(({ task, index, isSelected, isFocused, isDragging, onClick, dragHandleProps }) => {
  const isDelay = task.status === 'DELAY';
  const isWarning = task.status === 'WARNING';
  const statusColor = isDelay ? 'bg-rose-500' : (isWarning ? 'bg-amber-400' : 'bg-emerald-500');
  const statusBg = isDelay ? 'bg-rose-50' : (isWarning ? 'bg-amber-50' : 'bg-emerald-50');
  const statusText = isDelay ? 'text-rose-600' : (isWarning ? 'text-amber-600' : 'text-emerald-600');
  const statusBorder = isDelay ? 'border-rose-100' : (isWarning ? 'border-amber-100' : 'border-emerald-100');

  return (
    <div 
       style={{ height: VIEW_CONFIG.rowHeight }}
       {...dragHandleProps}
       className={`
         w-full relative rounded-2xl overflow-hidden flex flex-col transition-all duration-300 group select-none
         ${isDragging 
             ? 'bg-white shadow-2xl scale-[1.02] border-blue-400 z-50 ring-4 ring-blue-100/50 rotate-1 cursor-grabbing' 
             : (isSelected 
                 ? 'bg-white border-blue-400 shadow-xl ring-2 ring-blue-50 z-20 cursor-grab active:cursor-grabbing' 
                 : (isFocused 
                     ? 'bg-white border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.3)] z-10 cursor-grab active:cursor-grabbing animate-pulse-once' 
                     : 'bg-white border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-300 hover:-translate-y-1 cursor-grab active:cursor-grabbing'
                   )
               )
         }
         border
       `}
       onClick={onClick}
    >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${statusColor} z-20`} />
        <div className="absolute right-2 top-0 text-[3.5rem] leading-none font-black italic text-slate-100 select-none pointer-events-none z-0" style={{ fontFamily: 'Inter, sans-serif' }}>
            {String(index + 1).padStart(2, '0')}
        </div>
        <div className="relative z-10 flex flex-col h-full bg-transparent">
            <div className="flex items-center justify-between px-4 pt-2.5 pb-1 relative z-20">
                <div className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBg} ${statusText} ${statusBorder}`}>
                    {isDelay ? '延误' : (isWarning ? '预警' : '正常')}
                </div>
                <div className="text-slate-300 group-hover:text-blue-500 transition-colors"><GripVertical size={16} /></div>
            </div>
            <div className="px-4 flex items-end justify-between gap-2 mt-1 relative z-20">
                <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <Hash size={11} className="text-slate-400"/>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">生产单号</span>
                    </div>
                    <div className="text-lg font-black font-mono text-slate-800 leading-none truncate tracking-tight" title={task.billNo}>{task.billNo}</div>
                </div>
                <div className="flex-1 min-w-0 text-right">
                    <div className="flex items-center justify-end gap-1 mb-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">产品编号</span>
                        <Tag size={11} className="text-slate-400"/>
                    </div>
                    <div className="text-xs font-bold font-mono text-blue-600 leading-none truncate tracking-tight" title={task.productId}>{task.productId || "N/A"}</div>
                </div>
            </div>
            <div className="relative h-px bg-slate-100 my-2 mx-2 z-10">
                <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border border-slate-200 rounded-full z-20 box-content border-l-transparent border-t-transparent border-b-transparent -rotate-45" style={{boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.05)'}}></div>
                <div className="absolute right-[-8px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border border-slate-200 rounded-full z-20 box-content border-r-transparent border-t-transparent border-b-transparent 45deg" style={{boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.05)'}}></div>
            </div>
            <div className="px-4 grid grid-cols-2 gap-3 mb-auto relative z-20">
                <div className="bg-slate-50/80 rounded-lg p-1.5 border border-slate-100 flex flex-col justify-center backdrop-blur-sm min-h-[44px]">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5"><Package size={11} /> 计划数量</div>
                    <div className="text-sm font-black font-mono text-slate-700 leading-none">{task.qty} <span className="text-[10px] font-bold text-slate-400">{task.unit}</span></div>
                </div>
                <div className={`rounded-lg p-1.5 border flex flex-col justify-center min-h-[44px] backdrop-blur-sm ${isDelay ? 'bg-rose-50/50 border-rose-100' : 'bg-white/60 border-slate-100'}`}>
                    <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isDelay ? 'text-rose-400' : 'text-slate-400'}`}><Clock size={11} /> 交货日期</div>
                    <div className={`text-sm font-black font-mono leading-none ${isDelay ? 'text-rose-600' : 'text-slate-700'}`}>{safeFormat(task.dueTime, "MM-dd")}</div>
                </div>
            </div>
            <div className="h-[32px] bg-slate-50/40 border-t border-slate-100/60 flex items-center px-4 gap-2 overflow-hidden relative mt-auto z-20">
                 <div className="shrink-0 text-slate-300 mr-0.5"><FileDigit size={14} /></div>
                 <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar mask-linear-fade py-1">
                    {task.processRoute.map((step, idx) => (
                        <div key={idx} className="flex items-center shrink-0">
                            {idx === 0 ? (
                                <div className="flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-sm shadow-blue-200 group-hover:scale-105 transition-transform"><span className="text-[10px] font-bold leading-none">{step}</span></div>
                            ) : (
                                <span className="text-[10px] font-semibold text-slate-500 px-0.5">{step}</span>
                            )}
                            {idx < task.processRoute.length - 1 && <ChevronRight size={10} className="text-slate-300/80 mx-0.5" />}
                        </div>
                    ))}
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none"></div>
            </div>
        </div>
    </div>
  );
});

// 封装 Sortable 逻辑 - 增加 Memo
const SortableTaskItem: React.FC<{ task: UiTask; index: number; isSelected: boolean; isFocused: boolean; onClick: () => void }> = React.memo(({ task, index, isSelected, isFocused, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="mb-4 touch-none" id={`task-row-${task.id}`}>
       <TaskCard task={task} index={index} isSelected={isSelected} isFocused={isFocused} onClick={onClick} dragHandleProps={{...attributes, ...listeners}} />
    </div>
  );
});

// ==========================================
// 6. 主页面
// ==========================================

export default function ApsSchedulingPage() {
  const { user, avatarUrl, handleLogout, triggerFileUpload } = useOutletContext<DashboardContextType>();
  
  const [tasks, setTasks] = useState<UiTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [months, setMonths] = useState<ApsMonthItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(""); 
  const [isMonthSelectorOpen, setIsMonthSelectorOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false); 
  
  const [viewStart, setViewStart] = useState<Date>(startOfMonthDate(new Date()));
  const [keyword, setKeyword] = useState("");
  const [onlyDelayed, setOnlyDelayed] = useState(false); 
  const [selectedTask, setSelectedTask] = useState<UiTask | null>(null); 
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null); 

  const [activeContext, setActiveContext] = useState<ActiveContextData | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressHandledRef = useRef(false);

  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 性能优化：使用 ref 直接操作 DOM 元素，避免 State 更新触发重绘
  const guideLineRef = useRef<HTMLDivElement>(null);
  const guideLabelRef = useRef<HTMLDivElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  
  const stats = useMemo(() => {
     let delay = 0;
     let warning = 0;
     tasks.forEach(t => {
         if (t.status === 'DELAY') delay++;
         else if (t.status === 'WARNING') warning++;
     });
     return { total: tasks.length, delay, warning };
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  
  const viewEnd = useMemo(() => addDays(viewStart, 7), [viewStart]);
  const days = useMemo(() => {
    if (!isValid(viewStart) || !isValid(viewEnd) || viewEnd < viewStart) return [];
    return eachDayOfInterval({ start: viewStart, end: viewEnd });
  }, [viewStart, viewEnd]);

  // 使用 CSS Gradient 优化性能，不再生成数千个 div
  const ganttGridBackground = useMemo(() => {
      // 模拟每 1/12 (每2小时) 的虚线
      return {
          backgroundImage: `linear-gradient(to right, transparent 95%, #e2e8f0 95%)`,
          backgroundSize: `${(100/12)}% 100%`
      };
  }, []);

  const ganttTotalWidth = days.length * VIEW_CONFIG.dayColWidth;
  const timeSlots = Array.from({ length: 12 }, (_, i) => i * 2);

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
        if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
            setIsUserMenuOpen(false);
        }
    };
    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, []);

  const handleSelectMonth = (mc: string) => {
    setSelectedMonth(mc);
    setIsMonthSelectorOpen(false);
  };

  const loadSchedule = async () => {
    if (!selectedMonth) return;
    setLoading(true);
    try {
      const res = await runApsSchedule({ fromMc: selectedMonth });
      const map = new Map<number, UiSegment[]>();
      const warns = new Map<number, ApsScheduleWarning[]>();
      (res.warnings || []).forEach(w => {
         const did = Number(getPropSmart(w, ['detailId', 'DetailId', 'did']));
         if (!warns.has(did)) warns.set(did, []);
         warns.get(did)?.push(w);
      });
      (res.segments || []).forEach(s => {
         const did = Number(getPropSmart(s, ['detailId', 'DetailId', 'did']));
         if (!map.has(did)) map.set(did, []);
         const start = safeDate(getPropSmart(s, ['startTime', 'Start', 'start']));
         const endRaw = getPropSmart(s, ['endTime', 'End', 'end']);
         const mins = Number(getPropSmart(s, ['minutes', 'Minutes', 'mins']) || 0);
         const end = endRaw ? safeDate(endRaw) : addMinutes(start, mins);
         const name = getPropSmart(s, ['processName', 'ProcessName', 'name']) || "工序";
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
      const newTasks: UiTask[] = [];
      map.forEach((segs, did) => {
         segs.sort((a, b) => a.start.getTime() - b.start.getTime());
         if (segs.length === 0) return;
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
      if (newTasks.length > 0) {
          const allStarts = newTasks.map(t => t.start.getTime());
          const earliestDate = new Date(Math.min(...allStarts));
          if (isValid(earliestDate)) setViewStart(startOfDayDate(earliestDate));
          else {
             const match = selectedMonth.match(/(\d{4})年(\d{1,2})月/);
             if (match) setViewStart(new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1));
          }
      } else {
         const match = selectedMonth.match(/(\d{4})年(\d{1,2})月/);
         if (match) setViewStart(new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSchedule(); }, [selectedMonth]);

  const filteredTasks = useMemo(() => {
    let res = tasks;
    if (keyword) {
      const lower = keyword.toLowerCase();
      res = res.filter(t => 
        t.billNo.toLowerCase().includes(lower) || 
        t.productName.toLowerCase().includes(lower) ||
        t.productId.toLowerCase().includes(lower) ||
        t.processRoute.some(p => p.toLowerCase().includes(lower))
      );
    }
    if (onlyDelayed) res = res.filter(t => t.status !== 'NORMAL');
    return res;
  }, [tasks, keyword, onlyDelayed]);

  useEffect(() => {
    if (keyword && filteredTasks.length > 0) {
        const minStart = Math.min(...filteredTasks.map(t => t.start.getTime()));
        const earliest = new Date(minStart);
        if (isValid(earliest)) setViewStart(startOfDayDate(earliest));
    }
  }, [keyword, filteredTasks]); 

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTasks((items) => {
        const oldIndex = items.findIndex((t) => t.id === active.id);
        const newIndex = items.findIndex((t) => t.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveId(null);
  };

  const getPosPx = useCallback((date: Date) => {
    const dayInd = differenceInCalendarDays(date, viewStart);
    if (dayInd < 0 || dayInd >= days.length) return -9999;
    const h = date.getHours() + date.getMinutes() / 60;
    const totalH = VIEW_CONFIG.workEndHour - VIEW_CONFIG.workStartHour;
    let p = (h - VIEW_CONFIG.workStartHour) / totalH;
    p = Math.max(0, Math.min(1, p));
    return (dayInd + p) * VIEW_CONFIG.dayColWidth;
  }, [days, viewStart]);

  const handleLocateTask = (taskId: string) => {
      setIsErrorDrawerOpen(false);
      setOnlyDelayed(false);
      setKeyword("");
      const targetTask = tasks.find(t => t.id === taskId);
      if (targetTask) {
          const targetDate = startOfDayDate(targetTask.start);
          setViewStart(targetDate);
          
          setTimeout(() => {
              const rowEl = document.getElementById(`task-row-${taskId}`);
              if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

              if (rightPanelRef.current) {
                 const h = targetTask.start.getHours() + targetTask.start.getMinutes() / 60;
                 const totalH = VIEW_CONFIG.workEndHour - VIEW_CONFIG.workStartHour;
                 let p = (h - VIEW_CONFIG.workStartHour) / totalH;
                 p = Math.max(0, Math.min(1, p));
                 const px = p * VIEW_CONFIG.dayColWidth;
                 rightPanelRef.current.scrollTo({ left: Math.max(0, px - 100), behavior: 'smooth' });
              }

              setFocusedTaskId(taskId);
              setTimeout(() => setFocusedTaskId(null), 6000);
          }, 200); 
      }
  };

  const getSegmentStyle = useCallback((segStart: Date, segEnd: Date) => {
    const startH = segStart.getHours() + segStart.getMinutes() / 60;
    const endH = segEnd.getHours() + segEnd.getMinutes() / 60;
    const totalH = VIEW_CONFIG.workEndHour - VIEW_CONFIG.workStartHour;
    const visibleStartH = Math.max(VIEW_CONFIG.workStartHour, Math.min(VIEW_CONFIG.workEndHour, startH));
    const visibleEndH = Math.max(VIEW_CONFIG.workStartHour, Math.min(VIEW_CONFIG.workEndHour, endH));
    if (visibleEndH <= visibleStartH) return null; 
    return { 
        leftPercent: (visibleStartH - VIEW_CONFIG.workStartHour) / totalH * 100, 
        widthPercent: (visibleEndH - visibleStartH) / totalH * 100 
    };
  }, []);

  const handlePrevWeek = () => setViewStart(prev => addDays(prev, -7));
  const handleNextWeek = () => setViewStart(prev => addDays(prev, 7));

  // 性能关键：直接操作 DOM，避免 React Render
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!rightPanelRef.current || !guideLineRef.current) return;
    const rect = rightPanelRef.current.getBoundingClientRect();
    const scrollLeft = rightPanelRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    
    // 如果鼠标在可视区域外，隐藏
    if (x < 0 || x > days.length * VIEW_CONFIG.dayColWidth) {
        guideLineRef.current.style.display = 'none';
        return;
    }

    guideLineRef.current.style.display = 'flex';
    guideLineRef.current.style.transform = `translateX(${x}px)`;

    const dayIndex = Math.floor(x / VIEW_CONFIG.dayColWidth);
    const pxInDay = x % VIEW_CONFIG.dayColWidth;
    const hours = pxInDay / (VIEW_CONFIG.dayColWidth / 24);
    
    if (dayIndex >= 0 && dayIndex < days.length && guideLabelRef.current) {
        const date = addMinutes(days[dayIndex], hours * 60);
        guideLabelRef.current.textContent = format(date, 'MM-dd HH:mm');
    }
  };

  const handlePointerDownSegment = (e: React.PointerEvent, segment: UiSegment, task: UiTask) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const target = e.currentTarget as HTMLElement;
      isLongPressHandledRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
          const rect = target.getBoundingClientRect();
          setActiveContext({ segment, task, rect });
          isLongPressHandledRef.current = true;
          if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
      }, 500); 
  };

  const handlePointerUpSegment = () => {
      if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
  };
  
  const handleSegmentClick = (e: React.MouseEvent, task: UiTask) => {
      e.stopPropagation();
      if (isLongPressHandledRef.current) {
          isLongPressHandledRef.current = false;
          return; 
      }
      setSelectedTask(task);
  };

  const handleMenuAction = (type: string, task: UiTask) => {
      if (type === 'details') setSelectedTask(task);
  };

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;
  const activeIndex = activeId ? tasks.findIndex(t => t.id === activeId) : 0;

  return (
    <div className="h-full flex flex-col font-sans text-slate-700 overflow-hidden relative bg-white/50">
      
      <TaskDetailDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
      <ErrorListDrawer isOpen={isErrorDrawerOpen} onClose={() => setIsErrorDrawerOpen(false)} tasks={tasks} onLocate={handleLocateTask} />
      <LongPressOverlay active={activeContext} onClose={() => setActiveContext(null)} onAction={handleMenuAction} />

      <div className="relative z-50 px-4 py-3 pointer-events-none">
         {/* 核心修复：移除 overflow-x-auto，防止绝对定位的下拉菜单被截断 */}
         <div className="pointer-events-auto bg-white/60 backdrop-blur-2xl border border-white/50 shadow-xl shadow-slate-200/40 rounded-[1.5rem] p-1.5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-3 max-w-full">
             
             {/* Left Area */}
             <div className="flex items-center gap-3 pl-1.5">
                 {/* 月份/周导航 */}
                 <div className="relative" ref={dropdownRef}>
                    <div className="flex items-center bg-slate-50/80 border border-slate-200/60 rounded-xl p-0.5 shadow-inner group transition-all hover:bg-white hover:shadow-md">
                        <button onClick={handlePrevWeek} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="上一周"><ChevronLeft size={16}/></button>
                        
                        <div onClick={() => setIsMonthSelectorOpen(!isMonthSelectorOpen)} className="px-2 py-1 cursor-pointer select-none text-center min-w-[80px] hover:bg-white/80 rounded-lg transition-colors">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 scale-90 flex items-center justify-center gap-1">当前排程 <ChevronDown size={10}/></div>
                            <div className="text-xs font-black font-mono text-slate-700 group-hover:text-blue-600 transition-colors">{selectedMonth || format(viewStart, 'yyyy-MM')}</div>
                        </div>

                        <button onClick={handleNextWeek} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="下一周"><ChevronRight size={16}/></button>
                    </div>

                    {/* 下拉菜单：绝对定位，层级 z-[9999] */}
                    {isMonthSelectorOpen && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-white/95 backdrop-blur-3xl border border-white/60 rounded-2xl shadow-2xl shadow-slate-300/50 p-2 z-[9999] animate-in fade-in zoom-in-95 origin-top-left ring-1 ring-slate-100/50" style={{ maxHeight: '80vh' }}>
                            <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-1">切换数据源 (月度)</div>
                            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                            {months.length > 0 ? months.map(m => (
                                <div key={m.mc} onClick={() => handleSelectMonth(m.mc)} className={`px-3 py-2 rounded-xl text-xs cursor-pointer flex justify-between items-center transition-all mb-1 ${selectedMonth === m.mc ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                                    <div className="flex items-center gap-2"><CalendarIcon size={14} className={selectedMonth === m.mc ? 'text-blue-500' : 'text-slate-400'}/><span className="font-bold">{m.mc}</span></div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md border ${selectedMonth === m.mc ? 'bg-white text-blue-600 border-blue-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{m.orderCount || 0}单</span>
                                </div>
                            )) : <div className="p-4 text-center text-xs text-slate-400">暂无排程数据</div>}
                            </div>
                        </div>
                    )}
                 </div>

                 <div className="h-6 w-px bg-slate-200/60 mx-0.5 hidden xl:block"></div>

                 {/* 搜索框：修复消失问题，使用 hidden md:block 保证在 1080p 缩放时可见 */}
                 <div className="relative group/search hidden md:block min-w-[200px]">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
                     <input value={keyword} onChange={e => setKeyword(e.target.value)} className="pl-8 pr-3 py-1.5 w-full bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold placeholder:text-slate-400/80 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 focus:bg-white transition-all outline-none" placeholder="搜索产品、单号..." />
                 </div>
             </div>

             {/* Center Stats */}
             <div className="flex items-center gap-2">
                 <div className="flex flex-col items-center px-3 py-1 rounded-xl bg-white/40 border border-white/50 min-w-[70px]">
                     <span className="text-[9px] font-bold text-slate-400 uppercase scale-90">总任务</span>
                     <span className="text-sm font-black font-mono text-slate-700 leading-none">{stats.total}</span>
                 </div>
                 <button onClick={() => stats.delay > 0 && setIsErrorDrawerOpen(true)} disabled={stats.delay === 0} className={`relative flex flex-col items-center px-3 py-1 rounded-xl border transition-all duration-300 min-w-[70px] ${stats.delay > 0 ? 'bg-rose-50/80 border-rose-200 cursor-pointer hover:bg-rose-100 hover:scale-105 active:scale-95 shadow-sm hover:shadow-rose-200' : 'bg-white/40 border-white/50 opacity-60 cursor-default'}`}>
                     <span className={`text-[9px] font-bold uppercase flex items-center gap-1 scale-90 ${stats.delay > 0 ? 'text-rose-500' : 'text-slate-400'}`}>严重延误 {stats.delay > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>}</span>
                     <span className={`text-sm font-black font-mono leading-none ${stats.delay > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{stats.delay}</span>
                 </button>
                 <button onClick={() => stats.warning > 0 && setIsErrorDrawerOpen(true)} disabled={stats.warning === 0} className={`flex flex-col items-center px-3 py-1 rounded-xl border transition-all duration-300 min-w-[70px] ${stats.warning > 0 ? 'bg-amber-50/80 border-amber-200 cursor-pointer hover:bg-amber-100 hover:scale-105 active:scale-95 shadow-sm' : 'bg-white/40 border-white/50 opacity-60 cursor-default'}`}>
                     <span className={`text-[9px] font-bold uppercase scale-90 ${stats.warning > 0 ? 'text-amber-500' : 'text-slate-400'}`}>工期预警</span>
                     <span className={`text-sm font-black font-mono leading-none ${stats.warning > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{stats.warning}</span>
                 </button>
             </div>

             {/* Right Tools */}
             <div className="flex items-center gap-3 pr-1.5">
                 <button onClick={loadSchedule} disabled={loading} className="group relative overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white shadow-lg shadow-slate-800/20 hover:shadow-xl hover:shadow-slate-800/30 hover:-translate-y-0.5 active:translate-y-0 transition-all">
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-700 to-slate-900 transition-opacity group-hover:opacity-90"></div>
                    <div className="relative flex items-center gap-1.5"><PlayCircle size={14} className={`${loading ? "animate-spin" : ""} group-hover:text-blue-300 transition-colors`} /><span className="text-xs font-bold tracking-wide">排程</span></div>
                 </button>
                 <div className="h-6 w-px bg-slate-200/60 mx-0.5 hidden sm:block"></div>
                 <div className="relative" ref={userMenuRef}>
                    <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className={`hidden lg:flex items-center gap-2 rounded-full pl-1 pr-2.5 py-0.5 shadow-sm transition-all duration-300 ${isUserMenuOpen ? 'bg-white shadow-md ring-1 ring-blue-100' : 'bg-white/50 border border-white/60 hover:bg-white/80'}`}>
                        <div className="relative"><img src={avatarUrl} alt="Avatar" className="w-7 h-7 rounded-full border border-white shadow-sm object-cover" /><div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border-2 border-white rounded-full"></div></div>
                        <div className="flex flex-col text-left"><span className="text-[9px] text-slate-400 font-bold uppercase leading-none scale-90 origin-left">Planner</span><span className="text-[10px] font-bold text-slate-700 leading-none mt-0.5 max-w-[60px] truncate">{user?.userName || "Admin"}</span></div>
                        <ChevronDown size={12} className={`text-slate-400 ml-0.5 transition-transform duration-300 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isUserMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-white/90 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl shadow-slate-200/50 p-2 z-50 animate-in fade-in slide-in-from-top-2 origin-top-right">
                           <div className="px-3 py-2 border-b border-slate-100/50 mb-1"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">当前账号</p><p className="text-sm font-bold text-slate-700 mt-0.5 truncate">{user?.displayName || user?.userName}</p></div>
                           <div className="space-y-1">
                               <button onClick={triggerFileUpload} className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all"><Upload size={14} className="text-slate-400"/> 更换头像</button>
                               <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><LogOut size={14} className="text-rose-400"/> 退出登录</button>
                           </div>
                        </div>
                    )}
                 </div>
             </div>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative -mt-3 pt-3"> 
         <div className="shrink-0 h-full flex flex-col bg-white/60 border-r border-slate-200 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.02)]" style={{ width: VIEW_CONFIG.leftColWidth }}>
             <div className="h-[72px] shrink-0 border-b border-white/50 flex items-center px-5 bg-white/50 backdrop-blur-md">
                <div className="flex items-center gap-2 text-slate-700 font-black tracking-tight text-base"><Layers className="text-blue-600" size={18}/>排程任务<span className="ml-1 bg-blue-100 text-blue-700 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shadow-sm">{filteredTasks.length}</span></div>
                <div className="ml-auto"><button onClick={() => setOnlyDelayed(!onlyDelayed)} className={`p-1.5 rounded-lg transition-colors ${onlyDelayed ? 'bg-rose-100 text-rose-600' : 'hover:bg-slate-100 text-slate-400'}`} title="只看延误"><Filter size={16} /></button></div>
             </div>
             <div id="left-panel-scroll" className="flex-1 overflow-hidden hover:overflow-y-auto no-scrollbar" onWheel={(e) => { const right = document.getElementById('right-panel-scroll'); if (right) right.scrollTop += e.deltaY; }}>
                <div className="py-3 px-4">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <SortableContext items={filteredTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      {filteredTasks.map((task, index) => (
                        <SortableTaskItem key={task.id} task={task} index={index} isSelected={selectedTask?.id === task.id} isFocused={focusedTaskId === task.id} onClick={() => setSelectedTask(task)} />
                      ))}
                    </SortableContext>
                    {createPortal(
                      <DragOverlay modifiers={[snapCenterToCursor]} dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }} className="z-[9999] cursor-grabbing pointer-events-none">
                        {activeTask ? (<div style={{ width: VIEW_CONFIG.leftColWidth - 32 }}><TaskCard task={activeTask} index={activeIndex} isSelected={selectedTask?.id === activeTask.id} isFocused={focusedTaskId === activeTask.id} isDragging={true} /></div>) : null}
                      </DragOverlay>,
                      document.body
                    )}
                  </DndContext>
                  <div className="h-20"></div>
                </div>
             </div>
         </div>

         <div id="right-panel-scroll" ref={rightPanelRef} className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/30" onScroll={(e) => { const leftPanel = document.getElementById('left-panel-scroll'); if(leftPanel) leftPanel.scrollTop = e.currentTarget.scrollTop; }} onMouseMove={handleMouseMove} onMouseLeave={() => { if(guideLineRef.current) guideLineRef.current.style.display = 'none'; }}>
            <div style={{ width: Math.max(1000, ganttTotalWidth), minHeight: '100%' }} className="relative group/gantt">
               <div className="sticky top-0 z-40 flex border-b border-slate-200 bg-white/80 backdrop-blur-md shadow-sm h-[72px]">
                   {days.map((day, i) => {
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isToday = isSameDay(day, new Date());
                      return (
                        <div key={i} className={`shrink-0 flex flex-col relative border-r border-slate-200 ${isWeekend ? 'bg-slate-100/60' : 'bg-white/40'}`} style={{ width: VIEW_CONFIG.dayColWidth, height: '100%' }}>
                           <div className="flex-1 flex flex-col justify-center items-center">
                               <div className={`text-[10px] font-bold uppercase mb-0.5 ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>{WEEKDAYS[day.getDay()]}</div>
                               <div className={`text-lg font-black font-mono leading-none tracking-tight ${isToday ? 'text-blue-600' : 'text-slate-700'}`}>{format(day, "MM-dd")}</div>
                           </div>
                           <div className="h-[20px] flex w-full border-t border-slate-100">
                              {timeSlots.map((hour) => <div key={hour} className="flex-1 text-[9px] text-slate-300 font-mono text-center leading-[20px] border-r border-transparent last:border-none">{String(hour).padStart(2,'0')}</div>)}
                           </div>
                           {isToday && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500 z-10"></div>}
                        </div>
                      );
                   })}
               </div>

               {/* 性能优化：使用 Ref 控制的 DOM 元素，不触发 React Render */}
               <div ref={guideLineRef} className="absolute top-[72px] bottom-0 w-[1.5px] bg-blue-500 z-50 pointer-events-none flex flex-col items-center hidden" style={{ willChange: 'transform' }}>
                    <div ref={guideLabelRef} className="bg-blue-600 text-white text-[10px] font-mono font-bold px-2 py-1 rounded shadow-lg -mt-8 whitespace-nowrap ring-2 ring-white z-50"></div>
                    <div className="absolute bottom-0 w-3 h-3 bg-blue-500 rounded-full blur-[2px] opacity-50"></div>
               </div>

               <div className="relative z-10 py-3 px-0">
                  {/* 背景网格 - 性能优化版本 (CSS Gradient) */}
                  <div className="absolute inset-0 z-0 pointer-events-none flex" style={{ top: 0 }}>
                      {days.map((d, i) => {
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                              <div key={i} className={`h-full border-r border-slate-300/50 relative ${isWeekend ? 'bg-slate-100/30' : ''}`} style={{ width: VIEW_CONFIG.dayColWidth, ...ganttGridBackground }} />
                          );
                      })}
                  </div>

                  {filteredTasks.map((task) => {
                     const taskStartPx = getPosPx(task.start);
                     const taskEndPx = getPosPx(task.end);
                     const validStart = taskStartPx > -5000;
                     const validEnd = taskEndPx > -5000;
                     const connectionWidth = (validStart && validEnd) ? (taskEndPx - taskStartPx) : 0;

                     return (
                        <div key={task.id} className="relative w-full mb-4 z-10" style={{ height: VIEW_CONFIG.rowHeight }}>
                           <div className="absolute top-1/2 left-0 h-4 w-full pointer-events-none" style={{ transform: 'translateY(-50%)' }}>
                               {connectionWidth > 0 && (
                                  <div className="absolute h-full z-0 flex items-center" style={{ left: taskStartPx, width: connectionWidth }}>
                                     <div className="absolute inset-x-0 h-[3px] bg-slate-200/60 rounded-full"></div>
                                  </div>
                               )}
                           </div>
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
                                       className="absolute top-1/2 -translate-y-1/2 h-[52px] z-10 transition-all duration-300 hover:z-20 hover:scale-105 group/bar"
                                       style={{ left: baseLeft + pixelOffset, width: pixelWidth }}
                                       onPointerDown={(e) => handlePointerDownSegment(e, seg, task)}
                                       onPointerUp={handlePointerUpSegment}
                                       onPointerLeave={handlePointerUpSegment}
                                    >
                                       <div 
                                          className={`w-full h-full rounded-xl cursor-pointer pointer-events-auto ${seg.color.bgGradient} ${seg.color.shadow} ${seg.color.border} border flex flex-col items-center justify-center relative overflow-hidden backdrop-blur-sm`}
                                          onClick={(e) => handleSegmentClick(e, task)}
                                       >
                                          <div className="absolute inset-x-0 top-0 h-[40%] bg-white/20 rounded-t-xl pointer-events-none"></div>
                                          {pixelWidth > 30 && (
                                             <div className="relative z-10 px-1 text-center w-full overflow-hidden flex flex-col items-center justify-center h-full">
                                                <div className={`text-[10px] font-black drop-shadow-sm truncate w-full px-1 ${seg.color.text}`}>{seg.name}</div>
                                                {pixelWidth > 60 && (<div className={`text-[9px] font-mono font-bold opacity-90 scale-95 truncate mt-0.5 ${seg.color.text}`}>{safeFormat(seg.start)}</div>)}
                                             </div>
                                          )}
                                       </div>
                                       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max bg-slate-800/90 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 rounded-lg shadow-xl opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-opacity z-50">
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
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(241, 245, 249, 0.5); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border: 2px solid transparent; background-clip: content-box; border-radius: 99px; transition: background 0.2s; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
        .custom-scrollbar::-webkit-scrollbar-corner { background: transparent; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes pulse-once { 
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); border-color: transparent; } 
          50% { box-shadow: 0 0 0 6px rgba(59,130,246,0.3); border-color: #3b82f6; background-color: rgba(239, 246, 255, 0.5); } 
        }
        .animate-pulse-once { animation: pulse-once 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes menu-spring { 0% { opacity: 0; transform: scale(0.8) translateY(10px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        .animate-menu-spring { animation: menu-spring 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>
    </div>
  );
}
