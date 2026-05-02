import { 
  Heart, Trash2,
  Images, ExternalLink
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { auth, db } from '../firebase';
import { ContentItem } from '../types';
import { deleteDoc, doc } from 'firebase/firestore';
import { useResponsiveVideoUrl } from '../utils/videoUrl';

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
  isNew?: boolean;
  onSeen?: (id: string) => void;
  onLike: (id: string) => void;
  onSave?: (id: string) => void;
  onFollow?: (uid: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (item: ContentItem) => void;
  onHashtagClick?: (tag: string) => void;
  onPersonTagClick?: (slug: string) => void;
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
  isNew,
  onSeen,
  onLike, 
  onSave, 
  onFollow, 
  onDelete, 
  onClick,
  onHashtagClick,
  onPersonTagClick,
  isUserPost,
  searchQuery = ''
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isNew || !onSeen) return;
    const el = cardRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!timer) {
              timer = setTimeout(() => {
                onSeen(item.id);
                timer = null;
              }, 1500);
            }
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        });
      },
      { threshold: [0.5] }
    );
    observer.observe(el);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [isNew, item.id, onSeen]);

  const responsiveVideoUrl = useResponsiveVideoUrl(item.url);
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
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

  const handleVideoError = () => {
    setVideoError(true);
    setIsLoaded(true);
    unregisterVideo(item.id);

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
    <div
      className="card-fade-in group mb-6 break-inside-avoid"
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: '300px 400px',
      } as React.CSSProperties}
    >
      <div 
        ref={cardRef}
        className="relative rounded-[2rem] overflow-hidden bg-white/5 border border-white/10 shadow-xl transition-transform duration-200 active:scale-[0.98] cursor-pointer"
        onClick={handleTap}
        onContextMenu={(e) => e.preventDefault()}
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
      >
        {/* New post badge */}
        {isNew && (
          <div
            className="absolute top-3 left-3 z-30 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: 'rgba(0,0,0,0.55)',
              boxShadow:
                'inset 0 0 0 1px rgba(var(--accent-rgb, 255 255 255), 0.6)',
            }}
          >
            <span
              className="block w-1.5 h-1.5 rounded-full new-badge-pulse"
              style={{ background: 'rgb(var(--accent-rgb, 255 255 255))' }}
            />
            <span className="text-[9px] font-black uppercase tracking-widest text-white">
              Novo
            </span>
          </div>
        )}

        {/* Media Container */}
        <div className="relative overflow-hidden">
          {!isLoaded && !getVideoThumb(item.url, item.thumbnailUrl) && (
            <div 
              className="absolute inset-0 bg-white/5 flex items-center justify-center"
              style={{ height: item.height || 300 }}
            >
              <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
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
                      src={responsiveVideoUrl}
                      muted
                      playsInline
                      loop
                      preload="none"
                      controlsList="nodownload noremoteplayback"
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      onLoadedData={() => setIsLoaded(true)}
                      onEnded={() => advanceToNext(item.id)}
                      onError={handleVideoError}
                      className={`w-full h-full bg-black transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                      style={{ objectFit: 'contain' }}
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
                  className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                />
              )}
              {isUserPost && onDelete && (
                <button 
                  onClick={handleDeleteClick}
                  className={`absolute top-4 right-4 p-2.5 rounded-2xl text-white transition-all z-20 ${
                    isConfirmingDelete ? 'bg-red-600 px-4' : 'bg-black/50 active:bg-red-500'
                  }`}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ) : (
            item.aspectRatio && item.aspectRatio !== 'original' ? (
              <div className="relative w-full overflow-hidden" style={{ ...aspectStyle, minHeight: '150px' }}>
                <img
                  src={item.url}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  decoding="async"
                  onLoad={() => setIsLoaded(true)}
                  className={`w-full h-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                />
              </div>
            ) : (
              <img
                src={item.url}
                alt={item.title}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                onLoad={() => setIsLoaded(true)}
                className={`w-full object-cover transition-opacity duration-200 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                  minHeight: '150px', 
                  height: isLoaded ? 'auto' : (item.height || 300),
                  maxHeight: item.height ? `${item.height}px` : 'none'
                }}
              />
            )
          )}

          {isUserPost && onDelete && item.type === 'image' && (
            <button 
              onClick={handleDeleteClick}
              className={`absolute top-4 right-4 p-2.5 rounded-2xl text-white transition-all z-20 ${
                isConfirmingDelete ? 'bg-red-600 px-4' : 'bg-black/50 active:bg-red-500'
              }`}
            >
              <Trash2 size={16} />
            </button>
          )}

          {item.type === 'image' && item.images && item.images.length > 1 && (
            <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-1 bg-black/60 rounded-full z-20 pointer-events-none">
              <Images size={9} className="text-white/80" />
              <span className="text-[9px] font-bold text-white/80">{item.images.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Title & Hashtags Below Post */}
      <div className="mt-3 px-2 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[11px] font-black text-white uppercase tracking-wider truncate">
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
                  className="text-[9px] text-white/40 active:text-white transition-colors font-bold tracking-wide"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
          {item.personTags && item.personTags.length > 0 && (
            <div className="flex flex-nowrap overflow-hidden gap-1 mt-1">
              {item.personTags.slice(0, 3).map(slug => (
                <button
                  key={slug}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPersonTagClick?.(slug);
                  }}
                  className="flex items-center gap-0.5 text-[9px] font-black tracking-wide rounded-full px-1.5 py-0.5 transition-all"
                  style={{
                    color: 'rgba(var(--accent-rgb,255 255 255),0.75)',
                    background: 'rgba(var(--accent-rgb,255 255 255),0.06)',
                  }}
                >
                  <span className="opacity-50">@</span>{slug.replace(/-/g, ' ')}
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
    </div>
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
    prev.isNew === next.isNew &&
    prev.isUserPost === next.isUserPost &&
    prev.searchQuery === next.searchQuery &&
    prev.item.likesCount === next.item.likesCount
  );
});
