import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';

interface RefreshIndicatorProps {
  visible: boolean;
}

const RefreshIndicator: React.FC<RefreshIndicatorProps> = ({ visible }) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="refresh-indicator"
          initial={{ y: -28, opacity: 0, scaleX: 0.4 }}
          animate={{ y: 0, opacity: 1, scaleX: 1 }}
          exit={{ y: -28, opacity: 0, scaleX: 0.2 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
          style={{ transformOrigin: 'center' }}
        >
          <div
            className="relative h-[5px] w-[72px] rounded-full overflow-hidden backdrop-blur-md"
            style={{
              background: 'rgba(255,255,255,0.10)',
              boxShadow:
                '0 4px 18px -4px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            <motion.div
              className="absolute top-0 bottom-0 w-1/2 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(var(--accent-rgb, 255 255 255), 0.95) 50%, transparent 100%)',
              }}
              initial={{ x: '-110%' }}
              animate={{ x: '210%' }}
              transition={{
                duration: 0.9,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RefreshIndicator;
