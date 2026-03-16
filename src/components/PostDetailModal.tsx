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

  useEffect(() => { setLocalIsLiked(isLiked); }, [isLiked]);

  useEffect(() => {
    if (!item.authorUid) return;
    const fetchAuthor = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', item.authorUid)));
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setAuthorName(data.username || item.authorName || '');
          setAuthorPhoto(data.profilePhotoUrl || null);
        }
      } catch {}
    };
    fetchAuthor();
  }, [item.authorUid, item.authorName]);

  const spawnHearts = useCallback(() => {
    const newHearts: FloatingHeart[] = Array.from({ length: 7 }, (_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 60,
    }));
    setFloatingHearts(prev => [...prev, ...newHearts]);
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
    }, 1100);
  }, []);

  const handleLikeClick = () => {
    if (!localIsLiked) spawnHearts();
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
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      onClick={onClose}
    >
      {/* Floating card — constrained width, never touches edges */}
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(340px, calc(100vw - 48px))',
          borderRadius: '2.2rem',
          background: 'rgba(18,18,18,0.88)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.13)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Author row */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
              style={{ border: '1.5px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)' }}
            >
              {authorPhoto ? (
                <img src={authorPhoto} alt={authorName} className="w-full h-full object-cover" />
              ) : (
                <User size={14} className="text-white/40" />
              )}
            </div>
            <span className="text-[13px] font-semibold text-white/85 tracking-tight">
              @{authorName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Image — own inner card with rounded corners */}
        <div className="px-3">
          <div
            className="relative overflow-hidden"
            style={{
              borderRadius: '1.6rem',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {item.type === 'video' ? (
              <video
                src={item.url}
                className="w-full block object-cover"
                style={{ maxHeight: '48vh' }}
                autoPlay
                loop
                muted={isMuted}
                playsInline
              />
            ) : (
              <img
                src={item.url}
                alt={item.title}
                className="w-full block object-cover"
                style={{ maxHeight: '48vh' }}
                referrerPolicy="no-referrer"
              />
            )}
            {item.type === 'video' && (
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="absolute bottom-3 right-3 p-2 rounded-full text-white/70 hover:text-white transition-all"
                style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* Bottom row: title left + heart right */}
        <div className="flex items-center justify-between px-4 pt-3 pb-4">
          {/* Title — always uppercase, left side */}
          {item.title && (
            <span
              className="text-[10px] font-bold tracking-widest text-white/35 truncate"
              style={{ maxWidth: '60%', textTransform: 'uppercase' }}
            >
              {item.title}
            </span>
          )}

          {/* Heart — right side, hidden for own posts */}
          {!isUserPost && (
            <div className="relative ml-auto">
              <motion.button
                key={heartKey}
                onClick={handleLikeClick}
                whileTap={{ scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                className="flex items-center justify-center"
              >
                <motion.div
                  animate={
                    localIsLiked
                      ? { scale: [1, 1.5, 0.9, 1.1, 1], rotate: [0, -8, 8, -4, 0] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                  <Heart
                    size={26}
                    fill={localIsLiked ? '#ef4444' : 'none'}
                    strokeWidth={localIsLiked ? 0 : 1.8}
                    className={`transition-colors duration-150 ${localIsLiked ? 'text-red-500' : 'text-white/55'}`}
                  />
                </motion.div>
              </motion.button>

              {/* Floating hearts */}
              <AnimatePresence>
                {floatingHearts.map((h) => (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 1, y: 0, x: h.x * 0.3, scale: 0.4 }}
                    animate={{ opacity: 0, y: -65, x: h.x, scale: 1.1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.95, ease: [0.2, 0.8, 0.4, 1] }}
                    className="absolute bottom-0 right-1.5 pointer-events-none"
                  >
                    <Heart size={14} fill="#ef4444" className="text-red-500" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
