import { getBackendBaseUrl } from './authService';

const API_KEY = 'lserp2026wyftool';

export interface Order {
  OrderId: string;
  ClientName: string;
  OrderDate: string;
  TotalAmount: number;
  Status?: string; // e.g. "待排产", "生产中"
  [key: string]: any;
}

export interface AnalysisItem {
  ProductName: string;
  ProcessRoute: string; // e.g. "车削->磨削"
  TotalHours: number;
  DeliveryDate?: string;
  MustStartBy: string; // 核心：最晚开工时间
  Status: string;      // e.g. "严重延误"
  Color: string;       // e.g. "#ff4d4f"
  DelayHours: number;
}

export interface AnalyzeResponse {
  OrderId: string;
  Analysis: AnalysisItem[];
}

export interface OrderListResponse {
  total: number;
  list: Order[];
}

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'X-API-KEY': API_KEY
});

// 1. 获取订单列表
export async function fetchOrders(page = 1, keyword = ''): Promise<OrderListResponse> {
  try {
    const baseUrl = await getBackendBaseUrl();
    const url = `${baseUrl}/api/orders?page=${page}&pageSize=20&keyword=${encodeURIComponent(keyword)}`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!res.ok) {
      console.warn(`Fetch orders failed: ${res.status}`);
      // Fallback for demo if API fails or is mock
      return { total: 0, list: [] };
    }

    const text = await res.text();
    return text ? JSON.parse(text) : { total: 0, list: [] };
  } catch (error) {
    console.error("fetchOrders error", error);
    return { total: 0, list: [] };
  }
}

// 2. 执行 APS 分析 (POST)
export async function analyzeOrder(billId: string): Promise<AnalyzeResponse> {
  try {
    const baseUrl = await getBackendBaseUrl();
    const url = `${baseUrl}/api/orders/${billId}/analyze`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders()
    });

    if (!res.ok) {
      throw new Error(`Analysis failed: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error("analyzeOrder error", error);
    throw error;
  }
}
