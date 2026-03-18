# Velvit

A social media app for sharing images, GIFs, and videos with a glassmorphism aesthetic.

## Architecture

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS 4, Framer Motion
- **Backend**: Express (Node.js / tsx) on port 3001 — handles video uploads and AI tag suggestions
- **Database**: Firebase Firestore (custom database ID in config)
- **Auth**: Firebase Auth (Email/Password)
- **Video Storage**: Cloudinary (light videos ≤720p / ≤60s) or ImageKit (heavy videos >720p / >60s)
- **Thumbnails**: First frame of video extracted on client (canvas JPEG), saved as `thumbnailUrl` in Firestore
- **AI**: OpenAI GPT-4o-mini (`/api/suggest-tags`, `/api/generate-tags-multi`) — requires `OPENAI_API_KEY` env var
- **Hashtag DB**: Local JSON file (`tags_db.json`) storing user hashtags per post for `/api/search-tags`

## Key Files

- `src/App.tsx` — main app logic, routing states, auth flow
- `src/components/PublishModal.tsx` — post creation, video upload via Cloudinary/ImageKit, thumbnail extraction
- `src/components/GlassCard.tsx` — content card component (uses `thumbnailUrl` as video poster)
- `src/components/PostDetailModal.tsx` — full post view (uses `thumbnailUrl` as video poster)
- `src/firebase.ts` — Firebase init (db, auth exports)
- `src/types.ts` — TypeScript interfaces (ContentItem includes `thumbnailUrl`)
- `server.ts` — Express API server (Cloudinary & ImageKit upload proxy, Gemini tag suggestions)
- `firebase-applet-config.json` — Firebase project config
- `storage.rules` — Firebase Storage security rules
- `firestore.rules` — Firestore security rules

## Environment Variables Required

- `OPENAI_API_KEY` — AI tag suggestions (requires billing enabled at platform.openai.com)
- `CLOUDINARY_CLOUD_NAME` — Cloudinary cloud name
- `CLOUDINARY_API_KEY` — Cloudinary API key (signed uploads)
- `CLOUDINARY_API_SECRET` — Cloudinary API secret (signed uploads)
- `CLOUDINARY_UPLOAD_PRESET` — Cloudinary unsigned upload preset
- `IMAGEKIT_PRIVATE_KEY` — ImageKit private key
- `IMAGEKIT_PUBLIC_KEY` — ImageKit public key
- `IMAGEKIT_URL_ENDPOINT` — ImageKit URL endpoint

## Upload Flow

- **Images**: Compressed on client (canvas JPEG 0.82, max 1200px), stored as base64 in Firestore
- **Videos**:
  1. First frame extracted on client via canvas → saved as `thumbnailUrl` in Firestore document
  2. File uploaded to Express server → proxied to Cloudinary (light) or ImageKit (heavy)
  3. Permanent CDN URL saved as `url` in Firestore document
  4. `thumbnailUrl` used as `poster` in `<video>` elements for instant preview before video loads

## API Endpoints (port 3001)

### Original endpoints (unchanged)
- `GET  /api/health` — service status check
- `POST /api/thumbnail` — extract first frame from video via ffmpeg
- `POST /api/suggest-tags` — OpenAI GPT tag suggestions for a single post (requires OPENAI_API_KEY)
- `POST /api/generate-tags-multi` — GPT tags for multiple posts + saves user hashtags to tags_db.json
- `GET  /api/search-tags/:query` — searches saved hashtags in tags_db.json by substring
- `POST /api/upload-video` — proxy upload to Cloudinary or ImageKit based on file size
- `POST /api/upload-thumbnail` — upload JPEG thumbnail to ImageKit
- `POST /api/upload` — image/video upload (legacy route)
- `GET  /api/imagekit-auth` — short-lived ImageKit credentials for browser uploads
- `GET  /api/cloudinary-sign` — signed params for direct Cloudinary browser uploads

### New video-upload endpoints (multer-storage-cloudinary)
- `GET  /` — health check, returns "Backend funcionando!"
- `POST /upload` — upload 1 video (field: `video`), returns `{ url }`
- `POST /upload-multiple` — upload up to 5 videos (field: `videos`), returns `{ urls[] }`

## Dev Server

- Vite (frontend): port 5000
- Express API: port 3001
- Run: `npm run dev` (uses `concurrently`)
