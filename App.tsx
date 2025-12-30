import React from 'react';
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';

// Layouts & Components
import DreamyBackground from './components/DreamyBackground';
import LoginForm from './components/LoginForm';
import DashboardLayout from './layouts/DashboardLayout';

// Views
import Steps from './views/Steps';

// --- 路由配置 ---
const router = createHashRouter([
  {
    path: '/',
    // 根路径默认重定向到 dashboard
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    element: (
      <div className="relative w-screen h-screen flex justify-center items-center overflow-hidden">
        <DreamyBackground />
        <LoginForm />
      </div>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <div className="relative w-screen h-screen overflow-hidden">
         {/* 复用 DreamyBackground 作为 Dashboard 的底层背景 */}
         <DreamyBackground />
         <DashboardLayout />
      </div>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="steps" replace />, 
      },
      {
        path: 'steps',
        element: <Steps />,
      },
    ],
  },
]);

const App: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default App;