import React from 'react';
import { motion } from 'framer-motion';
import { Hash } from 'lucide-react';
import { HashtagCategory } from '../types';

interface Props {
  category: HashtagCategory;
  onClick: () => void;
}

const HashtagCategoryCard: React.FC<Props> = ({ category, onClick }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative shrink-0 w-32 h-44 rounded-2xl overflow-hidden group"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {category.coverImage ? (
        <img
          src={category.coverImage}
          alt={category.name}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Hash size={40} className="text-white/20" />
        </div>
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.85) 100%)',
        }}
      />
      <div className="absolute bottom-0 left-0 right-0 p-2.5 flex flex-col items-start text-left">
        <span className="text-white font-bold text-sm tracking-tight truncate w-full">
          #{category.name}
        </span>
        <span className="text-white/70 text-[10px] mt-0.5">
          {category.count} {category.count === 1 ? 'post' : 'posts'}
        </span>
      </div>
    </motion.button>
  );
};

export default HashtagCategoryCard;
