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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

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

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLiked && !isUserPost) {
      onLike(item.id);
      setShowHeartAnim(true);
      setTimeout(() => setShowHeartAnim(false), 800);
    }
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isUserPost) {
      onLike(item.id);
    }
  };

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (isConfirmingDelete) {
      const timer = setTimeout(() => setIsConfirmingDelete(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isConfirmingDelete]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    
    if (isConfirmingDelete) {
      onDelete(item.id);
      setIsConfirmingDelete(false);
    } else {
      setIsConfirmingDelete(true);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // On mobile/touch devices, a single click on user post shows the delete menu
    if (isUserPost && onDelete) {
      setShowMobileMenu(true);
    }
  };

  return (
    <div className="relative mb-4 break-inside-avoid group">
      <motion.div
        ref={cardRef}
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        className="relative z-10 cursor-pointer"
        onDoubleClick={handleDoubleClick}
        onClick={handleCardClick}
      >
        <div className="glass-panel rounded-2xl overflow-hidden transition-all duration-300 group-hover:border-white/20 relative">
          {/* Mobile Delete Menu */}
          <AnimatePresence>
            {showMobileMenu && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 gap-4"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMobileMenu(false);
                }}
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-full flex flex-col gap-3"
                >
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDelete) onDelete(item.id);
                      setShowMobileMenu(false);
                    }}
                    className="w-full py-4 bg-red-600 text-white font-bold rounded-2xl uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 shadow-xl"
                  >
                    <Trash2 size={16} />
                    Excluir Post
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMobileMenu(false);
                    }}
                    className="w-full py-4 bg-white/10 text-white font-bold rounded-2xl uppercase tracking-[0.2em] text-[10px] backdrop-blur-md"
                  >
                    Cancelar
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Persistent Like Indicator */}
          {isLiked && (
            <div className="absolute top-3 left-3 z-20 p-1.5 bg-black/40 backdrop-blur-md rounded-full text-red-500 shadow-lg">
              <Heart size={12} fill="currentColor" />
            </div>
          )}

          {/* Delete Button for User Posts */}
          {isUserPost && onDelete && (
            <button 
              onClick={handleDeleteClick}
              className={`absolute top-3 right-3 z-20 p-2 backdrop-blur-md rounded-full text-white shadow-lg transition-all flex items-center gap-2 ${
                isConfirmingDelete 
                  ? 'bg-red-600 px-4 ring-2 ring-white/50' 
                  : 'bg-red-500/80 hover:bg-red-500 opacity-0 group-hover:opacity-100'
              }`}
            >
              <Trash2 size={16} />
              {isConfirmingDelete && <span className="text-[10px] font-bold uppercase tracking-widest">Confirmar?</span>}
            </button>
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
            onError={() => setIsLoaded(true)}
            className={`w-full object-cover transition-all duration-500 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ 
              minHeight: '150px', 
              height: isLoaded ? 'auto' : (item.height || 300),
              maxHeight: item.height ? `${item.height}px` : 'none'
            }}
          />

          {/* Double Click Heart Animation */}
          <AnimatePresence>
            {showHeartAnim && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.2, 1], opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
              >
                <Heart size={80} fill="white" className="text-white drop-shadow-2xl" />
              </motion.div>
            )}
          </AnimatePresence>
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white truncate">{item.title || "Sem título"}</h3>
                {(item as any).authorName && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-white/60 truncate">@{ (item as any).authorName }</span>
                    {!isUserPost && onFollow && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onFollow((item as any).authorUid);
                        }}
                        className="text-[10px] font-bold text-white/80 hover:text-white transition-colors"
                      >
                        {isFollowing ? "Seguindo" : "Seguir"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {!isUserPost && (
                  <button
                    onClick={handleLikeClick}
                    className={`p-2 rounded-full transition-colors ${isLiked ? 'text-red-500' : 'text-white/60 hover:text-white'}`}
                  >
                    <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                  </button>
                )}
                {onSave && !isUserPost && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSave(item.id);
                    }}
                    className={`p-2 rounded-full transition-colors ${isSaved ? 'text-yellow-500' : 'text-white/60 hover:text-white'}`}
                  >
                    <Bookmark size={18} fill={isSaved ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default GlassCard;

