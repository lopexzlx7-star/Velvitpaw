import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X, Image as ImageIcon, Loader2, AlertTriangle,
  Maximize2, Square, Smartphone, Plus, Film, RotateCcw
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
  description: string;
}

const MAX_VIDEO_DURATION = 120;

// ─── Captura o primeiro frame visível de um vídeo via canvas ─────────────────
// Sempre produz um JPEG em proporção 9:16 (640×1138), usando scale + crop
// centralizado — espelhando o filtro ffmpeg do servidor.
function captureVideoFrame(file: File): Promise<string> {
  const TARGET_W = 640;
  const TARGET_H = 1138;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const done = (fn: () => void) => {
      URL.revokeObjectURL(objectUrl);
      fn();
    };

    const timeout = setTimeout(() => done(() => reject(new Error('timeout'))), 10_000);

    video.addEventListener('loadeddata', () => { video.currentTime = 0; });

    video.addEventListener('seeked', () => {
      clearTimeout(timeout);
      try {
        const vw = video.videoWidth  || TARGET_W;
        const vh = video.videoHeight || TARGET_H;

        // Scale so the frame COVERS the 9:16 canvas (same as ffmpeg increase + crop)
        const scale = Math.max(TARGET_W / vw, TARGET_H / vh);
        const sw = vw * scale;
        const sh = vh * scale;

        // Source rect in original-video coordinates (center-crop)
        const srcX = (sw - TARGET_W) / 2 / scale;
        const srcY = (sh - TARGET_H) / 2 / scale;
        const srcW = TARGET_W / scale;
        const srcH = TARGET_H / scale;

        const canvas = document.createElement('canvas');
        canvas.width  = TARGET_W;
        canvas.height = TARGET_H;
        canvas.getContext('2d')!.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, TARGET_W, TARGET_H);
        done(() => resolve(canvas.toDataURL('image/jpeg', 0.85)));
      } catch (e) {
        done(() => reject(e));
      }
    });

    video.addEventListener('error', () => {
      clearTimeout(timeout);
      done(() => reject(new Error('video_error')));
    });
  });
}

