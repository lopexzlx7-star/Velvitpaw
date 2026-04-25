import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import admin from 'firebase-admin';

// ─── Cloudinary v2 client ─────────────────────────────────────────────────────
import { v2 as cloudinaryV2 } from 'cloudinary';

const app = express();
app.use(express.json({ limit: '20mb' }));

// ─── CORS — allow browser to call port 3001 directly for large uploads ─────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-amz-acl');
  next();
});
app.options('*', (_req: Request, res: Response) => res.sendStatus(204));

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = IS_PROD ? (Number(process.env.PORT) || 3000) : 3001;
const SERVER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

// ─── Cloudinary config ────────────────────────────────────────────────────────
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY ?? '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET ?? '';

// ─── Storj config (S3-compatible) ─────────────────────────────────────────────
const STORJ_ACCESS_KEY = process.env.STORJ_ACCESS_KEY ?? '';
const STORJ_SECRET_KEY = process.env.STORJ_SECRET_KEY ?? '';
const STORJ_BUCKET = process.env.STORJ_BUCKET ?? '';
const STORJ_ENDPOINT = process.env.STORJ_ENDPOINT ?? 'https://gateway.storjshare.io';
// Public base URL for served files, e.g. https://link.storjshare.io/raw/ACCESS/bucket
// Falls back to constructing from endpoint + bucket
const STORJ_PUBLIC_BASE = process.env.STORJ_PUBLIC_BASE_URL
  ? process.env.STORJ_PUBLIC_BASE_URL.replace(/\/$/, '')
  : `${STORJ_ENDPOINT}/${STORJ_BUCKET}`;

// ─── Startup diagnostics ──────────────────────────────────────────────────────
const cloudinaryReady = !!(CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
const storjReady = !!(STORJ_ACCESS_KEY && STORJ_SECRET_KEY && STORJ_BUCKET);

if (cloudinaryReady) {
  console.log(`[OK] Cloudinary pronto: cloud=${CLOUD_NAME} (vídeos grandes)`);
} else {
  console.error('[AVISO] Cloudinary NÃO configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET nos Secrets.');
}

if (storjReady) {
  console.log(`[OK] Storj pronto: bucket=${STORJ_BUCKET} (imagens, thumbnails e vídeos pequenos)`);
} else {
  console.error('[AVISO] Storj NÃO configurado. Defina STORJ_ACCESS_KEY, STORJ_SECRET_KEY e STORJ_BUCKET nos Secrets.');
}

// ─── Storj S3 client ──────────────────────────────────────────────────────────
let storjClient: S3Client | null = null;
if (storjReady) {
  storjClient = new S3Client({
    region: 'us-east-1',
    endpoint: STORJ_ENDPOINT,
    credentials: { accessKeyId: STORJ_ACCESS_KEY, secretAccessKey: STORJ_SECRET_KEY },
    forcePathStyle: true,
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

// ─── Firebase Admin (Auth only — for updateUser) ──────────────────────────────
// Read project from the same config file used by the frontend
let _appletCfg: { projectId?: string; apiKey?: string; firestoreDatabaseId?: string } = {};
try {
  _appletCfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));
} catch {}
const FIREBASE_PROJECT_ID = _appletCfg.projectId ?? 'velvitpaw';
const FIREBASE_FIRESTORE_DB = _appletCfg.firestoreDatabaseId ?? '(default)';
const FIREBASE_API_KEY = _appletCfg.apiKey ?? '';
const stripWrappingQuotes = (s: string): string =>
  s.replace(/^\s*['"]/, '').replace(/['"]\s*$/, '');
const FIREBASE_CLIENT_EMAIL_ENV = stripWrappingQuotes(process.env.FIREBASE_CLIENT_EMAIL ?? '');
const FIREBASE_PRIVATE_KEY_ENV = stripWrappingQuotes(process.env.FIREBASE_PRIVATE_KEY ?? '')
  .replace(/\\n/g, '\n');

let adminAuth: admin.auth.Auth | null = null;

if (FIREBASE_CLIENT_EMAIL_ENV && FIREBASE_PRIVATE_KEY_ENV) {
  try {
    const adminApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL_ENV,
        privateKey: FIREBASE_PRIVATE_KEY_ENV,
      }),
      projectId: FIREBASE_PROJECT_ID,
    });
    adminAuth = adminApp.auth();
    console.log('[OK] Firebase Admin (Auth) pronto');
  } catch (e: any) {
    console.error('[ERRO] Firebase Admin:', e.message);
  }
} else {
  console.warn('[AVISO] Firebase Admin não configurado — FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY ausentes.');
}

