import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, UserPlus, UserCheck, Loader2, Users, ChevronLeft } from 'lucide-react';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { ContentItem } from '../types';
import GlassCard from './GlassCard';

interface UserProfileModalProps {
  targetUid: string;
  currentUserUid?: string;
  isFollowing: boolean;
  onFollow: (uid: string) => void;
  onClose: () => void;
  onPostClick?: (post: ContentItem) => void;
  onOpenUser?: (uid: string) => void;
  likedIds?: string[];
  onLike?: (id: string) => void;
  onHashtagClick?: (tag: string) => void;
}

interface FollowedUser {
  uid: string;
  username: string;
  profilePhotoUrl: string | null;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  targetUid,
  currentUserUid,
  isFollowing,
  onFollow,
  onClose,
  onPostClick,
  onOpenUser,
  likedIds = [],
  onLike,
  onHashtagClick,
}) => {
  const [username, setUsername] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);

  const [showFollowing, setShowFollowing] = useState(false);
  const [followingList, setFollowingList] = useState<FollowedUser[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', targetUid)));
        if (!usersSnap.empty) {
          const data = usersSnap.docs[0].data();
          setUsername(data.username || '');
          setProfilePhoto(data.profilePhotoUrl || null);
        }

        const postsSnap = await getDocs(query(collection(db, 'posts'), where('authorUid', '==', targetUid)));
        const userPosts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ContentItem));
        userPosts.sort((a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        setPosts(userPosts);

        const followersSnap = await getDocs(query(collection(db, 'following'), where('followingUid', '==', targetUid)));
        setFollowersCount(followersSnap.size);
      } catch (err) {
        console.error('Error loading profile:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [targetUid]);

  const loadFollowing = async () => {
    setFollowingLoading(true);
    try {
      const followSnap = await getDocs(
        query(collection(db, 'following'), where('followerUid', '==', targetUid))
      );
      const uids = Array.from(new Set(followSnap.docs.map(d => d.data().followingUid as string)));
      if (uids.length === 0) { setFollowingList([]); return; }

      // Fetch user docs in chunks of 10 (firestore "in" limit)
      const chunks: string[][] = [];
      for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));

      const all: FollowedUser[] = [];
      for (const chunk of chunks) {
        // Try by `uid` field first; fall back to docId
        const snap = await getDocs(query(collection(db, 'users'), where('uid', 'in', chunk)));
        snap.docs.forEach(d => {
          const data = d.data() as any;
          all.push({
            uid: data.uid || d.id,
            username: data.username || '',
            profilePhotoUrl: data.profilePhotoUrl || null,
          });
        });
        // Add any uids that didn't match by `uid` field, by docId
        const matched = new Set(snap.docs.map(d => (d.data() as any).uid || d.id));
        const missing = chunk.filter(u => !matched.has(u));
        if (missing.length > 0) {
          try {
            const byIdSnap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', missing)));
            byIdSnap.docs.forEach(d => {
              const data = d.data() as any;
              all.push({
                uid: data.uid || d.id,
                username: data.username || '',
                profilePhotoUrl: data.profilePhotoUrl || null,
              });
            });
          } catch {}
        }
      }
      setFollowingList(all);
    } catch (err) {
      console.error('Error loading following:', err);
      setFollowingList([]);
    } finally {
      setFollowingLoading(false);
    }
  };

  const openFollowing = () => {
    setShowFollowing(true);
    loadFollowing();
  };

  const isOwnProfile = currentUserUid === targetUid;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto no-scrollbar"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 8 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md my-auto rounded-[2.5rem] overflow-hidden glass-panel"
        style={{
          background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 100%)',
          backdropFilter: 'blur(30px) saturate(160%)',
          WebkitBackdropFilter: 'blur(30px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow:
            '0 40px 100px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 30px -10px rgba(0,0,0,0.4)',
        }}
      >
        {/* Specular highlights — bubble glass effect */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[2.5rem]"
          style={{
            background:
              'radial-gradient(120% 50% at 50% -10%, rgba(255,255,255,0.18), transparent 55%), radial-gradient(80% 40% at 50% 110%, rgba(255,255,255,0.10), transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full text-white/60 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        <div className="relative px-6 pt-7 pb-6">
          {/* Header: avatar + username + counts */}
          <div className="flex items-center gap-4">
            <div
              className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-white/5"
              style={{
                border: '1.5px solid rgba(255,255,255,0.18)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px -4px rgba(0,0,0,0.5)',
              }}
            >
              {profilePhoto ? (
                <img src={profilePhoto} alt={username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={28} className="text-white/40" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl font-black tracking-tight text-white truncate leading-none">
                @{username || '...'}
              </h2>
              <div className="flex items-center gap-4 mt-2.5 text-[11px] text-white/55">
                <span><span className="text-white font-bold text-sm">{posts.length}</span> Posts</span>
                <span><span className="text-white font-bold text-sm">{followersCount}</span> Seguidores</span>
              </div>
            </div>
          </div>

          {/* Action row */}
          {!isOwnProfile && (
            <div className="mt-5 flex items-center gap-2.5">
              <button
                onClick={() => onFollow(targetUid)}
                className={`flex-1 h-11 flex items-center justify-center gap-2 rounded-full text-sm font-semibold tracking-wide transition-all active:scale-[0.98] ${
                  isFollowing
                    ? 'text-white border border-white/15 hover:bg-white/15'
                    : 'text-white border border-white/20 hover:bg-white/10'
                }`}
                style={{
                  background: isFollowing
                    ? 'rgba(255,255,255,0.08)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
                }}
              >
                {isFollowing ? <><UserCheck size={15} /> Seguindo</> : <><UserPlus size={15} /> Seguir</>}
              </button>
              <button
                onClick={openFollowing}
                title="Quem este usuário segue"
                className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
                aria-label="Ver quem este usuário segue"
              >
                <UserPlus size={16} />
              </button>
            </div>
          )}

          {/* Posts grid — scrolls together with the header */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] uppercase tracking-widest text-white/45 font-bold">Posts</span>
              <span className="text-[10px] text-white/30">{posts.length}</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-white/30 text-sm">
                <Loader2 size={16} className="animate-spin" />
                Carregando...
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/30 text-sm gap-2">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10">
                  <User size={20} className="text-white/20" />
                </div>
                Nenhum post ainda
              </div>
            ) : (
              <div className="columns-2 gap-3">
                {posts.map(post => (
                  <GlassCard
                    key={`user-profile-${post.id}`}
                    item={post}
                    isLiked={likedIds.includes(post.id)}
                    onLike={(id) => onLike?.(id)}
                    onClick={() => onPostClick?.(post)}
                    onHashtagClick={onHashtagClick}
                    isUserPost={false}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Following list overlay */}
        <AnimatePresence>
          {showFollowing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex flex-col rounded-[2.5rem] overflow-hidden"
              style={{
                background: 'linear-gradient(160deg, rgba(20,20,22,0.96) 0%, rgba(14,14,16,0.98) 100%)',
                backdropFilter: 'blur(30px) saturate(160%)',
                WebkitBackdropFilter: 'blur(30px) saturate(160%)',
              }}
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
                <button
                  onClick={() => setShowFollowing(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Seguindo</div>
                  <div className="text-sm font-bold text-white truncate">@{username || '...'}</div>
                </div>
                <Users size={16} className="text-white/40" />
              </div>

              <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
                {followingLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-white/40 text-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Carregando...
                  </div>
                ) : followingList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-white/40 gap-2">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-white/5 border border-white/10">
                      <Users size={20} className="text-white/25" />
                    </div>
                    <p className="text-xs uppercase tracking-widest">Não segue ninguém ainda</p>
                  </div>
                ) : (
                  followingList.map(u => (
                    <button
                      key={u.uid}
                      onClick={() => {
                        if (u.uid === targetUid) { setShowFollowing(false); return; }
                        if (onOpenUser) {
                          setShowFollowing(false);
                          onOpenUser(u.uid);
                        }
                      }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-white/5"
                        style={{ border: '1px solid rgba(255,255,255,0.10)' }}
                      >
                        {u.profilePhotoUrl ? (
                          <img src={u.profilePhotoUrl} alt={u.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User size={18} className="text-white/30" />
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-bold text-white truncate">@{u.username || '...'}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default UserProfileModal;
