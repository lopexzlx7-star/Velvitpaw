import express from 'express';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';
import ImageKit from 'imagekit';

const app = express();
app.use(express.json());

const PORT = 3001;
const SERVER_TIMEOUT_MS = 10 * 60 * 1000;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET ?? '';

const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY ?? '';
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT ?? '';
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY ?? '';

if (!CLOUD_NAME || !UPLOAD_PRESET) {
  console.error('[AVISO] CLOUDINARY_CLOUD_NAME ou CLOUDINARY_UPLOAD_PRESET não definidos.');
} else {
  console.log(`[OK] Cloudinary configurado: ${CLOUD_NAME}`);
}

if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
  console.error('[AVISO] IMAGEKIT_PRIVATE_KEY ou IMAGEKIT_URL_ENDPOINT não definidos.');
} else {
  console.log(`[OK] ImageKit configurado: ${IMAGEKIT_URL_ENDPOINT}`);
}

let imagekit: ImageKit | null = null;
if (IMAGEKIT_PRIVATE_KEY && IMAGEKIT_URL_ENDPOINT && IMAGEKIT_PUBLIC_KEY) {
  imagekit = new ImageKit({
    publicKey: IMAGEKIT_PUBLIC_KEY,
    privateKey: IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: IMAGEKIT_URL_ENDPOINT,
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

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
      console.warn(`[${label}] Tentativa ${attempt} falhou: ${err?.message}. Tentando novamente em ${delayMs * attempt}ms...`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error('Máximo de tentativas atingido');
}

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

app.post('/api/upload', upload.single('file'), async (req, res) => {
  res.setTimeout(SERVER_TIMEOUT_MS);

  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const provider = req.body?.provider ?? 'cloudinary';
  const isHeavy = provider === 'imagekit';

  console.log(`[Upload] Arquivo: ${req.file.originalname}, Tamanho: ${(req.file.size / 1024 / 1024).toFixed(1)}MB, Rota: ${isHeavy ? 'ImageKit' : 'Cloudinary'}`);

  try {
    if (isHeavy) {
      if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
        return res.status(500).json({ error: 'Serviço de vídeos pesados não configurado.' });
      }

      const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const fileBuffer = req.file.buffer;

      const response = await withRetry(
        () => imagekit!.upload({ file: fileBuffer, fileName, folder: '/videos', useUniqueFileName: true }),
        3, 2000, 'ImageKit'
      );

      console.log(`[ImageKit] Upload concluído: ${response.url}`);
      return res.json({ url: response.url, provider: 'imagekit' });

    } else {
      if (!CLOUD_NAME || !UPLOAD_PRESET) {
        return res.status(500).json({ error: 'Serviço de vídeos leves não configurado.' });
      }

      const fileBuffer = req.file.buffer;
      const fileMimetype = req.file.mimetype;
      const fileName = req.file.originalname || 'upload';

      const url = await withRetry(async () => {
        const form = new FormData();
        const blob = new Blob([fileBuffer], { type: fileMimetype });
        form.append('file', blob, fileName);
        form.append('upload_preset', UPLOAD_PRESET);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
          { method: 'POST', body: form }
        );

        const data: any = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || 'Cloudinary retornou erro');
        return data.secure_url as string;
      }, 3, 2000, 'Cloudinary');

      console.log(`[Cloudinary] Upload concluído: ${url}`);
      return res.json({ url, provider: 'cloudinary' });
    }
  } catch (err: any) {
    console.error('[Upload] Falha após todas as tentativas:', err?.message);
    res.status(500).json({ error: 'Falha no upload após várias tentativas. Tente novamente.' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

server.timeout = SERVER_TIMEOUT_MS;
server.keepAliveTimeout = SERVER_TIMEOUT_MS;

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERRO] Porta ${PORT} ocupada. Tente reiniciar o servidor.`);
    process.exit(1);
  } else {
    throw err;
  }
});
