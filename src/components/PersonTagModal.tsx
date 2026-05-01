import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, Loader2 } from 'lucide-react';
import {
  collection, query, where, getDocs, orderBy, doc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { ContentItem } from '../types';
import GlassCard from './GlassCard';

export interface PersonTag {
  slug: string;
  name: string;
  photoUrl?: string;
  postCount: number;
  createdAt: string;
}

interface PersonTagModalProps {
  slug: string;
  onClose: () => void;
  onPostClick?: (post: ContentItem) => void;
  likedIds?: string[];
  savedIds?: string[];
  onLike?: (id: string) => void;
  onHashtagClick?: (tag: string) => void;
}

function nameInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

const PersonTagModal: React.FC<PersonTagModalProps> = ({
  slug,
  onClose,
  onPostClick,
  likedIds = [],
  savedIds = [],
  onLike,
  onHashtagClick,
}) => {
  const [tag, setTag] = useState<PersonTag | null>(null);
  const [posts, setPosts] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const tagSnap = await getDocs(
          query(collection(db, 'person_tags'), where('slug', '==', slug))
        );
        let resolved: PersonTag | null = null;
        if (!tagSnap.empty) {
          resolved = tagSnap.docs[0].data() as PersonTag;
          setTag(resolved);
        }

        const postsSnap = await getDocs(
          query(
            collection(db, 'posts'),
            where('personTags', 'array-contains', slug),
            orderBy('createdAt', 'desc')
          )
        );
        const fetched = postsSnap.docs.map(d => ({ ...d.data(), id: d.id })) as ContentItem[];
        setPosts(fetched);

        // If we have a photoUrl already, use it
        if (resolved?.photoUrl) {
          setCoverUrl(resolved.photoUrl);
        } else {
          // Try to auto-fetch from Wikipedia and save to Firestore
          try {
            const photoRes = await fetch(
              `/api/person-tag-photo?name=${encodeURIComponent(resolved?.name ?? slug)}`
            );
            if (photoRes.ok) {
              const { photoUrl, officialName } = await photoRes.json();
              if (photoUrl) {
                setCoverUrl(photoUrl);
                // Persist photo back to Firestore so future loads are instant
                await setDoc(
                  doc(db, 'person_tags', slug),
                  { photoUrl, ...(officialName ? { name: officialName } : {}), updatedAt: new Date().toISOString() },
                  { merge: true }
                );
                if (resolved && officialName) resolved.name = officialName;
                setTag(prev => prev ? { ...prev, photoUrl, ...(officialName ? { name: officialName } : {}) } : prev);
              } else if (fetched.length > 0) {
                // Fallback: derive from first post image
                const first = fetched[0];
                const cover = (first.type === 'image' ? first.url : null) ?? (first as any).thumbnailUrl ?? null;
                setCoverUrl(cover);
              }
            }
          } catch {
            // Fallback from post image
            if (fetched.length > 0) {
              const first = fetched[0];
              setCoverUrl((first.type === 'image' ? first.url : null) ?? (first as any).thumbnailUrl ?? null);
            }
          }
        }
      } catch (err) {
        console.error('PersonTagModal load error', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  return (
    <AnimatePresence>
      <motion.div
        key="person-tag-modal"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        className="fixed inset-0 z-[150] flex flex-col"
        style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(18px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-safe pt-6 pb-4 shrink-0">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/8 hover:bg-white/15 text-white/60 hover:text-white transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-white/30">
            Perfil de tag
          </span>
        </div>

        {/* Profile section */}
        <div className="px-5 pb-6 shrink-0">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className="w-20 h-20 rounded-[1.5rem] overflow-hidden flex items-center justify-center shrink-0 border border-white/10"
              style={{ background: 'rgba(255,255,255,0.07)' }}
            >
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={tag?.name ?? slug}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-2xl font-black text-white/40">
                  {nameInitials(tag?.name ?? slug)}
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-white leading-tight truncate">
                {tag?.name ?? slug}
              </h2>
              <p className="text-[11px] text-white/30 uppercase tracking-widest mt-0.5">
                {loading ? '...' : `${posts.length} post${posts.length !== 1 ? 's' : ''}`}
              </p>
            </div>

            <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px mx-5 bg-white/8 shrink-0" />

        {/* Posts grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="text-white/20 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <span className="text-4xl mb-4">🔍</span>
              <p className="text-white/30 text-xs uppercase tracking-widest">
                Nenhum post com esta tag ainda
              </p>
            </div>
          ) : (
            <div className="columns-2 gap-3">
              {posts.map(post => (
                <GlassCard
                  key={post.id}
                  item={post}
                  isLiked={likedIds.includes(post.id)}
                  isSaved={savedIds.includes(post.id)}
                  onLike={id => onLike?.(id)}
                  onClick={p => onPostClick?.(p)}
                  onHashtagClick={onHashtagClick}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PersonTagModal;
