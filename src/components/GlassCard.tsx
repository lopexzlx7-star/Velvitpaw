import { motion, AnimatePresence } from "motion/react";
import { 
  Heart, Bookmark, UserPlus, UserMinus, Trash2, 
  Film, Volume2, VolumeX, Share2, Download, ExternalLink,
  UserCheck
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { auth } from '../firebase';
import { ContentItem } from '../types';

interface GlassCardProps {
  item: ContentItem;
  isLiked: boolean;
  isSaved?: boolean;
  isFollowing?: boolean;
  onLike: (id: string) => void;
  onSave?: (id: string) => void;
  onFollow?: (uid: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (item: ContentItem) => void;
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
  onDelete, 
  onClick,
  isUserPost 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [showHeartAnim, setShowHeartAnim] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const lastTapRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      onLike(item.id);
      if (!isLiked) {
        setShowHeartAnim(true);
        setTimeout(() => setShowHeartAnim(false), 1000);
      }
    } else {
      // Single tap - handle as click for detail view
      // We wait a bit to see if it's a double tap
      setTimeout(() => {
        if (Date.now() - lastTapRef.current >= DOUBLE_TAP_DELAY) {
          onClick?.(item);
        }
      }, DOUBLE_TAP_DELAY);
    }
    lastTapRef.current = now;
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConfirmingDelete) {
      if (onDelete) onDelete(item.id);
    } else {
      setIsConfirmingDelete(true);
      setTimeout(() => setIsConfirmingDelete(false), 3000);
    }
  };

  useEffect(() => {
    // Video is now autoPlay for preview
  }, [isHovered]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="group mb-6 break-inside-avoid"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className="relative rounded-[2rem] overflow-hidden bg-white/5 border border-white/10 shadow-xl transition-all duration-500 group-hover:shadow-white/5 group-hover:-translate-y-1 cursor-pointer"
        onClick={handleTap}
      >
        {/* Media Container */}
        <div className="relative overflow-hidden">
          {/* Skeleton Placeholder */}
          {!isLoaded && (
            <div 
              className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center"
              style={{ height: item.height || 300 }}
            >
              <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/30 animate-spin" />
            </div>
          )}

          {item.type === 'video' ? (
            <div className="relative w-full overflow-hidden" style={{ minHeight: '200px' }}>
              <video
                ref={videoRef}
                src={item.url}
                loop
                muted={isMuted}
                playsInline
                autoPlay
                onLoadedData={() => setIsLoaded(true)}
                className={`w-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                style={{ maxHeight: item.height ? `${item.height}px` : 'none' }}
              />
              <div className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-xl text-white/70">
                <Film size={14} />
              </div>
              {isUserPost && onDelete && (
                <button 
                  onClick={handleDeleteClick}
                  className={`absolute top-4 right-4 p-2.5 backdrop-blur-xl rounded-2xl text-white transition-all z-20 ${
                    isConfirmingDelete ? 'bg-red-600 px-4' : 'bg-black/40 hover:bg-red-500'
                  }`}
                >
                  <Trash2 size={16} />
                </button>
              )}
              {isHovered && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMuted(!isMuted);
                  }}
                  className="absolute bottom-4 right-4 p-2 bg-black/40 backdrop-blur-md rounded-xl text-white/70 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              )}
            </div>
          ) : (
            <img
              src={item.url}
              alt={item.title}
              referrerPolicy="no-referrer"
              onLoad={() => setIsLoaded(true)}
              className={`w-full object-cover transition-all duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
              style={{ 
                minHeight: '150px', 
                height: isLoaded ? 'auto' : (item.height || 300),
                maxHeight: item.height ? `${item.height}px` : 'none'
              }}
            />
          )}

          {isUserPost && onDelete && item.type !== 'video' && (
            <button 
              onClick={handleDeleteClick}
              className={`absolute top-4 right-4 p-2.5 backdrop-blur-xl rounded-2xl text-white transition-all z-20 ${
                isConfirmingDelete ? 'bg-red-600 px-4' : 'bg-black/40 hover:bg-red-500'
              }`}
            >
              <Trash2 size={16} />
            </button>
          )}

          {/* Overlay Actions */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-between p-4">
            <div className="flex justify-end gap-2">
              {!isUserPost && onFollow && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onFollow(item.authorUid); }}
                  className={`p-2.5 backdrop-blur-xl rounded-2xl transition-all ${
                    isFollowing ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  {isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { e.stopPropagation(); onLike(item.id); }}
                  className={`p-2.5 backdrop-blur-xl rounded-2xl transition-all ${
                    isLiked ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                </button>
                {onSave && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); onSave(item.id); }}
                    className={`p-2.5 backdrop-blur-xl rounded-2xl transition-all ${
                      isSaved ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    <Bookmark size={18} fill={isSaved ? "currentColor" : "none"} />
                  </button>
                )}
              </div>
              <button className="p-2.5 bg-white/10 backdrop-blur-xl rounded-2xl text-white hover:bg-white/20 transition-all">
                <Share2 size={18} />
              </button>
            </div>
          </div>

          {/* Double Tap Heart Animation */}
          <AnimatePresence>
            {showHeartAnim && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1.5, opacity: 1 }}
                exit={{ scale: 2, opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
              >
                <Heart size={80} fill="#ef4444" className="text-red-500 drop-shadow-2xl" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Title Below Post */}
      <div className="mt-3 px-2 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-black text-white uppercase tracking-wider truncate group-hover:text-white/80 transition-colors">
            {item.title}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-white/20">
          <div className="flex items-center gap-1">
            <Heart size={10} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-red-500" : ""} />
            <span className="text-[9px] font-black">{item.likesCount || 0}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default GlassCard;

