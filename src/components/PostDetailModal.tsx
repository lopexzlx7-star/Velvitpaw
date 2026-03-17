import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Heart, User, Play, Pause } from 'lucide-react';
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

const isVideoType = (type: string) => type === 'video' || type === 'gif';

const PostDetailModal: React.FC<PostDetailModalProps> = ({
  item,
  onClose,
  onLike,
  isLiked,
  currentUserUid
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const playPauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVideo = isVideoType(item.type);

  const getModalWidth = () => {
    const ar = item.aspectRatio;
    if (ar === 'portrait' || isVideo) return 'min(380px, calc(100vw - 32px))';
    if (ar === 'wide' || ar === 'landscape') return 'min(560px, calc(100vw - 32px))';
    if (ar === 'square') return 'min(420px, calc(100vw - 32px))';
    return 'min(380px, calc(100vw - 32px))';
  };

  const getMediaStyle = (): React.CSSProperties => {
    const ar = item.aspectRatio;
    if (isVideo || ar === 'portrait') return { aspectRatio: '9/16', maxHeight: '65vh' };
    if (ar === 'wide') return { aspectRatio: '16/9' };
    if (ar === 'landscape') return { aspectRatio: '4/3' };
    if (ar === 'square') return { aspectRatio: '1/1' };
    return { maxHeight: '55vh' };
  };

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
          setAuthorPhoto(data.profilePhotoUrl || item.authorPhotoUrl || null);
        }
      } catch {}
    };
    fetchAuthor();
  }, [item.authorUid, item.authorName]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    const onTime = () => { if (!isSeeking) setCurrentTime(video.currentTime); };
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
  }, [isVideo, isSeeking, item.duration]);

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
    flashPlayPause();
  };

  const handleSeekStart = () => setIsSeeking(true);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) videoRef.current.currentTime = val;
  };

  const handleSeekEnd = () => setIsSeeking(false);

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
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 50, opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: getModalWidth(),
          borderRadius: '2.2rem',
          background: 'rgba(14,14,14,0.92)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 50px 120px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}
      >
        {/* Author row */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
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
            <span className="text-[13px] font-semibold text-white/85 tracking-tight">@{authorName}</span>
          </div>
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
            className="relative overflow-hidden w-full"
            style={{
              borderRadius: '1.6rem',
              border: '1px solid rgba(255,255,255,0.08)',
              ...getMediaStyle(),
            }}
          >
            {isVideo ? (
              <>
                <video
                  ref={videoRef}
                  src={item.url}
                  poster={item.thumbnailUrl || undefined}
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                  onClick={togglePlay}
                  style={{ cursor: 'pointer', display: 'block' }}
                />

                {/* Central play/pause flash */}
                <AnimatePresence>
                  {showPlayPause && (
                    <motion.div
                      initial={{ opacity: 0.9, scale: 0.8 }}
                      animate={{ opacity: 0.9, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.2 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <div
                        className="w-16 h-16 flex items-center justify-center rounded-full"
                        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
                      >
                        {isPlaying
                          ? <Pause size={26} className="text-white/80" fill="currentColor" />
                          : <Play size={26} className="text-white/80" fill="currentColor" />}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Video controls overlay at bottom */}
                <div
                  className="absolute bottom-0 left-0 right-0 px-4 pb-3 pt-8"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}
                >
                  {/* Seek bar */}
                  <div className="relative w-full mb-2" style={{ height: '18px', display: 'flex', alignItems: 'center' }}>
                    <div className="absolute left-0 right-0 h-[3px] rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 1}
                      step={0.01}
                      value={currentTime}
                      onMouseDown={handleSeekStart}
                      onTouchStart={handleSeekStart}
                      onChange={handleSeekChange}
                      onMouseUp={handleSeekEnd}
                      onTouchEnd={handleSeekEnd}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 right-0 w-full opacity-0 cursor-pointer"
                      style={{ height: '18px' }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/50 font-mono tabular-nums">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                      className="p-1.5 rounded-full text-white/60 hover:text-white transition-colors"
                      style={{ background: 'rgba(0,0,0,0.3)' }}
                    >
                      {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <img
                src={item.url}
                alt={item.title}
                className="w-full h-full object-cover block"
                referrerPolicy="no-referrer"
                style={{ display: 'block' }}
              />
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

        {/* Description — below title */}
        {item.description && (
          <div className="px-4 pb-4">
            <p className="text-[9px] font-normal text-white/35 leading-relaxed lowercase break-words">
              {item.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
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
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default PostDetailModal;
