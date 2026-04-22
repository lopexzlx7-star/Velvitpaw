import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User } from 'lucide-react';

interface Props {
  open: boolean;
  photoUrl: string | null;
  username?: string;
  onClose: () => void;
}

const PhotoViewerModal: React.FC<Props> = ({ open, photoUrl, username, onClose }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[300] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)' }}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex flex-col items-center"
          >
            <div
              className="w-72 h-72 sm:w-96 sm:h-96 rounded-full overflow-hidden flex items-center justify-center bg-white/5"
              style={{
                border: '4px solid rgb(var(--accent-rgb))',
                boxShadow:
                  '0 0 60px -10px rgba(var(--accent-rgb), 0.6), 0 20px 60px -10px rgba(0,0,0,0.7)',
              }}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={username || 'Profile'}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User size={96} className="text-white/25" />
              )}
            </div>
            {username && (
              <div className="mt-5 text-center">
                <span className="text-lg font-black tracking-tight text-white">@{username}</span>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PhotoViewerModal;
