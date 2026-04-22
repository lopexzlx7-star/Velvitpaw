import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Folder as FolderIcon, Sparkles, ChevronDown } from 'lucide-react';
import { Folder, ContentItem } from '../types';
import GlassCard from './GlassCard';
import FolderCover from './FolderCover';

interface Props {
  open: boolean;
  folder: Folder | null;
  allPosts: ContentItem[];
  likedIds: string[];
  savedIds: string[];
  followingUids: string[];
  currentUid: string | undefined;
  onClose: () => void;
  onOpenPost: (post: ContentItem) => void;
  onLike: (id: string) => void;
  onSave: (post: ContentItem) => void;
  onFollow: (uid: string) => void;
  onDelete: (id: string) => void;
  onHashtagClick: (tag: string) => void;
  onRemoveFromFolder: (folder: Folder, postId: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
}

const FolderDetailModal: React.FC<Props> = ({
  open, folder, allPosts, likedIds, savedIds, followingUids, currentUid,
  onClose, onOpenPost, onLike, onSave, onFollow, onDelete, onHashtagClick,
  onRemoveFromFolder, onDeleteFolder,
}) => {
  const [showRelated, setShowRelated] = useState(false);
  const [aiRanked, setAiRanked] = useState<ContentItem[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const posts = useMemo(() => {
    if (!folder) return [];
    const map = new Map(allPosts.map(p => [p.id, p]));
    return folder.postIds
      .map(id => map.get(id))
      .filter((p): p is ContentItem => Boolean(p));
  }, [folder, allPosts]);

  // Build a tag-frequency profile from the folder's posts and the folder name,
  // then rank other posts by overlap with that profile.
  const relatedPosts = useMemo(() => {
    if (!folder) return [] as ContentItem[];

    const tagWeights = new Map<string, number>();
    const bumpTag = (raw: string, weight: number) => {
      const t = raw.toLowerCase().replace(/^#/, '').trim();
      if (!t) return;
      tagWeights.set(t, (tagWeights.get(t) || 0) + weight);
    };

    // Tokens from the folder name itself
    folder.name.split(/[\s,/_-]+/).forEach(word => {
      if (word.length >= 3) bumpTag(word, 2);
    });

    // Tags from the posts inside
    posts.forEach(p => {
      (p.hashtags || []).forEach(t => bumpTag(t, 3));
      (p.title || '').split(/[\s,]+/).forEach(w => {
        if (w.length >= 4) bumpTag(w, 1);
      });
    });

    if (tagWeights.size === 0) return [];

    const inFolder = new Set(folder.postIds);
    const scored = allPosts
      .filter(p => !inFolder.has(p.id) && !(p as any).archived)
      .map(p => {
        let score = 0;
        (p.hashtags || []).forEach(t => {
          const w = tagWeights.get(t.toLowerCase());
          if (w) score += w * 3;
        });
        const titleLower = (p.title || '').toLowerCase();
        tagWeights.forEach((w, t) => {
          if (titleLower.includes(t)) score += w;
        });
        return { post: p, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60)
      .map(x => x.post);

    return scored;
  }, [folder, posts, allPosts]);

  useEffect(() => {
    if (!showRelated || !folder) return;
    if (relatedPosts.length === 0) { setAiRanked([]); return; }

    let cancelled = false;
    setAiLoading(true);
    setAiRanked(null);

    const candidates = relatedPosts.slice(0, 80).map(p => ({
      id: p.id,
      title: p.title || '',
      hashtags: p.hashtags || [],
    }));
    const folderPostsPayload = posts.slice(0, 20).map(p => ({
      title: p.title || '',
      hashtags: p.hashtags || [],
    }));

    fetch('/api/recommend-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderName: folder.name,
        folderPosts: folderPostsPayload,
        candidates,
      }),
    })
      .then(r => r.json())
      .then((data: { ids?: string[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.ids) && data.ids.length > 0) {
          const map = new Map(relatedPosts.map(p => [p.id, p]));
          const ordered = data.ids.map(id => map.get(id)).filter((x): x is ContentItem => Boolean(x));
          setAiRanked(ordered);
        } else {
          setAiRanked(relatedPosts);
        }
      })
      .catch(() => { if (!cancelled) setAiRanked(relatedPosts); })
      .finally(() => { if (!cancelled) setAiLoading(false); });

    return () => { cancelled = true; };
  }, [showRelated, folder, relatedPosts, posts]);

  if (!folder) return null;

  const handleDeleteFolder = async () => {
    if (!confirm(`Excluir a pasta "${folder.name}"? Os posts não serão removidos.`)) return;
    await onDeleteFolder(folder.id);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)' }}
        >
          <div className="min-h-screen px-4 md:px-8 py-6">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={onClose}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={handleDeleteFolder}
                  className="w-10 h-10 rounded-full bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 flex items-center justify-center text-white/60 hover:text-red-400 transition-colors"
                  title="Excluir pasta"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex flex-col items-center text-center mb-10">
                <div className="w-32 h-32 mb-4">
                  <FolderCover folder={folder} allPosts={allPosts} rounded="rounded-2xl" />
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-2">{folder.name}</h1>
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  {posts.length} {posts.length === 1 ? 'pin' : 'pins'}
                </div>
                {folder.description && (
                  <p className="mt-3 text-sm text-white/60 max-w-md mx-auto">{folder.description}</p>
                )}
              </div>

              {posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 text-center">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                    <FolderIcon size={32} className="text-white/15" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-tighter">Pasta vazia</h3>
                  <p className="text-white/40 text-xs uppercase tracking-widest">
                    Salve posts aqui para começar
                  </p>
                </div>
              ) : (
                <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
                  {posts.map(item => (
                    <div key={item.id} className="relative group mb-4 break-inside-avoid">
                      <GlassCard
                        item={item}
                        isLiked={likedIds.includes(item.id)}
                        isSaved={savedIds.includes(item.id)}
                        isFollowing={followingUids.includes((item as any).authorUid)}
                        onLike={onLike}
                        onSave={onSave}
                        onFollow={onFollow}
                        onDelete={onDelete}
                        onClick={() => onOpenPost(item)}
                        onHashtagClick={onHashtagClick}
                        isUserPost={(item as any).authorUid === currentUid}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveFromFolder(folder, item.id); }}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-red-500/80 border border-white/15 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Remover da pasta"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Floating circular Relacionados button */}
          <button
            onClick={() => setShowRelated(true)}
            className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-xl flex items-center justify-center text-white shadow-2xl transition-all z-[155] hover:scale-105"
            title="Posts relacionados"
            style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.6)' }}
          >
            <Sparkles size={20} />
          </button>

          {/* Related posts bottom sheet */}
          <AnimatePresence>
            {showRelated && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[160] flex items-end justify-center"
                style={{ background: 'rgba(0,0,0,0.55)' }}
                onClick={() => setShowRelated(false)}
              >
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                  onClick={(e) => e.stopPropagation()}
                  className="relative w-full max-w-3xl rounded-t-[2rem] overflow-hidden glass-panel"
                  style={{
                    maxHeight: '85vh',
                    background: 'rgba(16,16,18,0.92)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    backdropFilter: 'blur(28px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(140%)',
                    boxShadow: '0 -20px 60px -10px rgba(0,0,0,0.7)',
                  }}
                >
                  <div className="flex flex-col h-full" style={{ maxHeight: '85vh' }}>
                    {/* Drag handle + header */}
                    <div className="px-5 pt-3 pb-4 border-b border-white/5">
                      <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-3" />
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles size={14} className="text-white/70" />
                          <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                            Relacionados a "{folder.name}"
                          </h3>
                        </div>
                        <button
                          onClick={() => setShowRelated(false)}
                          className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                        >
                          <ChevronDown size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
                      {aiLoading && (
                        <div className="flex items-center justify-center gap-2 py-3 text-white/40 text-[10px] uppercase tracking-widest">
                          <div className="w-3 h-3 rounded-full border border-white/20 border-t-white/60 animate-spin" />
                          IA analisando...
                        </div>
                      )}
                      {relatedPosts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-white/40">
                          <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Sparkles size={20} className="text-white/20" />
                          </div>
                          <p className="text-xs uppercase tracking-widest">
                            Nenhum post relacionado encontrado
                          </p>
                          <p className="text-[10px] text-white/30 mt-2 max-w-xs">
                            Adicione posts com hashtags à pasta para descobrir conteúdo similar.
                          </p>
                        </div>
                      ) : (
                        <div className="columns-2 md:columns-3 lg:columns-4 gap-3">
                          {(aiRanked && aiRanked.length > 0 ? aiRanked : relatedPosts).map(item => (
                            <div key={`rel-${item.id}`} className="mb-3 break-inside-avoid">
                              <GlassCard
                                item={item}
                                isLiked={likedIds.includes(item.id)}
                                isSaved={savedIds.includes(item.id)}
                                isFollowing={followingUids.includes((item as any).authorUid)}
                                onLike={onLike}
                                onSave={onSave}
                                onFollow={onFollow}
                                onDelete={onDelete}
                                onClick={() => { setShowRelated(false); onOpenPost(item); }}
                                onHashtagClick={onHashtagClick}
                                isUserPost={(item as any).authorUid === currentUid}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FolderDetailModal;
