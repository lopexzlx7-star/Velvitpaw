import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, X, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';

interface Post {
  id: string;
  title?: string;
  authorName?: string;
  url?: string;
  type?: string;
  thumbnailUrl?: string;
  createdAt?: string;
}

interface CleanupPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CleanupPostsModal: React.FC<CleanupPostsModalProps> = ({ isOpen, onClose }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(true);
    getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(200)))
      .then(snap => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) })));
      })
      .catch(() => setError('Não foi possível carregar os posts.'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'posts', id));
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch {
      setError('Erro ao excluir. Tente novamente.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 220 }}
        className="relative w-full sm:max-w-md flex flex-col rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(30,30,30,0.98) 0%, rgba(18,18,18,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.6)',
          maxHeight: '85vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white">Gerenciar Posts</h2>
            <p className="text-white/30 text-xs mt-0.5">{posts.length} posts carregados</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin text-white/30" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400/80 text-xs py-4 px-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {!loading && posts.length === 0 && !error && (
            <p className="text-white/30 text-sm text-center py-12">Nenhum post encontrado.</p>
          )}

          <AnimatePresence initial={false}>
            {posts.map(post => {
              const thumb = post.thumbnailUrl || (
                post.type === 'image' || post.type === 'gif' ? post.url : null
              );
              const isDataUrl = thumb?.startsWith('data:');
              const showThumb = thumb && !isDataUrl;

              return (
                <motion.div
                  key={post.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0"
                >
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0 overflow-hidden flex items-center justify-center">
                    {showThumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white/20 text-[10px] uppercase">{post.type?.[0] ?? '?'}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">
                      {post.title || 'Sem título'}
                    </p>
                    <p className="text-white/35 text-[10px] truncate">
                      @{post.authorName || '—'}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(post.id)}
                    disabled={deletingId === post.id}
                    className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 flex items-center justify-center text-red-400/60 hover:text-red-400 transition-all disabled:opacity-40 shrink-0"
                  >
                    {deletingId === post.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default CleanupPostsModal;
