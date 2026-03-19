import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import ImageKit from 'imagekit';

// ─── Cloudinary v2 client ─────────────────────────────────────────────────────
import { v2 as cloudinaryV2 } from 'cloudinary';

const app = express();
app.use(express.json());

// ─── CORS — allow browser to call port 3001 directly for large uploads ─────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});
app.options('*', (_req: Request, res: Response) => res.sendStatus(204));

// In development Vite runs on 5000 and proxies /api to this server on 3001.
// In production Replit sets PORT automatically; the Express server serves both
// the API and the built Vite frontend from the dist/ folder.
const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = IS_PROD ? (Number(process.env.PORT) || 3000) : 3001;
const SERVER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

// ─── Video routing thresholds ─────────────────────────────────────────────────
// Files below this size go to ImageKit (light route)
// Files at or above this size go to Cloudinary (heavy route)
const HEAVY_VIDEO_MIN_MB = 50;
const HEAVY_VIDEO_MIN_BYTES = HEAVY_VIDEO_MIN_MB * 1024 * 1024;

// ─── Cloudinary config (read once at startup) ─────────────────────────────────
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET ?? '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET ?? '';

// ─── ImageKit config (read once at startup) ───────────────────────────────────
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY ?? '';
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT ?? '';
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY ?? '';

// ─── Startup diagnostics ──────────────────────────────────────────────────────
// Signed uploads require cloud name + API key + API secret (no preset needed)
const cloudinaryReady = !!(CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
const imagekitReady = !!(IMAGEKIT_PRIVATE_KEY && IMAGEKIT_URL_ENDPOINT && IMAGEKIT_PUBLIC_KEY);

if (cloudinaryReady) {
  console.log(`[OK] Cloudinary pronto (signed): cloud=${CLOUD_NAME}`);
} else {
  console.error('[AVISO] Cloudinary NÃO configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET nos Secrets.');
}

if (imagekitReady) {
  console.log(`[OK] ImageKit pronto: endpoint=${IMAGEKIT_URL_ENDPOINT}`);
} else {
  console.error('[AVISO] ImageKit NÃO configurado. Defina IMAGEKIT_PRIVATE_KEY, IMAGEKIT_PUBLIC_KEY e IMAGEKIT_URL_ENDPOINT nos Secrets.');
}

// ─── ImageKit client ──────────────────────────────────────────────────────────
let imagekit: ImageKit | null = null;
if (imagekitReady) {
  imagekit = new ImageKit({
    publicKey: IMAGEKIT_PUBLIC_KEY,
    privateKey: IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: IMAGEKIT_URL_ENDPOINT,
  });
}

// ─── Multer (memory storage, 500 MB cap) ─────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ─── Retry helper ─────────────────────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 2000,
  label = 'operation'
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      console.warn(`[${label}] Tentativa ${attempt} falhou: ${err?.message}. Aguardando ${delayMs * attempt}ms...`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error('Máximo de tentativas atingido');
}

// ─── Cloudinary signed-upload helper ─────────────────────────────────────────
// Generates a SHA-1 signature from sorted params + API secret, as required by
// Cloudinary's signed upload flow. No upload preset is needed.
function buildCloudinarySignature(params: Record<string, string>): string {
  const sortedStr = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return crypto
    .createHash('sha1')
    .update(sortedStr + CLOUDINARY_API_SECRET)
    .digest('hex');
}

// ─── Upload helpers ───────────────────────────────────────────────────────────
async function uploadToCloudinary(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
  if (!cloudinaryReady) throw new Error('Cloudinary não configurado');
  const fileName = originalName || 'upload';

  return withRetry(async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const folder = 'videos';

    // Only the params that will be sent in the request body (excluding file, api_key, resource_type)
    const paramsToSign: Record<string, string> = { folder, timestamp };
    const signature = buildCloudinarySignature(paramsToSign);

    const form = new FormData();
    const blob = new Blob([buffer], { type: mimetype });
    form.append('file', blob, fileName);
    form.append('folder', folder);
    form.append('timestamp', timestamp);
    form.append('api_key', CLOUDINARY_API_KEY);
    form.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
      { method: 'POST', body: form }
    );
    const data: any = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || 'Cloudinary retornou erro');
    return data.secure_url as string;
  }, 3, 2000, 'Cloudinary');
}

