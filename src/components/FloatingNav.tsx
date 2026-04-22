import { Home, Plus, User } from 'lucide-react';
import { motion } from 'framer-motion';
import React from 'react';

interface FloatingNavProps {
  activeTab: 'feed' | 'profile';
  onHomeClick: () => void;
  onAddClick: () => void;
  onProfileClick: () => void;
}

const FloatingNav: React.FC<FloatingNavProps> = ({
  activeTab,
  onHomeClick,
  onAddClick,
  onProfileClick,
}) => {
  const isHome = activeTab === 'feed';
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[120]">
      <div
        className="relative dark:bg-black/30 bg-white/30 backdrop-blur-2xl px-3 py-2.5 rounded-full flex items-center gap-1 shadow-2xl dark:shadow-black/50 border dark:border-white/10 border-black/10"
      >
        {/* Plus (action, not a tab) */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onAddClick}
          className="relative z-10 w-12 h-12 flex items-center justify-center rounded-full dark:text-white/55 text-black/55 dark:hover:text-white hover:text-black transition-colors"
          aria-label="Publicar"
        >
          <Plus size={22} />
        </motion.button>

        {/* Tabs container with animated pill */}
        <div className="relative flex items-center">
          {/* Sliding pill indicator */}
          <motion.div
            layout
            initial={false}
            animate={{ x: isHome ? 0 : 56 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="absolute top-1/2 -translate-y-1/2 left-0 w-14 h-14 rounded-full accent-primary-btn"
            style={{
              background: 'rgb(var(--accent-rgb, 255 255 255))',
              boxShadow:
                '0 8px 24px -6px rgba(var(--accent-rgb, 255 255 255), 0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          />

          {/* Home tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onHomeClick}
            className="relative z-10 w-14 h-14 flex items-center justify-center rounded-full transition-colors"
            style={{ color: isHome ? '#000' : 'rgba(255,255,255,0.55)' }}
            aria-label="Início"
          >
            <Home size={26} />
          </motion.button>

          {/* Profile tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onProfileClick}
            className="relative z-10 w-14 h-14 flex items-center justify-center rounded-full transition-colors"
            style={{ color: !isHome ? '#000' : 'rgba(255,255,255,0.55)' }}
            aria-label="Perfil"
          >
            <User size={24} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default FloatingNav;
