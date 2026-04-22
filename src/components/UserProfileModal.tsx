import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, User, UserPlus, UserCheck, Loader2, Bell, Mail } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
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
  likedIds?: string[];
  onLike?: (id: string) => void;
  onHashtagClick?: (tag: string) => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  targetUid,
  currentUserUid,
  isFollowing,
  onFollow,
  onClose,
  onPostClick,
  likedIds = [],
  onLike,
  onHashtagClick,
}) => {
  const [username, setUsername] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [followersCount, setFollowersCount] = useState(0);

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
        className="relative w-full max-w-md my-auto rounded-[2.5rem] overflow-hidden"
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
                disabled
                title="Em breve"
                className="w-11 h-11 flex items-center justify-center rounded-full text-white/50 transition-colors disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <Mail size={15} />
              </button>
              <button
                disabled
                title="Em breve"
                className="w-11 h-11 flex items-center justify-center rounded-full text-white/50 transition-colors disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <Bell size={15} />
              </button>
            </div>
          )}

          {/* Posts grid inside the popup */}
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
              <div className="max-h-[55vh] overflow-y-auto no-scrollbar -mx-1 px-1">
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
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default UserProfileModal;