async function uploadToImageKit(buffer: Buffer, originalName: string): Promise<string> {
  if (!imagekitReady || !imagekit) throw new Error('ImageKit não configurado');
  const fileName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  return withRetry(
    () => imagekit!.upload({ file: buffer, fileName, folder: '/videos', useUniqueFileName: true })
      .then(r => r.url),
    3, 2000, 'ImageKit'
  );
}

// ─── /api/health ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      cloudinary: cloudinaryReady ? 'configured' : 'missing',
      imagekit: imagekitReady ? 'configured' : 'missing',
      openai: !!process.env.OPENAI_API_KEY ? 'configured' : 'missing',
    },
    routing: {
      light: `< ${HEAVY_VIDEO_MIN_MB}MB → ImageKit (fallback: Cloudinary)`,
      heavy: `≥ ${HEAVY_VIDEO_MIN_MB}MB → Cloudinary (fallback: ImageKit)`,
    },
  });
});

// ─── /api/thumbnail ───────────────────────────────────────────────────────────
// Extracts the first frame from any video (including HEVC/H.265 from CapCut)
// using ffmpeg on the server. The client sends up to the first 30 MB of the
// file (enough to reach the first key frame), and receives a JPEG base64 string.
const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.post('/api/thumbnail', (req: Request, res: Response) => {
  thumbnailUpload.single('file')(req, res, async (err) => {
    if (err || !req.file) {
      return res.status(400).json({ error: 'Arquivo não recebido.' });
    }

    const tmpIn = path.join(os.tmpdir(), `thumb_in_${Date.now()}.mp4`);
    const tmpOut = path.join(os.tmpdir(), `thumb_out_${Date.now()}.jpg`);

    try {
      fs.writeFileSync(tmpIn, req.file.buffer);

      await new Promise<void>((resolve, reject) => {
        execFile(
          'ffmpeg',
          [
            '-y',
            '-i', tmpIn,
            '-vframes', '1',
            '-q:v', '3',
            '-vf', 'scale=640:-1',
            tmpOut,
          ],
          { timeout: 30_000 },
          (error) => {
            if (error) reject(error);
            else resolve();
          }
        );
      });

      const jpegBuffer = fs.readFileSync(tmpOut);
      const base64 = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
      res.json({ thumbnail: base64 });
    } catch (e: any) {
      console.error('[thumbnail] ffmpeg falhou:', e?.message);
      res.status(500).json({ error: 'Não foi possível extrair o frame.' });
    } finally {
      try { fs.unlinkSync(tmpIn); } catch {}
      try { fs.unlinkSync(tmpOut); } catch {}
    }
  });
});

// ─── OpenAI client (singleton, reused across all requests) ───────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });

// ─── Tags DB — file-based JSON store for user hashtags ───────────────────────
// Stored at project root so it persists across restarts.
const TAGS_DB_PATH = path.join(process.cwd(), 'tags_db.json');

