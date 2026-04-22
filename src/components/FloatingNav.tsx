import { Home, Plus, User } from 'lucide-react';
import { motion } from 'framer-motion';
import React from 'react';

export type NavTab = 'feed' | 'publish' | 'profile';

interface FloatingNavProps {
  activeTab: NavTab;
  onHomeClick: () => void;
  onAddClick: () => void;
  onProfileClick: () => void;
}

const TAB_ORDER: NavTab[] = ['publish', 'feed', 'profile'];
const SIZE = 56;

const FloatingNav: React.FC<FloatingNavProps> = ({
  activeTab,
  onHomeClick,
  onAddClick,
  onProfileClick,
}) => {
  const idx = Math.max(0, TAB_ORDER.indexOf(activeTab));

  const tabColor = (t: NavTab) =>
    activeTab === t ? '#000' : 'rgba(255,255,255,0.55)';

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[120]">
      <div
        className="relative dark:bg-black/30 bg-white/30 backdrop-blur-2xl px-2 py-2 rounded-full flex items-center shadow-2xl dark:shadow-black/50 border dark:border-white/10 border-black/10"
      >
        <div className="relative flex items-center">
          {/* Sliding pill */}
          <motion.div
            initial={false}
            animate={{ x: idx * SIZE }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="absolute top-1/2 -translate-y-1/2 left-0 rounded-full accent-primary-btn"
            style={{
              width: SIZE,
              height: SIZE,
              background: 'rgb(var(--accent-rgb, 255 255 255))',
              boxShadow:
                '0 8px 24px -6px rgba(var(--accent-rgb, 255 255 255), 0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          />

          {/* Plus tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onAddClick}
            className="relative z-10 flex items-center justify-center rounded-full transition-colors"
            style={{ width: SIZE, height: SIZE, color: tabColor('publish') }}
            aria-label="Publicar"
          >
            <Plus size={24} />
          </motion.button>

          {/* Home tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onHomeClick}
            className="relative z-10 flex items-center justify-center rounded-full transition-colors"
            style={{ width: SIZE, height: SIZE, color: tabColor('feed') }}
            aria-label="Início"
          >
            <Home size={26} />
          </motion.button>

          {/* Profile tab */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onProfileClick}
            className="relative z-10 flex items-center justify-center rounded-full transition-colors"
            style={{ width: SIZE, height: SIZE, color: tabColor('profile') }}
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
