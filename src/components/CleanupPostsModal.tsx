import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Search, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, query, where, deleteDoc } from 'firebase/firestore';

interface CleanupPostsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Stage = 'search' | 'confirm' | 'deleting' | 'done';

const CleanupPostsModal: React.FC<CleanupPostsModalProps> = ({ isOpen, onClose }) => {
  const [inputName, setInputName] = useState('');
  const [stage, setStage] = useState<Stage>('search');
  const [foundCount, setFoundCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setInputName('');
    setStage('search');
    setFoundCount(0);
    setDeletedCount(0);
    setError(null);
    setLoading(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSearch = async () => {
    const name = inputName.trim();
    if (!name) return;
    setError(null);
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'posts'), where('authorName', '==', name))
      );
      setFoundCount(snap.size);
      if (snap.size === 0) {
        setError(`Nenhum post encontrado com o autor "@${name}".`);
      } else {
        setStage('confirm');
      }
    } catch (e: any) {
      setError('Erro ao buscar posts. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const name = inputName.trim();
    setStage('deleting');
    setError(null);
    try {
      const snap = await getDocs(
        query(collection(db, 'posts'), where('authorName', '==', name))
      );
      // Delete in batches of 10 to avoid overwhelming Firestore
      const docs = snap.docs;
      let deleted = 0;
      for (const d of docs) {
        await deleteDoc(d.ref);
        deleted++;
        setDeletedCount(deleted);
      }
      setStage('done');
    } catch (e: any) {
      setError('Erro ao excluir posts. Alguns podem não ter sido removidos.');
      setStage('confirm');
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg p-4"
      onClick={handleClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 220 }}
        className="relative w-full max-w-sm rounded-[2.5rem] overflow-hidden p-8 flex flex-col gap-6"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <h2 className="text-base font-bold tracking-tight text-white">Limpar posts antigos</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <AnimatePresence mode="wait">

          {/* ── Stage: search ── */}
          {stage === 'search' && (
            <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
              <p className="text-white/50 text-sm leading-relaxed">
                Digite o nome de usuário de uma conta antiga. Todos os posts desse autor serão encontrados e você poderá excluí-los.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputName}
                  onChange={(e) => { setInputName(e.target.value); setError(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="nome_da_conta_antiga"
                  autoFocus
                  className="flex-1 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/20 outline-none focus:border-white/25 transition-colors"
                />
                <button
                  onClick={handleSearch}
                  disabled={!inputName.trim() || loading}
                  className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                </button>
              </div>
              {error && (
                <p className="text-red-400/80 text-xs flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {error}
                </p>
              )}
            </motion.div>
          )}

          {/* ── Stage: confirm ── */}
          {stage === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5">
              <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-center">
                <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Posts encontrados</p>
                <p className="text-4xl font-black text-white">{foundCount}</p>
                <p className="text-white/40 text-xs mt-1">de <span className="text-white/70">@{inputName.trim()}</span></p>
              </div>
              <p className="text-white/40 text-xs text-center leading-relaxed">
                Esta ação é <span className="text-red-400">irreversível</span>. Todos os {foundCount} posts serão removidos permanentemente do Firestore.
              </p>
              {error && (
                <p className="text-red-400/80 text-xs flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {error}
                </p>
              )}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDelete}
                  className="w-full py-3.5 rounded-2xl bg-red-600/80 hover:bg-red-600 border border-red-500/40 text-white font-bold text-xs uppercase tracking-widest transition-all"
                >
                  Excluir {foundCount} posts
                </button>
                <button
                  onClick={reset}
                  className="w-full py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white font-bold text-xs uppercase tracking-widest transition-all"
                >
                  Voltar
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Stage: deleting ── */}
          {stage === 'deleting' && (
            <motion.div key="deleting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-4">
              <Loader2 size={36} className="animate-spin text-white/40" />
              <p className="text-white/60 text-sm">Excluindo posts…</p>
              <p className="text-white font-bold text-lg">{deletedCount} / {foundCount}</p>
            </motion.div>
          )}

          {/* ── Stage: done ── */}
          {stage === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <div>
                <p className="text-white font-bold text-lg">{deletedCount} posts removidos</p>
                <p className="text-white/40 text-xs mt-1">de @{inputName.trim()}</p>
              </div>
              <button
                onClick={reset}
                className="mt-2 px-6 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-bold text-xs uppercase tracking-widest transition-all"
              >
                Limpar outra conta
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default CleanupPostsModal;