/** Read the tags DB from disk (returns empty array if not yet created). */
function readTagsDb(): Array<{ postId: string; hashtags: string[] }> {
  try {
    if (fs.existsSync(TAGS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(TAGS_DB_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

/** Append user hashtags for a post and persist to disk. */
function saveUserHashtags(postId: string, hashtags: string[]): void {
  const db = readTagsDb();
  // Replace existing entry for the same postId, or push a new one
  const idx = db.findIndex(e => e.postId === postId);
  if (idx >= 0) {
    db[idx].hashtags = [...new Set([...db[idx].hashtags, ...hashtags])];
  } else {
    db.push({ postId, hashtags });
  }
  fs.writeFileSync(TAGS_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// ─── /api/suggest-tags ────────────────────────────────────────────────────────
// Single-post shortcut kept for backward compatibility with the frontend.
// Accepts: { title, mediaType? }
// Returns: { tags: string[] }
app.post('/api/suggest-tags', async (req: Request, res: Response) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' });
  }

  const { title, mediaType } = req.body as { title?: string; mediaType?: string };
  if (!title) {
    return res.status(400).json({ error: 'Campo "title" é obrigatório.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Você sugere tags curtas e relevantes para posts de mídia social. Retorne apenas as tags separadas por vírgula, sem # e sem explicações.',
        },
        {
          role: 'user',
          content: `Sugira 5 tags para um post de ${mediaType ?? 'imagem'} com o título: "${title}".`,
        },
      ],
      max_tokens: 60,
    });

    const text = completion.choices[0]?.message?.content ?? '';
    const tags = text.split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 5);
    res.json({ tags });
  } catch (err: any) {
    console.error('[suggest-tags] OpenAI error:', err?.message);
    res.status(500).json({ error: 'Erro ao chamar a API OpenAI.' });
  }
});

// ─── /api/generate-tags-multi ─────────────────────────────────────────────────
// Processes multiple posts in a single request.
// Body: { posts: [{ postId, title, description, userHashtags? }] }
// Returns: [{ postId, tags, userHashtags }]
app.post('/api/generate-tags-multi', async (req: Request, res: Response) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no servidor.' });
  }

  const { posts } = req.body as {
    posts?: Array<{
      postId: string;
      title: string;
      description: string;
      userHashtags?: string;
    }>;
  };

  if (!posts || !Array.isArray(posts) || posts.length === 0) {
    return res.status(400).json({ error: 'Envie um array de posts em { posts: [...] }.' });
  }

  try {
    const results = [];

    for (const post of posts) {
      const { postId, title, description, userHashtags } = post;
      if (!postId || !title || !description) continue;

      // Call GPT to generate 5 tags based on title + description
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Você gera tags para vídeos — palavras únicas, separadas por espaço, sem # e sem explicações.',
          },
          {
            role: 'user',
            content: `Título: "${title}"\nDescrição: "${description}"\nRetorne exatamente 5 tags separadas por espaço.`,
          },
        ],
        max_tokens: 40,
      });

      const tags = completion.choices[0]?.message?.content?.trim() ?? '';

      // Save the user's own hashtags to the local DB for future /search-tags lookups
      if (userHashtags) {
        const parsed = userHashtags
          .split(/\s+/)
          .map((t: string) => t.replace(/^#/, '').trim())
          .filter(Boolean);
        if (parsed.length > 0) saveUserHashtags(postId, parsed);
      }

      results.push({ postId, tags, userHashtags: userHashtags ?? '' });
    }

    res.json(results);
  } catch (err: any) {
    console.error('[generate-tags-multi] OpenAI error:', err?.message);
    res.status(500).json({ error: 'Erro ao processar múltiplos posts.' });
  }
});

