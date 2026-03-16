import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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

  const handleLikeClick = () => {
    onLike(item.id);
    setLocalIsLiked(!localIsLiked);
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
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="relative w-[95vw] max-w-4xl max-h-[90vh] glass-panel flex flex-col rounded-[2.5rem] overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: author + close */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center shrink-0">
              {authorPhoto ? (
                <img src={authorPhoto} alt={authorName} className="w-full h-full object-cover" />
              ) : (
                <User size={16} className="text-white/30" />
              )}
            </div>
            <span className="text-sm font-bold text-white/80 tracking-tight">
              @{authorName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Media */}
          <div className="w-full md:w-2/3 bg-black/20 flex items-center justify-center overflow-hidden relative min-h-[40vh]">
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
                className="absolute bottom-4 right-4 p-3 bg-black/40 backdrop-blur-md rounded-full text-white opacity-70 hover:opacity-100 transition-opacity"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            )}
          </div>

          {/* Info panel */}
          <div className="w-full md:w-1/3 flex flex-col p-6">
            <div className="flex-1">
              <h2 className="text-xl font-black text-white tracking-tighter uppercase leading-tight">
                {item.title}
              </h2>
              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {item.tags.map(tag => (
                    <span key={tag} className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-white/40">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Like button only */}
            <div className="flex items-center justify-between mt-auto pt-4">
              <div className="flex items-center gap-2 text-white/30 text-xs font-bold">
                <Heart size={12} fill={localIsLiked ? '#ef4444' : 'none'} className={localIsLiked ? 'text-red-400' : ''} />
                <span>{item.likesCount || 0}</span>
              </div>
              {!isUserPost && (
                <motion.button
                  onClick={handleLikeClick}
                  className={`p-4 rounded-full text-white backdrop-blur-md border transition-all ${
                    localIsLiked
                      ? 'bg-red-500 border-red-400'
                      : 'bg-white/10 border-white/20 hover:bg-white/20'
                  }`}
                  whileTap={{ scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                >
                  <Heart size={20} fill={localIsLiked ? 'currentColor' : 'none'} />
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
