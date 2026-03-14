import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Image as ImageIcon, Loader2, AlertTriangle,
  Maximize2, Square, Smartphone, Plus, Film, Zap
} from 'lucide-react';
import { db, auth, storage } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type AspectRatio = 'portrait' | 'landscape' | 'square' | 'wide' | 'original';

interface Draft {
  title: string;
  aspectRatio: AspectRatio;
  previewUrl: string | null;
  mediaType: 'image' | 'video' | 'gif';
  file: File | null;
  base64Url: string | null;
  duration?: number;
}

const BLANK_DRAFT: Draft = {
  title: '',
  aspectRatio: 'original',
  previewUrl: null,
  mediaType: 'image',
  file: null,
  base64Url: null,
};

const PublishModal: React.FC<PublishModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [draft, setDraft] = useState<Draft>(BLANK_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  // Cleanup object URLs on unmount / draft change
  useEffect(() => {
    return () => {
      if (draft.previewUrl && draft.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(draft.previewUrl);
      }
    };
  }, [draft.previewUrl]);

  const resetDraft = () => {
    if (draft.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(draft.previewUrl);
    setDraft(BLANK_DRAFT);
    setUploadProgress(0);
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const processFile = async (file: File) => {
    setError(null);
    const isVideo = file.type.startsWith('video/');
    const isGif = file.type === 'image/gif';

    if (isVideo) {
      if (file.size > 200 * 1024 * 1024) {
        setError('Vídeo muito grande. Máximo 200MB.');
        return;
      }
      // Validate duration via object URL
      const objUrl = URL.createObjectURL(file);
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.src = objUrl;
      await new Promise<void>((resolve) => {
        videoEl.onloadedmetadata = () => resolve();
        videoEl.onerror = () => resolve();
      });

      if (videoEl.duration > 60) {
        URL.revokeObjectURL(objUrl);
        setError('Vídeo muito longo. Máximo 1 minuto.');
        return;
      }

      setDraft(prev => ({
        ...prev,
        file,
        previewUrl: objUrl,
        base64Url: null,
        mediaType: 'video',
        aspectRatio: 'portrait',
        duration: videoEl.duration,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      }));
      return;
    }

    if (isGif) {
      if (file.size > 20 * 1024 * 1024) {
        setError('GIF muito grande. Máximo 20MB.');
        return;
      }
      const objUrl = URL.createObjectURL(file);
      setDraft(prev => ({
        ...prev,
        file,
        previewUrl: objUrl,
        base64Url: null,
        mediaType: 'gif',
        aspectRatio: 'portrait',
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      }));
      return;
    }

    // Static image — compress via canvas, store base64
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        const img = new Image();
        img.src = dataUrl;
        await img.decode();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = (height / width) * maxDim; width = maxDim; }
          else { width = (width / height) * maxDim; height = maxDim; }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);

        setDraft(prev => ({
          ...prev,
          file,
          previewUrl: compressed,
          base64Url: compressed,
          mediaType: 'image',
          title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
        }));
      };
      reader.readAsDataURL(file);
    } catch {
      setError('Erro ao processar imagem.');
    }
  };

  const uploadToStorage = (file: File, path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);
      task.on(
        'state_changed',
        (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        }
      );
    });
  };

  const submitPost = async () => {
    if (!auth.currentUser || !draft.previewUrl) return;
    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);

    try {
      let finalUrl: string;

      if (draft.mediaType === 'video' || draft.mediaType === 'gif') {
        if (!draft.file) throw new Error('Arquivo não encontrado.');
        const ext = draft.file.name.split('.').pop() || (draft.mediaType === 'video' ? 'mp4' : 'gif');
        const path = `posts/${auth.currentUser.uid}/${Date.now()}.${ext}`;
        finalUrl = await uploadToStorage(draft.file, path);
      } else {
        finalUrl = draft.base64Url!;
      }

      const heightMap: Record<AspectRatio, number> = {
        portrait: 600, square: 400, landscape: 300, wide: 220, original: 450,
      };

      await addDoc(collection(db, 'posts'), {
        title: draft.title || 'Sem título',
        url: finalUrl,
        type: draft.mediaType,
        height: heightMap[draft.aspectRatio],
        aspectRatio: draft.aspectRatio,
        authorUid: auth.currentUser.uid,
        authorName: localStorage.getItem('velvit_username') || 'User',
        authorProfilePic: localStorage.getItem('velvit_profile_pic') || null,
        createdAt: new Date().toISOString(),
        likesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        duration: draft.duration || 0,
      });

      onSuccess();
      onClose();
      resetDraft();
    } catch (err: any) {
      console.error('Publish error:', err);
      if (err?.code === 'storage/unauthorized') {
        setError('Sem permissão no Firebase Storage. Verifique as regras.');
      } else {
        setError('Erro ao publicar. Tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAspectClass = () => {
    switch (draft.aspectRatio) {
      case 'portrait': return 'aspect-[9/16]';
      case 'landscape': return 'aspect-[4/3]';
      case 'square': return 'aspect-square';
      case 'wide': return 'aspect-[16/9]';
      default: return 'aspect-auto min-h-[280px]';
    }
  };

  const isMediaOnly = draft.mediaType === 'video' || draft.mediaType === 'gif';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-panel w-full max-w-md overflow-hidden flex flex-col rounded-[2.5rem] border border-white/10 shadow-2xl max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center">
              <Plus className="text-white" size={18} />
            </div>
            <h2 className="text-base font-black tracking-tighter uppercase text-white">Criar Post</h2>
          </div>
          <button onClick={() => { onClose(); resetDraft(); }} className="p-2.5 hover:bg-white/10 rounded-2xl transition-colors text-white/30 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-bold uppercase tracking-widest"
              >
                <AlertTriangle size={14} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {!draft.previewUrl ? (
            /* Drop zone */
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[4/5] rounded-[2rem] border-2 border-dashed border-white/10 hover:border-white/30 hover:bg-white/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-5 group"
            >
              <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform group-hover:bg-white/10">
                <div className="relative">
                  <ImageIcon size={32} className="text-white/20 group-hover:text-white/50 transition-colors" />
                  <Film size={16} className="absolute -bottom-1.5 -right-1.5 text-white/10 group-hover:text-white/30" />
                </div>
              </div>
              <div className="text-center space-y-1.5">
                <p className="text-white font-black uppercase tracking-[0.2em] text-xs">Selecionar Mídia</p>
                <p className="text-white/30 font-bold uppercase tracking-widest text-[8px]">Fotos · GIFs · Vídeos até 1 min</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,video/*"
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">Pré-visualização</label>
                  {isMediaOnly && (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/10 rounded-full border border-white/15 text-[8px] font-black uppercase tracking-widest text-white/60">
                      <Zap size={8} />
                      {draft.mediaType === 'video' ? 'Shorts · 9:16' : 'GIF · 9:16'}
                    </span>
                  )}
                </div>

                <motion.div
                  layout
                  className={`relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 transition-all duration-500 ${getAspectClass()}`}
                >
                  {draft.mediaType === 'video' ? (
                    <video
                      src={draft.previewUrl}
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  ) : (
                    <img src={draft.previewUrl} className="w-full h-full object-cover" alt="Preview" />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

                  <button
                    onClick={resetDraft}
                    className="absolute top-3 right-3 p-2.5 bg-black/50 backdrop-blur-xl rounded-xl text-white hover:bg-red-500 transition-all border border-white/10"
                  >
                    <X size={14} />
                  </button>

                  {draft.mediaType === 'video' && draft.duration && (
                    <div className="absolute bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                      <Film size={10} className="text-white/60" />
                      <span className="text-[8px] font-black text-white uppercase tracking-widest">
                        {Math.round(draft.duration)}s
                      </span>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Format selection — images only */}
              {!isMediaOnly && (
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">Formato</label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { id: 'portrait', label: 'Retrato', icon: <Smartphone size={13} /> },
                      { id: 'square', label: 'Quadrado', icon: <Square size={13} /> },
                      { id: 'original', label: 'Padrão', icon: <Maximize2 size={13} /> },
                      { id: 'landscape', label: 'Paisagem', icon: <ImageIcon size={13} /> },
                      { id: 'wide', label: 'Largo', icon: <ImageIcon size={13} className="rotate-90" /> },
                    ].map((fmt) => (
                      <button
                        key={fmt.id}
                        onClick={() => setDraft(prev => ({ ...prev, aspectRatio: fmt.id as AspectRatio }))}
                        className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-2xl border transition-all duration-300 ${
                          draft.aspectRatio === fmt.id
                            ? 'bg-white text-black border-white scale-105 shadow-xl'
                            : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {fmt.icon}
                        <span className="text-[6px] font-black uppercase tracking-tighter">{fmt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">Título</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Dê um nome marcante..."
                  className="w-full h-12 px-5 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-white/30 transition-all text-sm font-bold placeholder:text-white/10"
                />
              </div>
            </div>
          )}
        </div>

        {/* Upload progress bar */}
        <AnimatePresence>
          {isSubmitting && isMediaOnly && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-5 pb-2"
            >
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white rounded-full"
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-[9px] text-white/30 uppercase tracking-widest mt-1.5 text-center">
                Enviando... {uploadProgress}%
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Publish button */}
        <div className="p-5 border-t border-white/5 bg-white/5 backdrop-blur-xl shrink-0">
          <button
            onClick={submitPost}
            disabled={!draft.previewUrl || isSubmitting}
            className="w-full py-4 bg-white text-black rounded-[1.25rem] font-black uppercase tracking-[0.3em] text-[10px] hover:bg-white/90 transition-all disabled:opacity-40 flex items-center justify-center gap-3 shadow-2xl active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" size={15} />
                {isMediaOnly ? `Enviando ${uploadProgress}%` : 'Publicando...'}
              </>
            ) : (
              <>
                <Plus size={15} />
                Publicar Agora
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default PublishModal;
