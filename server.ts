import express from 'express';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';
import ImageKit from 'imagekit';

const app = express();
app.use(express.json());

const PORT = 3001;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET ?? '';

const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY ?? '';
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT ?? '';
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY ?? '';

const LIGHT_VIDEO_LIMIT = 50 * 1024 * 1024;

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

const imagekit = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY || 'public_placeholder',
  privateKey: IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: IMAGEKIT_URL_ENDPOINT,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

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
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const fileSize = req.file.size;
  const isHeavy = fileSize > LIGHT_VIDEO_LIMIT;

  console.log(`[Upload] Arquivo: ${req.file.originalname}, Tamanho: ${(fileSize / 1024 / 1024).toFixed(1)}MB, Rota: ${isHeavy ? 'ImageKit (pesado)' : 'Cloudinary (leve)'}`);

  try {
    if (isHeavy) {
      if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_URL_ENDPOINT) {
        return res.status(500).json({ error: 'ImageKit não configurado para vídeos pesados.' });
      }

      const fileName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const response = await imagekit.upload({
        file: req.file.buffer,
        fileName,
        folder: '/videos',
        useUniqueFileName: true,
      });

      console.log(`[ImageKit] Upload concluído: ${response.url}`);
      return res.json({ url: response.url, provider: 'imagekit' });
    } else {
      if (!CLOUD_NAME || !UPLOAD_PRESET) {
        return res.status(500).json({ error: 'Cloudinary não configurado para vídeos leves.' });
      }

      const form = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      form.append('file', blob, req.file.originalname || 'upload');
      form.append('upload_preset', UPLOAD_PRESET);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: form }
      );

      const data: any = await response.json();

      if (!response.ok) {
        console.error('[Cloudinary]', data?.error?.message);
        return res.status(500).json({ error: 'Falha no upload via Cloudinary.' });
      }

      console.log(`[Cloudinary] Upload concluído: ${data.secure_url}`);
      return res.json({ url: data.secure_url, provider: 'cloudinary' });
    }
  } catch (err: any) {
    console.error('[Upload]', err?.message);
    res.status(500).json({ error: 'Erro ao enviar vídeo. Tente novamente.' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERRO] Porta ${PORT} ocupada. Tente reiniciar o servidor.`);
    process.exit(1);
  } else {
    throw err;
  }
});
