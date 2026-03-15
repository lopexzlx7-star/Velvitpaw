import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Volume2, 
  VolumeX, 
  Heart,
  User,
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
  item, 
  onClose,
  onLike,
  isLiked,
  currentUserUid
}) => {
  const [isMuted, setIsMuted] = useState(true);
  const [localIsLiked, setLocalIsLiked] = useState(isLiked);
  const [localLikesCount, setLocalLikesCount] = useState(item.likesCount || 0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    setLocalIsLiked(isLiked);
    setLocalLikesCount(item.likesCount || 0);
  }, [isLiked, item.likesCount]);

  const handleLikeClick = () => {
    onLike(item.id);
    setLocalIsLiked(!localIsLiked);
    setLocalLikesCount(prev => localIsLiked ? prev - 1 : prev + 1);
  };

  const isUserPost = item.authorUid === currentUserUid;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        layout
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="relative w-[95vw] max-w-4xl max-h-[90vh] glass-panel flex flex-col rounded-[2.5rem] overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden">
              {item.authorPhotoUrl ? (
                <img src={item.authorPhotoUrl} alt={item.authorName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                   <User size={20} className="text-white/50" />
                </div>
              )}
            </div>
            <div>
              <p className="font-bold text-sm text-white">{item.authorName}</p>
              <p className="text-xs text-white/40">{new Date(item.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row gap-0 overflow-y-auto no-scrollbar">
          {/* Media Section */}
          <div className="w-full md:w-2/3 h-auto bg-black/20 flex items-center justify-center overflow-hidden relative">
            {item.type === 'video' ? (
              <video
                src={item.url}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted={isMuted}
                playsInline
              />
            ) : (
              <img 
                src={item.url} 
                alt={item.title}
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            {item.type === 'video' && (
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="absolute bottom-4 right-4 p-3 bg-black/40 backdrop-blur-md rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
          </div>

          {/* Info Section */}
          <div className="w-full md:w-1/3 flex flex-col p-6">
            <div className="flex-1">
              <h2 className="text-2xl font-black text-white tracking-tighter mb-2">{item.title}</h2>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-2">
                    {!isUserPost && (
                      <motion.button 
                        onClick={handleLikeClick}
                        className={`p-4 rounded-full text-white backdrop-blur-md border transition-all ${localIsLiked ? 'bg-red-500 border-red-400' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
                        whileTap={{ scale: 1.1 }}
                      >
                        <Heart size={20} fill={localIsLiked ? 'currentColor' : 'none'} />
                      </motion.button>
                    )}
                </div>
                <div className="flex items-center gap-1 text-white/50">
                    <Heart size={14} className={localIsLiked ? "text-red-500" : ""} fill={localIsLiked ? 'currentColor' : 'none'}/>
                    <span className="text-sm font-bold">{localLikesCount}</span>
                </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
