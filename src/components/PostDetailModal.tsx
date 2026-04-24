import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Heart, User, Play, Pause, ChevronLeft, ChevronRight, ChevronDown, Maximize2, ExternalLink, Bookmark } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ContentItem } from '../types';

interface PostDetailModalProps {
  item: ContentItem;
  prevItem?: ContentItem;
  nextItem?: ContentItem;
  onClose: () => void;
  onLike: (id: string) => void;
  onDelete?: (id: string) => void;
  isLiked: boolean;
  isSaved?: boolean;
  onSave?: (id: string) => void;
  currentUserUid?: string;
  onHashtagClick?: (tag: string) => void;
  onAuthorClick?: (authorUid: string) => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
}

interface FloatingHeart {
  id: number;
  x: number;
}

const isVideoType = (type: string) => type === 'video' || type === 'gif';

function throttle<T extends (...args: any[]) => void>(fn: T, intervalMs: number): T {
  let last = 0;
  return ((...args: any[]) => {
    const now = performance.now();
    if (now - last >= intervalMs) {
      last = now;
      fn(...args);
    }
  }) as T;
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

// Convert YouTube watch URL to embed URL
function getYouTubeEmbedUrl(url: string): string | null {
  const watchMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}?autoplay=1`;
  return null;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({
  item,
  prevItem,
  nextItem,
  onClose,
  onLike,
  isLiked,
  isSaved = false,
  onSave,
  currentUserUid,
  onHashtagClick,
  onAuthorClick,
  onNavigate,
}) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showPlayPause, setShowPlayPause] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(item.duration || 0);
  const [localIsLiked, setLocalIsLiked] = useState(isLiked);
  const [authorPhoto, setAuthorPhoto] = useState<string | null>(item.authorPhotoUrl || null);
  const [authorName, setAuthorName] = useState<string>(item.authorName || '');
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const [heartKey, setHeartKey] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState(1);
  const [seekFlash, setSeekFlash] = useState<'left' | 'right' | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0); // -1 = sliding to prev, 1 = sliding to next
  const [transitionOn, setTransitionOn] = useState(true);
  const [dragY, setDragY] = useState<number | null>(null); // px the finger has moved during an active drag
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const slidingRef = useRef(false);

  const allImages: string[] = item.images && item.images.length > 0 ? item.images : [item.url];
  const isMultiImage = !isVideoType(item.type) && allImages.length > 1;

  const swipeStartX = useRef<number | null>(null);

  const goToImage = (idx: number) => {
    setSwipeDirection(idx > activeImageIdx ? -1 : 1);
    setActiveImageIdx(idx);
  };

  const handleSwipeStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
  };
  const handleSwipeEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null) return;
    const diff = swipeStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0 && activeImageIdx < allImages.length - 1) goToImage(activeImageIdx + 1);
      if (diff < 0 && activeImageIdx > 0) goToImage(activeImageIdx - 1);
    }
    swipeStartX.current = null;
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaContainerRef = useRef<HTMLDivElement>(null);
  const playPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const seekFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setControlsVisible(true);
  }, []);

  const toggleControls = useCallback(() => {
    setControlsVisible(v => !v);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, []);

  const triggerSeek = (side: 'left' | 'right') => {
    const video = videoRef.current;
    if (!video) return;
    const delta = side === 'right' ? 10 : -10;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    // Show flash feedback
    if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
    setSeekFlash(side);
    seekFlashTimer.current = setTimeout(() => setSeekFlash(null), 700);
  };

  const handleVideoDoubleClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const side = (e.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
    triggerSeek(side);
  };

  const handleVideoTouchEnd = (e: React.TouchEvent<HTMLVideoElement>) => {
    const touch = e.changedTouches[0];
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.time < 300 && Math.abs(touch.clientX - last.x) < 60) {
      // Double tap detected
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const side = (touch.clientX - rect.left) < rect.width / 2 ? 'left' : 'right';
      triggerSeek(side);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = { time: now, x: touch.clientX };
    }
  };

  const isVideo = isVideoType(item.type);
  const externalEmbed = isVideo && isExternalEmbedUrl(item.url);
  const directVideo = isVideo && isDirectVideoUrl(item.url);
  const youtubeEmbed = externalEmbed ? getYouTubeEmbedUrl(item.url) : null;

  const getModalWidth = () => {
    const ar = item.aspectRatio;
    if (ar === 'wide') return 'min(640px, calc(100vw - 32px))';
    if (ar === 'landscape') return 'min(560px, calc(100vw - 32px))';
    if (ar === 'square') return 'min(420px, calc(100vw - 32px))';
    return 'min(380px, calc(100vw - 32px))';
  };

  const getMediaStyle = (): React.CSSProperties => {
    const ar = item.aspectRatio;
    if (ar === 'wide') return { aspectRatio: '16/9', maxHeight: '80vh' };
    if (ar === 'landscape') return { aspectRatio: '4/3', maxHeight: '70vh' };
    if (ar === 'square') return { aspectRatio: '1/1', maxHeight: '70vh' };
    return { aspectRatio: '9/16', maxHeight: '65vh' };
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  // The active video keeps playing throughout the drag and slide. It is only "stopped"
  // when the slide commits and the item prop changes, at which point the old <video>
  // element unmounts and the new one mounts — so playback never visibly pauses during
  // a scroll gesture.

  // Buffer-then-play: when the active item changes, wait until at least half of the
  // video has been buffered before starting playback. The remainder keeps loading in
  // the background while playing, which prevents mid-stream stutters. A loading
  // spinner is shown during the wait, and a 4s fallback ensures playback always
  // starts even on flaky networks or unknown durations.
  useEffect(() => {
    if (!isVideo || !directVideo) return;
    setVideoReady(false);
    const v = videoRef.current;
    if (!v) return;

    let started = false;
    const startNow = () => {
      if (started) return;
      started = true;
      v.play().catch(() => {});
    };
    const tryStart = () => {
      if (started) return;
      const dur = v.duration;
      if (!dur || isNaN(dur) || !isFinite(dur)) return;
      const buf = v.buffered;
      if (buf.length === 0) return;
      const bufferedEnd = buf.end(buf.length - 1);
      // Start when EITHER 50% of the file OR 5 seconds of playback are already
      // buffered — whichever happens first. This makes long videos start almost
      // instantly while still keeping short videos safely pre-buffered.
      const enoughByRatio = bufferedEnd / dur >= 0.5;
      const enoughByTime = bufferedEnd >= 5;
      if (enoughByRatio || enoughByTime) startNow();
    };

    v.addEventListener('progress', tryStart);
    v.addEventListener('loadedmetadata', tryStart);
    v.addEventListener('canplaythrough', startNow);
    // Kick once in case the video was already half-buffered (cached neighbor)
    tryStart();

    // Safety fallback — never wait longer than 4s
    const fallback = window.setTimeout(startNow, 4000);

    return () => {
      window.clearTimeout(fallback);
      v.removeEventListener('progress', tryStart);
      v.removeEventListener('loadedmetadata', tryStart);
      v.removeEventListener('canplaythrough', startNow);
    };
  }, [item.id, isVideo, directVideo]);

  // Trigger a TikTok-style slide; on completion swap the active item via onNavigate
  const triggerSlide = useCallback((dir: 'next' | 'prev') => {
    if (slidingRef.current) return;
    if (dir === 'next' && !nextItem) return;
    if (dir === 'prev' && !prevItem) return;
    slidingRef.current = true;
    setTransitionOn(true);
    setSlideOffset(dir === 'next' ? 1 : -1);
  }, [nextItem, prevItem]);

  const handleSlideTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform') return;
    if (slideOffset === 0) return;
    const dir = slideOffset > 0 ? 'next' : 'prev';
    // Snap back to 0 with no transition while item changes, so the new neighbors recenter seamlessly
    setTransitionOn(false);
    setSlideOffset(0);
    onNavigate?.(dir);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionOn(true);
        slidingRef.current = false;
      });
    });
  };

  // One-time swipe hint when first entering fullscreen on a video (per browser)
  useEffect(() => {
    if (!isFullscreen) return;
    if (!isVideo || !directVideo) return;
    try {
      if (localStorage.getItem('velvit_fs_swipe_hint_seen') === '1') return;
    } catch {}
    setShowSwipeHint(true);
    const t = setTimeout(() => {
      setShowSwipeHint(false);
      try { localStorage.setItem('velvit_fs_swipe_hint_seen', '1'); } catch {}
    }, 2500);
    return () => clearTimeout(t);
  }, [isFullscreen, isVideo, directVideo]);

  useEffect(() => { setLocalIsLiked(isLiked); }, [isLiked]);

  useEffect(() => {
    if (!item.authorUid) return;
    const fetchAuthor = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('uid', '==', item.authorUid)));
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setAuthorName(data.username || item.authorName || '');
          setAuthorPhoto(data.profilePhotoUrl || item.authorPhotoUrl || null);
        }
      } catch {}
    };
    const timer = setTimeout(fetchAuthor, 300);
    return () => clearTimeout(timer);
  }, [item.authorUid, item.authorName]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo || !directVideo) return;

    const onTime = throttle(() => {
      if (!isSeeking) setCurrentTime(video.currentTime);
    }, 250);

    const onMeta = () => setDuration(video.duration || item.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [isVideo, directVideo, isSeeking, item.duration]);

  const flashPlayPause = () => {
    setShowPlayPause(true);
    if (playPauseTimer.current) clearTimeout(playPauseTimer.current);
    playPauseTimer.current = setTimeout(() => setShowPlayPause(false), 800);
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); }
    else { video.pause(); }
    showControls();
  };

  const handleVideoTap = (e: React.MouseEvent<HTMLVideoElement>) => {
    e.stopPropagation();
    toggleControls();
  };

  const handleSeekStart = () => setIsSeeking(true);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) videoRef.current.currentTime = val;
  };

  const handleSeekEnd = () => setIsSeeking(false);

  // True if this is a landscape-format video (wide/landscape aspect ratio)
  const isLandscapeVideo =
    item.type === 'video' &&
    (item.aspectRatio === 'wide' || item.aspectRatio === 'landscape');

  // True when running on a mobile/touch device
  const isMobile = () =>
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 1024);

  // Track fullscreen state and unlock orientation on exit
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
      const inFs = !!fsEl && fsEl === mediaContainerRef.current;
      setIsFullscreen(inFs);
      if (!fsEl) {
        try { screen.orientation?.unlock?.(); } catch {}
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const container = mediaContainerRef.current;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      try { screen.orientation?.unlock?.(); } catch {}
    } else {
      // On iOS, use native video fullscreen (auto-rotates to landscape)
      if (videoRef.current && (videoRef.current as any).webkitSupportsFullscreen) {
        (videoRef.current as any).webkitEnterFullscreen();
        return;
      }

      container.requestFullscreen().then(() => {
        // On mobile + landscape video: rotate screen to landscape
        if (isMobile() && isLandscapeVideo) {
          try {
            (screen.orientation as any)?.lock?.('landscape').catch?.(() => {});
          } catch {}
        }
      }).catch(() => {
        // Last-resort fallback for browsers without Fullscreen API
        if (videoRef.current) {
          (videoRef.current as any).webkitEnterFullscreen?.();
        }
      });
    }
  };

  // TikTok-style vertical swipe/wheel navigation while in fullscreen
  useEffect(() => {
    if (!isFullscreen || !onNavigate) return;
    const container = mediaContainerRef.current;
    if (!container) return;

    let wheelLock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 30 || wheelLock) return;
      wheelLock = true;
      const dir = e.deltaY > 0 ? 'next' : 'prev';
      triggerSlide(dir);
      window.setTimeout(() => { wheelLock = false; }, 600);
    };

    let touchStartY: number | null = null;
    let touchStartX: number | null = null;
    let touchStartT = 0;
    let dragging = false;
    let lockedAxis: 'y' | 'x' | null = null;

    const onTouchStart = (e: TouchEvent) => {
      if (slidingRef.current) return;
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      touchStartT = Date.now();
      dragging = false;
      lockedAxis = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchStartY === null || touchStartX === null || slidingRef.current) return;
      const dy = e.touches[0].clientY - touchStartY;
      const dx = e.touches[0].clientX - touchStartX;
      if (lockedAxis === null) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        lockedAxis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      }
      if (lockedAxis !== 'y') return;
      dragging = true;
      // Resistance when there is no neighbor in that direction
      let clamped = dy;
      if (clamped < 0 && !nextItem) clamped = clamped * 0.25;
      if (clamped > 0 && !prevItem) clamped = clamped * 0.25;
      setDragY(clamped);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartY === null) return;
      const dy = e.changedTouches[0].clientY - touchStartY;
      const dt = Date.now() - touchStartT;
      const wasDragging = dragging;
      touchStartY = null; touchStartX = null; dragging = false; lockedAxis = null;
      if (!wasDragging) { setDragY(null); return; }

      const h = container.clientHeight || 1;
      const ratio = dy / h;
      const velocity = dy / (dt || 1); // px/ms (sign-aware)
      const commitNext = (ratio < -0.10 || velocity < -0.45) && !!nextItem;
      const commitPrev = (ratio > 0.10 || velocity > 0.45) && !!prevItem;

      // Re-enable transition so the snap (whether commit or cancel) animates from current dragY
      setTransitionOn(true);
      setDragY(null);
      if (commitNext) {
        slidingRef.current = true;
        setSlideOffset(1);
      } else if (commitPrev) {
        slidingRef.current = true;
        setSlideOffset(-1);
      }
      // else: snap back to 0 (slideOffset is already 0)
    };

    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    container.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isFullscreen, onNavigate, triggerSlide, nextItem, prevItem]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

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
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.88)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 32, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: getModalWidth(),
          borderRadius: '2.2rem',
          background: 'rgba(14,14,14,0.96)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.07)',
          overflow: 'hidden',
          willChange: 'transform',
        }}
      >
        {/* Author row */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <button
            className="flex items-center gap-2.5 hover:opacity-70 transition-opacity active:scale-95"
            onClick={() => item.authorUid && onAuthorClick?.(item.authorUid as string)}
          >
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
            <span className="text-[13px] font-semibold text-white/85 tracking-tight">@{authorName}</span>
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Media */}
        <div className="px-3">
          <div
            ref={mediaContainerRef}
            className="relative overflow-hidden w-full"
            style={{
              borderRadius: '1.6rem',
              border: '1px solid rgba(255,255,255,0.08)',
              // CSS containment isolates the player's layout/paint/style work from the
              // rest of the page, so animations and video repaints never trigger heavy
              // re-layout outside the modal.
              contain: 'layout paint style',
              ...getMediaStyle(),
            }}
          >
            {isVideo ? (
              externalEmbed ? (
                // External video URL — YouTube embed or link
                youtubeEmbed ? (
                  <iframe
                    src={youtubeEmbed}
                    className="w-full h-full"
                    allowFullScreen
                    allow="autoplay; encrypted-media; fullscreen"
                    style={{ border: 'none', display: 'block' }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-black/50">
                    <ExternalLink size={32} className="text-white/30" />
                    <span className="text-white/40 text-xs text-center px-4">
                      Vídeo externo — abrir no site original
                    </span>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-4 py-2 bg-white/10 rounded-full text-white/70 text-xs hover:bg-white/20 transition-colors flex items-center gap-2"
                    >
                      <ExternalLink size={12} /> Abrir link
                    </a>
                  </div>
                )
              ) : (
                // Direct playable video URL — TikTok-style stacked layers
                <>
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={{
                      transform: dragY !== null
                        ? `translate3d(0, ${dragY}px, 0)`
                        : `translate3d(0, ${-slideOffset * 100}%, 0)`,
                      transition: (dragY !== null || !transitionOn)
                        ? 'none'
                        : 'transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1)',
                      willChange: 'transform',
                    }}
                    onTransitionEnd={handleSlideTransitionEnd}
                  >
                    {prevItem && isDirectVideoUrl(prevItem.url) && (
                      <video
                        key={`prev-${prevItem.id}`}
                        src={prevItem.url}
                        poster={prevItem.thumbnailUrl || undefined}
                        className="absolute left-0 w-full h-full bg-black"
                        muted
                        playsInline
                        // Going back is less likely than forward, so only fetch metadata
                        // for the prev neighbor — saves bandwidth and decoder load.
                        preload="metadata"
                        style={{ top: '-100%', display: 'block', objectFit: 'contain', pointerEvents: 'none', transform: 'translateZ(0)' }}
                      />
                    )}

                    <video
                      key={`cur-${item.id}`}
                      ref={videoRef}
                      src={item.url}
                      poster={item.thumbnailUrl || undefined}
                      className="absolute left-0 top-0 w-full h-full bg-black"
                      loop
                      muted={isMuted}
                      playsInline
                      preload="auto"
                      onClick={handleVideoTap}
                      onDoubleClick={handleVideoDoubleClick}
                      onTouchEnd={handleVideoTouchEnd}
                      onPlaying={() => setVideoReady(true)}
                      onWaiting={() => setVideoReady(false)}
                      style={{ cursor: 'pointer', display: 'block', objectFit: 'contain', transform: 'translateZ(0)' }}
                    />

                    {nextItem && isDirectVideoUrl(nextItem.url) && (
                      <video
                        key={`next-${nextItem.id}`}
                        src={nextItem.url}
                        poster={nextItem.thumbnailUrl || undefined}
                        className="absolute left-0 w-full h-full bg-black"
                        muted
                        playsInline
                        preload="auto"
                        style={{ top: '100%', display: 'block', objectFit: 'contain', pointerEvents: 'none', transform: 'translateZ(0)' }}
                      />
                    )}
                  </div>

                  {/* One-time swipe hint — overlays first video in fullscreen */}
                  <AnimatePresence>
                    {showSwipeHint && (
                      <motion.div
                        key="swipe-hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30"
                        style={{ background: 'rgba(0,0,0,0.55)' }}
                      >
                        <motion.div
                          animate={{ y: [0, 18, 0] }}
                          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                          className="flex flex-col items-center gap-2"
                        >
                          <div
                            className="px-5 py-2.5 rounded-full"
                            style={{
                              background: 'rgba(255,255,255,0.14)',
                              backdropFilter: 'blur(18px) saturate(160%)',
                              WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                              border: '1px solid rgba(255,255,255,0.18)',
                              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            }}
                          >
                            <span className="text-white text-[13px] font-semibold tracking-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                              Role para baixo para ver mais vídeos
                            </span>
                          </div>
                          <ChevronDown
                            size={36}
                            className="text-white"
                            strokeWidth={2.5}
                            style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}
                          />
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Top author overlay — only in fullscreen, fades with controlsVisible */}
                  <AnimatePresence>
                    {isFullscreen && controlsVisible && (
                      <motion.div
                        key="fs-author"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-0 left-0 right-0 px-5 pt-5 pb-10 flex items-center"
                        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
                      >
                        <button
                          className="flex items-center gap-2.5 active:scale-95 transition-transform"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (item.authorUid && onAuthorClick) {
                              if (document.fullscreenElement) {
                                document.exitFullscreen().catch(() => {});
                              }
                              onAuthorClick(item.authorUid as string);
                            }
                          }}
                        >
                          <div
                            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                            style={{ border: '1.5px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.1)' }}
                          >
                            {authorPhoto ? (
                              <img src={authorPhoto} alt={authorName} className="w-full h-full object-cover" />
                            ) : (
                              <User size={16} className="text-white/70" />
                            )}
                          </div>
                          <span className="text-[14px] font-semibold text-white tracking-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                            @{authorName}
                          </span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Tiny loading spinner shown while the active video buffers / starts up.
                      Sits above the play/pause button area to mask the brief black flick
                      between unmounting the previous video and the new one rendering its first frame. */}
                  <AnimatePresence>
                    {!videoReady && (
                      <motion.div
                        key="video-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-40"
                        style={{ background: 'rgba(0,0,0,0.35)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-full"
                          style={{
                            border: '2.5px solid rgba(255,255,255,0.22)',
                            borderTopColor: 'rgba(255,255,255,0.95)',
                            animation: 'velvit-spin 0.75s linear infinite',
                            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
                          }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Centered play/pause toggle — visible only with controls */}
                  <AnimatePresence>
                    {controlsVisible && (
                      <motion.button
                        key="play-toggle"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.18 }}
                        onClick={togglePlay}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center rounded-full"
                        style={{
                          background: 'rgba(0,0,0,0.45)',
                          backdropFilter: 'blur(14px) saturate(160%)',
                          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                        }}
                        aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
                      >
                        {isPlaying
                          ? <Pause size={26} className="text-white" fill="currentColor" />
                          : <Play size={26} className="text-white translate-x-[2px]" fill="currentColor" />}
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Double-tap seek flash — glass, no border */}
                  <AnimatePresence>
                    {seekFlash && (
                      <motion.div
                        key={seekFlash}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.25 }}
                        className={`absolute top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center gap-1 px-5 py-4 rounded-3xl ${seekFlash === 'left' ? 'left-6' : 'right-6'}`}
                        style={{
                          background: 'rgba(255,255,255,0.10)',
                          backdropFilter: 'blur(16px) saturate(160%)',
                          WebkitBackdropFilter: 'blur(16px) saturate(160%)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                        }}
                      >
                        {seekFlash === 'left'
                          ? <ChevronLeft size={28} className="text-white" strokeWidth={2.5} />
                          : <ChevronRight size={28} className="text-white" strokeWidth={2.5} />}
                        <span className="text-white text-[10px] font-semibold tabular-nums">
                          {seekFlash === 'left' ? '-10s' : '+10s'}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Mini progress bar — visible only when controls are hidden */}
                  <AnimatePresence>
                    {!controlsVisible && duration > 0 && (
                      <motion.div
                        key="mini-progress"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/15 pointer-events-none"
                      >
                        <div
                          className="h-full bg-white"
                          style={{ width: `${progress}%`, transition: 'width 0.25s linear' }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Bottom controls — fade with controlsVisible */}
                  <AnimatePresence>
                    {controlsVisible && (
                      <motion.div
                        key="bottom-controls"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
                      >
                        <div className="relative w-full mb-2" style={{ height: '18px', display: 'flex', alignItems: 'center' }}>
                          <div className="absolute left-0 right-0 h-[3px] rounded-full bg-white/20 overflow-hidden">
                            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%`, transition: 'width 0.25s linear' }} />
                          </div>
                          <input
                            type="range" min={0} max={duration || 1} step={0.01} value={currentTime}
                            onMouseDown={handleSeekStart} onTouchStart={handleSeekStart}
                            onChange={handleSeekChange} onMouseUp={handleSeekEnd} onTouchEnd={handleSeekEnd}
                            onClick={(e) => { e.stopPropagation(); showControls(); }}
                            className="absolute left-0 right-0 w-full opacity-0 cursor-pointer" style={{ height: '18px' }}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-white/50 font-mono tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); showControls(); }}
                              className="p-1.5 rounded-full text-white/60 hover:text-white transition-colors"
                              style={{ background: 'rgba(0,0,0,0.3)' }}
                            >
                              {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                            </button>
                            <button
                              onClick={(e) => { handleFullscreen(e); showControls(); }}
                              className="p-1.5 rounded-full text-white/60 hover:text-white transition-colors"
                              style={{ background: 'rgba(0,0,0,0.3)' }}
                              title="Tela cheia"
                            >
                              <Maximize2 size={13} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )
            ) : isMultiImage ? (
              /* ── Multi-image carousel ── */
              <div
                className="relative w-full h-full"
                onTouchStart={handleSwipeStart}
                onTouchEnd={handleSwipeEnd}
              >
                <AnimatePresence mode="wait" custom={swipeDirection}>
                  <motion.img
                    key={activeImageIdx}
                    src={allImages[activeImageIdx]}
                    alt={item.title}
                    custom={swipeDirection}
                    variants={{
                      enter: (d: number) => ({ opacity: 0, x: d * 60 }),
                      center: { opacity: 1, x: 0 },
                      exit: (d: number) => ({ opacity: 0, x: d * -60 }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="w-full h-full object-cover block"
                    referrerPolicy="no-referrer"
                    style={{ display: 'block' }}
                  />
                </AnimatePresence>

                {activeImageIdx > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); goToImage(activeImageIdx - 1); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors z-10"
                  >
                    <ChevronLeft size={18} />
                  </button>
                )}
                {activeImageIdx < allImages.length - 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); goToImage(activeImageIdx + 1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors z-10"
                  >
                    <ChevronRight size={18} />
                  </button>
                )}

                {/* Dot indicator */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                  {allImages.map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-all duration-200"
                      style={{
                        width: i === activeImageIdx ? 16 : 5,
                        height: 5,
                        background: i === activeImageIdx ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                      }}
                    />
                  ))}
                </div>

                {/* Counter */}
                <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-full text-[10px] font-bold text-white z-10">
                  {activeImageIdx + 1}/{allImages.length}
                </div>

                {/* Fullscreen button for images */}
                <button
                  onClick={handleFullscreen}
                  className="absolute top-3 left-3 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white/60 hover:text-white transition-colors z-10"
                  title="Tela cheia"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            ) : (
              <>
                <img
                  src={item.url}
                  alt={item.title}
                  className="w-full h-full object-cover block"
                  referrerPolicy="no-referrer"
                  style={{ display: 'block' }}
                />
                {/* Fullscreen button for single image */}
                <button
                  onClick={handleFullscreen}
                  className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white/60 hover:text-white transition-colors z-10"
                  title="Tela cheia"
                >
                  <Maximize2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bottom row: title + like */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          {item.title && (
            <span
              className="text-[10px] font-bold tracking-widest text-white/35 truncate"
              style={{ maxWidth: '60%', textTransform: 'uppercase' }}
            >
              {item.title}
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            {onSave && (
              <motion.button
                onClick={(e) => { e.stopPropagation(); onSave(item.id); }}
                whileTap={{ scale: 0.85 }}
                transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                className="flex items-center justify-center"
                title={isSaved ? 'Salvo em pasta' : 'Salvar em pasta'}
              >
                <Bookmark
                  size={24}
                  fill={isSaved ? '#facc15' : 'none'}
                  strokeWidth={isSaved ? 0 : 1.8}
                  className={`transition-colors duration-150 ${isSaved ? 'text-yellow-400' : 'text-white/55'}`}
                />
              </motion.button>
            )}

            {!isUserPost && (
              <div className="relative">
                <motion.button
                  key={heartKey}
                  onClick={handleLikeClick}
                  whileTap={{ scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  className="flex items-center justify-center"
                >
                  <motion.div
                    animate={localIsLiked ? { scale: [1, 1.5, 0.9, 1.1, 1], rotate: [0, -8, 8, -4, 0] } : { scale: 1 }}
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
        </div>

        {/* Description */}
        {item.description && (
          <div className="px-4 pb-3">
            <p className="text-[9px] font-normal text-white/35 leading-relaxed lowercase break-words">
              {item.description.split(/(https?:\/\/[^\s]+|\B#\w+)/g).map((part, i) => {
                if (/^https?:\/\//.test(part)) {
                  return (
                    <a
                      key={i}
                      href={part}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-green-400 underline underline-offset-2 hover:text-green-300 transition-colors"
                    >
                      {part}
                    </a>
                  );
                }
                if (/^\B#\w+/.test(part) || part.startsWith('#')) {
                  const tag = part.slice(1);
                  return (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onHashtagClick) { onHashtagClick(tag); onClose(); }
                      }}
                      className={onHashtagClick ? 'text-blue-400 hover:text-blue-300 transition-colors cursor-pointer' : 'text-blue-400/50 cursor-default'}
                    >
                      {part}
                    </button>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
