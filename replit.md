# Velvit

A social media app for sharing images, GIFs, and videos with a glassmorphism aesthetic.

## Architecture

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS 4, Framer Motion
- **Backend**: Express (Node.js / tsx) on port 3001 — handles video uploads and AI tag suggestions
- **Database**: Firebase Firestore (custom database ID in config)
- **Auth**: Firebase Auth (Email/Password)
- **Media Storage**: Cloudinary (todos os tipos: vídeos, imagens, thumbnails, frames)
- **Thumbnails**: First frame of video extracted on client (canvas JPEG), saved as `thumbnailUrl` in Firestore
- **AI**: OpenAI GPT-4o-mini (`/api/suggest-tags`, `/api/generate-tags-multi`) — requires `OPENAI_API_KEY` env var
- **Hashtag DB**: Local JSON file (`tags_db.json`) storing user hashtags per post for `/api/search-tags`
- **Person Tags**: Firestore `person_tags` collection — auto-criada ao publicar posts com "Marcar pessoa". PersonTagModal agrega todos os posts tagueados.

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

## New Features (2026-04-22)

### Recency-first ordering
- Feed query in `App.tsx` sorts by `createdAt DESC` with `id DESC` as deterministic tie-breaker (matches `ORDER BY created_at DESC, id DESC`).

### Pinterest-style folders ("Pastas")
- New `folders` Firestore collection: `{ ownerUid, name, description, coverImage, postIds[], createdAt }`.
- `firestore.rules` updated to allow owner CRUD on `folders/{folderId}`.
- Bookmark icon on any post opens `SaveToFolderModal` (pick a folder or create one).
- Profile page has a new "Pastas" tab with a folder grid; tapping a folder opens `FolderDetailModal`.
- `savedIds` is derived from `folders.postIds` so the bookmark indicator stays accurate.
- Files: `src/components/SaveToFolderModal.tsx`, `src/components/FolderDetailModal.tsx`, `src/types.ts` (Folder).

### Hashtag categories in search
- Search popup "Recomendações" replaced with "Categorias em alta" — horizontal carousel of `HashtagCategoryCard` (cover image + name + post count) computed from `globalPosts`.
- Tapping a category triggers `handleHashtagClick(tag)`.
- Files: `src/components/HashtagCategoryCard.tsx`, `src/types.ts` (HashtagCategory).

## New Features (2026-04-25)

### Vercel deployment readiness
- `vite.config.ts` proxy target points to the Render backend (`https://velvitpaw-1.onrender.com`).
- `src/main.tsx` installs a global `fetch` wrapper that prepends the Render base URL to every `/api/*` request **only in production builds** (`import.meta.env.PROD`). Dev still uses the Vite proxy.
- `test-upload.sh` updated to the Render URL.

### Swipe navigation between tabs
- `<main>` now intercepts horizontal swipes (`onTouchStart` / `onTouchEnd`) and switches between `publish` ◀ `feed` ▶ `profile`.
- Vertical scrolls are ignored (swipe must be ≥ 70px and clearly horizontal).
- Helpers: `TAB_ORDER`, `goToTab`, `handleSwipeNav`, `onMainTouchStart`, `onMainTouchEnd` in `src/App.tsx`.

### Swipe-to-delete notifications + 7-day auto cleanup
- New component: `src/components/SwipeableNotification.tsx` — wraps each notification, exposes a red trash background as the user drags left; releasing past the threshold deletes.
- `handleDeleteNotification(id)` calls `DELETE /api/notifications/:id` (optimistically updates UI first).
- On mount (per session per user), the app calls `DELETE /api/notifications/:userId/old?days=7` to permanently purge old notifications.
- `visibleNotifications` (memoized) hides any notification older than 7 days from the UI immediately, even before the backend cleanup completes.

### New backend endpoints (`server/notifications/`)
- `DELETE /api/notifications/:id` — removes a single notification (`removeNotification` in service).
- `DELETE /api/notifications/:userId/old?days=7` — batch-deletes notifications older than `days` for a user (`cleanupOldNotifications`).
- CORS in `server.ts` updated to allow `PATCH` and `DELETE` methods.
