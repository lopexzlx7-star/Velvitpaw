import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const PORT = 3001;

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

app.post('/api/upload-url', async (req, res) => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return res.status(500).json({ error: 'Cloudflare R2 não configurado no servidor.' });
  }

  const { filename, contentType } = req.body as { filename?: string; contentType?: string };
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename e contentType são obrigatórios.' });
  }

  const ext = filename.split('.').pop() || 'bin';
  const key = `uploads/${crypto.randomUUID()}.${ext}`;

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });
    const filePublicUrl = `${publicUrl.replace(/\/$/, '')}/${key}`;
    res.json({ uploadUrl: signedUrl, publicUrl: filePublicUrl });
  } catch (err: any) {
    console.error('R2 presign error:', err?.message);
    res.status(500).json({ error: 'Erro ao gerar URL de upload.' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});