// ─── Fetch seguro: lança erro descritivo se a resposta não for JSON ───────────
async function safeFetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    throw new Error('Servidor indisponível. Verifique sua conexão e tente novamente.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}
const MAX_DESCRIPTION_WORDS = 50;
const MAX_VIDEO_HEIGHT = 1080;
const MAX_FILE_SIZE_MB = 490;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const XHR_TIMEOUT_MS = 9 * 60 * 1000;
const HEAVY_VIDEO_MIN_BYTES = 50 * 1024 * 1024;

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
  const [uploadAttempt, setUploadAttempt] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailSlow, setThumbnailSlow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (thumbTimerRef.current) {
      clearTimeout(thumbTimerRef.current);
      thumbTimerRef.current = null;
    }
    setDraft(INITIAL_DRAFT);
    setUploadProgress(0);
    setUploadAttempt(0);
    setUploadFailed(false);
    setError(null);
    setIsSubmitting(false);
    setIsValidating(false);
    setThumbnailUrl(null);
    setThumbnailSlow(false);
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
      setIsValidating(true);

      const metaEl = document.createElement('video');
      metaEl.preload = 'metadata';
      metaEl.muted = true;
      metaEl.playsInline = true;
      metaEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(metaEl);

      const cleanup = () => {
        if (metaEl.parentNode) metaEl.parentNode.removeChild(metaEl);
      };

      const commitDraft = (dur: number) => {
        cleanup();
        objectUrlRef.current = blobUrl;
        setIsValidating(false);
        setThumbnailUrl(null);
        setDraft(prev => ({
          ...prev,
          file,
          mediaUrl: blobUrl,
          mediaType: 'video',
          aspectRatio: 'portrait',
          duration: Math.round(dur),
          title: prev.title || file.name.split('.')[0],
        }));

        // Capture first frame in background — start a 6s slow-warning timer
        setThumbnailSlow(false);
        thumbTimerRef.current = setTimeout(() => setThumbnailSlow(true), 6000);

        captureVideoFrame(file)
          .then((url) => {
            if (thumbTimerRef.current) {
              clearTimeout(thumbTimerRef.current);
              thumbTimerRef.current = null;
            }
            setThumbnailSlow(false);
            setThumbnailUrl(url);
          })
          .catch(() => {
            if (thumbTimerRef.current) {
              clearTimeout(thumbTimerRef.current);
              thumbTimerRef.current = null;
            }
            setThumbnailSlow(false);
          });
      };

      // Safety timeout — if metadata never fires, accept the file anyway
      const safetyTimer = setTimeout(() => {
        commitDraft(0);
      }, 5000);

      metaEl.onloadedmetadata = () => {
        clearTimeout(safetyTimer);

        const dur = isFinite(metaEl.duration) ? metaEl.duration : 0;
        const h = metaEl.videoHeight;

        if (dur > MAX_VIDEO_DURATION) {
          cleanup();
          clearTimeout(safetyTimer);
          URL.revokeObjectURL(blobUrl);
          setIsValidating(false);
          setError(`Vídeo muito longo. Máximo ${MAX_VIDEO_DURATION / 60} minutos.`);
          return;
        }

        if (h > MAX_VIDEO_HEIGHT) {
          cleanup();
          clearTimeout(safetyTimer);
          URL.revokeObjectURL(blobUrl);
          setIsValidating(false);
          setError(`Resolução muito alta. Use vídeos até ${MAX_VIDEO_HEIGHT}p.`);
          return;
        }

        commitDraft(dur);
      };

      metaEl.onerror = () => {
        clearTimeout(safetyTimer);
        commitDraft(0);
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

  const xhrDirectUpload = (url: string, formData: FormData): Promise<any> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;
      xhr.open('POST', url);
      xhr.timeout = XHR_TIMEOUT_MS;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 95));
      };

      xhr.onload = () => {
        activeXhrRef.current = null;
        let data: any = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          resolve(data);
        } else {
          const msg = data?.error?.message || data?.error || `Erro ${xhr.status}`;
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

  const uploadVideo = async (file: File): Promise<string> => {
    const isLight = file.size < HEAVY_VIDEO_MIN_BYTES;

    if (isLight) {
      // ── ImageKit direct upload (< 50 MB) ────────────────────────────────
      const auth = await safeFetchJson('/api/imagekit-auth');

      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileName', `${Date.now()}_${file.name}`);
      fd.append('folder', '/videos');
      fd.append('token', auth.token);
      fd.append('expire', String(auth.expire));
      fd.append('signature', auth.signature);
      fd.append('publicKey', auth.publicKey);

      const data = await xhrDirectUpload('https://upload.imagekit.io/api/v1/files/upload', fd);
      if (!data.url) throw new Error('ImageKit não retornou URL do vídeo.');
      return data.url as string;

    } else {
      // ── Cloudinary direct upload (>= 50 MB) ─────────────────────────────
      const sign = await safeFetchJson('/api/cloudinary-sign');

      const fd = new FormData();
      fd.append('file', file);
      fd.append('timestamp', sign.timestamp);
      fd.append('folder', sign.folder);
      fd.append('signature', sign.signature);
      fd.append('api_key', sign.apiKey);
      fd.append('resource_type', 'video');

      const data = await xhrDirectUpload(
        `https://api.cloudinary.com/v1_1/${sign.cloudName}/video/upload`, fd
      );
      if (!data.secure_url) throw new Error('Cloudinary não retornou URL do vídeo.');
      return data.secure_url as string;
    }
  };

  const MAX_UPLOAD_ATTEMPTS = 5;

  const uploadVideoWithRetry = async (file: File): Promise<string> => {
    let lastError: Error = new Error('Falha no upload.');
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      try {
        setUploadAttempt(attempt);
        if (attempt > 1) {
          setUploadProgress(0);
          const waitMs = 3000 * (attempt - 1);
          console.warn(`[Upload] Tentativa ${attempt}/${MAX_UPLOAD_ATTEMPTS} em ${waitMs / 1000}s...`);
          await new Promise(r => setTimeout(r, waitMs));
        }
        return await uploadVideo(file);
      } catch (err: any) {
        lastError = err;
        if (err?.message === 'upload_aborted') throw err;
        const isRetryable = err?.message === 'network_error' || err?.isServerError === true;
        if (!isRetryable || attempt === MAX_UPLOAD_ATTEMPTS) throw err;
        console.warn(`[Upload] Tentativa ${attempt} falhou (${err.message}), tentando novamente...`);
      }
    }
    throw lastError;
  };

  const submitPost = async () => {
    if (!auth.currentUser || !draft.mediaUrl || !draft.file) return;
    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadAttempt(0);
    setUploadFailed(false);
    setError(null);

    try {
      let finalUrl = draft.mediaUrl;
      let hostedThumbnailUrl: string | null = null;

      if (draft.mediaType === 'video') {
        finalUrl = await uploadVideoWithRetry(draft.file);

        // Upload the first-frame thumbnail to ImageKit so we store a hosted URL
        // instead of a base64 blob (which would exceed Firestore's 1MB doc limit)
        if (thumbnailUrl) {
          try {
            const res = await fetch('/api/upload-thumbnail', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ thumbnail: thumbnailUrl }),
            });
            if (res.ok) {
              const data = await res.json();
              hostedThumbnailUrl = data.url ?? null;
            }
          } catch {
            // Non-fatal — post will still be created without a thumbnail URL
          }
        }
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
        ...(hostedThumbnailUrl ? { thumbnailUrl: hostedThumbnailUrl } : {}),
      };

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
      const isNetworkErr = err?.message === 'network_error';
      setUploadFailed(draft.mediaType === 'video');
      setError(
        isNetworkErr
          ? 'Sem conexão durante o envio. Toque em "Tentar de novo" para continuar.'
          : err.message || 'Erro ao publicar. Toque em "Tentar de novo".'
      );
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

          {isValidating ? (
            <div className="w-full aspect-square rounded-[2.5rem] border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-4">
              <Loader2 size={28} className="text-white/30 animate-spin" />
              <p className="text-white/30 font-black uppercase tracking-[0.2em] text-[10px]">Preparando vídeo...</p>
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
                    thumbnailUrl ? (
                      // First frame captured — show it as preview
                      <img
                        src={thumbnailUrl}
                        className="w-full h-full object-cover"
                        alt="Primeiro frame do vídeo"
                      />
                    ) : thumbnailSlow ? (
                      // Preview is taking too long — reassure the user
                      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white/5 px-8">
                        <Film size={28} className="text-white/20" />
                        <p className="text-[9px] uppercase tracking-widest font-black text-white/40 text-center">
                          Preview demorando...
                        </p>
                        <p className="text-[8px] uppercase tracking-widest font-bold text-white/20 text-center leading-relaxed">
                          O vídeo será postado normalmente
                        </p>
                      </div>
                    ) : (
                      // Still capturing — show spinner
                      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white/5">
                        <Loader2 size={28} className="text-white/30 animate-spin" />
                        <p className="text-[9px] uppercase tracking-widest font-black text-white/20 text-center px-6">
                          Carregando preview...
                        </p>
                      </div>
                    )
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
                      setDraft(prev => ({ ...prev, mediaUrl: null, file: null }));
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
          {isSubmitting && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-widest text-white/40 font-bold">
                  {uploadProgress >= 100
                    ? 'Publicando...'
                    : uploadAttempt > 1
                      ? `Tentativa ${uploadAttempt} de ${MAX_UPLOAD_ATTEMPTS}...`
                      : 'Enviando vídeo...'}
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

          {uploadFailed ? (
            <button
              onClick={submitPost}
              disabled={isSubmitting}
              className="w-full py-5 bg-red-500/20 border border-red-500/40 text-red-300 rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[10px] hover:bg-red-500/30 transition-all disabled:opacity-40 flex items-center justify-center gap-3 active:scale-95"
            >
              {isSubmitting
                ? <><Loader2 className="animate-spin" size={16} /> Tentando de novo...</>
                : <><RotateCcw size={16} /> Tentar de novo</>}
            </button>
          ) : (
            <button
              onClick={submitPost}
              disabled={!draft.mediaUrl || isSubmitting || isValidating}
              className="w-full py-5 bg-white text-black rounded-[1.5rem] font-black uppercase tracking-[0.3em] text-[10px] hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-3 shadow-2xl active:scale-95"
            >
              {isSubmitting
                ? <><Loader2 className="animate-spin" size={16} /> {uploadProgress < 100 ? 'Enviando...' : 'Publicando...'}</>
                : <><Plus size={16} /> Publicar Agora</>}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default PublishModal;