// ─── Firestore REST (public read via API key — same as the client SDK) ────────
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_FIRESTORE_DB}/documents`;

async function fsGetPublic(path: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${FS_BASE}/${path}?key=${FIREBASE_API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) { const t = await res.text(); throw new Error(`Firestore GET ${res.status}: ${t}`); }
  return res.json();
}

function fsFieldValue(v: any): any {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).getTime();
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(fsFieldValue);
  if ('mapValue' in v) return fsParseFields(v.mapValue?.fields ?? {});
  return null;
}

function fsParseFields(fields: Record<string, any>): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) obj[k] = fsFieldValue(v);
  return obj;
}

// ─── In-process token store (15-min TTL, no external DB needed) ──────────────
interface ResetToken {
  username: string;
  uid: string;
  code: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}
const resetTokenStore = new Map<string, ResetToken>(); // key = tokenId (uuid-like)

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of resetTokenStore.entries()) {
    if (now > v.expiresAt + 60_000) resetTokenStore.delete(k);
  }
}, 5 * 60 * 1000);

// ─── Mailgun ──────────────────────────────────────────────────────────────────
const MAILGUN_API_KEY_ENV = process.env.MAILGUN_API_KEY ?? '';
const MAILGUN_DOMAIN_ENV = process.env.MAILGUN_DOMAIN ?? '';
const MAILGUN_API_BASE = process.env.MAILGUN_API_BASE ?? 'https://api.mailgun.net';

async function sendMailgunEmail(to: string, subject: string, html: string): Promise<void> {
  if (!MAILGUN_API_KEY_ENV || !MAILGUN_DOMAIN_ENV) throw new Error('Mailgun não configurado.');
  const url = `${MAILGUN_API_BASE}/v3/${MAILGUN_DOMAIN_ENV}/messages`;
  const body = new URLSearchParams({
    from: `Velvit <noreply@${MAILGUN_DOMAIN_ENV}>`,
    to,
    subject,
    html,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY_ENV}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mailgun ${res.status}: ${text}`);
  }
}

// ─── In-memory rate limiter ───────────────────────────────────────────────────
interface RateBucket { count: number; resetAt: number; }
const rateBuckets = new Map<string, RateBucket>();

function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (bucket.count >= maxRequests) return true;
  bucket.count++;
  return false;
}

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

// ─── Cloudinary upload helper ─────────────────────────────────────────────────
async function uploadToCloudinary(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
  if (!cloudinaryReady) throw new Error('Cloudinary não configurado');
  const fileName = originalName || 'upload';

  return withRetry(async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const folder = 'videos';
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

// ─── Storj upload helper ──────────────────────────────────────────────────────
async function uploadToStorj(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (!storjReady || !storjClient) throw new Error('Storj não configurado');

  await withRetry(async () => {
    await storjClient!.send(new PutObjectCommand({
      Bucket: STORJ_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
  }, 3, 2000, 'Storj-upload');

  return `${STORJ_PUBLIC_BASE}/${key}`;
}

// ─── Notifications module (modular routes) ──────────────────────────────────
import notificationsRoutes from './server/notifications/notifications.routes';
app.use('/api/notifications', notificationsRoutes);

// ─── /api/health ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      cloudinary: cloudinaryReady ? 'configured' : 'missing',
      storj: storjReady ? 'configured' : 'missing',
      openai: !!process.env.OPENAI_API_KEY ? 'configured' : 'missing',
    },
    routing: {
      videos: 'Cloudinary (todos os tamanhos)',
      images: 'Storj',
      thumbnails: 'Storj',
      frames: 'Storj',
    },
  });
});

