import { getDb, FieldValue, Timestamp } from '../config/firebase';

export type NotificationType =
  | 'new_post'
  | 'new_follower'
  | 'recommended'
  | 'like'
  | 'comment';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  fromUserId: string;
  postId?: string;
  message: string;
}

export interface NotificationDoc extends NotificationInput {
  id: string;
  read: boolean;
  createdAt: string;
}

const COLLECTION = 'notifications';

// Window used for de-duplication checks (in milliseconds).
const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const toIsoDate = (value: unknown): string => {
  if (!value) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof (value as any)?.toDate === 'function') {
    return (value as any).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
};

const mapDoc = (snap: FirebaseFirestore.DocumentSnapshot): NotificationDoc => {
  const data = snap.data() || {};
  return {
    id: snap.id,
    userId: data.userId,
    type: data.type,
    fromUserId: data.fromUserId,
    postId: data.postId ?? undefined,
    message: data.message ?? '',
    read: !!data.read,
    createdAt: toIsoDate(data.createdAt),
  };
};

/**
 * Creates a notification, skipping it when:
 *  - the recipient and the sender are the same user (no self-notify)
 *  - an equivalent notification was created in the last DEDUPE_WINDOW_MS
 *
 * Returns the created notification, or null when skipped.
 */
export const createNotification = async (
  input: NotificationInput
): Promise<NotificationDoc | null> => {
  const { userId, fromUserId, type, postId, message } = input;

  if (!userId || !fromUserId || !type || !message) {
    throw new Error('Campos obrigatórios faltando: userId, fromUserId, type, message.');
  }

  // Rule: never notify yourself
  if (userId === fromUserId) return null;

  const db = getDb();

  // De-duplication: same recipient + same type + same source + same post within window
  const since = Timestamp.fromDate(new Date(Date.now() - DEDUPE_WINDOW_MS));
  let dupeQuery = db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('type', '==', type)
    .where('fromUserId', '==', fromUserId)
    .where('createdAt', '>=', since)
    .limit(1);

  if (postId) {
    dupeQuery = dupeQuery.where('postId', '==', postId);
  }

  const dupeSnap = await dupeQuery.get();
  if (!dupeSnap.empty) return null;

  const docRef = await db.collection(COLLECTION).add({
    userId,
    type,
    fromUserId,
    postId: postId ?? null,
    message,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  const saved = await docRef.get();
  return mapDoc(saved);
};

/**
 * Lists notifications for a given user, newest first.
 */
export const listNotifications = async (
  userId: string,
  limit = 50
): Promise<NotificationDoc[]> => {
  if (!userId) throw new Error('userId é obrigatório.');
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const db = getDb();

  const snap = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(safeLimit)
    .get();

  return snap.docs.map(mapDoc);
};

/**
 * Marks a single notification as read.
 */
export const markAsRead = async (notificationId: string): Promise<NotificationDoc> => {
  if (!notificationId) throw new Error('notificationId é obrigatório.');
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(notificationId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Notificação não encontrada.');
  await ref.update({ read: true });
  const updated = await ref.get();
  return mapDoc(updated);
};

/**
 * Marks every notification belonging to userId as read.
 * Returns the number of notifications updated.
 */
export const markAllAsRead = async (userId: string): Promise<number> => {
  if (!userId) throw new Error('userId é obrigatório.');
  const db = getDb();

  const unreadSnap = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('read', '==', false)
    .get();

  if (unreadSnap.empty) return 0;

  // Firestore batched writes are limited to 500 ops each
  const docs = unreadSnap.docs;
  let updated = 0;
  for (let i = 0; i < docs.length; i += 450) {
    const chunk = docs.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
    updated += chunk.length;
  }
  return updated;
};

// ─── Helper: getFollowers (real query against `follows` with safe fallback) ──

/**
 * Returns the list of follower UIDs for a given user.
 *
 * Looks for documents in the `follows` collection where `followingUid == userId`.
 * If the collection does not exist or the query fails, returns an empty array
 * so the caller can keep working without crashing.
 */
export const getFollowers = async (userId: string): Promise<string[]> => {
  try {
    const db = getDb();
    const snap = await db
      .collection('follows')
      .where('followingUid', '==', userId)
      .get();
    return snap.docs
      .map((d) => d.data().followerUid as string)
      .filter((uid) => typeof uid === 'string' && uid.length > 0);
  } catch (err) {
    console.warn('[notifications] getFollowers fallback (vazio):', (err as Error).message);
    return [];
  }
};

// ─── Automatic dispatch helpers ─────────────────────────────────────────────

/**
 * Notifies all followers when a user publishes a new post.
 * Returns how many notifications were actually written.
 */
export const notifyFollowersOfNewPost = async (params: {
  authorUid: string;
  postId: string;
  authorName?: string;
}): Promise<number> => {
  const { authorUid, postId, authorName } = params;
  if (!authorUid || !postId) {
    throw new Error('authorUid e postId são obrigatórios.');
  }

  const followers = await getFollowers(authorUid);
  if (followers.length === 0) return 0;

  const message = authorName
    ? `${authorName} publicou um novo post.`
    : 'Alguém que você segue publicou um novo post.';

  const results = await Promise.all(
    followers.map((followerUid) =>
      createNotification({
        userId: followerUid,
        type: 'new_post',
        fromUserId: authorUid,
        postId,
        message,
      }).catch((err) => {
        console.warn('[notifications] new_post falhou para', followerUid, err.message);
        return null;
      })
    )
  );

  return results.filter(Boolean).length;
};

/**
 * Notifies a user that someone started following them.
 */
export const notifyOnNewFollower = async (params: {
  followedUid: string;
  followerUid: string;
  followerName?: string;
}): Promise<NotificationDoc | null> => {
  const { followedUid, followerUid, followerName } = params;
  if (!followedUid || !followerUid) {
    throw new Error('followedUid e followerUid são obrigatórios.');
  }

  const message = followerName
    ? `${followerName} começou a seguir você.`
    : 'Você tem um novo seguidor.';

  return createNotification({
    userId: followedUid,
    type: 'new_follower',
    fromUserId: followerUid,
    message,
  });
};

/**
 * Simple recommendation engine: picks the most recent popular posts (by likes)
 * that the user has not authored, and sends one recommendation notification.
 *
 * Returns the notification created, or null when nothing was sent.
 */
export const sendRecommendationToUser = async (
  userId: string
): Promise<NotificationDoc | null> => {
  if (!userId) throw new Error('userId é obrigatório.');
  const db = getDb();

  // Pull a small slice of recent posts and pick the best one the user did not author.
  const snap = await db
    .collection('posts')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  if (snap.empty) return null;

  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => p.authorUid && p.authorUid !== userId);

  if (candidates.length === 0) return null;

  // Score = likes (fallback 0) + small recency boost
  const scored = candidates
    .map((p) => ({
      ...p,
      _score: (typeof p.likes === 'number' ? p.likes : 0) + Math.random() * 0.5,
    }))
    .sort((a, b) => b._score - a._score);

  const top = scored[0];
  const authorName = top.authorName || 'um criador';

  return createNotification({
    userId,
    type: 'recommended',
    fromUserId: top.authorUid,
    postId: top.id,
    message: `Recomendado para você: confira o novo post de ${authorName}.`,
  });
};
