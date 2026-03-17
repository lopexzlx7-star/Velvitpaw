import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';
import ImageKit from 'imagekit';

const app = express();
app.use(express.json());

const PORT = 3001;
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
      gemini: !!process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    },
    routing: {
      light: `< ${HEAVY_VIDEO_MIN_MB}MB → ImageKit (fallback: Cloudinary)`,
      heavy: `≥ ${HEAVY_VIDEO_MIN_MB}MB → Cloudinary (fallback: ImageKit)`,
    },
  });
});

// ─── /api/suggest-tags ────────────────────────────────────────────────────────
app.post('/api/suggest-tags', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
  }

  const { title, mediaType } = req.body as { title?: string; mediaType?: string };
  if (!title) {
    return res.status(400).json({ error: 'Campo "title" é obrigatório.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Sugira 5 tags curtas e relevantes (em português, sem #) para um post de ${mediaType ?? 'imagem'} com o título: "${title}". Retorne apenas as tags separadas por vírgula, sem explicações.`;
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    const text = result.text ?? '';
    const tags = text.split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 5);
    res.json({ tags });
  } catch (err: any) {
    console.error('Gemini error:', err?.message);
    res.status(500).json({ error: 'Erro ao chamar a API Gemini.' });
  }
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