// ─── /api/thumbnail ───────────────────────────────────────────────────────────
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
            '-vf', 'scale=640:1138:force_original_aspect_ratio=increase,crop=640:1138',
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

// ─── OpenAI client ────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });

// ─── Tags DB — file-based JSON store for user hashtags ───────────────────────
const TAGS_DB_PATH = path.join(process.cwd(), 'tags_db.json');

function readTagsDb(): Array<{ postId: string; hashtags: string[] }> {
  try {
    if (fs.existsSync(TAGS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(TAGS_DB_PATH, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveUserHashtags(postId: string, hashtags: string[]): void {
  const db = readTagsDb();
  const idx = db.findIndex(e => e.postId === postId);
  if (idx >= 0) {
    db[idx].hashtags = [...new Set([...db[idx].hashtags, ...hashtags])];
  } else {
    db.push({ postId, hashtags });
  }
  fs.writeFileSync(TAGS_DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// ─── /api/suggest-tags ────────────────────────────────────────────────────────
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
app.post('/api/generate-tags-multi', async (req: Request, res: Response) => {
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

  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const results = [];

  for (const post of posts) {
    const { postId, title, description, userHashtags } = post;
    if (!postId || !title || !description) continue;

    if (userHashtags) {
      const parsed = userHashtags
        .split(/\s+/)
        .map((t: string) => t.replace(/^#/, '').trim())
        .filter(Boolean);
      if (parsed.length > 0) saveUserHashtags(postId, parsed);
    }

    let tags = '';

    if (hasOpenAI) {
      try {
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
        tags = completion.choices[0]?.message?.content?.trim() ?? '';
      } catch (err: any) {
        console.warn(`[generate-tags-multi] OpenAI error for post ${postId}:`, err?.message);
      }
    }

    results.push({ postId, tags, userHashtags: userHashtags ?? '' });
  }

  res.json(results);
});

// ─── /api/recommend-folder ────────────────────────────────────────────────────
// Uses OpenAI to semantically rank candidate posts for a folder.
// Body: { folderName, folderPosts: [{title, hashtags}], candidates: [{id, title, hashtags}] }
// Returns: { ids: string[] }  ordered most-related first
app.post('/api/recommend-folder', async (req: Request, res: Response) => {
  const { folderName, folderPosts, candidates } = req.body as {
    folderName?: string;
    folderPosts?: Array<{ title?: string; hashtags?: string[] }>;
    candidates?: Array<{ id: string; title?: string; hashtags?: string[] }>;
  };

  if (!folderName || !Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'folderName e candidates são obrigatórios.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY não configurada.', ids: [] });
  }

  const trimmedCandidates = candidates.slice(0, 120).map(c => ({
    id: c.id,
    title: (c.title || '').slice(0, 80),
    tags: (c.hashtags || []).slice(0, 8).join(' '),
  }));

  const folderContext = (folderPosts || []).slice(0, 20).map(p => ({
    title: (p.title || '').slice(0, 80),
    tags: (p.hashtags || []).slice(0, 8).join(' '),
  }));

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Você é um sistema de recomendação. Recebe uma pasta (com nome e posts dentro) e uma lista de posts candidatos. Analise o tema/intenção da pasta e retorne APENAS um JSON com a propriedade "ids" — array de IDs dos candidatos mais relevantes ao tema da pasta, do mais relacionado para o menos. Inclua no máximo 30 IDs. Não inclua explicações.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            folderName,
            postsInFolder: folderContext,
            candidates: trimmedCandidates,
          }),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    });

    const text = completion.choices[0]?.message?.content ?? '{"ids":[]}';
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.ids)) {
        const allowed = new Set(trimmedCandidates.map(c => c.id));
        ids = parsed.ids.filter((x: any) => typeof x === 'string' && allowed.has(x)).slice(0, 30);
      }
    } catch {
      ids = [];
    }
    res.json({ ids });
  } catch (err: any) {
    console.error('[recommend-folder] OpenAI error:', err?.message);
    res.status(500).json({ error: 'Erro ao chamar a API OpenAI.', ids: [] });
  }
});

