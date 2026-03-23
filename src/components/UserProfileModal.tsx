import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, User, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ContentItem } from '../types';

interface UserProfileModalProps {
  targetUid: string;
  currentUserUid?: string;
  isFollowing: boolean;
  onFollow: (uid: string) => void;
  onClose: () => void;
  onPostClick?: (post: ContentItem) => void;
}

const isVideoType = (type: string) => type === 'video' || type === 'gif';

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  targetUid,
  currentUserUid,
  isFollowing,
  onFollow,
  onClose,
  onPostClick,
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
      className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(24px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          maxHeight: '88vh',
          background: 'rgba(18,18,24,0.98)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 40px 100px rgba(0,0,0,0.9)',
        }}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b border-white/5">
          <span className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">Perfil</span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Profile info */}
        <div className="px-5 py-5 flex items-center gap-4 border-b border-white/5">
          <div
            className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center shrink-0"
            style={{ border: '2px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)' }}
          >
            {profilePhoto ? (
              <img src={profilePhoto} alt={username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User size={24} className="text-white/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-bold text-lg tracking-tight truncate">@{username || '...'}</div>
            <div className="text-white/30 text-xs mt-0.5">
              {followersCount} {followersCount === 1 ? 'seguidor' : 'seguidores'} · {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            </div>
          </div>
          {!isOwnProfile && (
            <button
              onClick={() => onFollow(targetUid)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shrink-0 ${
                isFollowing
                  ? 'bg-white/10 text-white/60 hover:bg-white/15'
                  : 'bg-white text-black hover:bg-white/90 active:scale-95'
              }`}
            >
              {isFollowing ? <><UserMinus size={13} />Seguindo</> : <><UserPlus size={13} />Seguir</>}
            </button>
          )}
        </div>

        {/* Posts grid */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-white/20 text-sm">
              <Loader2 size={16} className="animate-spin" />
              Carregando...
            </div>
          ) : posts.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-white/20 text-sm">
              Nenhum post ainda
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-px">
              {posts.map(post => {
                const thumb = post.thumbnailUrl ||
                  (isVideoType(post.type) ? post.thumbnailUrl : null) ||
                  (post.images && post.images[0]) ||
                  post.url;
                return (
                  <button
                    key={post.id}
                    onClick={() => onPostClick?.(post)}
                    className="relative bg-white/5 overflow-hidden hover:opacity-75 active:opacity-60 transition-opacity"
                    style={{ aspectRatio: '1' }}
                  >
                    {thumb && (
                      <img
                        src={thumb}
                        alt={post.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {isVideoType(post.type) && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[9px] border-l-white ml-0.5" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default UserProfileModal;
