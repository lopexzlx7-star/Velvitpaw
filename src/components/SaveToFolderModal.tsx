import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder as FolderIcon, Check, Loader2 } from 'lucide-react';
import { Folder, ContentItem } from '../types';

interface Props {
  open: boolean;
  post: ContentItem | null;
  folders: Folder[];
  onClose: () => void;
  onAddToFolder: (folder: Folder, post: ContentItem) => Promise<void>;
}

const SaveToFolderModal: React.FC<Props> = ({
  open, post, folders, onClose, onAddToFolder,
}) => {
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
              {folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-1">
                    <FolderIcon size={20} className="text-white/30" />
                  </div>
                  <p className="text-sm text-white/70 font-medium">
                    Você não tem nenhuma pasta
                  </p>
                  <p className="text-[11px] text-white/40 max-w-[240px]">
                    Crie uma pasta na aba Pastas do seu perfil para começar a salvar posts.
                  </p>
                </div>
              ) : (
                folders.map((f) => {
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
                        <div className="w-7 h-7 rounded-full bg-yellow-400/20 flex items-center justify-center">
                          <Check size={14} className="text-yellow-400" />
                        </div>
                      ) : isBusy ? (
                        <Loader2 size={16} className="text-white/60 animate-spin" />
                      ) : (
                        <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Salvar</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SaveToFolderModal;
