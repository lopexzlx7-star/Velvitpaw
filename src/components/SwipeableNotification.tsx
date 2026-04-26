import React, { useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
  onClick?: () => void;
  className?: string;
}

const SWIPE_THRESHOLD = 90;

const SwipeableNotification: React.FC<Props> = ({ children, onDelete, onClick, className }) => {
  const x = useMotionValue(0);
  const [removed, setRemoved] = useState(false);
  const trashOpacity = useTransform(x, [-160, -40, 0], [1, 0.4, 0]);
  const trashScale = useTransform(x, [-160, -60, 0], [1, 0.8, 0.6]);
  const dragStartXRef = React.useRef(0);

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -SWIPE_THRESHOLD) {
      setRemoved(true);
      setTimeout(onDelete, 200);
    } else {
      x.set(0);
    }
  };

  const stopTouchPropagation = (e: React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <AnimatePresence>
      {!removed && (
        <motion.div
          layout
          exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={{ duration: 0.2 }}
          data-no-swipe="true"
          onTouchStart={stopTouchPropagation}
          onTouchMove={stopTouchPropagation}
          onTouchEnd={stopTouchPropagation}
          onPointerDown={stopTouchPropagation}
          className={`relative overflow-hidden isolate ${className ?? ''}`}
          style={{ touchAction: 'pan-y' }}
        >
          <motion.div
            className="absolute inset-0 flex items-center justify-end pr-6 bg-red-500/80 pointer-events-none"
            style={{ opacity: trashOpacity }}
          >
            <motion.div style={{ scale: trashScale }} className="text-white">
              <Trash2 size={22} />
            </motion.div>
          </motion.div>
          <motion.div
            drag="x"
            dragConstraints={{ left: -240, right: 0 }}
            dragElastic={{ left: 0.2, right: 0 }}
            dragDirectionLock
            style={{ x, touchAction: 'pan-y' }}
            onDragStart={(_, info) => { dragStartXRef.current = info.point.x; }}
            onDragEnd={handleDragEnd}
            onClick={(e) => {
              const moved = Math.abs(x.get());
              if (moved > 6) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              onClick?.();
            }}
            className="relative bg-transparent cursor-pointer hover:bg-white/5 transition-colors"
            whileTap={{ cursor: 'grabbing' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SwipeableNotification;
