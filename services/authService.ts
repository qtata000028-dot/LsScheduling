import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. 核心配置 & Supabase 初始化
// ==========================================

// 项目根地址 (从提供的 REST URL 提取)
const SUPABASE_URL = 'https://ugxkzfvdybzbsxitcybw.supabase.co';
// 提供的 Key
const SUPABASE_KEY = 'sb_publishable_TTpGoAiJ9WIRWQ_gxAxb8Q_LQ9c6Yv2';

// 初始化客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const API_KEY = 'lserp2026wyftool';
const DEFAULT_LOCAL_URL = 'http://localhost:5000'; // Requirement: Fallback to 5000

// 缓存 Base URL，避免每次请求都查库
let cachedBaseUrl: string | null = null;

// Requirement: Updated Data Structure
export interface Employee {
  employeeId: number;
  employeeName: string;
  pEmpNo?: string; // 工号，用于精确匹配
  displayName?: string; // e.g. "张三 (001)"
  fullAvatarUrl?: string; // 相对路径头像
}

export interface LoginResponse {
  code: number;
  msg?: string;
  token?: string;
  userName?: string;
  needConstraint?: boolean;
  error?: string;
  fullAvatarUrl?: string; // 登录返回的头像
  [key: string]: any;
}

export interface UploadResponse {
  id: string;
  url: string;
  originalName?: string;
}

// ==========================================
// 2. 内部辅助函数
// ==========================================

/**
 * 动态获取后端 Base URL
 * 逻辑：先查内存 -> 再查 Supabase (tunnel_endpoints) -> 失败则回退 localhost:5000
 */
async function getDynamicBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;

  try {
    // console.log('正在从 Supabase 获取隧道地址...');
    const { data, error } = await supabase
      .from('tunnel_endpoints')
      .select('public_url')
      .eq('name', 'home-pc')
      .single();

    if (error) {
      console.warn('Supabase 查询错误:', error.message);
      throw error; 
    }

    if (!data?.public_url) {
      console.warn('Supabase 返回数据为空或无 public_url');
      return DEFAULT_LOCAL_URL;
    }

    // 存入缓存，去除末尾斜杠
    cachedBaseUrl = data.public_url.replace(/\/$/, ''); 
    console.log('🔗 已获取动态后端地址:', cachedBaseUrl);
    return cachedBaseUrl;
  } catch (err) {
    console.error(`获取动态地址失败，回退到本地默认地址 (${DEFAULT_LOCAL_URL})`, err);
    return DEFAULT_LOCAL_URL;
  }
}

// ==========================================
// 3. 业务服务函数
// ==========================================

/**
 * 暴露给外部获取当前 BaseUrl 的方法
 */
export async function getBackendBaseUrl(): Promise<string> {
  return await getDynamicBaseUrl();
}

/**
 * 搜索/获取员工列表
 * API: GET /api/employees/list?q=keyword
 * Header: X-API-KEY
 */
export async function getEmployeeListService(query: string = ''): Promise<Employee[]> {
  try {
    const baseUrl = await getDynamicBaseUrl();
    // Requirement: Endpoint is /api/employees/list
    const url = `${baseUrl}/api/employees/list?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY // Requirement: Auth Header
      }
    });
    
    if (!response.ok) {
       console.warn(`搜索请求失败: ${response.status}`);
       return [];
    }
    
    // FIX: Handle empty body safely & Robust error parsing
    const text = await response.text();
    if (!text) return [];

    try {
      return JSON.parse(text);
    } catch (e) {
      console.warn('响应格式错误, 非 JSON:', text);
      return [];
    }
  } catch (error) {
    console.warn('员工搜索请求异常', error);
    return [];
  }
}

/**
 * 执行登录
 * API: POST /api/auth/login
 */
export async function loginService(userId: number | string, password: string, isConstraint: boolean): Promise<LoginResponse> {
  try {
    const baseUrl = await getDynamicBaseUrl();
    const loginApiUrl = `${baseUrl}/api/auth/login`;

    // 严格对应后端的字段命名 (PascalCase) 和类型
    const payload = {
      UserId: String(userId),        // 确保是字符串
      Password: password,            // 密码
      IsConstraint: Boolean(isConstraint) // 确保是布尔值
    };

    const response = await fetch(loginApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY 
      },
      body: JSON.stringify(payload)
    });

    // FIX: Handle empty or invalid JSON response safely
    const text = await response.text();
    
    if (!text) {
        return { code: -1, msg: `服务器未返回任何数据 (Status: ${response.status})` };
    }

    let result: any;
    try {
        result = JSON.parse(text);
    } catch (e) {
        console.error("原始错误响应:", text);
        return { code: -1, msg: `服务器响应格式异常` };
    }

    return result as LoginResponse;

  } catch (err: any) {
    console.error('API 请求异常:', err);
    throw new Error(err.message || '连接服务器失败，请检查网络或隧道状态。');
  }
}

/**
 * Step 1: 物理文件上传
 * API: POST /api/files
 */
export async function uploadFileService(file: File): Promise<UploadResponse> { 
  try {
    const baseUrl = await getDynamicBaseUrl();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${baseUrl}/api/files`, {
      method: 'POST',
      headers: {
        'X-API-KEY': API_KEY
        // 注意: FormData 不应手动设置 Content-Type，浏览器会自动处理 boundary
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed (${response.status}): ${errorText}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('File upload error:', error);
    throw error;
  }
}

/**
 * Step 2: 绑定头像数据到员工
 * API: POST /api/employees/update-avatar
 */
export async function updateEmployeeAvatarService(empId: string | number, fileId: string, fileUrl: string): Promise<any> {
  try {
    const baseUrl = await getDynamicBaseUrl();
    
    const payload = {
      empId: String(empId), // 确保转为字符串
      fileId: fileId,
      fileUrl: fileUrl
    };

    console.log("正在绑定头像...", payload); // 🔍 调试日志

    const response = await fetch(`${baseUrl}/api/employees/update-avatar`, {
      method: 'POST', // 🟢 【必须是 POST】
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Avatar update failed (${response.status}): ${errorText}`);
    }
    
    // 如果后端有返回 JSON，解析并返回
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return {};
    }
  } catch (error: any) {
    console.error('绑定请求失败:', error);
    throw error;
  }
}