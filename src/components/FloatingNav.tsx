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
        className="dark:bg-black/30 bg-white/30 backdrop-blur-sm px-2 py-2 rounded-full shadow-xl dark:shadow-black/50 border dark:border-white/10 border-black/10"
        style={{ position: 'relative' }}
      >
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {/* Sliding pill — pure CSS transition, no Tailwind transform conflicts */}
          <div
            className="accent-primary-btn"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: SIZE,
              height: SIZE,
              borderRadius: '50%',
              transform: `translateX(${idx * SIZE}px)`,
              transition: 'transform 220ms cubic-bezier(0.34,1.56,0.64,1)',
              boxShadow:
                '0 4px 14px -4px rgba(var(--accent-rgb, 255 255 255), 0.5)',
              pointerEvents: 'none',
            }}
          />

          {/* Plus tab */}
          <button
            onClick={onAddClick}
            style={{ position: 'relative', zIndex: 10, width: SIZE, height: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: tabColor('publish') }}
            className="transition-colors active:scale-90"
            aria-label="Publicar"
          >
            <Plus size={24} />
          </button>

          {/* Home tab */}
          <button
            onClick={onHomeClick}
            style={{ position: 'relative', zIndex: 10, width: SIZE, height: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: tabColor('feed') }}
            className="transition-colors active:scale-90"
            aria-label="Início"
          >
            <Home size={26} />
          </button>

          {/* Profile tab */}
          <button
            onClick={onProfileClick}
            style={{ position: 'relative', zIndex: 10, width: SIZE, height: SIZE, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: tabColor('profile') }}
            className="transition-colors active:scale-90"
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
