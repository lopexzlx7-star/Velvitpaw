import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Volume2, VolumeX, Heart, User } from 'lucide-react';
import { ContentItem } from '../types';

interface PostDetailModalProps {
  item: ContentItem;
  onClose: () => void;
  onLike: (id: string) => void;
  onDelete?: (id: string) => void;
  isLiked: boolean;
  currentUserUid?: string;
  currentUserProfilePic?: string;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({
  item,
  onClose,
  onLike,
  isLiked,
  currentUserUid,
  currentUserProfilePic,
}) => {
  const [isMuted, setIsMuted] = useState(true);
  const [likeAnim, setLikeAnim] = useState(false);

  const isOwn = currentUserUid && item.authorUid === currentUserUid;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleLike = () => {
    if (isOwn) return;
    onLike(item.id);
    if (!isLiked) {
      setLikeAnim(true);
      setTimeout(() => setLikeAnim(false), 700);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
      onClick={onClose}
    >
      {/* Blurred dark backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl" />

      {/* Glass bubble */}
      <motion.div
        initial={{ scale: 0.88, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-[2.5rem]"
        style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
        }}
      >
        {/* Inner glow top highlight */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-t-[2.5rem] pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2.5 rounded-2xl transition-all hover:scale-110 active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <X size={18} className="text-white/80" />
        </button>

        {/* Media */}
        <div className="relative overflow-hidden rounded-t-[2.5rem]">
          {item.type === 'video' ? (
            <video
              src={item.url}
              className="w-full object-cover"
              style={{ maxHeight: '65vh' }}
              autoPlay
              loop
              muted={isMuted}
              playsInline
            />
          ) : (
            <img
              src={item.url}
              alt={item.title}
              className="w-full object-cover"
              style={{ maxHeight: '65vh' }}
              referrerPolicy="no-referrer"
            />
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

          {/* Double-tap like overlay animation */}
          <AnimatePresence>
            {likeAnim && (
              <motion.div
                initial={{ scale: 0.4, opacity: 1 }}
                animate={{ scale: 1.4, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <Heart size={80} className="text-white fill-white drop-shadow-2xl" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Video mute toggle */}
          {item.type === 'video' && (
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="absolute bottom-4 right-4 p-2.5 rounded-full transition-all hover:scale-110"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.20)',
                backdropFilter: 'blur(10px)',
              }}
            >
              {isMuted ? <VolumeX size={16} className="text-white/80" /> : <Volume2 size={16} className="text-white/80" />}
            </button>
          )}
        </div>

        {/* Info bar */}
        <div
          className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Author info */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)' }}
            >
              {(isOwn ? currentUserProfilePic : item.authorProfilePic) ? (
                <img
                  src={(isOwn ? currentUserProfilePic : item.authorProfilePic) as string}
                  alt={item.authorName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User size={16} className="text-white/50" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate leading-tight">{item.title || 'Sem título'}</p>
              <p className="text-white/40 text-[10px] uppercase tracking-widest truncate">
                @{item.authorName || 'user'}
              </p>
            </div>
          </div>

          {/* Like button — hidden for own posts */}
          {!isOwn && (
            <motion.button
              onClick={handleLike}
              whileTap={{ scale: 0.82 }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl transition-colors shrink-0"
              style={{
                background: isLiked ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${isLiked ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.12)'}`,
              }}
            >
              <motion.div
                animate={isLiked ? { scale: [1, 1.4, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                <Heart
                  size={15}
                  className={isLiked ? 'text-red-400 fill-red-400' : 'text-white/60'}
                />
              </motion.div>
              <span className={`text-[11px] font-bold tabular-nums ${isLiked ? 'text-red-400' : 'text-white/50'}`}>
                {(item as any).likesCount || 0}
              </span>
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
