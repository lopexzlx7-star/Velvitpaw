import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Heart, User } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ContentItem } from '../types';

interface PostDetailModalProps {
  item: ContentItem;
  onClose: () => void;
  onLike: (id: string) => void;
  onDelete?: (id: string) => void;
  isLiked: boolean;
  currentUserUid?: string;
}

interface FloatingHeart {
  id: number;
  x: number;
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
  const [authorPhoto, setAuthorPhoto] = useState<string | null>(item.authorPhotoUrl || null);
  const [authorName, setAuthorName] = useState<string>(item.authorName || '');
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const [heartKey, setHeartKey] = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  useEffect(() => {
    setLocalIsLiked(isLiked);
  }, [isLiked]);

  useEffect(() => {
    if (!item.authorUid) return;
    const fetchAuthor = async () => {
      try {
        const q = query(collection(db, 'users'), where('uid', '==', item.authorUid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setAuthorName(data.username || item.authorName || '');
          setAuthorPhoto(data.profilePhotoUrl || null);
        }
      } catch {}
    };
    fetchAuthor();
  }, [item.authorUid]);

  const spawnHearts = useCallback(() => {
    const count = 6;
    const newHearts: FloatingHeart[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 80,
    }));
    setFloatingHearts(prev => [...prev, ...newHearts]);
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
    }, 1000);
  }, []);

  const handleLikeClick = () => {
    if (!localIsLiked) {
      spawnHearts();
    }
    setHeartKey(k => k + 1);
    onLike(item.id);
    setLocalIsLiked(!localIsLiked);
  };

  const isUserPost = item.authorUid === currentUserUid;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="relative w-full sm:w-auto sm:min-w-[340px] sm:max-w-[420px] mx-auto"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Outer glass card */}
        <div
          className="rounded-[2.2rem] sm:rounded-[2.5rem] overflow-hidden border border-white/15"
          style={{
            background: 'rgba(20,20,20,0.82)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          {/* Author row */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full overflow-hidden border border-white/15 bg-white/5 flex items-center justify-center shrink-0">
                {authorPhoto ? (
                  <img src={authorPhoto} alt={authorName} className="w-full h-full object-cover" />
                ) : (
                  <User size={14} className="text-white/40" />
                )}
              </div>
              <span className="text-[13px] font-bold text-white/90 tracking-tight leading-none">
                @{authorName}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-white/8 hover:bg-white/15 rounded-full text-white/50 hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* Image card — separate bubble inside */}
          <div className="px-3 pb-0">
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: '1.5rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              {item.type === 'video' ? (
                <video
                  src={item.url}
                  className="w-full object-cover"
                  style={{ maxHeight: '60vh', display: 'block' }}
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
                  style={{ maxHeight: '60vh', display: 'block' }}
                  referrerPolicy="no-referrer"
                />
              )}
              {item.type === 'video' && (
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="absolute bottom-3 right-3 p-2.5 bg-black/50 backdrop-blur-md rounded-full text-white/80 hover:text-white transition-all"
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              )}
            </div>
          </div>

          {/* Action row — only heart */}
          <div className="flex items-center px-4 pt-3 pb-4 relative">
            {!isUserPost ? (
              <div className="relative">
                <motion.button
                  key={heartKey}
                  onClick={handleLikeClick}
                  className="flex items-center justify-center"
                  whileTap={{ scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                >
                  <motion.div
                    animate={
                      localIsLiked
                        ? { scale: [1, 1.4, 1], rotate: [0, -10, 10, 0] }
                        : { scale: 1 }
                    }
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                    <Heart
                      size={28}
                      fill={localIsLiked ? '#ef4444' : 'none'}
                      className={`transition-colors duration-200 ${
                        localIsLiked ? 'text-red-500' : 'text-white/60'
                      }`}
                      strokeWidth={localIsLiked ? 0 : 2}
                    />
                  </motion.div>
                </motion.button>

                {/* Floating hearts animation */}
                <AnimatePresence>
                  {floatingHearts.map((h) => (
                    <motion.div
                      key={h.id}
                      initial={{ opacity: 1, y: 0, x: h.x, scale: 0.5 }}
                      animate={{ opacity: 0, y: -70, x: h.x + (Math.random() - 0.5) * 30, scale: 1.2 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                      className="absolute bottom-0 left-3 pointer-events-none"
                    >
                      <Heart size={16} fill="#ef4444" className="text-red-500" />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="w-7 h-7" />
            )}

            {/* Title bottom right */}
            {item.title && (
              <span className="ml-auto text-[11px] font-bold uppercase tracking-widest text-white/30 truncate max-w-[60%]">
                {item.title}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
