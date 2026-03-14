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
        <div className="relative p-3 pb-16">
          {item.type === 'video' ? (
            <video
              src={item.url}
              className="max-w-[85vw] max-h-[65vh] object-contain rounded-2xl"
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
              className="max-w-[85vw] max-h-[65vh] object-contain rounded-2xl"
              referrerPolicy="no-referrer"
            />
          ) : (
            <img 
              src={item.url} 
              alt={item.title}
              className="max-w-[85vw] max-h-[65vh] object-contain rounded-2xl"
              referrerPolicy="no-referrer"
            />
          )}

          {item.type === 'video' && (
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="absolute bottom-20 right-6 p-2.5 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-md border border-white/10 transition-all"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}

          {/* Post Info Footer - Compact Glassmorphism */}
          <div className="absolute bottom-3 left-3 right-3 px-4 py-2.5 bg-white/15 backdrop-blur-2xl rounded-xl border border-white/25 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium text-white truncate flex-1">
                {item.title}
              </h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center">
                  <User size={8} className="text-white/90" />
                </div>
                <span className="text-[10px] text-white/70">@{item.authorName}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
