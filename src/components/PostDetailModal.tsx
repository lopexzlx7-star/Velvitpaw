import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Volume2, VolumeX, User, Heart
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
  item, onClose, onLike, isLiked, currentUserUid
}) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [liked, setLiked] = useState(isLiked);
  const [showLikeAnimation, setShowLikeAnimation] = useState(false);

  const isOwnPost = currentUserUid === item.authorUid;

  // Scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleLike = () => {
    if (isOwnPost) return;
    setLiked(!liked);
    setShowLikeAnimation(true);
    onLike(item.id);
    setTimeout(() => setShowLikeAnimation(false), 600);
  };

  // Get current profile photo from localStorage (for real-time updates)
  const currentProfilePic = localStorage.getItem('velvit_profile_pic');
  const authorPhoto = item.authorUid === currentUserUid ? currentProfilePic : item.authorPhotoUrl;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Main Container */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 28, stiffness: 350 }}
        className="relative flex flex-col items-center max-w-[95vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute -top-14 right-0 z-50 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white/60 hover:text-white transition-all backdrop-blur-sm"
        >
          <X size={20} />
        </button>

        {/* Media Container with rounded corners */}
        <div className="relative rounded-3xl overflow-hidden shadow-2xl">
          {item.type === 'video' ? (
            <video
              src={item.url}
              className="max-w-[90vw] max-h-[70vh] object-contain bg-black/50"
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
              className="max-w-[90vw] max-h-[70vh] object-contain"
              referrerPolicy="no-referrer"
            />
          )}

          {/* Like Animation Overlay */}
          <AnimatePresence>
            {showLikeAnimation && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1.2, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <Heart size={80} className="text-red-500 fill-red-500 drop-shadow-lg" />
              </motion.div>
            )}
          </AnimatePresence>

          {item.type === 'video' && (
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="absolute bottom-4 right-4 p-2.5 bg-black/40 hover:bg-black/60 rounded-full text-white/80 hover:text-white backdrop-blur-md transition-all"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
        </div>

        {/* Info Bar - Glassmorphism Pill */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-5 px-4 py-3 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 flex items-center gap-3 shadow-xl"
        >
          {/* Author Photo */}
          <div className="w-9 h-9 rounded-full overflow-hidden bg-white/15 flex items-center justify-center shrink-0 border border-white/10">
            {authorPhoto ? (
              <img 
                src={authorPhoto} 
                alt={item.authorName} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User size={16} className="text-white/50" />
            )}
          </div>
          
          {/* Title & Author */}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm text-white font-semibold truncate max-w-[220px]">
              {item.title}
            </span>
            <span className="text-xs text-white/50">@{item.authorName}</span>
          </div>

          {/* Like Button - Only show if not own post */}
          {!isOwnPost && (
            <button
              onClick={handleLike}
              className="ml-2 p-2 rounded-full hover:bg-white/10 transition-all"
            >
              <motion.div
                animate={liked ? { scale: [1, 1.3, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                <Heart 
                  size={20} 
                  className={`transition-colors ${liked ? 'text-red-500 fill-red-500' : 'text-white/50 hover:text-white'}`} 
                />
              </motion.div>
            </button>
          )}
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
