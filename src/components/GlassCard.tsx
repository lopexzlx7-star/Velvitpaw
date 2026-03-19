import { motion, AnimatePresence } from "motion/react";
import { 
  Heart, Bookmark, UserPlus, Trash2, 
  Volume2, VolumeX, Share2,
  UserCheck
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { auth } from '../firebase';
import { ContentItem } from '../types';

function getCloudinaryThumb(videoUrl: string): string | null {
  if (!videoUrl.includes('res.cloudinary.com')) return null;
  return videoUrl
    .replace('/video/upload/', '/video/upload/so_0/')
    .replace(/\.[^./]+$/, '.jpg');
}

function getImageKitThumb(videoUrl: string): string | null {
  if (!videoUrl.includes('ik.imagekit.io')) return null;
  return `${videoUrl.split('?')[0]}/ik-thumbnail.jpg`;
}

function getVideoThumb(url: string, thumbnailUrl?: string): string | null {
  if (thumbnailUrl) return thumbnailUrl;
  return getCloudinaryThumb(url) || getImageKitThumb(url);
}

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
  onHashtagClick?: (tag: string) => void;
  isUserPost?: boolean;
  searchQuery?: string;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;

  const q = query.trim();
  const tLower = text.toLowerCase();
  const qLower = q.toLowerCase();

  if (tLower.includes(qLower)) {
    const idx = tLower.indexOf(qLower);
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-green-400 font-black">{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  }

  const tokens = qLower.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let remainingLower = tLower;
    let offset = 0;

    for (const token of tokens) {
      const idx = remainingLower.indexOf(token);
      if (idx === -1) continue;
      if (idx > 0) parts.push(remaining.slice(0, idx));
      parts.push(
        <span key={offset + idx} className="text-green-400 font-black">
          {remaining.slice(idx, idx + token.length)}
        </span>
      );
      remaining = remaining.slice(idx + token.length);
      remainingLower = remainingLower.slice(idx + token.length);
      offset += idx + token.length;
    }
    if (remaining) parts.push(remaining);
    if (parts.length > 0) return <>{parts}</>;
  }

  const chars = qLower.replace(/\s/g, '');
  const result: React.ReactNode[] = [];
  let ci = 0;
  for (let i = 0; i < text.length; i++) {
    if (ci < chars.length && text[i].toLowerCase() === chars[ci]) {
      result.push(<span key={i} className="text-green-400 font-black">{text[i]}</span>);
      ci++;
    } else {
      result.push(text[i]);
    }
  }
  if (ci === chars.length) return <>{result}</>;

  return text;
}

// ---------------------------------------------------------------------------
// Module-level video registry — coordinates playback across all GlassCard instances
// ---------------------------------------------------------------------------
interface VideoEntry {
  id: string;
  el: HTMLVideoElement;
}

let registry: VideoEntry[] = [];
let activeId: string | null = null;

function registerVideo(id: string, el: HTMLVideoElement) {
  if (!registry.find(v => v.id === id)) {
    registry.push({ id, el });
  }
  // Do NOT auto-play on register — only IntersectionObserver triggers playback,
  // ensuring the topmost visible video always plays first.
}

function unregisterVideo(id: string) {
  registry = registry.filter(v => v.id !== id);
  if (activeId === id) {
    activeId = null;
  }
}

function triggerPlay(id: string) {
  registry.forEach(v => {
    if (v.id !== id) {
      v.el.pause();
      v.el.currentTime = 0;
    }
  });
  const target = registry.find(v => v.id === id);
  if (target) {
    activeId = id;
    target.el.play().catch(() => {});
  }
}

function advanceToNext(finishedId: string) {
  const idx = registry.findIndex(v => v.id === finishedId);
  if (idx === -1) return;
  const nextEntry = registry[idx + 1] ?? registry[0];
  if (nextEntry) triggerPlay(nextEntry.id);
}
// ---------------------------------------------------------------------------

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
  onHashtagClick,
  isUserPost,
  searchQuery = ''
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    onClick?.(item);
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
    if (item.type !== 'video') return;
    const el = videoRef.current;
    if (!el) return;

    registerVideo(item.id, el);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            triggerPlay(item.id);
          } else {
            el.pause();
            if (activeId === item.id) activeId = null;
          }
        });
      },
      { threshold: 0.5 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      unregisterVideo(item.id);
    };
  }, [item.id, item.type]);

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
          {/* Skeleton Placeholder — only shown when there is no thumbnail to display */}
          {!isLoaded && !getVideoThumb(item.url, item.thumbnailUrl) && (
            <div 
              className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center"
              style={{ height: item.height || 300 }}
            >
              <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/30 animate-spin" />
            </div>
          )}

          {item.type === 'video' || item.type === 'gif' ? (
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: '9/16', minHeight: '200px' }}>
              {item.type === 'video' ? (
                videoError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/60">
                    <span className="text-white/20 text-[9px] uppercase tracking-widest font-bold">Vídeo indisponível</span>
                  </div>
                ) : (
                <>
                  {/* Thumbnail shown immediately as a static layer — visible before the
                      video element loads. The poster attribute on <video> is invisible
                      while the video has opacity-0, so we use a separate <img> layer. */}
                  {!isLoaded && getVideoThumb(item.url, item.thumbnailUrl) && (
                    <img
                      src={getVideoThumb(item.url, item.thumbnailUrl)!}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <video
                    ref={videoRef}
                    src={item.url}
                    muted={isMuted}
                    playsInline
                    loop
                    preload="auto"
                    onLoadedData={() => setIsLoaded(true)}
                    onEnded={() => advanceToNext(item.id)}
                    onError={() => { setVideoError(true); setIsLoaded(true); unregisterVideo(item.id); }}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                  />
                </>
                )
              ) : (
                <img
                  src={item.url}
                  alt={item.title}
                  onLoad={() => setIsLoaded(true)}
                  className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                />
              )}
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
              {isHovered && item.type === 'video' && (
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

          {isUserPost && onDelete && item.type === 'image' && (
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (navigator.share) {
                    navigator.share({ title: item.title, url: item.url }).catch(() => {});
                  } else {
                    navigator.clipboard?.writeText(item.url).catch(() => {});
                  }
                }}
                className="p-2.5 bg-white/10 backdrop-blur-xl rounded-2xl text-white hover:bg-white/20 transition-all"
              >
                <Share2 size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Title & Hashtags Below Post */}
      <div className="mt-3 px-2 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-black text-white uppercase tracking-wider truncate group-hover:text-white/80 transition-colors">
            {highlightText(item.title, searchQuery)}
          </h3>
          {item.hashtags && item.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.hashtags.slice(0, 4).map(tag => (
                <button
                  key={tag}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHashtagClick?.(tag);
                  }}
                  className="text-[9px] text-white/40 hover:text-white transition-colors font-bold tracking-wide"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
        {!isUserPost && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLike(item.id);
            }}
            className="flex items-center gap-1 text-white/20 p-1"
          >
            <Heart size={10} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-red-500" : ""} />
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default GlassCard;
