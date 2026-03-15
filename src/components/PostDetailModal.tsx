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
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const handleLikeClick = () => {
    onLike(item.id);
    if (!isLiked) {
      setShowLikeAnimation(true);
      setTimeout(() => setShowLikeAnimation(false), 1000);
    }
  };

  const isUserPost = item.authorUid === currentUserUid;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center dark:bg-black/80 bg-gray-900/70 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        layout
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="relative w-[95vw] max-w-4xl max-h-[90vh] dark:bg-black/20 bg-white/90 flex flex-col rounded-[2.5rem] overflow-hidden border dark:border-white/10 border-black/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-white/5 border-black/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full dark:bg-white/10 bg-black/5 overflow-hidden">
              {item.authorPhotoURL ? (
                <img src={item.authorPhotoURL} alt={item.authorName || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                   <User size={20} className="dark:text-white/50 text-black/50" />
                </div>
              )}
            </div>
            <div>
              <p className="font-bold text-sm dark:text-white text-gray-900">{item.authorName}</p>
              <p className="text-xs dark:text-white/40 text-gray-500">{new Date(item.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 dark:bg-white/5 dark:hover:bg-white/10 bg-black/5 hover:bg-black/10 rounded-full dark:text-white/50 text-black/50 hover:dark:text-white hover:text-black transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row gap-0 overflow-y-auto no-scrollbar">
          {/* Media Section */}
          <div className="w-full md:w-2/3 h-auto bg-gray-100 dark:bg-black/20 flex items-center justify-center overflow-hidden relative">
            {item.type === 'video' ? (
              <video src={item.url} className="w-full h-full object-contain" autoPlay loop muted={isMuted} playsInline />
            ) : (
              <img src={item.url} alt={item.title} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
            )}
            {item.type === 'video' && (
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="absolute bottom-4 right-4 p-3 bg-black/40 backdrop-blur-md rounded-full text-white transition-opacity hover:opacity-100 opacity-70"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
            <AnimatePresence>
                {showLikeAnimation && (
                    <motion.div
                        initial={{ scale: 0, opacity: 0, y: 0 }}
                        animate={{ scale: 1, opacity: 1, y: -60 }}
                        exit={{ opacity: 0, scale: 1.5 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute flex items-center justify-center pointer-events-none"
                    >
                        <Heart size={100} fill="#ef4444" className="text-red-500 drop-shadow-lg" />
                    </motion.div>
                )}
            </AnimatePresence>
          </div>

          {/* Info Section */}
          <div className="w-full md:w-1/3 flex flex-col p-6">
            <div className="flex-1">
              <h2 className="text-2xl font-black dark:text-white text-gray-900 tracking-tighter mb-2">{item.title}</h2>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-2 mt-auto">
                <div className="flex items-center gap-2">
                    {!isUserPost && (
                      <motion.button 
                        onClick={handleLikeClick}
                        className={`p-4 rounded-full text-white backdrop-blur-md border transition-all ${isLiked ? 'bg-red-500 border-red-400' : 'dark:bg-white/10 dark:border-white/20 dark:hover:bg-white/20 bg-black/5 border-black/10 hover:bg-black/10'}`}
                        whileTap={{ scale: 1.1 }}
                      >
                        <Heart size={20} fill={isLiked ? 'currentColor' : 'none'} className={`${isLiked ? 'text-white' : 'dark:text-white text-black'}`} />
                      </motion.button>
                    )}
                </div>
                <div className="flex items-center gap-1 dark:text-white/50 text-gray-500">
                    <Heart size={14} className={isLiked ? "text-red-500" : ""} fill={isLiked ? 'currentColor' : 'none'}/>
                    <span className="text-sm font-bold">{item.likesCount || 0}</span>
                </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