// ─── /api/search-tags/:query ──────────────────────────────────────────────────
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

// ─── /api/upload-image — server-side image upload to Storj ───────────────────
// Accepts: multipart/form-data with field "file" (image)
// Returns: { url }
const imageUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.post('/api/upload-image', (req: Request, res: Response) => {
  imageUploadMiddleware.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Apenas imagens são aceitas.' });
    }

    // Prefer Storj; fall back to Cloudinary when Storj is not configured
    if (storjReady && storjClient) {
      const ext = req.file.originalname.split('.').pop() || 'jpg';
      const key = `images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      try {
        const url = await uploadToStorj(req.file.buffer, key, req.file.mimetype);
        console.log(`[upload-image] ✓ Storj: ${url}`);
        return res.json({ url });
      } catch (err: any) {
        console.error('[upload-image] Storj falhou, tentando Cloudinary:', err?.message);
      }
    }

    if (cloudinaryReady) {
      try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const folder = 'images';
        const paramsToSign: Record<string, string> = { folder, timestamp };
        const signature = buildCloudinarySignature(paramsToSign);

        const form = new FormData();
        const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
        form.append('file', blob, req.file.originalname);
        form.append('folder', folder);
        form.append('timestamp', timestamp);
        form.append('api_key', CLOUDINARY_API_KEY);
        form.append('signature', signature);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: 'POST', body: form }
        );
        const data: any = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || 'Cloudinary retornou erro');
        const url = data.secure_url as string;
        console.log(`[upload-image] ✓ Cloudinary: ${url}`);
        return res.json({ url });
      } catch (err: any) {
        console.error('[upload-image] Cloudinary falhou:', err?.message);
        return res.status(500).json({ error: 'Falha ao enviar imagem para o Cloudinary.' });
      }
    }

    return res.status(503).json({ error: 'Nenhum serviço de armazenamento configurado. Configure Storj ou Cloudinary nos Secrets.' });
  });
});

// ─── /api/upload-thumbnail — upload base64 thumbnail to Storj ────────────────
app.post('/api/upload-thumbnail', async (req: Request, res: Response) => {
  const { thumbnail } = req.body as { thumbnail?: string };
  if (!thumbnail || !thumbnail.startsWith('data:image/')) {
    return res.status(400).json({ error: 'Campo "thumbnail" ausente ou inválido.' });
  }

  if (!storjReady || !storjClient) {
    return res.status(503).json({ error: 'Storj não configurado. Defina as credenciais nos Secrets.' });
  }

  try {
    const [header, base64Data] = thumbnail.split(',');
    const mimeMatch = header.match(/data:(image\/\w+);/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = contentType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(base64Data, 'base64');
    const key = `thumbnails/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const url = await uploadToStorj(buffer, key, contentType);
    console.log(`[upload-thumbnail] ✓ ${url}`);
    return res.json({ url });
  } catch (err: any) {
    console.error('[upload-thumbnail] Falha:', err?.message);
    return res.status(500).json({ error: 'Falha ao enviar thumbnail para o Storj.' });
  }
});

// ─── /api/upload-video — server-side proxy to Cloudinary (heavy videos) ──────
app.post('/api/upload-video', (req: Request, res: Response) => {
  upload.single('file')(req, res, async (multerErr) => {
    res.setTimeout(SERVER_TIMEOUT_MS);

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

    if (!req.file.mimetype.startsWith('video/')) {
      return res.status(400).json({ error: 'Tipo de arquivo inválido. Apenas vídeos são aceitos.' });
    }

    if (!cloudinaryReady) {
      return res.status(503).json({
        error: 'Cloudinary não configurado. Adicione as credenciais nos Secrets.',
      });
    }

    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
    console.log(`[upload-video] ${req.file.originalname} | ${fileSizeMB}MB → Cloudinary`);

    try {
      const url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, req.file.originalname);
      console.log(`[upload-video] ✓ Cloudinary sucesso: ${url}`);
      return res.json({ url, provider: 'cloudinary' });
    } catch (err: any) {
      console.error(`[upload-video] ✗ Cloudinary falhou: ${err?.message}`);
      return res.status(500).json({ error: 'Upload falhou. Verifique as credenciais do Cloudinary nos Secrets.' });
    }
  });
});

