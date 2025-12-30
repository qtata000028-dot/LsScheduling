
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loginService,
  getEmployeeListService,
  Employee,
  getBackendBaseUrl,
} from '../services/authService';
import { User, Lock, ArrowRight, Loader2, X, Sparkles } from 'lucide-react';

interface SavedAccount {
  employeeId: number;
  employeeName: string;
  displayName: string;
  avatarUrl?: string;
  password?: string;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const LoginForm: React.FC = () => {
  // --- 状态管理 ---
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<number | null>(null);

  const [password, setPassword] = useState('');
  const [isConstraint, setIsConstraint] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  // Spotlight + Jelly Tilt refs
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- 初始化 ---
  useEffect(() => {
    const saved = localStorage.getItem('ls_saved_accounts');
    if (saved) {
      try {
        setSavedAccounts(JSON.parse(saved));
      } catch (e) {}
    }

    const initData = async () => {
      try {
        const list = await getEmployeeListService('');
        setAllEmployees(list || []);
        setIsDataReady(true);
      } catch (e) {
        setIsDataReady(true);
      }
    };
    initData();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Spotlight + Tilt Logic ---
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

    // 轻微 3D 倾斜（果冻感的关键：幅度小 + 回弹快）
    const px = x / rect.width; // 0..1
    const py = y / rect.height; // 0..1
    const ry = clamp((px - 0.5) * 10, -6, 6);
    const rx = clamp(-(py - 0.5) * 10, -6, 6);
    setTilt({ rx, ry });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0 });
  };

  // --- 核心交互逻辑 ---
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    setSelectedEmpId(null);

    if (!val.trim()) {
      setFilteredEmployees([]);
      setIsDropdownOpen(false);
      return;
    }

    const lowerVal = val.trim().toLowerCase();

    const matches = allEmployees.filter(
      (emp) =>
        (emp.employeeName && emp.employeeName.toLowerCase().includes(lowerVal)) ||
        (emp.pEmpNo && emp.pEmpNo.toLowerCase().includes(lowerVal)) ||
        (emp.displayName && emp.displayName.toLowerCase().includes(lowerVal))
    );

    setFilteredEmployees(matches.slice(0, 50));

    const exactMatch = matches.find(
      (e) =>
        (e.pEmpNo && e.pEmpNo.toLowerCase() === lowerVal) ||
        e.employeeName.toLowerCase() === lowerVal
    );

