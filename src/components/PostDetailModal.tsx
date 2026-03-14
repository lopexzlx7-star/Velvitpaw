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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Main Container */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 400 }}
        className="relative flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute -top-12 right-0 z-50 p-2 text-white/50 hover:text-white transition-all"
        >
          <X size={24} />
        </button>

        {/* Media */}
        <div className="relative">
          {item.type === 'video' ? (
            <video
              src={item.url}
              className="max-w-[92vw] max-h-[75vh] object-contain rounded-2xl"
              autoPlay
              loop
              muted={isMuted}
              playsInline
              onClick={() => setIsPlaying(!isPlaying)}
            />
          ) : (
            <img 
              src={item.url} 
              alt={item.title}
              className="max-w-[92vw] max-h-[75vh] object-contain rounded-2xl"
              referrerPolicy="no-referrer"
            />
          )}

          {item.type === 'video' && (
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="absolute bottom-4 right-4 p-2.5 bg-black/50 hover:bg-black/70 rounded-full text-white/80 hover:text-white backdrop-blur-sm transition-all"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
        </div>

        {/* Info Bar - Glassmorphism */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 px-4 py-2.5 bg-white/10 backdrop-blur-xl rounded-full border border-white/15 flex items-center gap-3 max-w-[90vw]"
        >
          {/* Author Photo */}
          <div className="w-7 h-7 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shrink-0">
            {item.authorPhotoUrl ? (
              <img 
                src={item.authorPhotoUrl} 
                alt={item.authorName} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User size={14} className="text-white/60" />
            )}
          </div>
          
          {/* Title & Author */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-white font-medium truncate max-w-[200px]">
              {item.title}
            </span>
            <span className="text-white/30">•</span>
            <span className="text-xs text-white/50 shrink-0">@{item.authorName}</span>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