// ─── /api/search-tags/:query ──────────────────────────────────────────────────
// Searches the local hashtag DB for tags that contain the query string.
// Returns: { related: string[] }
app.get('/api/search-tags/:query', (req: Request, res: Response) => {
  const query = (req.params.query ?? '').toLowerCase().replace(/^#/, '');
  if (!query) return res.json({ related: [] });

  const db = readTagsDb();
  const related: string[] = [];

  for (const entry of db) {
    for (const tag of entry.hashtags) {
      if (tag.toLowerCase().includes(query) && !related.includes(tag)) {
        related.push(tag);
      }
    }
  }

  res.json({ related });
});

// ─── /api/upload-video ────────────────────────────────────────────────────────
// Multer error handler must be applied manually to catch file-size rejections
app.post('/api/upload-video', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (multerErr) => {
    res.setTimeout(SERVER_TIMEOUT_MS);

    // Handle multer-specific errors (e.g. file too large) with a clean JSON response
    if (multerErr) {
      if ((multerErr as any).code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Arquivo muito grande. O limite é ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`,
        });
      }
      console.error('[upload-video] Multer error:', multerErr.message);
      return res.status(400).json({ error: multerErr.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    // MIME validation — only video types allowed
    if (!req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'Tipo de arquivo inválido. Apenas vídeos são aceitos.' });
    }

    // Ensure at least one service is available before doing any work
    if (!imagekitReady && !cloudinaryReady) {
      return res.status(503).json({
        error: 'Nenhum serviço de upload configurado. Adicione as credenciais nos Secrets.',
      });
    }

    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
    const isHeavy = req.file.size >= HEAVY_VIDEO_MIN_BYTES;

    // Light videos (< 50MB) → ImageKit primary, Cloudinary fallback
    // Heavy videos (>= 50MB) → Cloudinary primary, ImageKit fallback
    const primaryService: 'Cloudinary' | 'ImageKit' = isHeavy ? 'Cloudinary' : 'ImageKit';
    const fallbackService: 'Cloudinary' | 'ImageKit' = isHeavy ? 'ImageKit' : 'Cloudinary';

    const primaryReady = primaryService === 'Cloudinary' ? cloudinaryReady : imagekitReady;
    const fallbackReady = fallbackService === 'Cloudinary' ? cloudinaryReady : imagekitReady;

    const routeLabel = isHeavy ? 'pesado' : 'leve';
    console.log(`[upload-video] ${req.file.originalname} | ${fileSizeMB}MB | ${routeLabel} | ${primaryService}${primaryReady ? '' : ' (não configurado)'} → fallback: ${fallbackService}${fallbackReady ? '' : ' (não configurado)'}`);

    const { buffer, mimetype, originalname } = req.file;

    const runUpload = async (service: 'Cloudinary' | 'ImageKit') =>
      service === 'ImageKit'
        ? uploadToImageKit(buffer, originalname)
        : uploadToCloudinary(buffer, mimetype, originalname);

    // ─── Primary attempt ─────────────────────────────────────────────────────
    if (primaryReady) {
      try {
        const url = await runUpload(primaryService);
        console.log(`[upload-video] ✓ ${primaryService} sucesso: ${url}`);
        return res.json({ url, provider: primaryService.toLowerCase() });
      } catch (primaryErr: any) {
        console.error(`[upload-video] ✗ ${primaryService} falhou: ${primaryErr?.message}. Ativando fallback para ${fallbackService}...`);
      }
    } else {
      console.warn(`[upload-video] ${primaryService} não configurado, pulando para fallback ${fallbackService}.`);
    }

    // ─── Fallback attempt ────────────────────────────────────────────────────
    if (fallbackReady) {
      try {
        const url = await runUpload(fallbackService);
        console.log(`[upload-video] ✓ Fallback ${fallbackService} sucesso: ${url}`);
        return res.json({ url, provider: fallbackService.toLowerCase() });
      } catch (fallbackErr: any) {
        console.error(`[upload-video] ✗ Fallback ${fallbackService} também falhou: ${fallbackErr?.message}`);
      }
    }

    return res.status(500).json({
      error: 'Upload falhou em todos os serviços disponíveis. Verifique as credenciais nos Secrets e tente novamente.',
    });
  });
});

// ─── /api/upload-thumbnail ────────────────────────────────────────────────────
// Receives a base64 data URL (JPEG) for a video thumbnail and uploads it to
// ImageKit, returning a permanent hosted URL to be stored in Firestore instead
// of the raw base64 string (which would exceed Firestore's 1MB document limit).
app.post('/api/upload-thumbnail', async (req: Request, res: Response) => {
  const { thumbnail } = req.body as { thumbnail?: string };
  if (!thumbnail || !thumbnail.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Campo "thumbnail" ausente ou inválido.' });
  }

  if (!imagekitReady || !imagekit) {
    return res.status(503).json({ error: 'ImageKit não configurado. Defina as credenciais nos Secrets.' });
  }

  try {
    const base64Data = thumbnail.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `thumb_${Date.now()}.jpg`;

    const result = await withRetry(
      () => imagekit!.upload({ file: buffer, fileName, folder: '/thumbnails', useUniqueFileName: true }),
      3, 2000, 'ImageKit-thumbnail'
    );

    return res.json({ url: result.url });
  } catch (err: any) {
    console.error('[upload-thumbnail] Falha:', err?.message);
    return res.status(500).json({ error: 'Falha ao enviar thumbnail para o ImageKit.' });
  }
});

// ─── /api/upload (mantido para compatibilidade — imagens) ─────────────────────
app.post('/api/upload', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (multerErr) => {
    res.setTimeout(SERVER_TIMEOUT_MS);

    if (multerErr) {
      if ((multerErr as any).code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Arquivo muito grande. O limite é ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`,
        });
      }
      return res.status(400).json({ error: multerErr.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const provider = req.body?.provider ?? 'cloudinary';
    const isHeavy = provider === 'imagekit';

    console.log(`[upload] ${req.file.originalname} | ${(req.file.size / 1024 / 1024).toFixed(1)}MB | ${isHeavy ? 'ImageKit' : 'Cloudinary'}`);

    try {
      if (isHeavy) {
        if (!imagekitReady) {
          return res.status(503).json({ error: 'Serviço ImageKit não configurado.' });
        }
        const url = await uploadToImageKit(req.file.buffer, req.file.originalname);
        console.log(`[upload] ImageKit concluído: ${url}`);
        return res.json({ url, provider: 'imagekit' });
      } else {
        if (!cloudinaryReady) {
          return res.status(503).json({ error: 'Serviço Cloudinary não configurado.' });
        }
        const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, req.file.originalname);
        console.log(`[upload] Cloudinary concluído: ${url}`);
        return res.json({ url, provider: 'cloudinary' });
      }
    } catch (err: any) {
      console.error('[upload] Falha:', err?.message);
      res.status(500).json({ error: 'Falha no upload. Tente novamente.' });
    }
  });
});

