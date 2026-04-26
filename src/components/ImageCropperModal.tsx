import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface Props {
  open: boolean;
  imageSrc: string | null;
  shape: 'circle' | 'rect';
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  outputType?: 'image/jpeg' | 'image/png';
  outputQuality?: number;
  title?: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

const ImageCropperModal: React.FC<Props> = ({
  open,
  imageSrc,
  shape,
  aspect,
  outputWidth,
  outputHeight,
  outputType = 'image/jpeg',
  outputQuality = 0.92,
  title = 'Ajustar imagem',
  onCancel,
  onConfirm,
}) => {
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStart = useRef<{ x: number; y: number; pos: { x: number; y: number } } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number; pos: { x: number; y: number } } | null>(null);

  const maxScale = minScale * 6;

  // Calcular tamanho do frame de recorte conforme viewport e aspect
  useEffect(() => {
    if (!open) return;
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Reserva ~80px header + ~140px footer
      const maxW = Math.min(vw - 32, 420);
      const maxH = Math.max(180, vh - 260);
      let fw = maxW;
      let fh = fw / aspect;
      if (fh > maxH) {
        fh = maxH;
        fw = fh * aspect;
      }
      setFrameSize({ w: fw, h: fh });
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [open, aspect]);

  // Carregar dimensões da imagem
  useEffect(() => {
    if (!imageSrc || !open) {
      setImgDims(null);
      return;
    }
    const img = new Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageSrc;
  }, [imageSrc, open]);

  // Definir escala inicial (cover) sempre que tiver imagem + frame
  useEffect(() => {
    if (!imgDims || !frameSize) return;
    const ms = Math.max(frameSize.w / imgDims.w, frameSize.h / imgDims.h);
    setMinScale(ms);
    setScale(ms);
    setPos({ x: 0, y: 0 });
  }, [imgDims, frameSize]);

  const constrain = useCallback(
    (p: { x: number; y: number }, s: number) => {
      if (!imgDims || !frameSize) return p;
      const w = imgDims.w * s;
      const h = imgDims.h * s;
      const maxX = Math.max(0, (w - frameSize.w) / 2);
      const maxY = Math.max(0, (h - frameSize.h) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, p.x)),
        y: Math.max(-maxY, Math.min(maxY, p.y)),
      };
    },
    [imgDims, frameSize]
  );

  // Pointer events (suporta mouse + touch + caneta, e pinch com 2 dedos)
  const onPointerDown = (e: React.PointerEvent) => {
    if (!stageRef.current) return;
    stageRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, pos: { ...pos } };
      pinchStart.current = null;
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      pinchStart.current = {
        dist: Math.hypot(dx, dy) || 1,
        scale,
        pos: { ...pos },
      };
      dragStart.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = Array.from(pointers.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / pinchStart.current.dist;
      const newScale = Math.max(minScale, Math.min(maxScale, pinchStart.current.scale * ratio));
      setScale(newScale);
      setPos(constrain(pinchStart.current.pos, newScale));
    } else if (pointers.current.size === 1 && dragStart.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPos(constrain({ x: dragStart.current.pos.x + dx, y: dragStart.current.pos.y + dy }, scale));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 1) {
      const [p] = Array.from(pointers.current.values());
      dragStart.current = { x: p.x, y: p.y, pos: { ...pos } };
    } else if (pointers.current.size === 0) {
      dragStart.current = null;
    }
  };

  // Wheel: precisamos de listener nativo para poder preventDefault
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const handler = (ev: WheelEvent) => {
      ev.preventDefault();
      const delta = -ev.deltaY * 0.0015;
      setScale((prev) => {
        const next = Math.max(minScale, Math.min(maxScale, prev * (1 + delta)));
        setPos((p) => constrain(p, next));
        return next;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [open, minScale, maxScale, constrain]);

  const reset = () => {
    setScale(minScale);
    setPos({ x: 0, y: 0 });
  };

  const handleConfirm = async () => {
    if (!imgDims || !frameSize || !imageSrc || busy) return;
    setBusy(true);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('img load'));
        img.src = imageSrc;
      });

      const cropW = frameSize.w / scale;
      const cropH = frameSize.h / scale;
      const cx = imgDims.w / 2 - pos.x / scale;
      const cy = imgDims.h / 2 - pos.y / scale;
      const sx = cx - cropW / 2;
      const sy = cy - cropH / 2;

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setBusy(false);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outputWidth, outputHeight);

      const dataUrl = canvas.toDataURL(outputType, outputQuality);
      onConfirm(dataUrl);
    } catch (err) {
      console.error('Erro ao recortar imagem', err);
      alert('Não foi possível processar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  const sliderValue = minScale > 0 && maxScale > minScale
    ? (scale - minScale) / (maxScale - minScale)
    : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex flex-col"
          style={{ background: 'rgba(0,0,0,0.96)', backdropFilter: 'blur(8px)' }}
        >
          {/* Header */}
          <div className="relative flex items-center justify-between px-4 sm:px-6 pt-4 pb-3 shrink-0">
            <button
              onClick={onCancel}
              disabled={busy}
              className="w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:text-white transition-colors disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)' }}
              aria-label="Cancelar"
            >
              <X size={18} />
            </button>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">Ajustar</div>
              <h3 className="text-sm font-black tracking-tight text-white">{title}</h3>
            </div>
            <button
              onClick={handleConfirm}
              disabled={busy || !imgDims}
              className="px-4 h-10 flex items-center gap-2 rounded-full text-black font-black text-sm transition-transform active:scale-95 disabled:opacity-50"
              style={{
                background: 'rgb(var(--accent-rgb))',
                boxShadow: '0 4px 16px -2px rgba(var(--accent-rgb), 0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <Check size={16} />
              <span>Concluir</span>
            </button>
          </div>

          {/* Stage */}
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="relative flex-1 overflow-hidden touch-none select-none cursor-grab active:cursor-grabbing"
          >
            {imageSrc && imgDims && frameSize && (
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: imgDims.w,
                  height: imgDims.h,
                  transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                  transformOrigin: 'center center',
                  willChange: 'transform',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  maxWidth: 'none',
                }}
              />
            )}

            {/* Mask + frame */}
            {frameSize && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  width: frameSize.w,
                  height: frameSize.h,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: shape === 'circle' ? '9999px' : '1rem',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)',
                  border: '2px solid rgba(255,255,255,0.85)',
                }}
              />
            )}

            {/* Grade auxiliar (regra dos terços) */}
            {frameSize && shape === 'rect' && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  width: frameSize.w,
                  height: frameSize.h,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: '1rem',
                  background:
                    'linear-gradient(to right, transparent 33.33%, rgba(255,255,255,0.18) 33.33%, rgba(255,255,255,0.18) 33.5%, transparent 33.5%, transparent 66.66%, rgba(255,255,255,0.18) 66.66%, rgba(255,255,255,0.18) 66.83%, transparent 66.83%), linear-gradient(to bottom, transparent 33.33%, rgba(255,255,255,0.18) 33.33%, rgba(255,255,255,0.18) 33.5%, transparent 33.5%, transparent 66.66%, rgba(255,255,255,0.18) 66.66%, rgba(255,255,255,0.18) 66.83%, transparent 66.83%)',
                }}
              />
            )}
          </div>

          {/* Footer com slider */}
          <div className="shrink-0 px-5 sm:px-8 pt-4 pb-6 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const next = Math.max(minScale, scale / 1.2);
                  setScale(next);
                  setPos((p) => constrain(p, next));
                }}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-white/80 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                aria-label="Diminuir zoom"
              >
                <ZoomOut size={16} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={sliderValue}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  const next = minScale + v * (maxScale - minScale);
                  setScale(next);
                  setPos((p) => constrain(p, next));
                }}
                className="flex-1 accent-white h-1"
                style={{ accentColor: 'rgb(var(--accent-rgb))' }}
                aria-label="Zoom"
              />
              <button
                onClick={() => {
                  const next = Math.min(maxScale, scale * 1.2);
                  setScale(next);
                  setPos((p) => constrain(p, next));
                }}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-white/80 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                aria-label="Aumentar zoom"
              >
                <ZoomIn size={16} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold">
                Arraste para mover · Pinça/roda para zoom
              </p>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white/90 font-bold transition-colors"
              >
                <RotateCcw size={11} />
                Resetar
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ImageCropperModal;