// ─── /api/cloudinary-sign — assinatura para upload direto do browser ──────────
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

// ─── /api/upload-frames — upload multiple PNG frames to Storj ─────────────────
const framesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20,
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

    if (!storjReady || !storjClient) {
      return res.status(503).json({
        error: 'Storj não configurado. Defina STORJ_ACCESS_KEY, STORJ_SECRET_KEY e STORJ_BUCKET nos Secrets.',
      });
    }

    const nonImages = files.filter(f => !f.mimetype.startsWith('image/'));
    if (nonImages.length > 0) {
      return res.status(400).json({
        error: `Tipo inválido: apenas imagens são aceitas como frames. Arquivos rejeitados: ${nonImages.map(f => f.originalname).join(', ')}`,
      });
    }

    console.log(`[upload-frames] Recebidos ${files.length} frame(s)`);

    const results: Array<{ name: string; url: string }> = [];

    for (const file of files) {
      const safeName = `frames/frame_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      try {
        const url = await uploadToStorj(file.buffer, safeName, file.mimetype);
        console.log(`[upload-frames] ✓ ${safeName} → ${url}`);
        results.push({ name: path.basename(safeName), url });
      } catch (err: any) {
        console.error(`[upload-frames] ✗ Falha no frame ${safeName}:`, err?.message);
        results.push({ name: path.basename(safeName), url: '' });
      }
    }

    const succeeded = results.filter(r => r.url).length;
    res.json({
      message: `${succeeded} de ${files.length} frame(s) enviado(s) com sucesso.`,
      frames: results,
    });
  });
});

// ─── Configure Cloudinary v2 ──────────────────────────────────────────────────
cloudinaryV2.config({
  cloud_name: CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ─── Multer instance for legacy routes ───────────────────────────────────────
const uploadVideoCloud = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE_BYTES } });

// ─── GET / ─── Health / sanity check (dev only) ──────────────────────────────
if (!IS_PROD) {
  app.get('/', (_req: Request, res: Response) => {
    res.send('Backend funcionando!');
  });
}

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

// ─── Production: serve the Vite build + SPA fallback ─────────────────────────
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

// ─── POST /api/forgot-password ────────────────────────────────────────────────
// Rate limit: 3 requests per IP per 15 min
app.post('/api/forgot-password', async (req: Request, res: Response) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'unknown';
  if (isRateLimited(`forgot:${ip}`, 3, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  }

  const { username } = req.body as { username?: string };
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Nome de usuário obrigatório.' });
  }
  const cleanName = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (cleanName.length < 3) {
    return res.status(400).json({ error: 'Nome de usuário inválido.' });
  }
  if (!adminAuth) {
    return res.status(503).json({ error: 'Serviço de autenticação indisponível.' });
  }

  try {
    // Look up user doc via public Firestore REST API (same access the client SDK uses)
    const userDoc = await fsGetPublic(`users/${cleanName}`);
    if (!userDoc) {
      return res.json({ ok: true }); // don't reveal user existence
    }
    const userData = fsParseFields(userDoc.fields ?? {});
    const recoveryEmail = (userData.recoveryEmail as string | undefined)?.trim();
    if (!recoveryEmail) {
      return res.status(400).json({ error: 'Este usuário não possui e-mail de recuperação vinculado. Faça login e adicione um e-mail nas configurações.' });
    }

    // Invalidate any previous tokens for this user
    for (const [k, v] of resetTokenStore.entries()) {
      if (v.username === cleanName) resetTokenStore.delete(k);
    }

    // Generate 6-digit code + unique token ID
    const tokenId = crypto.randomBytes(16).toString('hex');
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    resetTokenStore.set(tokenId, {
      username: cleanName,
      uid: userData.uid as string,
      code,
      expiresAt,
      attempts: 0,
      createdAt: Date.now(),
    });

    const maskedEmail = recoveryEmail.replace(/(.{2}).+(@.+)/, '$1***$2');

    await sendMailgunEmail(
      recoveryEmail,
      'Recuperação de senha — Velvit',
      `<!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        <div style="max-width:480px;margin:40px auto;padding:40px 32px;background:#111;border-radius:20px;border:1px solid #222">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;color:#555;text-transform:uppercase">Velvit</p>
          <h1 style="margin:0 0 32px;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px">Recuperação<br>de Senha</h1>
          <p style="margin:0 0 8px;font-size:14px;color:#888">Olá <strong style="color:#ddd">@${cleanName}</strong>, seu código de verificação é:</p>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:28px 24px;text-align:center;margin:20px 0 28px">
            <span style="font-size:44px;font-weight:900;letter-spacing:10px;color:#fff;font-family:'Courier New',monospace">${code}</span>
          </div>
          <p style="margin:0 0 6px;font-size:13px;color:#555">⏱ Expira em <strong style="color:#888">15 minutos</strong></p>
          <p style="margin:0;font-size:12px;color:#444">Se você não solicitou esta recuperação, ignore este e-mail. Sua senha permanece a mesma.</p>
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #1e1e1e">
            <p style="margin:0;font-size:11px;color:#333">Enviado para ${maskedEmail}</p>
          </div>
        </div>
      </body>
      </html>`
    );

    console.log(`[forgot-password] Código enviado para @${cleanName} (${maskedEmail})`);
    return res.json({ ok: true, maskedEmail });
  } catch (err: any) {
    console.error('[forgot-password]', err.message);
    return res.status(500).json({ error: 'Erro ao enviar e-mail. Verifique sua conexão e tente novamente.' });
  }
});

// ─── POST /api/reset-password ─────────────────────────────────────────────────
// Rate limit: 10 attempts per IP per 15 min
app.post('/api/reset-password', async (req: Request, res: Response) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'unknown';
  if (isRateLimited(`reset:${ip}`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  }

  const { username, code, newPassword } = req.body as {
    username?: string; code?: string; newPassword?: string;
  };
  if (!username || !code || !newPassword) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
  }
  if (!adminAuth) {
    return res.status(503).json({ error: 'Serviço de autenticação indisponível.' });
  }

  const cleanName = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const cleanCode = code.trim();
  const now = Date.now();

  // Find most recently created valid token for this user
  let found: [string, ResetToken] | null = null;
  for (const entry of resetTokenStore.entries()) {
    if (entry[1].username === cleanName) {
      if (!found || entry[1].createdAt > found[1].createdAt) found = entry;
    }
  }

  if (!found) {
    return res.status(400).json({ error: 'Código inválido ou expirado. Solicite um novo.' });
  }

  const [tokenId, td] = found;

  if (now > td.expiresAt) {
    resetTokenStore.delete(tokenId);
    return res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
  }

  if (td.attempts >= 5) {
    resetTokenStore.delete(tokenId);
    return res.status(400).json({ error: 'Código bloqueado por muitas tentativas incorretas. Solicite um novo.' });
  }

  if (td.code !== cleanCode) {
    td.attempts++;
    const remaining = 5 - td.attempts;
    return res.status(400).json({ error: `Código incorreto. ${remaining} tentativa(s) restante(s).` });
  }

  try {
    // Update password via Firebase Admin Auth
    await adminAuth.updateUser(td.uid, { password: newPassword });
    resetTokenStore.delete(tokenId);
    console.log(`[reset-password] Senha atualizada com sucesso para @${cleanName}`);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[reset-password]', err.message);
    return res.status(500).json({ error: 'Erro interno ao redefinir senha. Tente novamente.' });
  }
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