// ─── /api/imagekit-auth — credenciais para upload direto do browser ──────────
// The browser calls this first to get a short-lived signature, then uploads
// the video file directly to ImageKit (bypassing the Replit/Vite proxy chain).
app.get('/api/imagekit-auth', (_req: Request, res: Response) => {
  if (!imagekitReady || !imagekit) {
    return res.status(503).json({ error: 'ImageKit não configurado.' });
  }
  try {
    const authParams = imagekit.getAuthenticationParameters();
    return res.json({
      ...authParams,
      publicKey: IMAGEKIT_PUBLIC_KEY,
      urlEndpoint: IMAGEKIT_URL_ENDPOINT,
    });
  } catch (err: any) {
    console.error('[imagekit-auth] Erro:', err?.message);
    return res.status(500).json({ error: 'Erro ao gerar credenciais ImageKit.' });
  }
});

// ─── /api/cloudinary-sign — assinatura para upload direto do browser ──────────
// Returns signed params the browser uses to upload directly to Cloudinary.
app.get('/api/cloudinary-sign', (_req: Request, res: Response) => {
  if (!cloudinaryReady) {
    return res.status(503).json({ error: 'Cloudinary não configurado.' });
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = 'videos';
  const paramsToSign: Record<string, string> = { folder, timestamp };
  const signature = buildCloudinarySignature(paramsToSign);
  return res.json({
    timestamp,
    folder,
    signature,
    apiKey: CLOUDINARY_API_KEY,
    cloudName: CLOUD_NAME,
  });
});

// ─── /api/upload-frames ───────────────────────────────────────────────────────
// Receives multiple PNG frames (extracted from videos on the client side) and
// uploads each one to ImageKit. Only frames are ever sent — never full videos.
// Accepts: multipart/form-data, field name "frames" (up to 20 files)
// Returns: { message, frames: [{ name, url }] }
const framesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10 MB per frame is more than enough for a PNG
    files: 20,                    // maximum 20 frames per request
  },
});

