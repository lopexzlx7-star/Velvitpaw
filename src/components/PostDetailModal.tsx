import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, Volume2, VolumeX, User
} from 'lucide-react';
import { ContentItem } from '../types';

interface PostDetailModalProps {
  item: ContentItem;
  onClose: () => void;
  onLike: (id: string) => void;
  onDelete?: (id: string) => void;
  isLiked: boolean;
  currentUserUid?: string;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ 
  item, onClose
}) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);

  // Scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl"
      onClick={onClose}
    >
      {/* Glassmorphism Bubble Container */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative max-w-[90vw] max-h-[85vh] bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[32px] overflow-hidden shadow-[0_8px_64px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/30 hover:bg-black/50 rounded-full text-white/80 hover:text-white backdrop-blur-md transition-all border border-white/10"
        >
          <X size={20} />
        </button>

        {/* Media Section */}
        <div className="relative">
          {item.type === 'video' ? (
            <video
              src={item.url}
              className="max-w-[90vw] max-h-[70vh] object-contain"
              autoPlay
              loop
              muted={isMuted}
              playsInline
              onClick={() => setIsPlaying(!isPlaying)}
            />
          ) : item.type === 'gif' ? (
            <img 
              src={item.url} 
              alt={item.title}
              className="max-w-[90vw] max-h-[70vh] object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <img 
              src={item.url} 
              alt={item.title}
              className="max-w-[90vw] max-h-[70vh] object-contain"
              referrerPolicy="no-referrer"
            />
          )}

          {item.type === 'video' && (
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="absolute bottom-4 right-4 p-3 bg-black/30 hover:bg-black/50 rounded-full text-white backdrop-blur-md border border-white/10 transition-all"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          )}
        </div>

        {/* Post Info Footer */}
        <div className="px-6 py-5 bg-gradient-to-t from-black/40 to-transparent border-t border-white/10">
          <h3 className="text-lg font-bold text-white tracking-tight mb-2 line-clamp-2">
            {item.title}
          </h3>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
              <User size={14} className="text-white/70" />
            </div>
            <span className="text-sm text-white/60">@{item.authorName}</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
