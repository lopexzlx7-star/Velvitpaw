import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, Volume2, VolumeX
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full h-full flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-50 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md transition-all border border-white/10"
        >
          <X size={28} />
        </button>

        {/* Media Section */}
        <div className="w-full h-full flex items-center justify-center relative">
          {item.type === 'video' ? (
            <video
              src={item.url}
              className="max-w-full max-h-full rounded-3xl shadow-2xl"
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
              className="max-w-full max-h-full rounded-3xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
          ) : (
            <img 
              src={item.url} 
              alt={item.title}
              className="max-w-full max-h-full rounded-3xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
          )}

          {item.type === 'video' && (
            <div className="absolute bottom-10 right-10 flex gap-4">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-4 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md border border-white/10 transition-all"
              >
                {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
