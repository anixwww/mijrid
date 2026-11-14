import React from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  visible: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300 bg-gradient-to-br from-white via-[#f8faf8] to-[#eef3ef] dark:from-[#16191d] dark:via-[#111315] dark:to-[#0c0e10]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.85)_0%,rgba(4,120,87,0.06)_46%,rgba(255,255,255,0)_70%)] dark:bg-[radial-gradient(circle_at_50%_42%,rgba(16,185,129,0.12)_0%,rgba(16,185,129,0.03)_44%,rgba(17,19,21,0)_70%)]" />

      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 3.2, ease: 'easeInOut' }}
        className="relative z-10 mb-5 flex items-center justify-center"
      >
        <img
          src="/assets/logo-tree-transparent.png"
          alt="Логотип родового дерева"
          className="w-44 h-44 sm:w-52 sm:h-52 object-contain select-none pointer-events-none drop-shadow-[0_8px_18px_rgba(28,25,23,0.12)] dark:drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)]"
        />
      </motion.div>

      <h1 className="relative z-10 font-serif-heritage text-3xl sm:text-4xl font-bold tracking-wide text-stone-900 dark:text-zinc-100 mb-1">
        МІЙ РІД
      </h1>
      <p className="relative z-10 text-xs text-stone-600 dark:text-zinc-400 font-semibold tracking-widest uppercase mb-6">
        Хронологічне родове дерево
      </p>

      <div className="relative z-10 w-48 h-1.5 bg-stone-900/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 to-emerald-700 dark:from-emerald-400 dark:to-emerald-500 rounded-full animate-[shimmer_1.6s_ease-in-out_infinite]"
          style={{ width: '55%' }}
        />
      </div>

      <p className="relative z-10 text-[11px] text-stone-600 dark:text-zinc-400 mt-3 font-mono font-medium">
        Відкриття родинного архіву...
      </p>
    </div>
  );
};
