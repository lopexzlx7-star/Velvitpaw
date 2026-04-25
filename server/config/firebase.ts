import admin from 'firebase-admin';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read project + database from the same config file used by the frontend so
// backend and client always point at the same Firestore instance.
let appletCfg: { projectId?: string; firestoreDatabaseId?: string } = {};
try {
  const raw = readFileSync(join(process.cwd(), 'firebase-applet-config.json'), 'utf-8');
  appletCfg = JSON.parse(raw);
} catch (err) {
  console.warn('[notifications] firebase-applet-config.json não encontrado:', (err as Error).message);
}

const PROJECT_ID = appletCfg.projectId ?? '';
const FIRESTORE_DB_ID = appletCfg.firestoreDatabaseId ?? '(default)';
const stripWrappingQuotes = (s: string): string =>
  s.replace(/^\s*['"]/, '').replace(/['"]\s*$/, '');

const CLIENT_EMAIL = stripWrappingQuotes(process.env.FIREBASE_CLIENT_EMAIL ?? '');
const PRIVATE_KEY = stripWrappingQuotes(process.env.FIREBASE_PRIVATE_KEY ?? '')
  .replace(/\\n/g, '\n');

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
  cachedDb =
    FIRESTORE_DB_ID && FIRESTORE_DB_ID !== '(default)'
      ? getFirestore(app, FIRESTORE_DB_ID)
      : getFirestore(app);
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
