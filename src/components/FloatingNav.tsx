import { Home, Plus, User } from 'lucide-react';
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
        className="relative dark:bg-black/30 bg-white/30 backdrop-blur-sm px-2 py-2 rounded-full flex items-center shadow-xl dark:shadow-black/50 border dark:border-white/10 border-black/10"
      >
        <div className="relative flex items-center">
          {/* Sliding pill — pure CSS transition */}
          <div
            className="absolute top-1/2 -translate-y-1/2 left-0 rounded-full accent-primary-btn nav-pill"
            style={{
              width: SIZE,
              height: SIZE,
              transform: `translateY(-50%) translateX(${idx * SIZE}px)`,
              transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1)',
              background: 'rgb(var(--accent-rgb, 255 255 255))',
              boxShadow:
                '0 4px 14px -4px rgba(var(--accent-rgb, 255 255 255), 0.5)',
            }}
          />

          {/* Plus tab */}
          <button
            onClick={onAddClick}
            className="relative z-10 flex items-center justify-center rounded-full transition-colors active:scale-90"
            style={{ width: SIZE, height: SIZE, color: tabColor('publish') }}
            aria-label="Publicar"
          >
            <Plus size={24} />
          </button>

          {/* Home tab */}
          <button
            onClick={onHomeClick}
            className="relative z-10 flex items-center justify-center rounded-full transition-colors active:scale-90"
            style={{ width: SIZE, height: SIZE, color: tabColor('feed') }}
            aria-label="Início"
          >
            <Home size={26} />
          </button>

          {/* Profile tab */}
          <button
            onClick={onProfileClick}
            className="relative z-10 flex items-center justify-center rounded-full transition-colors active:scale-90"
            style={{ width: SIZE, height: SIZE, color: tabColor('profile') }}
            aria-label="Perfil"
          >
            <User size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FloatingNav;
