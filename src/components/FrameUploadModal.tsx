import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, ImageIcon, CheckCircle, AlertCircle, Loader } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FramePreview {
  /** The original video File chosen by the user */
  file: File;
  /** Data-URL of the captured first frame (shown as preview) */
  dataUrl: string;
  /** PNG Blob ready to be sent to the backend */
  blob: Blob;
}

interface UploadResult {
  name: string;
  /** ImageKit URL returned by the backend — empty string means failure */
  url: string;
}

interface FrameUploadModalProps {
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given a video File, renders its very first frame to a canvas and returns
 * both the dataURL (for preview) and the PNG Blob (for upload).
 * Resolves when the frame is captured; rejects on any media error.
 */
function captureFirstFrame(
  file: File,
  width = 320,
  height = 180,
): Promise<{ dataUrl: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);

    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    // After the browser has enough data, seek to the very beginning.
    // The 'seeked' event fires when seek is complete and the frame is ready.
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0;
    });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/png');

        // Convert to Blob asynchronously (more memory-efficient than dataURL for uploads)
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (blob) {
              resolve({ dataUrl, blob });
            } else {
              reject(new Error(`Não foi possível converter o frame de "${file.name}" para PNG.`));
            }
          },
          'image/png',
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    });

    video.addEventListener('error', () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Não foi possível carregar o vídeo "${file.name}".`));
    });
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const FrameUploadModal: React.FC<FrameUploadModalProps> = ({ onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previews, setPreviews] = useState<FramePreview[]>([]);
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  // ── Step 1: User picks videos → capture first frame of each ────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setError(null);
    setResults([]);
    setLoadingPreviews(true);
    setStatusMsg('Capturando frames...');
    setPreviews([]);

    const captured: FramePreview[] = [];

    for (const file of files) {
      try {
        const { dataUrl, blob } = await captureFirstFrame(file);
        captured.push({ file, dataUrl, blob });
      } catch (err: any) {
        console.error('[FrameUpload] captureFirstFrame error:', err?.message);
        // Skip files that fail silently — user will notice the missing preview
      }
    }

    setPreviews(captured);
    setLoadingPreviews(false);
    setStatusMsg(
      captured.length === files.length
        ? `${captured.length} frame(s) capturado(s). Pronto para enviar.`
        : `${captured.length} de ${files.length} frame(s) capturado(s). Alguns vídeos não puderam ser lidos.`,
    );
  }, []);

  // ── Step 2: Send only the PNG blobs to the backend ─────────────────────────
  const handleUpload = useCallback(async () => {
    if (previews.length === 0) {
      setStatusMsg('Selecione ao menos um vídeo primeiro.');
      return;
    }

    setUploading(true);
    setError(null);
    setResults([]);
    setStatusMsg('Enviando frames para ImageKit...');

    try {
      const formData = new FormData();

      previews.forEach(({ file, blob }) => {
        // Use the original video filename (with .png extension) so ImageKit keeps
        // a meaningful name. The backend adds a timestamp prefix automatically.
        const frameName = file.name.replace(/\.[^.]+$/, '') + '.png';
        formData.append('frames', blob, frameName);
      });

      const response = await fetch('/api/upload-frames', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? 'Erro desconhecido no servidor.');
        setStatusMsg('Falha no envio.');
      } else {
        setResults(data.frames ?? []);
        setStatusMsg(data.message ?? 'Concluído!');
      }
    } catch (err: any) {
      console.error('[FrameUpload] upload error:', err?.message);
      setError('Não foi possível conectar ao servidor. Tente novamente.');
      setStatusMsg('Falha na conexão.');
    } finally {
      setUploading(false);
    }
  }, [previews]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        {/* Modal panel — stops click propagation so backdrop click closes modal */}
        <motion.div
          key="panel"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white/5 border border-white/10 shadow-2xl backdrop-blur-xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl">
                <ImageIcon size={18} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-black text-sm uppercase tracking-widest">
                  Upload de Frames
                </h2>
                <p className="text-white/40 text-[10px] mt-0.5">
                  Selecione vídeos — somente o primeiro frame é enviado
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white/60 hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingPreviews || uploading}
            className="w-full flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-white/20 hover:border-white/40 text-white/50 hover:text-white/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-5"
          >
            <Upload size={22} />
            <span className="text-[11px] font-bold uppercase tracking-widest">
              Escolher vídeos
            </span>
          </button>

          {/* Status message */}
          {statusMsg && (
            <p className="text-white/50 text-[10px] uppercase tracking-widest mb-4 text-center">
              {statusMsg}
            </p>
          )}

          {/* Loading spinner while capturing frames */}
          {loadingPreviews && (
            <div className="flex justify-center mb-5">
              <Loader size={20} className="text-white/40 animate-spin" />
            </div>
          )}

          {/* Frame previews grid */}
          {previews.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {previews.map(({ file, dataUrl }, i) => (
                <div
                  key={i}
                  className="relative rounded-xl overflow-hidden bg-white/5 border border-white/10"
                >
                  <img
                    src={dataUrl}
                    alt={`Frame de ${file.name}`}
                    className="w-full aspect-video object-cover"
                  />
                  <p className="absolute bottom-0 inset-x-0 bg-black/60 text-white/70 text-[9px] px-2 py-1 truncate">
                    {file.name}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-[11px]">{error}</p>
            </div>
          )}

          {/* Upload button */}
          {previews.length > 0 && results.length === 0 && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-5"
            >
              {uploading ? (
                <>
                  <Loader size={14} className="animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload size={14} />
                  Enviar {previews.length} frame{previews.length > 1 ? 's' : ''}
                </>
              )}
            </button>
          )}

          {/* Results list */}
          {results.length > 0 && (
            <div className="space-y-2">
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-3">
                URLs geradas
              </p>
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                >
                  {r.url ? (
                    <>
                      <CheckCircle size={14} className="text-green-400 shrink-0" />
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white/70 hover:text-white text-[11px] truncate transition-colors"
                      >
                        {r.url}
                      </a>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={14} className="text-red-400 shrink-0" />
                      <span className="text-red-300 text-[11px] truncate">{r.name} — falhou</span>
                    </>
                  )}
                </div>
              ))}

              {/* Start over */}
              <button
                onClick={() => {
                  setPreviews([]);
                  setResults([]);
                  setStatusMsg('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="w-full mt-3 py-2.5 rounded-2xl border border-white/20 text-white/50 hover:text-white hover:border-white/40 text-[11px] font-bold uppercase tracking-widest transition-all"
              >
                Enviar mais frames
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FrameUploadModal;
