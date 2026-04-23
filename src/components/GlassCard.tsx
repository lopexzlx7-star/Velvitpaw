import { motion, AnimatePresence } from "motion/react";
import { 
  Heart, Bookmark, UserPlus, Trash2, 
  Volume2, VolumeX, Share2,
  UserCheck, Images, ExternalLink
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { auth, db } from '../firebase';
import { ContentItem } from '../types';
import { deleteDoc, doc } from 'firebase/firestore';

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

// Detect if a URL is a playable video (direct file link)
function isDirectVideoUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0];
  return (
    /\.(mp4|webm|mov|avi|mkv|ogg|ogv|m4v|3gp)$/.test(lower) ||
    lower.includes('res.cloudinary.com') ||
    lower.includes('ik.imagekit.io') ||
    lower.includes('storjshare.io') ||
    lower.includes('link.storjshare.io')
  );
}

// Detect if a URL is an external embed (YouTube, Drive, etc.)
function isExternalEmbedUrl(url: string): boolean {
  return (
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    url.includes('drive.google.com') ||
    url.includes('vimeo.com') ||
    url.includes('dailymotion.com')
  );
}

function getAspectRatioStyle(aspectRatio?: string): React.CSSProperties {
  switch (aspectRatio) {
    case 'landscape': return { aspectRatio: '4/3' };
    case 'wide': return { aspectRatio: '16/9' };
    case 'square': return { aspectRatio: '1/1' };
    case 'portrait':
    default: return { aspectRatio: '9/16' };
  }
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

  const handleTap = () => {
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

  // Auto-delete post if it's an external URL video that fails to load
  const handleVideoError = () => {
    setVideoError(true);
    setIsLoaded(true);
    unregisterVideo(item.id);

    // Auto-delete posts with broken external URLs from Firestore
    if (item.type === 'video' && !isDirectVideoUrl(item.url)) {
      deleteDoc(doc(db, 'posts', item.id)).catch(() => {});
      onDelete?.(item.id);
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

  const aspectStyle = getAspectRatioStyle(item.aspectRatio);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="group mb-6 break-inside-avoid"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '300px 400px',
      } as React.CSSProperties}
    >
      <div 
        className="relative rounded-[2rem] overflow-hidden bg-white/5 border border-white/10 shadow-xl transition-transform duration-300 group-hover:-translate-y-1 cursor-pointer"
        onClick={handleTap}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', willChange: 'transform' }}
      >
        {/* Media Container */}
        <div className="relative overflow-hidden">
          {!isLoaded && !getVideoThumb(item.url, item.thumbnailUrl) && (
            <div 
              className="absolute inset-0 bg-white/5 animate-pulse flex items-center justify-center"
              style={{ height: item.height || 300 }}
            >
              <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/30 animate-spin" />
            </div>
          )}

          {item.type === 'video' || item.type === 'gif' ? (
            <div className="relative w-full overflow-hidden" style={{ ...aspectStyle, minHeight: '150px' }}>
              {item.type === 'video' ? (
                videoError ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/60" style={aspectStyle}>
                    <span className="text-white/20 text-[9px] uppercase tracking-widest font-bold">Vídeo indisponível</span>
                  </div>
                ) : isExternalEmbedUrl(item.url) ? (
                  // External embed URL — show thumbnail with external link
                  <div className="relative w-full h-full" style={aspectStyle}>
                    {item.thumbnailUrl ? (
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={() => setVideoError(true)}
                      />
                    ) : (
                      <div className="w-full h-full bg-black/40 flex flex-col items-center justify-center gap-2">
                        <ExternalLink size={24} className="text-white/30" />
                        <span className="text-white/20 text-[9px] uppercase tracking-widest">Link Externo</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                        <ExternalLink size={18} className="text-white/80" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {!isLoaded && getVideoThumb(item.url, item.thumbnailUrl) && (
                      <img
                        src={getVideoThumb(item.url, item.thumbnailUrl)!}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                    <video
                      ref={videoRef}
                      src={item.url}
                      muted={isMuted}
                      playsInline
                      loop
                      preload="none"
                      controlsList="nodownload noremoteplayback"
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      onLoadedData={() => setIsLoaded(true)}
                      onEnded={() => advanceToNext(item.id)}
                      onError={handleVideoError}
                      className={`w-full h-full object-cover transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                    />
                  </>
                )
              ) : (
                <img
                  src={item.url}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
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
              {isHovered && item.type === 'video' && !isExternalEmbedUrl(item.url) && (
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
              loading="lazy"
              decoding="async"
              onLoad={() => setIsLoaded(true)}
              className={`w-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
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

          {item.type === 'image' && item.images && item.images.length > 1 && (
            <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-full z-20 pointer-events-none">
              <Images size={9} className="text-white/80" />
              <span className="text-[9px] font-bold text-white/80">{item.images.length}</span>
            </div>
          )}

          {/* Overlay Actions */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300 flex flex-col justify-between p-4">
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
            <div className="flex flex-nowrap overflow-hidden gap-1 mt-1.5">
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

export default React.memo(GlassCard, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.url === next.item.url &&
    prev.item.thumbnailUrl === next.item.thumbnailUrl &&
    prev.item.title === next.item.title &&
    prev.isLiked === next.isLiked &&
    prev.isSaved === next.isSaved &&
    prev.isFollowing === next.isFollowing &&
    prev.isUserPost === next.isUserPost &&
    prev.searchQuery === next.searchQuery &&
    prev.item.likesCount === next.item.likesCount
  );
});
