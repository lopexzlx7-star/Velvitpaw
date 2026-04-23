import React, { useState, useEffect, ChangeEvent, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Image as ImageIcon, Check, ChevronRight, AtSign } from 'lucide-react';

interface Props {
  open: boolean;
  currentUsername: string;
  currentProfilePic?: string | null;
  onClose: () => void;
  onUpdateUsername: (newUsername: string) => Promise<void> | void;
  onSelectProfilePhoto: (e: ChangeEvent<HTMLInputElement>) => void;
  onSelectBackgroundPhoto: (e: ChangeEvent<HTMLInputElement>) => void;
  onDeleteAccount?: () => void;
}

const ProfileEditModal: React.FC<Props> = ({
  open,
  currentUsername,
  currentProfilePic,
  onClose,
  onUpdateUsername,
  onSelectProfilePhoto,
  onSelectBackgroundPhoto,
  onDeleteAccount,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(currentUsername);
  const [saving, setSaving] = useState(false);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(currentUsername);
      setEditingName(false);
      setSaving(false);
    }
  }, [open, currentUsername]);

  const save = async () => {
    const clean = name.trim();
    if (!clean || clean === currentUsername) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      await onUpdateUsername(clean);
    } finally {
      setSaving(false);
      setEditingName(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden glass-panel"
            style={{
              background:
                'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 100%)',
              backdropFilter: 'blur(30px) saturate(160%)',
              WebkitBackdropFilter: 'blur(30px) saturate(160%)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow:
                '0 40px 100px -20px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.22)',
            }}
          >
            {/* Specular highlight */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(120% 60% at 50% -10%, rgba(var(--accent-rgb, 255,255,255), 0.18), transparent 55%)',
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb, 255,255,255), 0.55), transparent)' }}
            />

            {/* Drag handle (mobile) */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="relative flex items-center justify-between px-6 pt-4 pb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1">Conta</div>
                <h3 className="text-xl font-black tracking-tight text-white">Editar Perfil</h3>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center rounded-full text-white/70 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Avatar preview with quick change */}
            <div className="relative px-6 pb-6 flex flex-col items-center">
              <button
                type="button"
                onClick={() => profileInputRef.current?.click()}
                className="relative group focus:outline-none"
                aria-label="Alterar foto de perfil"
              >
                <div
                  className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-white/5 transition-transform group-active:scale-95"
                  style={{
                    border: '2px solid rgb(var(--accent-rgb))',
                    boxShadow:
                      '0 0 30px -8px rgba(var(--accent-rgb), 0.5), inset 0 1px 0 rgba(255,255,255,0.18)',
                  }}
                >
                  {currentProfilePic ? (
                    <img src={currentProfilePic} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User size={36} className="text-white/30" />
                  )}
                </div>
                <span
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-black"
                  style={{
                    background: 'rgb(var(--accent-rgb))',
                    boxShadow: '0 4px 12px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
                  }}
                >
                  <ImageIcon size={14} />
                </span>
              </button>
              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                Toque para trocar foto
              </p>
            </div>

            {/* Sections */}
            <div className="px-5 pb-5 space-y-3">
              {/* Username */}
              <div
                className="rounded-2xl p-4"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <AtSign size={12} className="text-white/40" />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                    Nome de usuário
                  </span>
                </div>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">@</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                        className="w-full bg-black/30 border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-white text-sm outline-none focus:border-white/30 transition-colors"
                        placeholder="seu_nome"
                      />
                    </div>
                    <button
                      onClick={save}
                      disabled={saving}
                      className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-black font-bold transition-transform active:scale-95 disabled:opacity-50"
                      style={{
                        background: 'rgb(var(--accent-rgb))',
                        boxShadow: '0 4px 12px -2px rgba(var(--accent-rgb), 0.5)',
                      }}
                      aria-label="Salvar"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingName(true)}
                    className="w-full flex items-center justify-between text-white text-base font-bold group"
                  >
                    <span className="truncate">@{currentUsername}</span>
                    <span className="text-[10px] uppercase tracking-widest text-white/40 group-hover:text-white/70 transition-colors flex items-center gap-1">
                      Editar <ChevronRight size={12} />
                    </span>
                  </button>
                )}
              </div>

              <input
                ref={profileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onSelectProfilePhoto(e)}
              />

              {/* Background */}
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-colors hover:bg-white/[0.06]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(var(--accent-rgb), 0.15)', border: '1px solid rgba(var(--accent-rgb), 0.3)' }}
                >
                  <ImageIcon size={16} style={{ color: 'rgb(var(--accent-rgb))' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Imagem de fundo</div>
                  <div className="text-sm font-bold text-white truncate">Escolher nova imagem</div>
                </div>
                <ChevronRight size={16} className="text-white/30 shrink-0" />
              </button>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onSelectBackgroundPhoto(e)}
              />

              {onDeleteAccount && (
                <button
                  type="button"
                  onClick={onDeleteAccount}
                  className="w-full mt-2 rounded-2xl py-3 text-[10px] uppercase tracking-[0.2em] font-bold text-red-400/80 hover:text-red-400 transition-colors"
                  style={{
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.18)',
                  }}
                >
                  Excluir Conta
                </button>
              )}
            </div>

            <div className="h-2 sm:h-1" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProfileEditModal;