    if (exactMatch) {
      handleSelectEmployee(exactMatch, true);
    } else {
      setIsDropdownOpen(true);
    }
  };

  const handleSelectEmployee = (emp: Employee, autoFocusPassword = false) => {
    setSelectedEmpId(emp.employeeId);
    setSearchQuery(emp.employeeName);
    setIsDropdownOpen(false);

    const saved = savedAccounts.find((a) => a.employeeId === emp.employeeId);
    if (saved && saved.password) {
      setPassword(atob(saved.password));
      setRememberPassword(true);
    } else {
      setPassword('');
      setRememberPassword(false);
    }

    if (autoFocusPassword) {
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    } else {
      setTimeout(() => passwordInputRef.current?.focus(), 100);
    }
  };

  const handleSelectSavedAccount = (acc: SavedAccount) => {
    // 逻辑优化：如果点击的是当前已选中的账号，则取消选中并清空表单
    if (selectedEmpId === acc.employeeId) {
      handleClearInput();
      return;
    }

    setSelectedEmpId(acc.employeeId);
    setSearchQuery(acc.employeeName);
    if (acc.password) {
      setPassword(atob(acc.password));
      setRememberPassword(true);
    } else {
      setPassword('');
      setRememberPassword(false);
    }
    setErrorMessage('');
    setTimeout(() => passwordInputRef.current?.focus(), 100);
  };

  const handleRemoveSavedAccount = (e: React.MouseEvent, empId: number) => {
    e.stopPropagation();
    const newAccounts = savedAccounts.filter((a) => a.employeeId !== empId);
    setSavedAccounts(newAccounts);
    localStorage.setItem('ls_saved_accounts', JSON.stringify(newAccounts));
    if (selectedEmpId === empId) {
      handleClearInput();
    }
  };

  const handleClearInput = () => {
    setSearchQuery('');
    setSelectedEmpId(null);
    setPassword('');
    setFilteredEmployees([]);
    setErrorMessage('');
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const handleLogin = async (e: React.FormEvent, forceConstraintOverride?: boolean) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!selectedEmpId) {
      setErrorMessage('请先输入工号或姓名');
      searchInputRef.current?.focus();
      return;
    }

    setIsLoading(true);
    const currentConstraint =
      forceConstraintOverride !== undefined ? forceConstraintOverride : isConstraint;

    try {
      const result = await loginService(selectedEmpId, password, currentConstraint);

      if (result.code === 0) {
        const userInfo = {
          id: selectedEmpId,
          employeeId: selectedEmpId,
          userName: result.userName || searchQuery,
          ...result,
        };
        localStorage.setItem('user', JSON.stringify(userInfo));
        if (result.token) localStorage.setItem('token', result.token);

        let realAvatarUrl = undefined;
        if (result.fullAvatarUrl) {
          const baseUrl = await getBackendBaseUrl();
          const cleanPath = result.fullAvatarUrl.startsWith('/')
            ? result.fullAvatarUrl
            : `/${result.fullAvatarUrl}`;
          realAvatarUrl = `${baseUrl}${cleanPath}`;
        }
        updateSavedAccounts(selectedEmpId, userInfo.userName, searchQuery, realAvatarUrl);
        navigate('/dashboard', { replace: true });
      } else if (result.code === 2) {
        const confirmKick = window.confirm(
          `${result.error || '该账号已在别处登录'}，是否强制踢下线并登录？`
        );
        if (confirmKick) {
          setIsConstraint(true);
          await handleLogin(null as any, true);
        } else {
          setIsLoading(false);
        }
      } else {
        setErrorMessage(result.msg || result.error || '登录失败，请检查密码');
        setIsLoading(false);
      }
    } catch (error: any) {
      setErrorMessage(error.message || '系统连接异常');
      setIsLoading(false);
    }
  };

  const updateSavedAccounts = (
    empId: number,
    name: string,
    rawName: string,
    realAvatarUrl?: string
  ) => {
    let newAccounts = [...savedAccounts];
    const existingIndex = newAccounts.findIndex((a) => a.employeeId === empId);

    const accountData: SavedAccount = {
      employeeId: empId,
      employeeName: rawName,
      displayName: name,
      avatarUrl:
        realAvatarUrl ||
        `https://ui-avatars.com/api/?name=${name}&background=random&color=fff&rounded=true`,
      password: rememberPassword ? btoa(password) : undefined,
    };

    if (existingIndex > -1) newAccounts[existingIndex] = accountData;
    else newAccounts.unshift(accountData);

    setSavedAccounts(newAccounts.slice(0, 5));
    localStorage.setItem('ls_saved_accounts', JSON.stringify(newAccounts));
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans">
      {/* 背景：动态渐变 Mesh + 浮动光团 + 噪点（高级感三件套） */}
      <div className="absolute inset-0 bg-mesh" />
      <div className="absolute inset-0 noise" />
      <div className="absolute -top-24 -left-24 blob blob-1" />
      <div className="absolute top-1/3 -right-28 blob blob-2" />
      <div className="absolute -bottom-28 left-1/3 blob blob-3" />

      {/* 中心布局 */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6">
        {/* 外层容器：移除了 active:scale 和 hover:scale 效果 */}
        <div
          className="
            group/card w-[520px] max-w-full
            transition-transform duration-500
          "
          style={{
            transformOrigin: 'center',
          }}
        >
          {/* 内层：3D tilt（跟随鼠标，增强高级感） */}
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="glass-card relative rounded-[2.75rem] overflow-hidden"
            style={{
              transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
            }}
          >
            {/* 玻璃边缘高光 */}
            <div className="pointer-events-none absolute inset-0 glass-rim" />

            {/* Spotlight Layer（你原来的聚光灯我保留并加强） */}
            <div
              className="pointer-events-none absolute -inset-px opacity-0 group-hover/card:opacity-100 transition duration-300"
              style={{
                background: `radial-gradient(720px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.18), transparent 42%)`,
              }}
            />

            {/* 顶部流光 sheen（更“高级”的玻璃反射） */}
            <div className="pointer-events-none absolute inset-0 sheen" />

            {/* 内容 */}
            <div className="relative p-10 sm:p-11 flex flex-col items-center">
              {/* Logo 区：玻璃徽章 + 微呼吸 */}
              <div className="mb-9 text-center">
                <div className="brand-badge mb-5">
                  <Sparkles className="w-8 h-8" strokeWidth={2} />
                </div>

                <h1 className="text-[34px] font-black tracking-tight text-slate-900/90">
                  LSERP{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                    APS
                  </span>
                </h1>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-700/50">
                  Intelligent Scheduling
                </p>
              </div>

              {/* 历史头像 */}
              {savedAccounts.length > 0 && (
                <div className="flex justify-center gap-3.5 mb-9 w-full">
                  {savedAccounts.slice(0, 3).map((acc) => (
                    <div
                      key={acc.employeeId}
                      className="group/avatar relative flex flex-col items-center cursor-pointer transition-transform hover:-translate-y-1"
                      onClick={() => handleSelectSavedAccount(acc)}
                    >
                      <div
                        className={`
                          w-12 h-12 rounded-full p-0.5 transition-all duration-300
                          ${
                            selectedEmpId === acc.employeeId
                              ? 'bg-gradient-to-tr from-blue-400 to-indigo-500 shadow-lg ring-2 ring-blue-100'
                              : 'bg-white/30 hover:bg-white/45 ring-1 ring-white/25'
                          }
                        `}
                      >
                        <img
                          src={acc.avatarUrl}
                          alt={acc.displayName}
                          className="w-full h-full rounded-full object-cover border border-white/45"
                        />
                      </div>

                      <button
                        onClick={(e) => handleRemoveSavedAccount(e, acc.employeeId)}
                        className="
                          absolute -top-1 -right-1
                          rounded-full p-0.5
                          bg-white/80 text-slate-500
                          opacity-0 group-hover/avatar:opacity-100
                          hover:bg-red-500 hover:text-white
                          transition-all scale-90
                          shadow
                        "
                      >
                        <X size={10} strokeWidth={3} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={(e) => handleLogin(e)} className="w-full space-y-5">
                {/* 账号输入 */}
                <div className="relative" ref={dropdownRef}>
                  <div className="relative group/input">
                    <User className="icon-left" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="工号 / 姓名"
                      className="glass-input"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onClick={() => {
                        if (filteredEmployees.length > 0) setIsDropdownOpen(true);
                      }}
                      autoComplete="off"
                    />

                    {/* 清空按钮：仅当有内容时显示 */}
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={handleClearInput}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400/60 hover:text-slate-600 p-1 rounded-full hover:bg-slate-500/10 transition-all z-20"
                            title="清空"
                        >
                            <X size={14} strokeWidth={3} />
                        </button>
                    )}

                    <div className="input-glow" />
                  </div>

                  {isDropdownOpen && (
                    <div className="dropdown-panel">
                      {filteredEmployees.map((emp) => (
                        <div
                          key={emp.employeeId}
                          onClick={() => handleSelectEmployee(emp)}
                          className="dropdown-item"
                        >
                          <span className="font-bold text-slate-900/80">
                            {emp.displayName || emp.employeeName}
                          </span>
                          <span className="tag-mono">{emp.pEmpNo}</span>
                        </div>
                      ))}
                      {filteredEmployees.length === 0 && (
                        <div className="p-3 text-center text-slate-500/70 text-xs">
                          无匹配结果
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 密码输入 */}
                <div className="relative group/input">
                  <Lock className="icon-left" />
                  <input
                    ref={passwordInputRef}
                    type="password"
                    placeholder="请输入密码"
                    className="glass-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="input-glow" />
                </div>

                {/* 选项 - 双列卡片式布局 */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  {/* 记住密码 */}
                  <label 
                    className={`
                      relative flex items-center justify-center gap-3 p-3.5 rounded-2xl border cursor-pointer select-none transition-all duration-300 group
                      ${rememberPassword 
                        ? 'bg-blue-50/40 border-blue-200 shadow-sm' 
                        : 'bg-white/20 border-white/20 hover:bg-white/40 hover:border-white/40'
                      }
                    `}
                  >
                    <div className={`
                      w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300
                      ${rememberPassword
                        ? 'bg-blue-600 border-blue-600 scale-110 shadow-md shadow-blue-500/30'
                        : 'bg-white/40 border-slate-300/60 group-hover:border-blue-400/70'
                      }
                    `}>
                      {rememberPassword && (
                         <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                         </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={rememberPassword}
                      onChange={(e) => setRememberPassword(e.target.checked)}
                      className="hidden"
                    />
                    <span className={`text-sm font-bold transition-colors ${rememberPassword ? 'text-blue-700' : 'text-slate-600 group-hover:text-slate-800'}`}>
                      记住密码
                    </span>
                  </label>

                  {/* 强制登录 */}
                  <label 
                    className={`
                      relative flex items-center justify-center gap-3 p-3.5 rounded-2xl border cursor-pointer select-none transition-all duration-300 group
                      ${isConstraint 
                        ? 'bg-red-50/40 border-red-200 shadow-sm' 
                        : 'bg-white/20 border-white/20 hover:bg-white/40 hover:border-white/40'
                      }
                    `}
                  >
                    <div className={`
                      w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-300
                      ${isConstraint
                        ? 'bg-red-500 border-red-500 scale-110 shadow-md shadow-red-500/30'
                        : 'bg-white/40 border-slate-300/60 group-hover:border-red-400/70'
                      }
                    `}>
                      {isConstraint && (
                         <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                         </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={isConstraint}
                      onChange={(e) => setIsConstraint(e.target.checked)}
                      className="hidden"
                    />
                    <span className={`text-sm font-bold transition-colors ${isConstraint ? 'text-red-600' : 'text-slate-600 group-hover:text-slate-800'}`}>
                      强制登录
                    </span>
                  </label>
                </div>

                {/* 登录按钮：果冻按压 + 流光 + 更精致阴影 */}
                <button
                  type="submit"
                  disabled={isLoading || !isDataReady}
                  className="login-btn"
                >
                  <div className="btn-sheen" />
                  {isLoading ? (
                    <Loader2 className="animate-spin w-5 h-5" />
                  ) : (
                    <>
                      进入系统{' '}
                      <ArrowRight className="w-4 h-4 btn-arrow" />
                    </>
                  )}
                </button>

                {/* 错误提示：轻抖动 + 玻璃提示条 */}
                {errorMessage && (
                  <div className="error-toast">
                    {errorMessage}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 text-slate-200/40 text-[10px] font-mono tracking-[0.32em] mix-blend-overlay pointer-events-none select-none">
          DESIGNED FOR EFFICIENCY
        </div>

        {/* 样式（继续沿用你原本 style 内联方式，只是更系统化） */}
        <style>{`
          /* ---------- 背景：mesh + noise + blobs ---------- */
          .bg-mesh{
            background:
              radial-gradient(1200px 800px at 10% 10%, rgba(59,130,246,0.35), transparent 55%),
              radial-gradient(900px 700px at 90% 20%, rgba(99,102,241,0.28), transparent 55%),
              radial-gradient(900px 700px at 40% 95%, rgba(16,185,129,0.18), transparent 60%),
              linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.55));
            animation: meshShift 10s ease-in-out infinite alternate;
          }
          @keyframes meshShift{
            from{ filter: hue-rotate(0deg) saturate(1.05); transform: scale(1); }
            to{ filter: hue-rotate(12deg) saturate(1.15); transform: scale(1.02); }
          }
          .noise{
            opacity: .18;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E");
            mix-blend-mode: overlay;
          }
          .blob{
            width: 520px; height: 520px;
            border-radius: 999px;
            filter: blur(40px);
            opacity: .45;
            transform: translateZ(0);
            animation: blobFloat 12s ease-in-out infinite;
          }
          .blob-1{ background: radial-gradient(circle at 30% 30%, rgba(59,130,246,.7), transparent 60%); }
          .blob-2{ background: radial-gradient(circle at 30% 30%, rgba(99,102,241,.65), transparent 60%); animation-duration: 14s; }
          .blob-3{ background: radial-gradient(circle at 30% 30%, rgba(16,185,129,.45), transparent 60%); animation-duration: 16s; }
          @keyframes blobFloat{
            0%{ transform: translate3d(0,0,0) scale(1); }
            50%{ transform: translate3d(20px,-18px,0) scale(1.04); }
            100%{ transform: translate3d(-10px,16px,0) scale(1); }
          }

          /* ---------- 卡片：玻璃系统 ---------- */
          .glass-card{
            background: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.22);
            box-shadow:
              0 30px 70px -25px rgba(15,23,42,0.18),
              0 18px 40px -28px rgba(59,130,246,0.18);
            backdrop-filter: blur(28px) saturate(1.25);
            -webkit-backdrop-filter: blur(28px) saturate(1.25);
            transition: transform 360ms cubic-bezier(0.22, 1.4, 0.36, 1), box-shadow 360ms ease;
            will-change: transform;
          }
          .glass-rim{
            background:
              linear-gradient(135deg, rgba(255,255,255,0.35), rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.15));
            opacity: .55;
            mask-image: radial-gradient(closest-side, transparent 76%, #000 100%);
          }
          .sheen{
            background: linear-gradient(115deg,
              transparent 0%,
              rgba(255,255,255,0.12) 22%,
              rgba(255,255,255,0.02) 52%,
              transparent 72%);
            transform: translateX(-30%);
            opacity: .35;
            animation: sheenSlow 6s ease-in-out infinite;
          }
          @keyframes sheenSlow{
            0%,100%{ transform: translateX(-30%); }
            50%{ transform: translateX(12%); }
          }

          /* ---------- 果冻交互曲线 ---------- */
          .jelly-ease{
            transition-timing-function: cubic-bezier(0.22, 1.4, 0.36, 1);
          }

          /* ---------- Logo Badge ---------- */
          .brand-badge{
            width: 68px; height: 68px;
            border-radius: 22px;
            display:flex; align-items:center; justify-content:center;
            color: rgb(37 99 235);
            background: linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.10));
            border: 1px solid rgba(255,255,255,0.35);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 18px 40px -26px rgba(37,99,235,0.35);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            animation: breathe 3.5s ease-in-out infinite;
          }
          @keyframes breathe{
            0%,100%{ transform: translateY(0) scale(1); }
            50%{ transform: translateY(-2px) scale(1.02); }
          }

          /* ---------- 输入框 ---------- */
          .icon-left{
            position:absolute; left: 16px; top:50%;
            transform: translateY(-50%);
            width: 20px; height: 20px;
            color: rgba(51,65,85,0.55);
            transition: color 200ms ease;
          }
          .group\\/input:focus-within .icon-left{
            color: rgba(37,99,235,0.9);
          }
          .glass-input{
            width: 100%;
            padding: 14px 38px 14px 48px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.35);
            background: rgba(255,255,255,0.34);
            color: rgba(15,23,42,0.86);
            font-weight: 600;
            outline: none;
            transition: all 220ms ease;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.55);
          }
          .glass-input::placeholder{ color: rgba(51,65,85,0.45); font-weight: 600; }
          .group\\/input:focus-within .glass-input{
            background: rgba(255,255,255,0.62);
            border-color: rgba(59,130,246,0.35);
            box-shadow:
              0 0 0 6px rgba(59,130,246,0.10),
              inset 0 1px 0 rgba(255,255,255,0.6);
          }
          .input-glow{
            pointer-events: none;
            position: absolute;
            inset: -1px;
            border-radius: 18px;
            opacity: 0;
            transition: opacity 220ms ease;
            background: radial-gradient(400px circle at 50% 0%, rgba(59,130,246,0.16), transparent 55%);
          }
          .group\\/input:focus-within .input-glow{ opacity: 1; }

          /* ---------- 下拉 ---------- */
          .dropdown-panel{
            position:absolute;
            top: calc(100% + 10px);
            left: 0; right: 0;
            border-radius: 16px;
            background: rgba(255,255,255,0.80);
            border: 1px solid rgba(255,255,255,0.55);
            backdrop-filter: blur(18px);
            -webkit-backdrop-filter: blur(18px);
            box-shadow: 0 24px 60px -35px rgba(15,23,42,0.35);
            max-height: 220px;
            overflow-y: auto;
            z-index: 50;
            padding: 6px 0;
            animation: popIn 180ms ease-out;
            transform-origin: top;
          }
          @keyframes popIn{
            from{ opacity: 0; transform: translateY(-4px) scale(.98); }
            to{ opacity: 1; transform: translateY(0) scale(1); }
          }
          .dropdown-item{
            padding: 10px 16px;
            display:flex;
            justify-content: space-between;
            align-items: center;
            cursor:pointer;
            font-size: 13px;
            color: rgba(51,65,85,0.75);
            transition: background 150ms ease;
          }
          .dropdown-item:hover{
            background: rgba(59,130,246,0.10);
          }
          .tag-mono{
            font-size: 10px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            background: rgba(15,23,42,0.06);
            padding: 2px 6px;
            border-radius: 8px;
            color: rgba(51,65,85,0.55);
          }

          /* ---------- 登录按钮 ---------- */
          .login-btn{
            position: relative;
            overflow: hidden;
            width: 100%;
            padding: 14px 0;
            border-radius: 16px;
            font-weight: 800;
            color: white;
            letter-spacing: .02em;
            background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95));
            box-shadow:
              0 26px 60px -36px rgba(15,23,42,0.55),
              0 18px 50px -42px rgba(37,99,235,0.55);
            transition: transform 240ms cubic-bezier(0.22, 1.4, 0.36, 1), box-shadow 240ms ease, filter 240ms ease;
            display:flex;
            justify-content:center;
            align-items:center;
            gap: 10px;
            margin-top: 10px;
          }
          .login-btn:hover{
            transform: translateY(-1px) scale(1.012);
            filter: saturate(1.05);
            box-shadow:
              0 30px 70px -40px rgba(15,23,42,0.65),
              0 22px 60px -46px rgba(37,99,235,0.65);
          }
          .login-btn:active{
            transform: translateY(1px) scale(0.985);
          }
          .login-btn:disabled{
            opacity: .55;
            cursor: not-allowed;
            transform: none;
            filter: none;
          }
          .btn-sheen{
            position:absolute;
            inset: 0;
            transform: translateX(-120%);
            background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.22) 40%, transparent 70%);
            transition: transform 600ms ease;
          }
          .login-btn:hover .btn-sheen{
            transform: translateX(120%);
          }
          .btn-arrow{
            transition: transform 200ms ease;
          }
          .login-btn:hover .btn-arrow{
            transform: translateX(4px);
          }

          /* ---------- 错误提示 ---------- */
          .error-toast{
            text-align:center;
            color: rgba(220,38,38,0.92);
            font-size: 12px;
            font-weight: 800;
            padding: 10px 12px;
            border-radius: 14px;
            background: rgba(254,226,226,0.55);
            border: 1px solid rgba(254,202,202,0.55);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            animation: shake 520ms cubic-bezier(.36,.07,.19,.97) both;
          }
          @keyframes shake{
            10%, 90% { transform: translate3d(-1px, 0, 0); }
            20%, 80% { transform: translate3d(2px, 0, 0); }
            30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
            40%, 60% { transform: translate3d(4px, 0, 0); }
          }

          /* ---------- 无障碍：减少动效 ---------- */
          @media (prefers-reduced-motion: reduce){
            .bg-mesh, .blob, .sheen, .brand-badge { animation: none !important; }
            .glass-card, .login-btn, .jelly-ease { transition: none !important; }
          }

          /* scrollbar */
          .dropdown-panel::-webkit-scrollbar { width: 4px; }
          .dropdown-panel::-webkit-scrollbar-track { background: transparent; }
          .dropdown-panel::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.7); border-radius: 2px; }
        `}</style>
      </div>
    </div>
  );
};

export default LoginForm;
