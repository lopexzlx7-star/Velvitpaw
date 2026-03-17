import express from 'express';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';

const app = express();
app.use(express.json());

const PORT = 3001;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET ?? '';

if (!CLOUD_NAME || !UPLOAD_PRESET) {
  console.error('[AVISO] CLOUDINARY_CLOUD_NAME ou CLOUDINARY_UPLOAD_PRESET não definidos. Uploads de vídeo não funcionarão.');
} else {
  console.log(`[OK] Cloudinary configurado para cloud: ${CLOUD_NAME}`);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
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

  try {
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
      return res.status(500).json({ error: 'Falha no upload. Tente novamente.' });
    }

    res.json({ url: data.secure_url });
  } catch (err: any) {
    console.error('[Upload]', err?.message);
    res.status(500).json({ error: 'Erro ao enviar vídeo. Tente novamente.' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
