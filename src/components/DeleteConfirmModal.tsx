
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ isOpen, onClose, onConfirm, isDeleting }) => {
  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="relative w-[95vw] max-w-md glass-panel flex flex-col rounded-[2.5rem] overflow-hidden border border-yellow-500/20 text-center p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-500/10 border-4 border-yellow-500/20 flex items-center justify-center">
            <AlertTriangle size={40} className="text-yellow-400" />
        </div>
        
        <h2 className="text-2xl font-black text-white tracking-tighter mb-2">Tem certeza?</h2>
        <p className="text-white/50 text-sm mb-8">Essa ação não pode ser revertida e todos os seus dados serão perdidos permanentemente.</p>

        <div className="flex flex-col gap-4">
            <button
                onClick={onConfirm}
                disabled={isDeleting}
                className="w-full py-4 bg-red-600/80 hover:bg-red-600 text-white rounded-2xl font-bold uppercase tracking-widest text-xs border border-red-500/50 transition-all disabled:opacity-50"
            >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
            </button>
            <button
                onClick={onClose}
                disabled={isDeleting}
                className="w-full py-4 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-2xl font-bold uppercase tracking-widest text-xs transition-all"
            >
                Cancelar
            </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default DeleteConfirmModal;
