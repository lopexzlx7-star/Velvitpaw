import express from 'express';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';
import ImageKit from 'imagekit';

const app = express();
app.use(express.json());

const PORT = 3001;
const SERVER_TIMEOUT_MS = 10 * 60 * 1000;

// ─── Video routing thresholds ─────────────────────────────────────────────────
// Files at or above this size always go to ImageKit first (heavy route)
const HEAVY_VIDEO_MIN_MB = 50;
const HEAVY_VIDEO_MIN_BYTES = HEAVY_VIDEO_MIN_MB * 1024 * 1024;

// Round-robin counter for light videos — alternates between Cloudinary and ImageKit
// so neither service accumulates all the load
let lightVideoCounter = 0;

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
const cloudinaryReady = !!(CLOUD_NAME && UPLOAD_PRESET);
const imagekitReady = !!(IMAGEKIT_PRIVATE_KEY && IMAGEKIT_URL_ENDPOINT && IMAGEKIT_PUBLIC_KEY);

if (cloudinaryReady) {
  console.log(`[OK] Cloudinary pronto: cloud=${CLOUD_NAME}`);
} else {
  console.error('[AVISO] Cloudinary NÃO configurado. Defina CLOUDINARY_CLOUD_NAME e CLOUDINARY_UPLOAD_PRESET nos Secrets.');
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
  limits: { fileSize: 500 * 1024 * 1024 },
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

// ─── Upload helpers ───────────────────────────────────────────────────────────
async function uploadToCloudinary(buffer: Buffer, mimetype: string, originalName: string): Promise<string> {
  if (!cloudinaryReady) throw new Error('Cloudinary não configurado');
  const fileName = originalName || 'upload';
  return withRetry(async () => {
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimetype });
    form.append('file', blob, fileName);
    form.append('upload_preset', UPLOAD_PRESET);
    form.append('resource_type', 'video');

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

// ─── /api/suggest-tags ────────────────────────────────────────────────────────
app.post('/api/suggest-tags', async (req, res) => {
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
// All upload logic lives here. Frontend never decides which service to use.
app.post('/api/upload-video', upload.single('file'), async (req, res) => {
  res.setTimeout(SERVER_TIMEOUT_MS);

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  // MIME validation — only video types allowed
  if (!req.file.mimetype.startsWith('video/')) {
    return res.status(400).json({ error: 'Tipo de arquivo inválido. Apenas vídeos são aceitos.' });
  }

  const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
  const isHeavy = req.file.size >= HEAVY_VIDEO_MIN_BYTES;

  let primaryService: 'Cloudinary' | 'ImageKit';
  let fallbackService: 'Cloudinary' | 'ImageKit';

  if (isHeavy) {
    // Heavy videos always go to ImageKit first
    primaryService = 'ImageKit';
    fallbackService = 'Cloudinary';
  } else {
    // Light videos alternate between services on each upload (round-robin)
    const useCloudinaryFirst = lightVideoCounter % 2 === 0;
    primaryService = useCloudinaryFirst ? 'Cloudinary' : 'ImageKit';
    fallbackService = useCloudinaryFirst ? 'ImageKit' : 'Cloudinary';
    lightVideoCounter++;
  }

  const routeLabel = isHeavy ? 'pesado' : `leve #${lightVideoCounter}`;
  console.log(`[upload-video] Arquivo: ${req.file.originalname} | Tamanho: ${fileSizeMB}MB | Tipo: ${routeLabel} | Rota: ${primaryService} (fallback: ${fallbackService})`);

  const { buffer, mimetype, originalname } = req.file;

  // ─── Primary attempt ───────────────────────────────────────────────────────
  try {
    let url: string;
    if (isHeavy) {
      url = await uploadToImageKit(buffer, originalname);
    } else {
      url = await uploadToCloudinary(buffer, mimetype, originalname);
    }
    console.log(`[upload-video] ✓ ${primaryService} sucesso: ${url}`);
    return res.json({ url, provider: primaryService.toLowerCase() });
  } catch (primaryErr: any) {
    console.error(`[upload-video] ✗ ${primaryService} falhou: ${primaryErr?.message}. Ativando fallback para ${fallbackService}...`);
  }

  // ─── Fallback attempt ──────────────────────────────────────────────────────
  try {
    let url: string;
    if (isHeavy) {
      url = await uploadToCloudinary(buffer, mimetype, originalname);
    } else {
      url = await uploadToImageKit(buffer, originalname);
    }
    console.log(`[upload-video] ✓ Fallback ${fallbackService} sucesso: ${url}`);
    return res.json({ url, provider: fallbackService.toLowerCase() });
  } catch (fallbackErr: any) {
    console.error(`[upload-video] ✗ Fallback ${fallbackService} também falhou: ${fallbackErr?.message}`);
    return res.status(500).json({
      error: `Upload falhou em ambos os serviços (${primaryService} e ${fallbackService}). Verifique as credenciais nos Secrets e tente novamente.`,
    });
  }
});

// ─── /api/upload (mantido para compatibilidade — imagens) ─────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  res.setTimeout(SERVER_TIMEOUT_MS);

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const provider = req.body?.provider ?? 'cloudinary';
  const isHeavy = provider === 'imagekit';

  console.log(`[upload] Arquivo: ${req.file.originalname}, Tamanho: ${(req.file.size / 1024 / 1024).toFixed(1)}MB, Rota: ${isHeavy ? 'ImageKit' : 'Cloudinary'}`);

  try {
    if (isHeavy) {
      if (!imagekitReady) {
        return res.status(500).json({ error: 'Serviço ImageKit não configurado.' });
      }
      const url = await uploadToImageKit(req.file.buffer, req.file.originalname);
      console.log(`[upload] ImageKit concluído: ${url}`);
      return res.json({ url, provider: 'imagekit' });
    } else {
      if (!cloudinaryReady) {
        return res.status(500).json({ error: 'Serviço Cloudinary não configurado.' });
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
