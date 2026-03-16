import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, Image as ImageIcon, Loader2, AlertTriangle, 
  Maximize2, Square, Smartphone, Plus, Film
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AspectRatio = 'portrait' | 'landscape' | 'square' | 'wide' | 'original';

interface Draft {
  title: string;
  aspectRatio: AspectRatio;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'gif';
  file: File | null;
  duration?: number;
}

const PublishModal: React.FC<PublishModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [draft, setDraft] = useState<Draft>({
    title: '',
    aspectRatio: 'original',
    mediaUrl: null,
    mediaType: 'image',
    file: null
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    setError(null);
    const isVideo = file.type.startsWith('video/');
    const isGif = file.type === 'image/gif';
    
    if (isVideo && file.size > 50 * 1024 * 1024) {
      setError('Vídeo muito grande. Máximo 50MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const mediaUrl = event.target?.result as string;
      if (isVideo) {
        setDraft(prev => ({ ...prev, file, mediaUrl, mediaType: 'video', title: prev.title || file.name.split('.')[0] }));
      } else {
        const img = new Image();
        img.src = mediaUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxDim = 1200;
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                height = (height / width) * maxDim;
                width = maxDim;
                } else {
                width = (width / height) * maxDim;
                height = maxDim;
                }
            }
            canvas.width = width;
            canvas.height = height;
            ctx?.drawImage(img, 0, 0, width, height);
            const compressedUrl = canvas.toDataURL(isGif ? 'image/gif' : 'image/jpeg', 0.7);
            setDraft(prev => ({ ...prev, file, mediaUrl: compressedUrl, mediaType: isGif ? 'gif' : 'image', title: prev.title || file.name.split('.')[0] }));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const submitPost = async () => {
    if (!auth.currentUser || !draft.mediaUrl) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const postData = {
        title: draft.title || 'Sem título',
        url: draft.mediaUrl,
        type: draft.mediaType,
        height: 450, // Simplified, adjust as needed
        aspectRatio: draft.aspectRatio,
        authorUid: auth.currentUser.uid,
        authorName: localStorage.getItem('velvit_username') || 'User',
        authorPhotoUrl: localStorage.getItem('velvit_profile_pic') || null,
        createdAt: new Date().toISOString(),
        likesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        duration: draft.duration || 0
      };

      await addDoc(collection(db, 'posts'), postData);
      onSuccess();
      onClose();
      // Reset draft state
      setDraft({ title: '', aspectRatio: 'original', mediaUrl: null, mediaType: 'image', file: null });
    } catch (err) {
      console.error("Error submitting post:", err);
      setError('Erro ao publicar. Verifique o tamanho e formato do arquivo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAspectClass = () => {
    switch (draft.aspectRatio) {
      case 'portrait': return 'aspect-[3/4]';
      case 'landscape': return 'aspect-[4/3]';
      case 'square': return 'aspect-square';
      case 'wide': return 'aspect-[16/9]';
      default: return 'aspect-auto min-h-[300px]';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/70 backdrop-blur-lg">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="dark:bg-black/20 bg-white/80 w-full max-w-xl overflow-hidden flex flex-col rounded-[2.5rem] border dark:border-white/10 border-black/10 shadow-2xl max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b dark:border-white/5 border-black/5 flex items-center justify-between dark:bg-white/5 bg-black/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl dark:bg-white/10 bg-black/10 flex items-center justify-center">
              <Plus className="dark:text-white text-black" size={20} />
            </div>
            <h2 className="text-lg font-black tracking-tighter uppercase dark:text-white text-black">Criar Post</h2>
          </div>
          <button onClick={onClose} className="p-3 hover:dark:bg-white/10 hover:bg-black/10 rounded-2xl transition-colors dark:text-white/30 text-black/30 hover:dark:text-white hover:text-black">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-xs font-bold uppercase tracking-widest"
            >
              <AlertTriangle size={16} />
              {error}
            </motion.div>
          )}

          {!draft.mediaUrl ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-square rounded-[2.5rem] border-2 border-dashed dark:border-white/10 border-black/10 hover:dark:border-white/30 hover:border-black/30 hover:dark:bg-white/5 hover:bg-black/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-6 group"
            >
              <div className="w-20 h-20 rounded-3xl dark:bg-white/5 bg-black/5 flex items-center justify-center group-hover:scale-110 transition-transform group-hover:dark:bg-white/10 group-hover:bg-black/10">
                <div className="relative">
                  <ImageIcon size={40} className="dark:text-white/20 text-black/20 group-hover:dark:text-white/50 group-hover:text-black/50 transition-colors" />
                  <Film size={20} className="absolute -bottom-2 -right-2 dark:text-white/10 text-black/10 group-hover:dark:text-white/30 group-hover:text-black/30" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="dark:text-white text-black font-black uppercase tracking-[0.2em] text-xs">Selecionar Mídia</p>
                <p className="dark:text-white/30 text-black/40 font-bold uppercase tracking-widest text-[8px]">Fotos, GIFs ou Vídeos</p>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-[0.2em] dark:text-white/30 text-black/40 font-black">Pré-visualização</label>
                <motion.div 
                  layout
                  className={`relative w-full overflow-hidden rounded-[2.5rem] border dark:border-white/10 border-black/10 dark:bg-white/5 bg-black/5 transition-all duration-500 ${getAspectClass()}`}
                >
                  {draft.mediaType === 'video' ? (
                    <video src={draft.mediaUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
                  ) : (
                    <img src={draft.mediaUrl} className="w-full h-full object-cover" alt="Preview" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <button 
                    onClick={() => setDraft(prev => ({ ...prev, mediaUrl: null, file: null }))}
                    className="absolute top-4 right-4 p-3 bg-black/50 backdrop-blur-xl rounded-2xl text-white hover:bg-red-500 transition-all border border-white/10"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-[0.2em] dark:text-white/30 text-black/40 font-black">Formato</label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { id: 'portrait', label: 'Retrato', icon: <Smartphone size={14} /> },
                    { id: 'square', label: 'Quadrado', icon: <Square size={14} /> },
                    { id: 'original', label: 'Padrão', icon: <Maximize2 size={14} /> },
                    { id: 'landscape', label: 'Paisagem', icon: <ImageIcon size={14} /> },
                    { id: 'wide', label: 'Largo', icon: <ImageIcon size={14} className="rotate-90" /> },
                  ].map((format) => (
                    <button
                      key={format.id}
                      onClick={() => setDraft(prev => ({ ...prev, aspectRatio: format.id as AspectRatio }))}
                      className={`flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl border transition-all duration-300 ${
                        draft.aspectRatio === format.id 
                          ? 'dark:bg-white bg-black dark:text-black text-white dark:border-white border-black scale-105 shadow-xl' 
                          : 'dark:bg-white/5 bg-black/5 dark:text-white/40 text-black/40 dark:border-white/10 border-black/10 hover:dark:border-white/20 hover:border-black/20'
                      }`}
                    >
                      {format.icon}
                      <span className="text-[7px] font-black uppercase tracking-tighter">{format.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-[0.2em] dark:text-white/30 text-black/40 font-black">Título</label>
                <input 
                  type="text" 
                  value={draft.title}
                  onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Dê um nome marcante..."
                  className="w-full h-14 px-6 dark:bg-white/5 bg-black/5 border dark:border-white/10 border-black/10 rounded-2xl dark:text-white text-black focus:outline-none focus:dark:border-white/30 focus:border-black/30 transition-all text-sm font-bold dark:placeholder:text-white/10 placeholder:text-black/20"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t dark:border-white/5 border-black/5 dark:bg-white/5 bg-black/5 backdrop-blur-xl">
          <button 
            onClick={submitPost}
            disabled={!draft.mediaUrl || isSubmitting}
            className="w-full py-5 dark:bg-white bg-black dark:text-black text-white rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[10px] hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-2xl active:scale-95"
          >
            {isSubmitting ? <><Loader2 className="animate-spin" size={16} /> Publicando...</> : <><Plus size={16} /> Publicar Agora</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default PublishModal;