app.post('/api/upload-frames', (req: Request, res: Response) => {
  framesUpload.array('frames', 20)(req, res, async (multerErr) => {
    if (multerErr) {
      console.error('[upload-frames] Multer error:', multerErr.message);
      return res.status(400).json({ error: multerErr.message });
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum frame recebido.' });
    }

    if (!imagekitReady || !imagekit) {
      return res.status(503).json({
        error: 'ImageKit não configurado. Defina IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY e IMAGEKIT_URL_ENDPOINT nos Secrets.',
      });
    }

    // Reject any file that is not an image — clients must only send PNG/JPEG frames
    const nonImages = files.filter(f => !f.mimetype.startsWith('image/'));
    if (nonImages.length > 0) {
      return res.status(400).json({
        error: `Tipo inválido: apenas imagens são aceitas como frames. Arquivos rejeitados: ${nonImages.map(f => f.originalname).join(', ')}`,
      });
    }

    console.log(`[upload-frames] Recebidos ${files.length} frame(s)`);

    const results: Array<{ name: string; url: string }> = [];

    for (const file of files) {
      // Build a unique filename: timestamp + original name
      const safeName = `frame_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      try {
        const uploaded = await imagekit!.upload({
          file: file.buffer,           // Buffer from memory storage — no temp file needed
          fileName: safeName,
          folder: '/frames',           // Stored in a dedicated /frames folder on ImageKit
          useUniqueFileName: true,
        });

        console.log(`[upload-frames] ✓ ${safeName} → ${uploaded.url}`);
        results.push({ name: uploaded.name, url: uploaded.url });
      } catch (err: any) {
        console.error(`[upload-frames] ✗ Falha no frame ${safeName}:`, err?.message);
        // Don't abort — continue with remaining frames and report the failure inline
        results.push({ name: safeName, url: '' });
      }
    }

    const succeeded = results.filter(r => r.url).length;
    res.json({
      message: `${succeeded} de ${files.length} frame(s) enviado(s) com sucesso.`,
      frames: results,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEW VIDEO UPLOAD ROUTES (via CloudinaryStorage)
// All routes below are additive — nothing above has been modified.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Configure cloudinary v2 client with the same env vars already declared ───
// (CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET are set earlier in
//  this file; we reuse them so there is a single source of truth.)
cloudinaryV2.config({
  cloud_name: CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ─── Multer instance with memory storage (for legacy routes) ─────────────────
const uploadVideoCloud = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });

// ─── GET / ─── Health / sanity check ─────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.send('Backend funcionando!');
});

// ─── POST /upload ─── Upload de 1 vídeo via Cloudinary ───────────────────────
app.post('/upload', uploadVideoCloud.single('video'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum vídeo enviado.' });
  }
  try {
    const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, req.file.originalname);
    return res.json({ message: 'Upload realizado com sucesso!', url });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha no upload.' });
  }
});

// ─── POST /upload-multiple ─── Upload de até 5 vídeos via Cloudinary ─────────
app.post('/upload-multiple', uploadVideoCloud.array('videos', 5), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Nenhum vídeo enviado.' });
  }
  try {
    const urls = await Promise.all(
      files.map(f => uploadToCloudinary(f.buffer, f.mimetype, f.originalname))
    );
    return res.json({ message: 'Uploads realizados com sucesso!', urls });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha no upload.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// END OF NEW VIDEO UPLOAD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Production: serve the Vite build + SPA fallback ─────────────────────────
// All /api/* routes are already registered above, so this block only runs for
// non-API requests (the frontend). The catch-all sends index.html so that
// React Router / client-side navigation works correctly on any URL.
if (IS_PROD) {
  const distDir = path.join(process.cwd(), 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Servidor] Erro inesperado:', err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// ─── Server bootstrap ─────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

server.timeout = SERVER_TIMEOUT_MS;
server.keepAliveTimeout = SERVER_TIMEOUT_MS;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERRO] Porta ${PORT} ocupada. Reinicie o servidor.`);
    process.exit(1);
  } else {
    throw err;
  }
});
