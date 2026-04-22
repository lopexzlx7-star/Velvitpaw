import React, { useState, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Image as ImageIcon, CheckCircle2, Pencil } from 'lucide-react';

interface Props {
  open: boolean;
  currentUsername: string;
  onClose: () => void;
  onUpdateUsername: (newUsername: string) => Promise<void> | void;
  onSelectProfilePhoto: (e: ChangeEvent<HTMLInputElement>) => void;
  onSelectBackgroundPhoto: (e: ChangeEvent<HTMLInputElement>) => void;
}

const ProfileEditModal: React.FC<Props> = ({
  open,
  currentUsername,
  onClose,
  onUpdateUsername,
  onSelectProfilePhoto,
  onSelectBackgroundPhoto,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(currentUsername);

  useEffect(() => {
    if (open) {
      setName(currentUsername);
      setEditingName(false);
    }
  }, [open, currentUsername]);

  const save = async () => {
    if (name.trim() && name.trim() !== currentUsername) {
      await onUpdateUsername(name.trim());
    }
    setEditingName(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[250] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(20px)' }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl overflow-hidden glass-panel"
            style={{
              background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 100%)',
              backdropFilter: 'blur(30px) saturate(160%)',
              WebkitBackdropFilter: 'blur(30px) saturate(160%)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 40px 100px -20px rgba(0,0,0,0.85)',
            }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Editar Perfil</h3>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-3">
              {/* Username */}
              <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
                  Nome de usuário
                </div>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-1 focus:ring-white/25"
                      placeholder="Novo username"
                    />
                    <button
                      onClick={save}
                      className="p-2 rounded-lg text-emerald-400 hover:text-emerald-300"
                      aria-label="Salvar"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingName(true)}
                    className="w-full flex items-center justify-between text-white text-sm font-bold"
                  >
                    <span>@{currentUsername}</span>
                    <Pencil size={14} className="text-white/50" />
                  </button>
                )}
              </div>

              {/* Profile photo */}
              <label className="block cursor-pointer rounded-2xl p-4 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
                  Foto de perfil
                </div>
                <div className="flex items-center justify-between text-white text-sm font-bold">
                  <span className="flex items-center gap-2">
                    <User size={16} className="text-white/60" />
                    Escolher foto
                  </span>
                  <Pencil size={14} className="text-white/50" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { onSelectProfilePhoto(e); }}
                />
              </label>

              {/* Background photo */}
              <label className="block cursor-pointer rounded-2xl p-4 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
                  Imagem de fundo
                </div>
                <div className="flex items-center justify-between text-white text-sm font-bold">
                  <span className="flex items-center gap-2">
                    <ImageIcon size={16} className="text-white/60" />
                    Escolher foto
                  </span>
                  <Pencil size={14} className="text-white/50" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { onSelectBackgroundPhoto(e); }}
                />
              </label>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProfileEditModal;
