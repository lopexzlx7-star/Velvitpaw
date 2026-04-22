import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Folder as FolderIcon, Check, Loader2 } from 'lucide-react';
import { Folder, ContentItem } from '../types';

interface Props {
  open: boolean;
  post: ContentItem | null;
  folders: Folder[];
  onClose: () => void;
  onAddToFolder: (folder: Folder, post: ContentItem) => Promise<void>;
  onCreateFolder: (name: string, description?: string) => Promise<Folder | null>;
}

const SaveToFolderModal: React.FC<Props> = ({
  open, post, folders, onClose, onAddToFolder, onCreateFolder,
}) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  if (!post) return null;

  const handleSelect = async (folder: Folder) => {
    setBusyId(folder.id);
    try {
      await onAddToFolder(folder, post);
      setDoneId(folder.id);
      setTimeout(() => { onClose(); setDoneId(null); }, 600);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusyId('__new__');
    try {
      const f = await onCreateFolder(newName.trim());
      if (f) {
        await onAddToFolder(f, post);
        setDoneId(f.id);
        setTimeout(() => { onClose(); setDoneId(null); setCreating(false); setNewName(''); }, 600);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl overflow-hidden glass-panel"
            style={{
              background: 'rgba(20,20,22,0.7)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(28px) saturate(140%)',
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
              <div className="flex-1" />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Salvar em pasta</h2>
              <div className="flex-1 flex justify-end">
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              {!creating && (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/8 transition-all mb-2"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Plus size={20} className="text-white/70" />
                  </div>
                  <span className="text-sm font-bold text-white">Criar nova pasta</span>
                </button>
              )}

              {creating && (
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 mb-2">
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder="Nome da pasta"
                    className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none mb-3"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setCreating(false); setNewName(''); }}
                      className="px-3 py-1.5 text-xs text-white/60 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim() || busyId === '__new__'}
                      className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {busyId === '__new__' ? <Loader2 size={12} className="animate-spin" /> : null}
                      Criar
                    </button>
                  </div>
                </div>
              )}

              {folders.length === 0 && !creating && (
                <div className="text-center py-6 text-white/30 text-xs uppercase tracking-widest">
                  Nenhuma pasta ainda
                </div>
              )}

              {folders.map((f) => {
                const has = f.postIds.includes(post.id);
                const isBusy = busyId === f.id;
                const isDone = doneId === f.id;
                return (
                  <button
                    key={f.id}
                    disabled={has || isBusy}
                    onClick={() => handleSelect(f)}
                    className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-white/5 transition-all disabled:cursor-default"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      {f.coverImage ? (
                        <img src={f.coverImage} alt={f.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <FolderIcon size={18} className="text-white/40" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-bold text-white truncate">{f.name}</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider">
                        {f.postIds.length} {f.postIds.length === 1 ? 'pin' : 'pins'}
                      </div>
                    </div>
                    {(has || isDone) ? (
                      <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                    ) : isBusy ? (
                      <Loader2 size={16} className="text-white/60 animate-spin" />
                    ) : (
                      <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Salvar</span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SaveToFolderModal;
