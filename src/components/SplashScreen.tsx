import React from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  visible: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300"
      style={{
        background:
          'linear-gradient(145deg, #f7fad9 0%, #e5ef96 38%, #bfd452 74%, #95b530 100%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(255, 253, 224, 0.72) 0%, rgba(255, 253, 224, 0) 65%)',
        }}
      />

      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
        className="relative z-10 mb-5 flex items-center justify-center"
      >
        <img
          src="/assets/logo-tree-transparent.png"
          alt="Логотип родового дерева"
          className="w-44 h-44 sm:w-52 sm:h-52 object-contain select-none pointer-events-none drop-shadow-[0_6px_14px_rgba(45,59,18,0.16)]"
        />
      </motion.div>

      <h1 className="relative z-10 font-serif-heritage text-3xl sm:text-4xl font-bold tracking-wide text-[#1f290e] mb-1">
        МІЙ РІД
      </h1>
      <p className="relative z-10 text-xs text-[#314114]/85 font-semibold tracking-widest uppercase mb-6">
        Хронологічне родове дерево
      </p>

      <div className="relative z-10 w-48 h-1.5 bg-[#263310]/15 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#587816] to-[#2e470c] rounded-full animate-[shimmer_1.6s_ease-in-out_infinite]"
          style={{ width: '55%' }}
        />
      </div>

      <p className="relative z-10 text-[11px] text-[#2c3a12]/75 mt-3 font-mono font-medium">
        Завантаження родинного архіву...
      </p>
    </div>
  );
};
