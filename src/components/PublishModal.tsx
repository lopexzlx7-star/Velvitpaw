import React, { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Image as ImageIcon, Loader2, AlertTriangle,
  Maximize2, Square, Smartphone, Plus, Film, RotateCcw,
  ChevronLeft, ChevronRight, Trash2, Camera
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, where, doc, setDoc } from 'firebase/firestore';

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onHasMediaChange?: (hasMedia: boolean) => void;
}

type AspectRatio = 'portrait' | 'landscape' | 'square' | 'wide' | 'original';

interface VideoDraft {
  title: string;
  aspectRatio: AspectRatio;
  mediaUrl: string;
  file: File;
  duration?: number;
  description: string;
}

interface ImageItem {
  file: File;
  preview: string;
}

const MAX_VIDEO_DURATION = 600; // 10 minutes
const MAX_DESCRIPTION_WORDS = 50;
const MAX_VIDEO_SHORT_SIDE = 1920;
const MAX_FILE_SIZE_MB = 490;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const XHR_TIMEOUT_MS = 30 * 60 * 1000; // 30 min de tolerância para uploads longos
const MAX_IMAGES = 10;

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
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      fn();
    };
    const timeout = setTimeout(() => finish(() => reject(new Error('timeout'))), 10_000);
    const capture = () => {
      try {
        const vw = video.videoWidth || TARGET_W;
        const vh = video.videoHeight || TARGET_H;
        const scale = Math.max(TARGET_W / vw, TARGET_H / vh);
        const sw = vw * scale;
        const sh = vh * scale;
        const srcX = (sw - TARGET_W) / 2 / scale;
        const srcY = (sh - TARGET_H) / 2 / scale;
        const srcW = TARGET_W / scale;
        const srcH = TARGET_H / scale;
        const canvas = document.createElement('canvas');
        canvas.width = TARGET_W;
        canvas.height = TARGET_H;
        canvas.getContext('2d')!.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, TARGET_W, TARGET_H);
        finish(() => resolve(canvas.toDataURL('image/jpeg', 0.85)));
      } catch (e) {
        finish(() => reject(e));
      }
    };
    video.addEventListener('loadeddata', () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) capture();
      else video.currentTime = 0.001;
    });
    video.addEventListener('seeked', () => { if (!settled) capture(); });
    video.addEventListener('canplay', () => { if (!settled && video.videoWidth > 0) capture(); });
    video.addEventListener('error', () => finish(() => reject(new Error('video_error'))));
  });
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const src = evt.target?.result as string;
      const img = new Image();
      img.src = src;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = (height / width) * maxDim; width = maxDim; }
          else { width = (width / height) * maxDim; height = maxDim; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

async function safeFetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new Error('Servidor indisponível.');
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

const PublishModal: React.FC<PublishModalProps> = ({ isOpen, onClose, onSuccess, onHasMediaChange }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('portrait');

  const [images, setImages] = useState<ImageItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const [videoDraft, setVideoDraft] = useState<VideoDraft | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailSlow, setThumbnailSlow] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hashtag autocomplete — when the caret is inside a `#token`, we fetch
  // existing matching hashtags and show a dropdown so the user picks an
  // existing tag instead of creating a typo'd new one.
  interface ActiveHashtag { start: number; end: number; query: string; }
  const [activeHashtag, setActiveHashtag] = useState<ActiveHashtag | null>(null);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<Array<{ tag: string; count: number }>>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // ── Person tag system ────────────────────────────────────────────────────
  interface PersonTagItem { slug: string; name: string; photoUrl?: string; }
  const [personTagInput, setPersonTagInput] = useState('');
  const [personTagSuggestions, setPersonTagSuggestions] = useState<PersonTagItem[]>([]);
  const [selectedPersonTags, setSelectedPersonTags] = useState<PersonTagItem[]>([]);
  const [personTagLoading, setPersonTagLoading] = useState(false);
  const personTagTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toSlug = (name: string) =>
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-áéíóúàãõâêôçüñ]/g, '').trim();

  const searchPersonTags = useCallback(async (q: string) => {
    if (!q.trim()) { setPersonTagSuggestions([]); return; }
    setPersonTagLoading(true);
    try {
      const qLower = q.toLowerCase();
      const snap = await getDocs(collection(db, 'person_tags'));
      const results: PersonTagItem[] = snap.docs
        .map(d => d.data() as PersonTagItem)
        .filter(t => t.name.toLowerCase().includes(qLower))
        .slice(0, 6);
      setPersonTagSuggestions(results);
    } catch { setPersonTagSuggestions([]); } finally { setPersonTagLoading(false); }
  }, []);

  useEffect(() => {
    if (personTagTimerRef.current) clearTimeout(personTagTimerRef.current);
    if (!personTagInput.trim()) { setPersonTagSuggestions([]); return; }
    personTagTimerRef.current = setTimeout(() => searchPersonTags(personTagInput), 280);
  }, [personTagInput, searchPersonTags]);

  const addPersonTag = async (item: PersonTagItem) => {
    if (!selectedPersonTags.find(t => t.slug === item.slug)) {
      setSelectedPersonTags(prev => [...prev, item]);
      // If tag has no photo yet, fetch one from Wikipedia
      if (!item.photoUrl) {
        try {
          const res = await fetch(`/api/person-tag-photo?name=${encodeURIComponent(item.name)}`);
          if (res.ok) {
            const { photoUrl, officialName } = await res.json();
            if (photoUrl || officialName) {
              setSelectedPersonTags(prev =>
                prev.map(t => t.slug === item.slug
                  ? { ...t, ...(photoUrl ? { photoUrl } : {}), ...(officialName ? { name: officialName } : {}) }
                  : t
                )
              );
            }
          }
        } catch {}
      }
    }
    setPersonTagInput('');
    setPersonTagSuggestions([]);
  };

  const createAndAddPersonTag = async () => {
    const rawName = personTagInput.trim();
    if (!rawName) return;
    const slug = toSlug(rawName);
    if (selectedPersonTags.find(t => t.slug === slug)) {
      setPersonTagInput(''); setPersonTagSuggestions([]); return;
    }
    // Optimistically add with raw name, then enrich with Wikipedia data
    const provisional: PersonTagItem = { slug, name: rawName };
    setSelectedPersonTags(prev => [...prev, provisional]);
    setPersonTagInput('');
    setPersonTagSuggestions([]);
    try {
      const res = await fetch(`/api/person-tag-photo?name=${encodeURIComponent(rawName)}`);
      if (res.ok) {
        const { photoUrl, officialName } = await res.json();
        const finalName = officialName || rawName;
        const finalSlug = toSlug(finalName);
        setSelectedPersonTags(prev =>
          prev.map(t => t.slug === slug
            ? { slug: finalSlug, name: finalName, ...(photoUrl ? { photoUrl } : {}) }
            : t
          )
        );
      }
    } catch {}
  };

  const removePersonTag = (slug: string) =>
    setSelectedPersonTags(prev => prev.filter(t => t.slug !== slug));

  const upsertPersonTags = async (postId: string, postImageUrl: string | null) => {
    for (const pt of selectedPersonTags) {
      try {
        const tagDocRef = doc(db, 'person_tags', pt.slug);
        await setDoc(tagDocRef, {
          slug: pt.slug,
          name: pt.name,
          ...(pt.photoUrl ? { photoUrl: pt.photoUrl } : {}),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        // Ensure createdAt exists (only written on first creation via merge)
        const existing = await getDocs(query(collection(db, 'person_tags'), where('slug', '==', pt.slug)));
        if (existing.empty || !existing.docs[0].data().createdAt) {
          await setDoc(tagDocRef, { createdAt: new Date().toISOString() }, { merge: true });
        }
      } catch {}
    }
  };

  const isMultiImage = images.length > 0;
  const isVideo = !!videoDraft;
  const hasMedia = isMultiImage || isVideo;

  useEffect(() => {
    onHasMediaChange?.(isOpen && hasMedia);
    if (!isOpen) onHasMediaChange?.(false);
  }, [hasMedia, isOpen, onHasMediaChange]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    };
  }, []);

  const resetState = () => {
    cancelledRef.current = true;
    if (activeXhrRef.current) { activeXhrRef.current.abort(); activeXhrRef.current = null; }
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    if (thumbTimerRef.current) { clearTimeout(thumbTimerRef.current); thumbTimerRef.current = null; }
    setTitle('');
    setDescription('');
    setAspectRatio('portrait');
    setImages([]);
    setActiveIdx(0);
    setVideoDraft(null);
    setThumbnailUrl(null);
    setThumbnailSlow(false);
    setThumbnailFailed(false);
    setUploadProgress(0);
    setUploadFailed(false);
    setUploadingIdx(null);
    setError(null);
    setIsSubmitting(false);
    setIsValidating(false);
    setPersonTagInput('');
    setPersonTagSuggestions([]);
    setSelectedPersonTags([]);
  };

  const handleClose = () => { resetState(); onClose(); };

  // Identify the hashtag token (if any) under the textarea caret.
  // Returns { start, end, query } where `query` is the text after `#`,
  // or null when the caret isn't inside a `#word` token.
  const findHashtagAtCaret = (text: string, caret: number): ActiveHashtag | null => {
    let start = caret;
    while (start > 0 && /[\w]/.test(text[start - 1])) start--;
    if (start === 0 || text[start - 1] !== '#') return null;
    let end = caret;
    while (end < text.length && /[\w]/.test(text[end])) end++;
    const query = text.slice(start, end);
    return { start: start - 1, end, query };
  };

  // Refresh the active hashtag detection from current caret + value.
  const refreshHashtagContext = (text: string, caret: number) => {
    const ctx = findHashtagAtCaret(text, caret);
    setActiveHashtag(ctx);
    if (!ctx || ctx.query.length === 0) setHashtagSuggestions([]);
  };

  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setDescription(newText);
    refreshHashtagContext(newText, e.target.selectionStart ?? newText.length);
  };

  // Replace the active `#token` with the chosen suggestion + trailing space,
  // then move the caret to right after the inserted hashtag.
  const applyHashtagSuggestion = (tag: string) => {
    if (!activeHashtag) return;
    const before = description.slice(0, activeHashtag.start);
    const after = description.slice(activeHashtag.end);
    const insert = `#${tag}`;
    const next = `${before}${insert}${after.startsWith(' ') ? '' : ' '}${after}`;
    setDescription(next);
    setActiveHashtag(null);
    setHashtagSuggestions([]);
    requestAnimationFrame(() => {
      const ta = descRef.current;
      if (!ta) return;
      const pos = before.length + insert.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  // Debounced fetch of hashtag suggestions whenever the active token changes.
  useEffect(() => {
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    if (!activeHashtag || activeHashtag.query.length === 0) {
      setHashtagSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    setSuggestLoading(true);
    const q = activeHashtag.query;
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-tags/${encodeURIComponent(q)}`);
        if (!res.ok) { setHashtagSuggestions([]); return; }
        const data = await res.json();
        const list: Array<{ tag: string; count: number }> =
          Array.isArray(data?.suggestions)
            ? data.suggestions
            : (Array.isArray(data?.related) ? data.related.map((t: string) => ({ tag: t, count: 0 })) : []);
        // Hide the suggestion that exactly equals what the user typed
        const filtered = list.filter(s => s.tag.toLowerCase() !== q.toLowerCase());
        setHashtagSuggestions(filtered);
      } catch {
        setHashtagSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 180);
    return () => { if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current); };
  }, [activeHashtag?.query]);

  const registerHashtags = async (postId: string, hashtags: string[]) => {
    if (hashtags.length === 0) return;
    try {
      await fetch('/api/register-hashtags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, hashtags }),
      });
    } catch {}
  };

  const processImages = useCallback(async (files: File[]) => {
    const valid = files.filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES);
    if (valid.length === 0) return;
    setError(null);
    setVideoDraft(null);
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }

    const results: ImageItem[] = [];
    for (const file of valid) {
      try {
        const preview = await compressImage(file);
        results.push({ file, preview });
      } catch {}
    }

    setImages(prev => {
      const combined = [...prev, ...results].slice(0, MAX_IMAGES);
      return combined;
    });
    setActiveIdx(0);
    if (!title && results[0]) setTitle(results[0].file.name.split('.')[0]);
  }, [title]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const firstIsVideo = files[0].type.startsWith('video/');
    if (firstIsVideo) {
      if (files[0].size > MAX_FILE_SIZE_BYTES) {
        setError(`Arquivo muito grande. Limite: ${MAX_FILE_SIZE_MB}MB.`); return;
      }
      await processVideo(files[0]);
    } else {
      await processImages(files);
    }
  };

  const handleAddMoreImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) { setError(`Máximo de ${MAX_IMAGES} imagens.`); return; }
    const toProcess = files.filter(f => f.type.startsWith('image/')).slice(0, remaining);
    if (toProcess.length === 0) return;
    const results: ImageItem[] = [];
    for (const file of toProcess) {
      try { results.push({ file, preview: await compressImage(file) }); } catch {}
    }
    setImages(prev => [...prev, ...results].slice(0, MAX_IMAGES));
    setActiveIdx(images.length);
  };

  const removeImage = (idx: number) => {
    setImages(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (activeIdx >= next.length) setActiveIdx(Math.max(0, next.length - 1));
      return next;
    });
  };

  const processVideo = async (file: File) => {
    const blobUrl = URL.createObjectURL(file);
    setIsValidating(true);
    setImages([]);

    const metaEl = document.createElement('video');
    metaEl.preload = 'metadata';
    metaEl.muted = true;
    metaEl.playsInline = true;
    metaEl.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(metaEl);

    const cleanup = () => { if (metaEl.parentNode) metaEl.parentNode.removeChild(metaEl); };

    const commitDraft = (dur: number, vw?: number, vh?: number) => {
      cleanup();
      objectUrlRef.current = blobUrl;
      setIsValidating(false);
      setThumbnailUrl(null);
      const roundedDur = Math.round(dur);

      // Auto-detect orientation from video dimensions
      if (vw && vh) {
        if (vw > vh * 1.2) {
          setAspectRatio('wide');
        } else if (vw > vh * 0.85) {
          setAspectRatio('square');
        } else {
          setAspectRatio('portrait');
        }
      }

      setVideoDraft({
        file,
        mediaUrl: blobUrl,
        aspectRatio: 'portrait',
        duration: roundedDur,
        title: title || file.name.split('.')[0],
        description,
      });
      if (!title) setTitle(file.name.split('.')[0]);
      setThumbnailSlow(false);
      setThumbnailFailed(false);
      thumbTimerRef.current = setTimeout(() => setThumbnailSlow(true), 6000);
      captureVideoFrame(file)
        .then(url => {
          if (thumbTimerRef.current) { clearTimeout(thumbTimerRef.current); thumbTimerRef.current = null; }
          setThumbnailSlow(false); setThumbnailFailed(false); setThumbnailUrl(url);
        })
        .catch(() => {
          if (thumbTimerRef.current) { clearTimeout(thumbTimerRef.current); thumbTimerRef.current = null; }
          setThumbnailSlow(false); setThumbnailFailed(true);
        });
    };

    const safetyTimer = setTimeout(() => commitDraft(0), 5000);

    metaEl.onloadedmetadata = () => {
      clearTimeout(safetyTimer);
      const dur = isFinite(metaEl.duration) ? metaEl.duration : 0;
      const w = metaEl.videoWidth; const h = metaEl.videoHeight;
      const longerSide = Math.max(w, h);
      if (dur > MAX_VIDEO_DURATION) {
        cleanup(); clearTimeout(safetyTimer); URL.revokeObjectURL(blobUrl);
        setIsValidating(false);
        setError(`Vídeo muito longo. Máximo ${MAX_VIDEO_DURATION / 60} minutos.`); return;
      }
      if (w > 0 && h > 0 && longerSide > MAX_VIDEO_SHORT_SIDE) {
        cleanup(); clearTimeout(safetyTimer); URL.revokeObjectURL(blobUrl);
        setIsValidating(false);
        setError(`Resolução muito alta (${w}×${h}). Use vídeos até ${MAX_VIDEO_SHORT_SIDE}p.`); return;
      }
      commitDraft(dur, w, h);
    };
    metaEl.onerror = () => { clearTimeout(safetyTimer); commitDraft(0); };
    metaEl.src = blobUrl;
  };

  const xhrPost = (url: string, body: FormData): Promise<any> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;
      xhr.open('POST', url);
      xhr.timeout = XHR_TIMEOUT_MS;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 95)); };
      xhr.onload = () => {
        activeXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          let data: any = {};
          try { data = JSON.parse(xhr.responseText); } catch {}
          resolve(data);
        } else {
          let data: any = {};
          try { data = JSON.parse(xhr.responseText); } catch {}
          reject(new Error(data?.error || `Erro ${xhr.status}`));
        }
      };
      xhr.ontimeout = () => { activeXhrRef.current = null; reject(new Error('O upload demorou muito.')); };
      xhr.onerror = () => { activeXhrRef.current = null; reject(new Error('network_error')); };
      xhr.onabort = () => { activeXhrRef.current = null; reject(new Error('upload_aborted')); };
      xhr.send(body);
    });

  const xhrDirectUpload = (url: string, body: FormData | Blob, method: 'POST' | 'PUT' = 'POST', extraHeaders?: Record<string, string>): Promise<any> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhrRef.current = xhr;
      xhr.open(method, url);
      xhr.timeout = XHR_TIMEOUT_MS;
      if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 95)); };
      xhr.onload = () => {
        activeXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          if (!xhr.responseText.trim()) return resolve({});
          let data: any = {};
          try { data = JSON.parse(xhr.responseText); } catch {}
          resolve(data);
        } else {
          let data: any = {};
          try { data = JSON.parse(xhr.responseText); } catch {}
          const msg = data?.error?.message || data?.error || `Erro ${xhr.status}`;
          const err = new Error(msg) as any;
          err.isServerError = xhr.status >= 500;
          reject(err);
        }
      };
      xhr.ontimeout = () => { activeXhrRef.current = null; reject(new Error('O upload demorou muito.')); };
      xhr.onerror = () => { activeXhrRef.current = null; reject(new Error('network_error')); };
      xhr.onabort = () => { activeXhrRef.current = null; reject(new Error('upload_aborted')); };
      xhr.send(body);
    });

  const uploadSingleImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append('file', file);
    const data = await xhrPost('/api/upload-image', fd);
    if (!data.url) throw new Error('Servidor não retornou URL da imagem.');
    return data.url as string;
  };

  const uploadVideo = async (file: File): Promise<string> => {
    const sign = await safeFetchJson('/api/cloudinary-sign');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('timestamp', sign.timestamp);
    fd.append('folder', sign.folder);
    fd.append('signature', sign.signature);
    fd.append('api_key', sign.apiKey);
    fd.append('resource_type', 'video');
    // Sem transformação no upload: arquivo é apenas armazenado (rápido).
    // A otimização (720p mobile / 1080p desktop) é aplicada na entrega,
    // via URLs com transformação — o Cloudinary gera e cacheia sob demanda.
    const data = await xhrDirectUpload(`https://api.cloudinary.com/v1_1/${sign.cloudName}/video/upload`, fd);
    if (!data.secure_url) throw new Error('Cloudinary não retornou URL do vídeo.');
    return data.secure_url as string;
  };


  const submitPost = async () => {
    if (!auth.currentUser) return;
    if (!hasMedia) { setError('Selecione uma imagem ou vídeo.'); return; }
    cancelledRef.current = false;
    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadFailed(false);
    setError(null);

    try {
      const extractedHashtags = Array.from(
        new Set((description.match(/\B#(\w+)/g) || []).map(t => t.slice(1).toLowerCase()))
      );

      if (isMultiImage) {
        const imageUrls: string[] = [];
        for (let i = 0; i < images.length; i++) {
          if (cancelledRef.current) throw new Error('upload_aborted');
          setUploadingIdx(i);
          setUploadProgress(0);
          const url = await uploadSingleImage(images[i].file);
          imageUrls.push(url);
        }
        setUploadingIdx(null);

        const postData: Record<string, unknown> = {
          title: title.trim() || 'Sem título',
          url: imageUrls[0],
          images: imageUrls,
          type: 'image',
          height: 450,
          aspectRatio,
          authorUid: auth.currentUser.uid,
          authorName: localStorage.getItem('velvit_username') || 'User',
          authorPhotoUrl: localStorage.getItem('velvit_profile_pic') || null,
          createdAt: new Date().toISOString(),
          likesCount: 0,
          savesCount: 0,
          viewsCount: 0,
          duration: 0,
          description: description.trim() || '',
          hashtags: extractedHashtags,
          ...(selectedPersonTags.length > 0 ? { personTags: selectedPersonTags.map(t => t.slug) } : {}),
        };

        const newPostRef = await addDoc(collection(db, 'posts'), postData);
        // Register hashtags so future posts get suggestions for them
        void registerHashtags(newPostRef.id, extractedHashtags);
        // Upsert person tags in Firestore
        if (selectedPersonTags.length > 0) void upsertPersonTags(newPostRef.id, imageUrls[0] ?? null);
        // Notify followers (best-effort — backend handles dedup + missing creds)
        void fetch('/api/notifications/trigger/new-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorUid: auth.currentUser.uid,
            postId: newPostRef.id,
            authorName: postData.authorName,
            authorPhotoUrl: postData.authorPhotoUrl,
            postThumbnailUrl: imageUrls[0] || null,
            postType: 'image',
          }),
        }).catch(() => {});
      } else if (videoDraft) {
        if (!videoDraft) { setIsSubmitting(false); return; }

        const finalUrl = await uploadVideo(videoDraft.file);

        let hostedThumbnailUrl: string | null = null;
        if (thumbnailUrl) {
          try {
            const res = await fetch('/api/upload-thumbnail', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ thumbnail: thumbnailUrl }),
            });
            if (res.ok) { const data = await res.json(); hostedThumbnailUrl = data.url ?? null; }
          } catch {}
        }

        const postData: Record<string, unknown> = {
          title: title.trim() || 'Sem título',
          url: finalUrl,
          type: 'video',
          height: 600,
          aspectRatio,
          authorUid: auth.currentUser.uid,
          authorName: localStorage.getItem('velvit_username') || 'User',
          authorPhotoUrl: localStorage.getItem('velvit_profile_pic') || null,
          createdAt: new Date().toISOString(),
          likesCount: 0,
          savesCount: 0,
          viewsCount: 0,
          duration: videoDraft.duration || 0,
          description: description.trim() || '',
          hashtags: extractedHashtags,
          ...(selectedPersonTags.length > 0 ? { personTags: selectedPersonTags.map(t => t.slug) } : {}),
          ...(hostedThumbnailUrl ? { thumbnailUrl: hostedThumbnailUrl } : {}),
        };

        const newVideoRef = await addDoc(collection(db, 'posts'), postData);
        // Register hashtags so future posts get suggestions for them
        void registerHashtags(newVideoRef.id, extractedHashtags);
        // Upsert person tags in Firestore
        if (selectedPersonTags.length > 0) void upsertPersonTags(newVideoRef.id, hostedThumbnailUrl ?? null);
        // Notify followers about the new video (best-effort)
        void fetch('/api/notifications/trigger/new-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorUid: auth.currentUser.uid,
            postId: newVideoRef.id,
            authorName: postData.authorName,
            authorPhotoUrl: postData.authorPhotoUrl,
            postThumbnailUrl: hostedThumbnailUrl,
            postType: 'video',
          }),
        }).catch(() => {});
        if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
      }

      resetState();
      onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.message === 'upload_aborted') return;
      console.error('Error submitting post:', err);
      if (isVideo) {
        setUploadFailed(true);
        setError('O upload do vídeo falhou ou demorou demais. Escolha o arquivo novamente.');
      } else {
        setError(err?.message === 'network_error' ? 'Sem conexão. Tente novamente.' : err.message || 'Erro ao publicar.');
      }
    } finally {
      setIsSubmitting(false);
      setUploadingIdx(null);
    }
  };

  const getAspectClass = () => {
    switch (aspectRatio) {
      case 'portrait': return 'aspect-[9/16]';
      case 'landscape': return 'aspect-[4/3]';
      case 'square': return 'aspect-square';
      case 'wide': return 'aspect-[16/9]';
      default: return 'aspect-auto min-h-[300px]';
    }
  };

  const wordCount = description.trim() ? description.trim().split(/\s+/).length : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-black/80 backdrop-blur-2xl">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] rounded-[2.5rem]"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Subtle accent glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[2.5rem] opacity-60"
          style={{
            background: 'radial-gradient(120% 60% at 50% 0%, rgba(var(--accent-rgb), 0.10), transparent 60%)',
          }}
        />

        <div className="relative px-6 pt-6 pb-4 flex items-center justify-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">Novo post</h2>
          <button
            onClick={handleClose}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors text-white/40 hover:text-white hover:bg-white/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-bold uppercase tracking-widest">
              <AlertTriangle size={16} />
              {error}
            </motion.div>
          )}

          {/* Media area */}
          {!hasMedia ? (
            /* ── File picker ── */
            <label className="block cursor-pointer group">
              <div className="flex flex-col items-center justify-center py-10">
                <motion.div
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="relative w-32 h-32 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    backdropFilter: 'blur(18px)',
                    WebkitBackdropFilter: 'blur(18px)',
                  }}
                >
                  <Camera size={42} className="relative text-white/85" strokeWidth={1.5} />
                </motion.div>
                <p className="mt-6 text-white/70 text-sm font-medium">Fotos ou vídeos</p>
                <p className="mt-1 text-white/30 text-xs">Toque para selecionar</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          ) : isValidating ? (
            <div className="flex items-center justify-center gap-3 py-16 text-white/50">
              <Loader2 className="animate-spin" size={20} />
              <span className="text-sm">Validando vídeo...</span>
            </div>
          ) : isMultiImage ? (
            /* ── Multi-image preview ── */
            <div className="space-y-3">
              <div className="relative rounded-3xl overflow-hidden bg-white/5">
                <div className={`relative ${getAspectClass()} overflow-hidden`}>
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={activeIdx}
                      src={images[activeIdx]?.preview}
                      alt=""
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.18 }}
                      className="w-full h-full object-cover"
                    />
                  </AnimatePresence>

                  {images.length > 1 && (
                    <>
                      {activeIdx > 0 && (
                        <button
                          onClick={() => setActiveIdx(i => i - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors z-10"
                        >
                          <ChevronLeft size={16} />
                        </button>
                      )}
                      {activeIdx < images.length - 1 && (
                        <button
                          onClick={() => setActiveIdx(i => i + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors z-10"
                        >
                          <ChevronRight size={16} />
                        </button>
                      )}
                      <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-full text-[10px] font-bold text-white z-10">
                        {activeIdx + 1}/{images.length}
                      </div>
                    </>
                  )}

                  <button
                    onClick={() => removeImage(activeIdx)}
                    className="absolute top-3 left-3 p-2 bg-black/60 backdrop-blur-sm rounded-full text-white/70 hover:text-red-400 hover:bg-black/80 transition-colors z-10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Thumbnail strip */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveIdx(i)}
                      className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${i === activeIdx ? 'border-white' : 'border-white/10 opacity-50 hover:opacity-75'}`}
                    >
                      <img src={img.preview} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}

                  {images.length < MAX_IMAGES && (
                    <label className="flex-shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-white/40 transition-colors">
                      <Plus size={18} className="text-white/30" />
                      <input
                        ref={addMoreInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleAddMoreImages}
                      />
                    </label>
                  )}
                </div>
              )}

              {images.length === 1 && images.length < MAX_IMAGES && (
                <label className="flex items-center gap-2 cursor-pointer text-white/40 hover:text-white/70 transition-colors text-xs">
                  <Plus size={14} />
                  <span>Adicionar mais imagens (até {MAX_IMAGES - images.length} restantes)</span>
                  <input
                    ref={addMoreInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAddMoreImages}
                  />
                </label>
              )}

              {/* Aspect ratio for images */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-white/30 mr-1">Formato</span>
                {(['portrait', 'square', 'landscape', 'wide', 'original'] as AspectRatio[]).map((ar) => {
                  const icons: Record<AspectRatio, React.ReactNode> = {
                    portrait: <Smartphone size={14} />, square: <Square size={14} />,
                    landscape: <Film size={14} />, wide: <Maximize2 size={14} />, original: <RotateCcw size={14} />
                  };
                  const labels: Record<AspectRatio, string> = {
                    portrait: '9:16', square: '1:1', landscape: '4:3', wide: '16:9', original: 'Original'
                  };
                  return (
                    <button key={ar} onClick={() => setAspectRatio(ar)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${aspectRatio === ar ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
                      {icons[ar]}
                      <span className="text-[8px] font-bold">{labels[ar]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : videoDraft ? (
            /* ── Video preview ── */
            <div className="space-y-4">
              <div className="relative rounded-3xl overflow-hidden bg-black/40">
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                  className={`relative w-full ${getAspectClass()} overflow-hidden bg-black`}
                  style={{ maxHeight: '60vh' }}
                >
                  <video
                    src={videoDraft.mediaUrl}
                    poster={thumbnailUrl || undefined}
                    className="w-full h-full"
                    style={{ objectFit: 'contain' }}
                    muted playsInline loop autoPlay
                  />
                </motion.div>
                <button
                  onClick={() => { setVideoDraft(null); setThumbnailUrl(null); if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; } }}
                  className="absolute top-3 right-3 p-2.5 bg-black/60 backdrop-blur-sm rounded-2xl text-white hover:bg-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
                {(thumbnailSlow || thumbnailFailed) && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 bg-black/60 rounded-xl text-[10px] text-white/50">
                    {thumbnailFailed ? 'Preview não disponível. O vídeo será publicado normalmente.' : 'Gerando preview...'}
                  </div>
                )}
                {videoDraft.duration && videoDraft.duration > 0 && (
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/60 rounded-full text-[10px] text-white/70 font-mono">
                    {Math.floor(videoDraft.duration / 60)}:{String(videoDraft.duration % 60).padStart(2, '0')}
                  </div>
                )}
              </div>

              {/* Video aspect ratio selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest text-white/30 mr-1">Formato do Vídeo</span>
                {([
                  { ar: 'portrait' as AspectRatio, icon: <Smartphone size={14} />, label: '9:16' },
                  { ar: 'square' as AspectRatio, icon: <Square size={14} />, label: '1:1' },
                  { ar: 'landscape' as AspectRatio, icon: <Film size={14} />, label: '4:3' },
                  { ar: 'wide' as AspectRatio, icon: <Maximize2 size={14} />, label: '16:9' },
                ]).map(({ ar, icon, label }) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${aspectRatio === ar ? 'bg-white text-black accent-selected' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                  >
                    {icon}
                    <span className="text-[8px] font-bold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Title */}
          {hasMedia && !isValidating && (
            <>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-white/30 mb-2 block">Título</span>
                <input
                  type="text"
                  placeholder="Nome do post..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-5 text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-all text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-white/30">Descrição (opcional)</span>
                  <span className={`text-[9px] font-bold ${wordCount > MAX_DESCRIPTION_WORDS ? 'text-red-400' : 'text-white/20'}`}>
                    {wordCount}/{MAX_DESCRIPTION_WORDS}
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    ref={descRef}
                    placeholder="Descreva seu post... use #hashtags"
                    value={description}
                    onChange={handleDescriptionChange}
                    onKeyUp={(e) => refreshHashtagContext((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                    onClick={(e) => refreshHashtagContext((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                    onBlur={() => setTimeout(() => setActiveHashtag(null), 150)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-all text-sm resize-none"
                  />

                  {/* Hashtag suggestion dropdown — shows existing tags so the user
                      can pick one instead of accidentally creating a typo'd new one */}
                  <AnimatePresence>
                    {activeHashtag && activeHashtag.query.length > 0 && (suggestLoading || hashtagSuggestions.length > 0) && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 right-0 top-full mt-1 z-30 rounded-2xl border border-white/10 overflow-hidden"
                        style={{
                          background: 'rgba(20,20,20,0.96)',
                          backdropFilter: 'blur(14px)',
                          WebkitBackdropFilter: 'blur(14px)',
                          maxHeight: '200px',
                          overflowY: 'auto',
                        }}
                      >
                        <div className="px-4 py-2 text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5">
                          {suggestLoading ? 'Buscando hashtags...' : 'Hashtags existentes'}
                        </div>
                        {hashtagSuggestions.map(({ tag, count }) => (
                          <button
                            key={tag}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); applyHashtagSuggestion(tag); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/10 transition-colors"
                          >
                            <span className="text-sm text-white">#{tag}</span>
                            {count > 0 && (
                              <span className="text-[10px] text-white/30">
                                {count} {count === 1 ? 'post' : 'posts'}
                              </span>
                            )}
                          </button>
                        ))}
                        {!suggestLoading && hashtagSuggestions.length === 0 && (
                          <div className="px-4 py-3 text-xs text-white/40">
                            Nenhuma hashtag parecida — será criada nova: <span className="text-white/70">#{activeHashtag.query}</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Person Tags ─────────────────────────────────────────── */}
              <div>
                <span className="text-[10px] uppercase tracking-widest text-white/30 mb-2 block">
                  Marcar pessoa (opcional)
                </span>

                {/* Selected chips */}
                {selectedPersonTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedPersonTags.map(pt => (
                      <span
                        key={pt.slug}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white/80 border border-white/10 bg-white/5"
                      >
                        <span className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center text-[9px] font-black text-white/40">
                          {pt.photoUrl
                            ? <img src={pt.photoUrl} alt={pt.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : pt.name.charAt(0).toUpperCase()
                          }
                        </span>
                        {pt.name}
                        <button
                          type="button"
                          onClick={() => removePersonTag(pt.slug)}
                          className="text-white/30 hover:text-white transition-colors leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ex: Mia Khalifa, Johnny Depp..."
                    value={personTagInput}
                    onChange={e => setPersonTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); createAndAddPersonTag(); }
                    }}
                    onBlur={() => setTimeout(() => setPersonTagSuggestions([]), 200)}
                    className="w-full h-11 bg-white/5 border border-white/10 rounded-2xl px-4 text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-all"
                  />

                  <AnimatePresence>
                    {(personTagSuggestions.length > 0 || (personTagLoading && personTagInput.trim())) && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 right-0 top-full mt-1 z-30 rounded-2xl border border-white/10 overflow-hidden"
                        style={{
                          background: 'rgba(18,18,18,0.97)',
                          backdropFilter: 'blur(14px)',
                          maxHeight: '200px',
                          overflowY: 'auto',
                        }}
                      >
                        <div className="px-4 py-2 text-[9px] uppercase tracking-widest text-white/30 border-b border-white/5">
                          {personTagLoading ? 'Buscando...' : 'Pessoas existentes'}
                        </div>
                        {personTagSuggestions.map(pt => (
                          <button
                            key={pt.slug}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); addPersonTag(pt); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors"
                          >
                            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center text-[10px] font-black text-white/40">
                              {pt.photoUrl
                                ? <img src={pt.photoUrl} alt={pt.name} className="w-full h-full object-cover" />
                                : pt.name.charAt(0).toUpperCase()
                              }
                            </div>
                            <span className="text-sm text-white">{pt.name}</span>
                          </button>
                        ))}
                        {!personTagLoading && personTagSuggestions.length === 0 && personTagInput.trim() && (
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); createAndAddPersonTag(); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/10 transition-colors"
                          >
                            <span className="text-[11px] text-white/40">Criar tag nova:</span>
                            <span className="text-sm text-white font-bold">{personTagInput.trim()}</span>
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isValidating && (
          <div className="relative p-6 pt-2">
            {isSubmitting ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>
                    {isMultiImage && uploadingIdx !== null
                      ? `Enviando imagem ${uploadingIdx + 1} de ${images.length}...`
                      : 'Enviando...'}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-white rounded-full" animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
                </div>
                <button
                  onClick={() => { cancelledRef.current = true; if (activeXhrRef.current) activeXhrRef.current.abort(); setIsSubmitting(false); setError('Upload cancelado.'); }}
                  className="w-full py-3 text-white/30 hover:text-white/60 text-xs uppercase tracking-widest transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                {uploadFailed && isVideo ? (
                  <button
                    onClick={() => { setVideoDraft(null); setThumbnailUrl(null); setUploadFailed(false); setError(null); if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; } if (fileInputRef.current) fileInputRef.current.click(); }}
                    className="flex-1 py-4 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-2xl font-bold uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={14} /> Escolher novamente
                  </button>
                ) : !hasMedia ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-4 rounded-full font-semibold tracking-wide text-sm text-white transition-colors hover:bg-white/10"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                    }}
                  >
                    Selecionar mídia
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={submitPost}
                    disabled={wordCount > MAX_DESCRIPTION_WORDS}
                    className="flex-1 py-4 rounded-full font-semibold tracking-wide text-sm text-white transition-colors hover:bg-white/10 disabled:opacity-40"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      backdropFilter: 'blur(14px)',
                      WebkitBackdropFilter: 'blur(14px)',
                    }}
                  >
                    {isMultiImage ? `Publicar ${images.length} ${images.length === 1 ? 'imagem' : 'imagens'}` : 'Publicar'}
                  </motion.button>
                )}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default PublishModal;
