import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, Heart, UserPlus, Sparkles, Film, CheckCheck, Loader2 } from 'lucide-react';
import SwipeableNotification from './SwipeableNotification';

export interface AppNotification {
  id: string;
  type: 'like' | 'new_follower' | 'new_post' | 'recommended' | 'comment';
  fromUserName?: string;
  fromUserPhotoUrl?: string | null;
  postThumbnailUrl?: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  onUnreadChange: (count: number) => void;
  onPostClick?: (postId: string) => void;
}

const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}sem`;
}

function NotifIcon({ type }: { type: AppNotification['type'] }) {
  if (type === 'like') return <Heart size={14} className="text-red-400" fill="currentColor" />;
  if (type === 'new_follower') return <UserPlus size={14} className="text-blue-400" />;
  if (type === 'new_post') return <Film size={14} className="text-purple-400" />;
  if (type === 'recommended') return <Sparkles size={14} className="text-yellow-400" />;
  return <Bell size={14} className="text-white/50" />;
}

const NotificationsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  userId,
  onUnreadChange,
  onPostClick,
}) => {
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifs = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const list: AppNotification[] = Array.isArray(data) ? data : (data.notifications ?? []);
      setNotifs(list);
      onUnreadChange(list.filter(n => !n.read).length);
    } catch {}
  }, [userId, onUnreadChange]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifs();
    const interval = setInterval(fetchNotifs, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, fetchNotifs]);

  useEffect(() => {
    if (isOpen && userId) {
      setLoading(true);
      fetchNotifs().finally(() => setLoading(false));
    }
  }, [isOpen, userId, fetchNotifs]);

  const markRead = async (id: string) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    onUnreadChange(notifs.filter(n => !n.read && n.id !== id).length);
    try { await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
  };

  const markAllRead = async () => {
    if (!userId) return;
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    onUnreadChange(0);
    try { await fetch(`/api/notifications/${encodeURIComponent(userId)}/read-all`, { method: 'PATCH' }); } catch {}
  };

  const deleteNotif = async (id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    onUnreadChange(notifs.filter(n => !n.read && n.id !== id).length);
    try { await fetch(`/api/notifications/${id}`, { method: 'DELETE' }); } catch {}
  };

  const handleNotifClick = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    if (n.postId && onPostClick) onPostClick((n as any).postId);
  };

  const unread = notifs.filter(n => !n.read).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="fixed top-24 right-4 md:right-8 z-[210] w-[min(380px,calc(100vw-2rem))] glass-panel rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <Bell size={16} className="accent-icon" />
                <span className="text-sm font-black uppercase tracking-widest text-white">Notificações</span>
                {unread > 0 && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full accent-primary-btn">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                  >
                    <CheckCheck size={13} />
                    Tudo lido
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="max-h-[min(70vh,480px)] overflow-y-auto no-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={22} className="text-white/30 animate-spin" />
                </div>
              ) : notifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Bell size={22} className="text-white/15" />
                  </div>
                  <p className="text-sm font-bold text-white/30 uppercase tracking-widest">Sem notificações</p>
                  <p className="text-xs text-white/20 mt-1">Quando algo acontecer, você verá aqui.</p>
                </div>
              ) : (
                <div className="py-1">
                  {notifs.map(n => (
                    <SwipeableNotification
                      key={n.id}
                      onDelete={() => deleteNotif(n.id)}
                      onClick={() => handleNotifClick(n)}
                      className="rounded-xl mx-2 my-0.5"
                    >
                      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl transition-colors ${n.read ? 'opacity-60' : ''}`}>
                        <div className="relative shrink-0">
                          {n.fromUserPhotoUrl ? (
                            <img
                              src={n.fromUserPhotoUrl}
                              alt={n.fromUserName}
                              className="w-10 h-10 rounded-full object-cover border border-white/10"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/40 text-xs font-bold">
                              {(n.fromUserName || '?')[0].toUpperCase()}
                            </div>
                          )}
                          <span className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-black/70 border border-white/10 flex items-center justify-center">
                            <NotifIcon type={n.type} />
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-white leading-snug line-clamp-2">{n.message}</p>
                          <p className="text-[11px] text-white/35 mt-0.5">{timeAgo(n.createdAt)}</p>
                        </div>

                        {n.postThumbnailUrl && (
                          <img
                            src={n.postThumbnailUrl}
                            alt=""
                            className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                        )}

                        {!n.read && (
                          <span className="w-2 h-2 rounded-full accent-primary-btn shrink-0 mt-1" />
                        )}
                      </div>
                    </SwipeableNotification>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-white/8 flex justify-center">
              <p className="text-[10px] text-white/20 uppercase tracking-widest">Deslize para a esquerda para apagar</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationsModal;
