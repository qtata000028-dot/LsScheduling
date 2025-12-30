import React from 'react';

const DreamyBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 w-full h-full bg-[#F5F5F7] overflow-hidden -z-10 isolate">
      {/* 
         Web3 / Apple Style Background 
         Base: Light Gray (#F5F5F7)
         Layer 1: Animated Mesh Gradient Blobs
         Layer 2: Noise Overlay (optional texture)
         Layer 3: Vector Grid
      */}

      {/* 1. 动态光斑 (Mesh Gradients) */}
      <div className="absolute top-[-10%] left-[-10%] w-[70vw] h-[70vw] bg-purple-300/30 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-[70vw] h-[70vw] bg-blue-300/30 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-[70vw] h-[70vw] bg-pink-300/30 rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-4000"></div>

      {/* 2. 矢量网格 (Subtle Grid) */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"
        style={{ maskImage: 'linear-gradient(to bottom, transparent, 10%, white, 90%, transparent)' }}
      ></div>
      
      {/* 3. 噪点纹理 (增加质感，防止色带) */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}>
      </div>
    </div>
  );
};

export default DreamyBackground;