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
  mediaType: 'image' | 'video';
  file: File | null;
  duration?: number;
  videoHeight?: number;
  videoThumbnail?: string | null;
  description: string;
}

const MAX_VIDEO_DURATION = 120;
const MAX_DESCRIPTION_WORDS = 50;
const MAX_VIDEO_HEIGHT = 1080;
const MAX_FILE_SIZE_MB = 490;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
// XHR timeout: 9 minutes (slightly below server's 10-minute limit)
const XHR_TIMEOUT_MS = 9 * 60 * 1000;

const INITIAL_DRAFT: Draft = {
  title: '',
  aspectRatio: 'portrait',
  mediaUrl: null,
  mediaType: 'image',
  file: null,
  description: '',
};

const PublishModal: React.FC<PublishModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const resetState = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      activeXhrRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setDraft(INITIAL_DRAFT);
    setUploadProgress(0);
    setError(null);
    setIsSubmitting(false);
    setIsLoadingPreview(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const processFile = (file: File) => {
    setError(null);

    // Front-end file size guard — reject before even touching the server
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Arquivo muito grande. O limite é ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      const blobUrl = URL.createObjectURL(file);
      setIsLoadingPreview(true);

      const metaEl = document.createElement('video');
      metaEl.preload = 'auto';
      metaEl.muted = true;
      metaEl.playsInline = true;
      metaEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(metaEl);

      let capturedDur = 0;
      let capturedH = 0;
      let capturedW = 0;
      let validationPassed = false;
      let thumbnailExtracted = false;

      // Safety timeout — if events never fire (some browsers / formats), bail gracefully
      const safetyTimer = setTimeout(() => {
        if (!thumbnailExtracted) {
          cleanup();
          objectUrlRef.current = blobUrl;
          setIsLoadingPreview(false);
          setDraft(prev => ({
            ...prev,
            file,
            mediaUrl: blobUrl,
            mediaType: 'video',
            videoThumbnail: null,
            aspectRatio: 'portrait',
            duration: isFinite(capturedDur) ? Math.round(capturedDur) : 0,
            videoHeight: capturedH || 0,
            title: prev.title || file.name.split('.')[0],
          }));
        }
      }, 8000);

      const cleanup = () => {
        clearTimeout(safetyTimer);
        if (metaEl.parentNode) metaEl.parentNode.removeChild(metaEl);
      };

      // Returns true if the canvas is essentially all-black (frame not yet decoded)
      const isBlackFrame = (canvas: HTMLCanvasElement): boolean => {
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx) return false;
          // Sample 20 pixels spread across the canvas
          const { width, height } = canvas;
          const data = ctx.getImageData(0, 0, width, height).data;
          let brightPixels = 0;
          const step = Math.max(1, Math.floor(data.length / (20 * 4)));
          for (let i = 0; i < data.length; i += step * 4) {
            if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) brightPixels++;
          }
          return brightPixels === 0;
        } catch { return false; }
      };

      const fetchServerThumbnail = async (): Promise<void> => {
        try {
          const SLICE_BYTES = 30 * 1024 * 1024;
          const slice = file.slice(0, SLICE_BYTES);
          const form = new FormData();
          form.append('file', new File([slice], file.name, { type: file.type }));
          const resp = await fetch('/api/thumbnail', { method: 'POST', body: form });
          if (resp.ok) {
            const { thumbnail } = await resp.json();
            if (thumbnail) {
              setDraft(prev => ({ ...prev, videoThumbnail: thumbnail }));
            }
          }
        } catch { /* upload proceeds without thumbnail */ }
        finally { setIsLoadingPreview(false); }
      };

      const extractFrame = () => {
        if (thumbnailExtracted) return;
        thumbnailExtracted = true;

        cleanup();
        objectUrlRef.current = blobUrl;

        // Commit the draft immediately so the UI unlocks
        const commitDraft = (thumb: string | null) => {
          setDraft(prev => ({
            ...prev,
            file,
            mediaUrl: blobUrl,
            mediaType: 'video',
            videoThumbnail: thumb,
            aspectRatio: 'portrait',
            duration: isFinite(capturedDur) ? Math.round(capturedDur) : 0,
            videoHeight: capturedH || 0,
            title: prev.title || file.name.split('.')[0],
          }));
        };

        try {
          const MAX_THUMB_W = 640;
          const scale = capturedW > 0 ? Math.min(1, MAX_THUMB_W / capturedW) : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round((capturedW || 320) * scale));
          canvas.height = Math.max(1, Math.round((capturedH || 568) * scale));
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(metaEl, 0, 0, canvas.width, canvas.height);

          if (isBlackFrame(canvas)) {
            // Browser produced a black frame — fall back to server
            commitDraft(null);
            fetchServerThumbnail();
            return;
          }

          const thumbnail = canvas.toDataURL('image/jpeg', 0.85);
          commitDraft(thumbnail);
          setIsLoadingPreview(false);
        } catch {
          // Canvas draw failed — fall back to server
          commitDraft(null);
          fetchServerThumbnail();
        }
      };

      metaEl.onloadedmetadata = () => {
        capturedDur = metaEl.duration;
        capturedH = metaEl.videoHeight;
        capturedW = metaEl.videoWidth;

        if (isFinite(capturedDur) && capturedDur > MAX_VIDEO_DURATION) {
          cleanup();
          URL.revokeObjectURL(blobUrl);
          setIsLoadingPreview(false);
          setError(`Vídeo muito longo. Máximo ${MAX_VIDEO_DURATION / 60} minutos.`);
          return;
        }

        if (capturedH > MAX_VIDEO_HEIGHT) {
          cleanup();
          URL.revokeObjectURL(blobUrl);
          setIsLoadingPreview(false);
          setError(`Resolução muito alta. Use vídeos até ${MAX_VIDEO_HEIGHT}p.`);
          return;
        }

        validationPassed = true;

        // Seek to 0.5s to get a representative frame.
        // The 'seeked' event fires reliably on iOS Safari, Android Chrome,
        // Firefox and desktop Chrome — unlike 'onloadeddata'.
        metaEl.currentTime = Math.min(0.5, isFinite(capturedDur) ? capturedDur * 0.1 : 0.5);
      };

      // 'seeked' fires after currentTime is set — works across all major browsers
      metaEl.onseeked = () => {
        if (!validationPassed) return;
        extractFrame();
      };

      // Fallback: some browsers fire 'canplay' before 'seeked'
      metaEl.oncanplay = () => {
        if (!validationPassed || thumbnailExtracted) return;
        // Only use as fallback if seeked hasn't fired yet
        setTimeout(() => {
          if (!thumbnailExtracted && validationPassed) extractFrame();
        }, 300);
      };

      // onerror fires when the browser can't decode the video (e.g. HEVC/H.265 from CapCut).
      // Fall back to server-side thumbnail extraction via ffmpeg.
      metaEl.onerror = () => {
        if (thumbnailExtracted) return;
        thumbnailExtracted = true;
        cleanup();
        objectUrlRef.current = blobUrl;
        setDraft(prev => ({
          ...prev,
          file,
          mediaUrl: blobUrl,
          mediaType: 'video',
          videoThumbnail: null,
          aspectRatio: 'portrait',
          duration: 0,
          videoHeight: 0,
          title: prev.title || file.name.split('.')[0],
        }));
        fetchServerThumbnail();
      };

      metaEl.src = blobUrl;
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const mediaUrl = event.target?.result as string;
      const img = new Image();
      img.src = mediaUrl;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = (height / width) * maxDim; width = maxDim; }
          else { width = (width / height) * maxDim; height = maxDim; }
        }
        canvas.width = width; canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setDraft(prev => ({
          ...prev, file, mediaUrl: compressed,
          mediaType: 'image',
          title: prev.title || file.name.split('.')[0]
        }));
      };
      img.onerror = () => setError('Não foi possível carregar a imagem. Tente outro arquivo.');
    };
    reader.onerror = () => setError('Erro ao ler o arquivo. Tente novamente.');
    reader.readAsDataURL(file);
  };

  const uploadVideo = (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;

      xhr.open('POST', '/api/upload-video');
      xhr.timeout = XHR_TIMEOUT_MS;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 90));
      };

      xhr.onload = () => {
        activeXhrRef.current = null;
        if (xhr.status === 200) {
          let data: any;
          try { data = JSON.parse(xhr.responseText); } catch {
            return reject(new Error('Resposta inválida do servidor.'));
          }
          setUploadProgress(100);
          resolve(data.url);
        } else {
          let msg = 'Falha no upload.';
          try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch {}
          // Tag server errors so retry logic can handle them
          const err = new Error(msg) as any;
          err.isServerError = xhr.status >= 500;
          reject(err);
        }
      };

      xhr.ontimeout = () => {
        activeXhrRef.current = null;
        reject(new Error('O upload demorou muito. Verifique sua conexão e tente novamente.'));
      };

      xhr.onerror = () => { activeXhrRef.current = null; reject(new Error('network_error')); };
      xhr.onabort = () => { activeXhrRef.current = null; reject(new Error('upload_aborted')); };

      xhr.send(formData);
    });
  };

  const uploadVideoWithRetry = async (
    file: File,
    maxAttempts = 3
  ): Promise<string> => {
    let lastError: Error = new Error('Falha no upload.');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          setUploadProgress(0);
          const waitMs = 2000 * attempt;
          console.warn(`[Upload] Tentativa ${attempt} em ${waitMs / 1000}s...`);
          await new Promise(r => setTimeout(r, waitMs));
        }
        return await uploadVideo(file);
      } catch (err: any) {
        lastError = err;
        if (err?.message === 'upload_aborted') throw err;
        // Retry on network errors and transient server errors (5xx)
        const isRetryable = err?.message === 'network_error' || err?.isServerError === true;
        if (!isRetryable || attempt === maxAttempts) throw err;
        console.warn(`[Upload] Tentativa ${attempt} falhou (${err.message}), tentando novamente...`);
      }
    }
    throw lastError;
  };

  const uploadThumbnailToImageKit = async (base64: string): Promise<string | null> => {
    try {
      const resp = await fetch('/api/upload-thumbnail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail: base64 }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.url ?? null;
    } catch {
      return null;
    }
  };

  const submitPost = async () => {
    if (!auth.currentUser || !draft.mediaUrl || !draft.file) return;
    setIsSubmitting(true);
    setUploadProgress(0);
    setError(null);

    try {
      let finalUrl = draft.mediaUrl;

      if (draft.mediaType === 'video') {
        finalUrl = await uploadVideoWithRetry(draft.file);
      }

      // Upload thumbnail to ImageKit so only a URL (not base64) is stored in Firestore
      let thumbnailUrl: string | null = null;
      if (draft.mediaType === 'video' && draft.videoThumbnail) {
        thumbnailUrl = await uploadThumbnailToImageKit(draft.videoThumbnail);
      }

      const extractedHashtags = Array.from(
        new Set(
          (draft.description.match(/\B#(\w+)/g) || []).map(t => t.slice(1).toLowerCase())
        )
      );

      const postData: Record<string, unknown> = {
        title: draft.title || 'Sem título',
        url: finalUrl,
        type: draft.mediaType,
        height: draft.mediaType === 'video' ? 600 : 450,
        aspectRatio: draft.aspectRatio,
        authorUid: auth.currentUser.uid,
        authorName: localStorage.getItem('velvit_username') || 'User',
        authorPhotoUrl: localStorage.getItem('velvit_profile_pic') || null,
        createdAt: new Date().toISOString(),
        likesCount: 0,
        savesCount: 0,
        viewsCount: 0,
        duration: draft.duration || 0,
        description: draft.description.trim() || '',
        hashtags: extractedHashtags,
      };

      if (thumbnailUrl) {
        postData.thumbnailUrl = thumbnailUrl;
      }

      await addDoc(collection(db, 'posts'), postData);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      setDraft(INITIAL_DRAFT);
      setUploadProgress(0);
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.message === 'upload_aborted') return;
      console.error('Error submitting post:', err);
      setError(err.message || 'Erro ao publicar. Tente novamente.');
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
      default: return 'aspect-auto min-h-[300px]';
    }
  };

  const isVideo = draft.mediaType === 'video';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/70 backdrop-blur-lg">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-black/80 backdrop-blur-xl w-full max-w-xl overflow-hidden flex flex-col rounded-[2.5rem] border border-white/10 shadow-2xl max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
              <Plus className="text-white" size={20} />
            </div>
            <h2 className="text-lg font-black tracking-tighter uppercase text-white">Criar Post</h2>
          </div>
          <button onClick={handleClose} className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-white/30 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-bold uppercase tracking-widest"
            >
              <AlertTriangle size={16} />
              {error}
            </motion.div>
          )}

          {isLoadingPreview ? (
            <div className="w-full aspect-square rounded-[2.5rem] border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-4">
              <Loader2 size={28} className="text-white/30 animate-spin" />
              <p className="text-white/30 font-black uppercase tracking-[0.2em] text-[10px]">Carregando preview...</p>
            </div>
          ) : !draft.mediaUrl ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-square rounded-[2.5rem] border-2 border-dashed border-white/10 hover:border-white/30 hover:bg-white/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-6 group"
            >
              <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform group-hover:bg-white/10">
                <div className="relative">
                  <ImageIcon size={40} className="text-white/20 group-hover:text-white/50 transition-colors" />
                  <Film size={20} className="absolute -bottom-2 -right-2 text-white/10 group-hover:text-white/30" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-white font-black uppercase tracking-[0.2em] text-xs">Selecionar Mídia</p>
                <p className="text-white/30 font-bold uppercase tracking-widest text-[8px]">Fotos ou Vídeos · Máx 2 min · 1080p · {MAX_FILE_SIZE_MB}MB</p>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/webp,image/avif,video/*"
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">Pré-visualização</label>
                  {isVideo && (
                    <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-green-400 font-black">
                      <Film size={10} /> Vídeo{draft.duration ? ` · ${draft.duration}s` : ''}
                    </span>
                  )}
                </div>
                <motion.div
                  layout
                  className={`relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-black/50 transition-all duration-500 ${getAspectClass()}`}
                >
                  {isVideo ? (
                    <>
                      {draft.videoThumbnail ? (
                        <img
                          src={draft.videoThumbnail}
                          className="w-full h-full object-cover"
                          alt="Preview do vídeo"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center gap-2">
                          <Film size={36} className="text-white/20" />
                          <p className="text-[9px] uppercase tracking-widest font-black text-white/20 text-center px-4">
                            Preview indisponível<br/>O vídeo será enviado normalmente
                          </p>
                        </div>
                      )}
                      <div className="absolute top-3 left-3 pointer-events-none">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-black/30 backdrop-blur-sm">
                          <svg viewBox="0 0 24 24" fill="white" className="w-3 h-3 ml-0.5 opacity-60"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </>
                  ) : (
                    <img src={draft.mediaUrl || undefined} className="w-full h-full object-cover" alt="Preview" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  <button
                    onClick={() => {
                      if (objectUrlRef.current) {
                        URL.revokeObjectURL(objectUrlRef.current);
                        objectUrlRef.current = null;
                      }
                      setDraft(prev => ({ ...prev, mediaUrl: null, file: null, videoThumbnail: null }));
                      setError(null);
                    }}
                    className="absolute top-4 right-4 p-3 bg-black/50 backdrop-blur-xl rounded-2xl text-white hover:bg-red-500 transition-all border border-white/10"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              </div>

              {!isVideo && (
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">Formato</label>
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
                            ? 'bg-white text-black border-white scale-105 shadow-xl'
                            : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {format.icon}
                        <span className="text-[7px] font-black uppercase tracking-tighter">{format.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">Título</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Dê um nome marcante..."
                  className="w-full h-14 px-6 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-white/30 transition-all text-sm font-bold placeholder:text-white/10"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-black">Descrição</label>
                  <span className={`text-[9px] font-bold tabular-nums ${
                    draft.description.trim().split(/\s+/).filter(Boolean).length >= MAX_DESCRIPTION_WORDS
                      ? 'text-red-400'
                      : 'text-white/20'
                  }`}>
                    {draft.description.trim().split(/\s+/).filter(Boolean).length}/{MAX_DESCRIPTION_WORDS} palavras
                  </span>
                </div>
                <textarea
                  value={draft.description}
                  onChange={(e) => {
                    const words = e.target.value.trim().split(/\s+/).filter(Boolean);
                    if (words.length <= MAX_DESCRIPTION_WORDS || e.target.value.length < draft.description.length) {
                      setDraft(prev => ({ ...prev, description: e.target.value }));
                    }
                  }}
                  placeholder="Adicione uma descrição, link ou #hashtags... (opcional)"
                  rows={3}
                  className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none focus:border-white/30 transition-all text-xs font-medium placeholder:text-white/10 resize-none leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/5 bg-white/5 backdrop-blur-xl space-y-3">
          {isSubmitting && uploadProgress > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">
                  {uploadProgress < 100 ? 'Enviando mídia...' : 'Publicando...'}
                </span>
                <span className="text-[9px] text-white/40 font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ ease: 'linear' }}
                />
              </div>
            </div>
          )}
          <button
            onClick={submitPost}
            disabled={!draft.mediaUrl || isSubmitting || isLoadingPreview}
            className="w-full py-5 bg-white text-black rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[10px] hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-3 shadow-2xl active:scale-95"
          >
            {isSubmitting
              ? <><Loader2 className="animate-spin" size={16} /> {uploadProgress < 100 ? 'Enviando...' : 'Publicando...'}</>
              : <><Plus size={16} /> Publicar Agora</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default PublishModal;
