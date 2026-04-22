import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, UserPlus, UserCheck, Loader2, Bell, Mail } from 'lucide-react';
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
      className="fixed inset-0 z-[200] overflow-y-auto no-scrollbar"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)' }}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-4 pb-3"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)' }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">Perfil</span>
        <div className="w-10 h-10" />
      </div>

      <div className="px-4 pb-24 max-w-4xl mx-auto">
        {/* Profile card */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="glass-panel rounded-3xl p-6 md:p-8"
        >
          <div className="flex items-center gap-5">
            <div
              className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-white/5"
              style={{ border: '2px solid rgba(255,255,255,0.12)' }}
            >
              {profilePhoto ? (
                <img src={profilePhoto} alt={username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User size={32} className="text-white/30" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white truncate">@{username || '...'}</h2>
              <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                <span><span className="text-white/80 font-semibold">{posts.length}</span> {posts.length === 1 ? 'post' : 'posts'}</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span><span className="text-white/80 font-semibold">{followersCount}</span> {followersCount === 1 ? 'seguidor' : 'seguidores'}</span>
              </div>
            </div>
          </div>

          {/* Action row */}
          {!isOwnProfile && (
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => onFollow(targetUid)}
                className={`flex-1 h-12 flex items-center justify-center gap-2 rounded-full text-sm font-semibold tracking-wide transition-all active:scale-[0.98] ${
                  isFollowing
                    ? 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
                    : 'bg-white text-black hover:bg-white/90 accent-primary-btn'
                }`}
              >
                {isFollowing ? <><UserCheck size={16} /> Seguindo</> : <><UserPlus size={16} /> Seguir</>}
              </button>
              <button
                disabled
                title="Em breve"
                className="w-12 h-12 flex items-center justify-center rounded-full text-white/50 hover:text-white transition-colors disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <Mail size={16} />
              </button>
              <button
                disabled
                title="Em breve"
                className="w-12 h-12 flex items-center justify-center rounded-full text-white/50 hover:text-white transition-colors disabled:opacity-60"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <Bell size={16} />
              </button>
            </div>
          )}
        </motion.div>

        {/* Posts */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Posts</span>
            <span className="text-[10px] text-white/30">{posts.length}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-white/30 text-sm">
              <Loader2 size={16} className="animate-spin" />
              Carregando...
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/30 text-sm gap-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white/5 border border-white/10">
                <User size={22} className="text-white/20" />
              </div>
              Nenhum post ainda
            </div>
          ) : (
            <div className="columns-2 sm:columns-3 gap-4">
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
    </motion.div>
  );
};

export default UserProfileModal;
