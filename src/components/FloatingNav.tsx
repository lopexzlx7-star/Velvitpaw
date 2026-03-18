import { Home, Plus, User, Film } from 'lucide-react';
import { motion } from 'framer-motion';
import React from 'react';

interface FloatingNavProps {
  onHomeClick: () => void;
  onAddClick: () => void;
  onProfileClick: () => void;
  /** Opens the video-frame upload modal */
  onFrameUploadClick: () => void;
}

const FloatingNav: React.FC<FloatingNavProps> = ({
  onHomeClick,
  onAddClick,
  onProfileClick,
  onFrameUploadClick,
}) => {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <div className="dark:bg-black/20 bg-white/30 backdrop-blur-2xl px-4 py-3 rounded-full flex items-center gap-6 shadow-2xl dark:shadow-black/50 border dark:border-white/10 border-black/10">
        {/* Add Post Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onAddClick}
          className="p-2 dark:text-white/50 text-black/50 dark:hover:text-white hover:text-black transition-colors"
        >
          <Plus size={24} />
        </motion.button>

        {/* Home Button — center focal point */}
        <motion.button
          whileHover={{ scale: 1.1, y: -5 }}
          whileTap={{ scale: 0.9 }}
          onClick={onHomeClick}
          className="w-14 h-14 bg-white dark:bg-white rounded-full flex items-center justify-center text-black shadow-lg dark:shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-shadow hover:shadow-xl dark:hover:shadow-[0_0_30px_rgba(255,255,255,0.5)]"
        >
          <Home size={28} />
        </motion.button>

        {/* Frame Upload Button — sends first frame of videos to ImageKit */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onFrameUploadClick}
          className="p-2 dark:text-white/50 text-black/50 dark:hover:text-white hover:text-black transition-colors"
        >
          <Film size={24} />
        </motion.button>

        {/* Profile Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onProfileClick}
          className="p-2 dark:text-white/50 text-black/50 dark:hover:text-white hover:text-black transition-colors"
        >
          <User size={24} />
        </motion.button>
      </div>
    </div>
  );
};

export default FloatingNav;
