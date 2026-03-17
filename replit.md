# Velvit

A social media app for sharing images, GIFs, and videos with a glassmorphism aesthetic.

## Architecture

- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS 4, Framer Motion
- **Backend**: Express (Node.js / tsx) on port 3001 — handles AI tag suggestions via Gemini
- **Database**: Firebase Firestore (custom database ID in config)
- **Auth**: Firebase Auth (Email/Password)
- **Media Storage**: Firebase Storage (videos uploaded directly from client via `uploadBytesResumable`)
- **AI**: Google Gemini (`/api/suggest-tags`) — requires `GEMINI_API_KEY` env var

## Key Files

- `src/App.tsx` — main app logic, routing states, auth flow
- `src/components/PublishModal.tsx` — post creation, video upload via Firebase Storage
- `src/components/GlassCard.tsx` — content card component
- `src/components/PostDetailModal.tsx` — full post view
- `src/firebase.ts` — Firebase init (db, auth, storage exports)
- `server.ts` — Express API server (Gemini tag suggestions)
- `firebase-applet-config.json` — Firebase project config
- `storage.rules` — Firebase Storage security rules
- `firestore.rules` — Firestore security rules

## Environment Variables

- `GEMINI_API_KEY` — Required for AI tag suggestions
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET` — Optional legacy, no longer used for uploads
- `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`, `IMAGEKIT_PUBLIC_KEY` — Optional legacy, no longer used for uploads

## Upload Flow

- **Images**: Compressed on client (canvas, JPEG 0.82, max 1200px), stored as base64 in Firestore
- **Videos**: Uploaded directly to Firebase Storage at `posts/{uid}/{timestamp}_{filename}`, with real-time progress. Download URL saved to Firestore.

## Dev Server

- Vite (frontend): port 5000
- Express API: port 3001
- Run: `npm run dev` (uses `concurrently`)
