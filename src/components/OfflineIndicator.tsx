import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';

const OfflineIndicator: React.FC = () => {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[400] pointer-events-none flex items-center gap-1.5 text-red-500"
          style={{ fontSize: '11px', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
          role="status"
          aria-live="polite"
        >
          <WifiOff size={12} />
          <span className="uppercase tracking-widest font-bold">Você está offline</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
