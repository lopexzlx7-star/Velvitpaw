import { Home, Plus, User } from 'lucide-react';
import { motion } from 'motion/react';
import React from 'react';

interface FloatingNavProps {
  onHomeClick: () => void;
  onAddClick: () => void;
  onProfileClick: () => void;
}

const FloatingNav: React.FC<FloatingNavProps> = ({ onHomeClick, onAddClick, onProfileClick }) => {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
      <div className="glass-panel px-4 py-3 rounded-full flex items-center gap-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        {/* Add Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onAddClick}
          className="p-2 text-white/50 hover:text-white transition-colors"
        >
          <Plus size={24} />
        </motion.button>

        {/* Home Button - Center & Eye-catching */}
        <motion.button
          whileHover={{ scale: 1.1, y: -5 }}
          whileTap={{ scale: 0.9 }}
          onClick={onHomeClick}
          className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-shadow hover:shadow-[0_0_30px_rgba(255,255,255,0.5)]"
        >
          <Home size={28} />
        </motion.button>

        {/* Profile Button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onProfileClick}
          className="p-2 text-white/50 hover:text-white transition-colors"
        >
          <User size={24} />
        </motion.button>
      </div>
    </div>
  );
};

export default FloatingNav;
