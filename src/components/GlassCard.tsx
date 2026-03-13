import { motion, AnimatePresence, useMotionValue, useTransform } from "motion/react";
import { Play, Maximize2, Heart, X, Bookmark, UserPlus, UserMinus, Trash2, Archive } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { db, auth } from '../firebase';
import { ContentItem } from '../types';

interface GlassCardProps {
  item: ContentItem;
  isLiked: boolean;
  isSaved?: boolean;
  isFollowing?: boolean;
  onLike: (id: string) => void;
  onSave?: (id: string) => void;
  onFollow?: (uid: string) => void;
  onView?: (id: string) => void;
  onDelete?: (id: string) => void;
  isUserPost?: boolean;
}

const GlassCard: React.FC<GlassCardProps> = ({ 
  item, 
  isLiked, 
  isSaved, 
  isFollowing, 
  onLike, 
  onSave, 
  onFollow, 
  onView, 
  onDelete, 
  isUserPost 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<NodeJS.Timeout | null>(null);
  
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-80, -40], [1, 0]);
  const deleteScale = useTransform(x, [-80, -40], [1, 0.8]);

  useEffect(() => {
    if (!onView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onView(item.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, [item.id, onView]);

  const handleTripleClick = () => {
    if (isLiked && !isUserPost) {
      onLike(item.id); // Toggle off
    }
  };

  const handleInteraction = (e: React.MouseEvent) => {
    // If we've swiped, don't trigger clicks
    if (Math.abs(x.get()) > 10) return;

    e.stopPropagation();
    
    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
    }

    if (newCount === 2) {
      // Double click logic
      if (!isLiked && !isUserPost) {
        onLike(item.id);
        setShowHeartAnim(true);
        setTimeout(() => setShowHeartAnim(false), 800);
      }
    } else if (newCount === 3) {
      // Triple click logic
      handleTripleClick();
      setClickCount(0);
      return;
    }

    clickTimer.current = setTimeout(() => {
      setClickCount(0);
    }, 300); // 300ms window for clicks
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isUserPost) {
      onLike(item.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(item.id);
      // Reset swipe position
      x.set(0);
    }
  };

  return (
    <div className="relative mb-4 break-inside-avoid group">
      {/* Delete Action (Behind) */}
      {isUserPost && onDelete && (
        <motion.div 
          style={{ opacity: deleteOpacity, scale: deleteScale }}
          className="absolute inset-y-0 right-0 w-20 flex items-center justify-center bg-red-500 rounded-2xl z-0 cursor-pointer"
          onClick={handleDeleteClick}
        >
          <Trash2 size={24} className="text-white" />
        </motion.div>
      )}

      <motion.div
        ref={cardRef}
        layout
        style={{ x }}
        drag={isUserPost ? "x" : false}
        dragConstraints={{ left: -80, right: 0 }}
        dragElastic={0.1}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        className="relative z-10 cursor-grab active:cursor-grabbing"
        onClick={handleInteraction}
      >
        <div className="glass-panel rounded-2xl overflow-hidden transition-all duration-500 group-hover:border-white/20 relative">
          {/* Persistent Like Indicator */}
          {isLiked && (
            <div className="absolute top-3 left-3 z-20 p-1.5 bg-black/40 backdrop-blur-md rounded-full text-red-500 shadow-lg">
              <Heart size={12} fill="currentColor" />
            </div>
          )}

          {/* Archived Badge */}
          {item.archived && (
            <div className="absolute top-3 right-3 z-20 px-2 py-1 bg-yellow-500/80 backdrop-blur-md rounded-full text-white text-[8px] font-bold uppercase tracking-widest flex items-center gap-1 shadow-lg">
              <Archive size={10} /> Arquivado
            </div>
          )}

          {/* Skeleton Placeholder */}
          {!isLoaded && (
            <div 
              className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center"
              style={{ height: item.height || 300 }}
            >
              <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-white/30 animate-spin" />
            </div>
          )}

          <img
            src={item.url}
            alt={item.title}
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoaded(true)}
            className={`w-full object-cover transition-all duration-700 group-hover:scale-110 ${
              isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
            }`}
            style={{ minHeight: '200px', height: isLoaded ? 'auto' : (item.height || 300) }}
          />

          {/* Double Click Heart Animation */}
          <AnimatePresence>
            {showHeartAnim && (
              <motion.div
                initial={{ scale: 0, opacity: 0, rotate: -20 }}
                animate={{ scale: [0, 1.2, 1], opacity: 1, rotate: 0 }}
                exit={{ scale: 1.5, opacity: 0, rotate: 20 }}
                transition={{ duration: 0.4, ease: "backOut" }}
                className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
              >
                <div className="relative">
                  <Heart size={100} fill="white" className="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]" />
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                    className="absolute inset-0 bg-white rounded-full blur-2xl"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300 flex flex-col justify-end p-4 ${
            isLoaded ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'
          }`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white/90 truncate">{item.title}</h3>
                {(item as any).authorName && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-white/50 truncate">@{ (item as any).authorName }</span>
                    {!isUserPost && onFollow && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onFollow((item as any).authorUid);
                        }}
                        className="text-[10px] font-bold text-white/70 hover:text-white transition-colors"
                      >
                        {isFollowing ? <UserMinus size={12} /> : <UserPlus size={12} />}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {!isUserPost && (
                <div className="flex flex-col gap-2">
                  <motion.button
                    whileTap={{ scale: 0.6 }}
                    onClick={handleLikeClick}
                    className={`p-2 rounded-full transition-colors relative ${isLiked ? 'text-red-500' : 'text-white/50 hover:text-white'}`}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={isLiked ? 'liked' : 'unliked'}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                      </motion.div>
                    </AnimatePresence>
                    {isLiked && (
                      <motion.div
                        initial={{ scale: 0, opacity: 1 }}
                        animate={{ scale: 2.5, opacity: 0 }}
                        className="absolute inset-0 border-2 border-red-500 rounded-full pointer-events-none"
                      />
                    )}
                  </motion.button>

                  {onSave && (
                    <motion.button
                      whileTap={{ scale: 0.6 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSave(item.id);
                      }}
                      className={`p-2 rounded-full transition-colors ${isSaved ? 'text-yellow-500' : 'text-white/50 hover:text-white'}`}
                    >
                      <Bookmark size={18} fill={isSaved ? "currentColor" : "none"} />
                    </motion.button>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-white/50">
                {item.type}
              </span>
              {item.type === 'gif' && (
                <Play size={14} className="text-white/70" />
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default GlassCard;

