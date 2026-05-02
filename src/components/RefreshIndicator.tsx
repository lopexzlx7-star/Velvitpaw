import React from 'react';

interface RefreshIndicatorProps {
  visible: boolean;
}

const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({ visible }) => {
  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: `translateX(-50%) translateY(${visible ? '0' : '-28px'})`,
        transition: 'opacity 200ms ease, transform 200ms cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div
        className="relative h-[5px] w-[72px] rounded-full overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.10)',
          boxShadow: '0 2px 8px -2px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="absolute top-0 bottom-0 w-1/2 rounded-full refresh-shimmer"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(var(--accent-rgb, 255 255 255), 0.95) 50%, transparent 100%)',
          }}
        />
      </div>
    </div>
  );
};

export default RefreshIndicator;
