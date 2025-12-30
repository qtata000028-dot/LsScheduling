
import { getBackendBaseUrl } from "./authService";

const API_KEY = "lserp2026wyftool";

const getHeaders = () => ({
  "Content-Type": "application/json",
  "X-API-KEY": API_KEY,
});

export type ApsWarningLevel = "INFO" | "WARN" | "ERROR";

export interface ApsMonthItem {
  mc: string;     // "2025年12月"
  mcYm: number;   // 202512
  orderCount?: number;
  detailCount?: number;
}

export interface ApsScheduleSegment {
  mc: string;
  mcYm: number;

  billNo: string;
  detailId: number;
  lineNo1: string;

  productId: string;
  dueTime: string;      // ISO string

  processNo: string;
  processName: string;

  machineIndex: number; // 1..n
  startTime: string;    // ISO
  endTime: string;      // ISO
  minutes: number;
}

export interface ApsScheduleWarning {
  level: ApsWarningLevel;
  mc: string;
  billNo: string;
  detailId: number;
  lineNo1: string;
  productId: string;
  dueTime: string;
  message: string;
}

export interface ApsScheduleDetail {
  mc: string;
  mcYm: number;
  billNo: string;
  detailId: number;
  lineNo1: string;
  productId: string;

  productName?: string;
  planQty?: number;
  unit?: string;
  dueTime: string;
  processRoute?: string;
}

export interface ApsScheduleRunRequest {
  fromMc?: string;          // "2025年12月"
  toMc?: string;            // "2026年1月"
  anchorStart?: string;     // ISO
  includeAll?: boolean;     // false=只取 stepover=1
  detailOrder?: number[];   // 预留
}

export interface ApsScheduleRunResponse {
  fromMc?: string;
  toMc?: string;
  anchorStart: string;
  segmentCount: number;
  warningCount: number;
  segments: ApsScheduleSegment[];
  warnings: ApsScheduleWarning[];
  details?: ApsScheduleDetail[];
}

export async function fetchApsMonths(includeAll = false): Promise<ApsMonthItem[]> {
  const baseUrl = await getBackendBaseUrl();
  // FIX: C# Minimal API bool binder expects "true"/"false", not 1/0.
  // JS template literal `${boolean}` converts to "true" or "false" string automatically.
  const url = `${baseUrl}/api/aps/schedule/months?includeAll=${includeAll}`;

  console.log(`[APS] Fetching months from: ${url}`);
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) {
        console.error(`[APS] fetchApsMonths failed status: ${res.status}`);
        throw new Error(`fetchApsMonths failed: ${res.status}`);
    }

    const text = await res.text();
    if (!text) return [];
    
    const json = JSON.parse(text);
    if (!Array.isArray(json)) {
        console.warn("[APS] fetchApsMonths response is not array:", json);
        return [];
    }

    // 兼容：后端可能只返回 {mc, mcYm} 或还带统计
    return json.map((x: any) => ({
      mc: String(x.mc ?? x.Mc ?? ""),
      mcYm: Number(x.mcYm ?? x.McYm ?? 0),
      orderCount: x.orderCount != null ? Number(x.orderCount) : undefined,
      detailCount: x.detailCount != null ? Number(x.detailCount) : undefined,
    }));
  } catch (e) {
    console.error("[APS] fetchApsMonths error:", e);
    throw e;
  }
}

export async function runApsSchedule(req: ApsScheduleRunRequest): Promise<ApsScheduleRunResponse> {
  const baseUrl = await getBackendBaseUrl();
  const url = `${baseUrl}/api/aps/schedule/run`;

  console.log(`[APS] Running schedule for: ${req.fromMc} (includeAll=${req.includeAll})`);
  
  try {
      const res = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          fromMc: req.fromMc,
          toMc: req.toMc,
          anchorStart: req.anchorStart,
          includeAll: !!req.includeAll,
          detailOrder: req.detailOrder,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[APS] runApsSchedule failed: ${res.status} ${text}`);
        throw new Error(`runApsSchedule failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      
      const segmentCount = Number(data.segmentCount ?? data.SegmentCount ?? 0);
      console.log(`[APS] Schedule run success. Segments: ${segmentCount}`);

      return {
        fromMc: data.fromMc ?? data.FromMc,
        toMc: data.toMc ?? data.ToMc,
        anchorStart: data.anchorStart ?? data.AnchorStart,
        segmentCount: segmentCount,
        warningCount: Number(data.warningCount ?? data.WarningCount ?? 0),
        segments: Array.isArray(data.segments) ? data.segments : (Array.isArray(data.Segments) ? data.Segments : []),
        warnings: Array.isArray(data.warnings) ? data.warnings : (Array.isArray(data.Warnings) ? data.Warnings : []),
        details: Array.isArray(data.details) ? data.details : (Array.isArray(data.Details) ? data.Details : undefined),
      };
  } catch (e) {
      console.error("[APS] runApsSchedule error:", e);
      throw e;
  }
}
