# Velvit - Social Media App

A visual social media app built with React, Vite, Firebase, and Tailwind CSS v4. Features authentication, posts, likes, follows, notifications, and AI-powered recommendations via Gemini.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite 6
- **Styling:** Tailwind CSS v4 (via @tailwindcss/vite plugin)
- **Animations:** Motion (Framer Motion)
- **Database & Auth:** Firebase (Firestore + Firebase Auth)
- **AI:** Google Gemini API (@google/genai)
- **Icons:** Lucide React

## Project Structure

```
src/
  App.tsx              - Main app component (auth, feed, posts, likes, follows)
  firebase.ts          - Firebase initialization
  index.css            - Global styles
  main.tsx             - Entry point
  types.ts             - TypeScript types
  components/
    FloatingNav.tsx    - Bottom navigation bar
    GlassCard.tsx      - Post card with glass morphism style
    PostDetailModal.tsx - Post detail view
    PublishModal.tsx   - Post creation modal
firebase-applet-config.json  - Firebase project config
firestore.rules              - Firestore security rules
```

## Configuration

- **Dev server:** port 5000, host 0.0.0.0, all hosts allowed
- **Firebase project:** gen-lang-client-0766084456
- **Firestore DB:** ai-studio-77ffd2cc-dfda-47fc-9d29-f9bbf07dfa46

## Environment Variables

- `GEMINI_API_KEY` - Required for AI tag recommendations

## Deployment

Configured as a static site deployment (builds with `npm run build`, serves `dist/`).
