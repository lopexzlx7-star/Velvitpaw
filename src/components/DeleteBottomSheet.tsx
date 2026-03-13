import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Archive, X } from 'lucide-react';

interface DeleteBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
  onArchive: () => void;
}

const DeleteBottomSheet: React.FC<DeleteBottomSheetProps> = ({
  isOpen,
  onClose,
  onDelete,
  onArchive,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-[101] bg-black/40 backdrop-blur-3xl rounded-t-[40px] p-8 pb-12 border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
          >
            {/* Handle */}
            <div className="w-16 h-1.5 bg-white/10 rounded-full mx-auto mb-10" />

            <div className="space-y-4">
              <button
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-6 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-[24px] text-red-500 transition-all active:scale-[0.98] group"
              >
                <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] group-hover:scale-110 transition-transform">
                  <Trash2 size={22} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-base">Excluir permanentemente</p>
                  <p className="text-[10px] opacity-50 uppercase tracking-[0.2em] mt-0.5">Esta ação é irreversível</p>
                </div>
              </button>

              <button
                onClick={() => {
                  onArchive();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-6 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-[24px] text-yellow-500 transition-all active:scale-[0.98] group"
              >
                <div className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center text-white shadow-[0_0_20px_rgba(234,179,8,0.4)] group-hover:scale-110 transition-transform">
                  <Archive size={22} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-base">Arquivar (só eu vejo)</p>
                  <p className="text-[10px] opacity-50 uppercase tracking-[0.2em] mt-0.5">Ocultar da comunidade</p>
                </div>
              </button>

              <button
                onClick={onClose}
                className="w-full flex items-center gap-4 p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[24px] text-white/70 transition-all active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <X size={22} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-base">Cancelar</p>
                </div>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DeleteBottomSheet;
