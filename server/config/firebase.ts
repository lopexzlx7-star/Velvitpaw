import admin from 'firebase-admin';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = 'gen-lang-client-0766084456';
const FIRESTORE_DB_ID = 'ai-studio-77ffd2cc-dfda-47fc-9d29-f9bbf07dfa46';
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL ?? '';
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

let cachedDb: Firestore | null = null;
let initAttempted = false;

const ensureAdminApp = (): admin.app.App | null => {
  if (admin.apps.length > 0) return admin.app();
  if (!CLIENT_EMAIL || !PRIVATE_KEY) return null;
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: PROJECT_ID,
      clientEmail: CLIENT_EMAIL,
      privateKey: PRIVATE_KEY,
    }),
    projectId: PROJECT_ID,
  });
};

export const getDb = (): Firestore => {
  if (cachedDb) return cachedDb;
  const app = ensureAdminApp();
  if (!app) {
    throw new Error(
      'Firebase Admin não está configurado. Defina FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY nos Secrets.'
    );
  }
  cachedDb = getFirestore(app, FIRESTORE_DB_ID);
  return cachedDb;
};

export const isFirebaseReady = (): boolean => {
  if (initAttempted) return cachedDb !== null;
  initAttempted = true;
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
};

export { FieldValue, Timestamp };
