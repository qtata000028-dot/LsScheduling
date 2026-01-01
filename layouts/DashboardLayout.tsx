
import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { uploadFileService, updateEmployeeAvatarService, getBackendBaseUrl } from '../services/authService';

// 定义 Context 类型，以便子组件使用
export interface DashboardContextType {
  user: any;
  avatarUrl: string;
  handleLogout: () => void;
  triggerFileUpload: () => void;
}

const DashboardLayout: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>(''); 

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
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const triggerFileUpload = () => {
      fileInputRef.current?.click();
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

  // 构造 Context 对象
  const contextValue: DashboardContextType = {
      user,
      avatarUrl,
      handleLogout,
      triggerFileUpload
  };

  return (
    <div className="flex flex-col h-screen w-full font-sans text-slate-800">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      {/* Main Content Area - 全屏，无顶部 Header */}
      <main className="flex-1 overflow-hidden relative z-10">
         <Outlet context={contextValue} />
      </main>
    </div>
  );
};

export default DashboardLayout;
