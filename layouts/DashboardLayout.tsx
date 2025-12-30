
import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { uploadFileService, updateEmployeeAvatarService, getBackendBaseUrl } from '../services/authService';
import { LogOut, Upload, Command, ChevronDown } from 'lucide-react';

const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>(''); 
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      navigate('/login');
      return;
    }
    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);
    
    const loadAvatar = async () => {
        const defaultAvatar = `https://ui-avatars.com/api/?name=${parsedUser.userName || 'User'}&background=random&color=fff`;
        try {
          const baseUrl = await getBackendBaseUrl();
          let finalUrl = defaultAvatar;
          if (parsedUser.fullAvatarUrl) {
            const cleanPath = parsedUser.fullAvatarUrl.startsWith('/') ? parsedUser.fullAvatarUrl : `/${parsedUser.fullAvatarUrl}`;
            finalUrl = `${baseUrl}${cleanPath}`;
          } else if (parsedUser.avatarFileId) {
            finalUrl = `${baseUrl}/api/files/${parsedUser.avatarFileId}`;
          }
          setAvatarUrl(finalUrl);
        } catch (e) {
          setAvatarUrl(defaultAvatar);
        }
    };
    loadAvatar();

    const closeMenu = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    try {
      const { id: fileId, url: fileUrl } = await uploadFileService(file);
      await updateEmployeeAvatarService(user.employeeId || user.id, fileId, fileUrl);
      const updatedUser = { ...user, avatarFileId: fileId, fullAvatarUrl: fileUrl };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      const baseUrl = await getBackendBaseUrl();
      setAvatarUrl(`${baseUrl}${fileUrl.startsWith('/') ? fileUrl : '/' + fileUrl}`);
    } catch (error) {
      alert('头像上传失败');
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen w-full font-sans text-slate-800">
      
      {/* 
          Top Navigation Bar - Upgraded Glassmorphism
          FIX: Added 'relative' to ensure z-index context works correctly with sticky positioning
      */}
      <header className="relative h-18 px-8 flex items-center justify-between z-30 sticky top-0 transition-all duration-300 pointer-events-none">
        {/* 背景层：分离出来以便做更好的模糊和渐变，不影响内容 */}
        <div className="absolute inset-x-4 top-2 bottom-0 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/40 shadow-sm shadow-slate-200/20 pointer-events-auto"></div>

        <div className="relative z-10 flex items-center justify-between w-full pointer-events-auto pl-2 pr-2">
            <div className="flex items-center gap-4">
               <div className="group w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 shadow-lg shadow-slate-900/20 flex items-center justify-center text-white cursor-pointer transition-all hover:scale-105 hover:shadow-blue-900/20">
                 <Command size={18} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-500"/>
               </div>
               <div className="flex flex-col justify-center">
                   <span className="font-black text-lg text-slate-800 tracking-tight leading-none cursor-default">
                     LSERP <span className="text-blue-600">APS</span>
                   </span>
                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">
                     智能生产排程系统
                   </span>
               </div>
            </div>

            <div className="relative" ref={dropdownRef}>
               <button 
                 onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                 className={`
                    group flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full transition-all duration-300
                    ${isUserMenuOpen ? 'bg-white/80 shadow-inner' : 'hover:bg-white/40'}
                 `}
               >
                  <div className="text-right hidden md:block">
                     <div className="text-xs font-bold text-slate-700 leading-tight group-hover:text-blue-700 transition-colors">{user.userName}</div>
                     <div className="text-[9px] text-slate-400 font-mono font-medium">{user.employeeId}</div>
                  </div>
                  <div className="relative">
                      <img src={avatarUrl} alt="avatar" className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-sm group-hover:ring-blue-100 transition-all" />
                      <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 w-2.5 h-2.5 rounded-full border-2 border-white"></div>
                  </div>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isUserMenuOpen ? 'rotate-180' : ''}`}/>
               </button>

               {isUserMenuOpen && (
                 <div className="absolute top-full right-0 mt-3 w-60 bg-white/70 backdrop-blur-2xl border border-white/60 rounded-2xl shadow-xl shadow-slate-200/50 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right">
                    <div className="px-4 py-3 border-b border-slate-100/50 mb-1">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">我的账户</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5 truncate">{user.displayName || user.userName}</p>
                    </div>
                    <div className="space-y-1 mt-1">
                        <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-blue-50/60 hover:text-blue-600 rounded-xl transition-all group">
                           <div className="p-1.5 bg-white rounded-lg shadow-sm text-slate-400 group-hover:text-blue-500 transition-colors">
                                <Upload size={14} /> 
                           </div>
                           更换头像
                        </button>
                        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50/60 rounded-xl transition-all group">
                           <div className="p-1.5 bg-white rounded-lg shadow-sm text-red-400 group-hover:text-red-500 transition-colors">
                                <LogOut size={14} /> 
                           </div>
                           退出登录
                        </button>
                    </div>
                 </div>
               )}
            </div>
        </div>
      </header>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative z-10 pt-2">
         <Outlet />
      </main>
    </div>
  );
};

export default DashboardLayout;
