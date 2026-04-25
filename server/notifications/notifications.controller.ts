import { Request, Response } from 'express';
import {
  createNotification,
  listNotifications,
  markAsRead,
  markAllAsRead,
  notifyFollowersOfNewPost,
  notifyOnNewFollower,
  sendRecommendationToUser,
  NotificationType,
} from './notifications.service';

const VALID_TYPES: NotificationType[] = [
  'new_post',
  'new_follower',
  'recommended',
  'like',
  'comment',
];

export const create = async (req: Request, res: Response) => {
  try {
    const { userId, type, fromUserId, postId, message } = req.body || {};

    if (!userId || !type || !fromUserId || !message) {
      return res.status(400).json({
        error: 'Campos obrigatórios: userId, type, fromUserId, message.',
      });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Tipo inválido. Use um de: ${VALID_TYPES.join(', ')}.`,
      });
    }

    const created = await createNotification({
      userId,
      type,
      fromUserId,
      postId,
      message,
    });

    if (!created) {
      return res
        .status(200)
        .json({ skipped: true, reason: 'self-notify ou duplicada recente' });
    }

    return res.status(201).json(created);
  } catch (err: any) {
    console.error('[notifications.create]', err);
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
};

export const list = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório.' });
    const items = await listNotifications(userId, limit);
    return res.json({ count: items.length, items });
  } catch (err: any) {
    console.error('[notifications.list]', err);
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
};

export const read = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updated = await markAsRead(id);
    return res.json(updated);
  } catch (err: any) {
    console.error('[notifications.read]', err);
    const status = err.message?.includes('não encontrada') ? 404 : 500;
    return res.status(status).json({ error: err.message || 'Erro interno.' });
  }
};

export const readAll = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const updated = await markAllAsRead(userId);
    return res.json({ updated });
  } catch (err: any) {
    console.error('[notifications.readAll]', err);
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
};

// ─── Trigger endpoints (optional helpers exposed via routes) ────────────────

export const triggerNewPost = async (req: Request, res: Response) => {
  try {
    const { authorUid, postId, authorName } = req.body || {};
    if (!authorUid || !postId) {
      return res.status(400).json({ error: 'authorUid e postId são obrigatórios.' });
    }
    const sent = await notifyFollowersOfNewPost({ authorUid, postId, authorName });
    return res.json({ sent });
  } catch (err: any) {
    console.error('[notifications.triggerNewPost]', err);
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
};

export const triggerNewFollower = async (req: Request, res: Response) => {
  try {
    const { followedUid, followerUid, followerName } = req.body || {};
    if (!followedUid || !followerUid) {
      return res.status(400).json({ error: 'followedUid e followerUid são obrigatórios.' });
    }
    const result = await notifyOnNewFollower({ followedUid, followerUid, followerName });
    return res.json({ created: result });
  } catch (err: any) {
    console.error('[notifications.triggerNewFollower]', err);
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
};

export const triggerRecommendation = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório.' });
    const result = await sendRecommendationToUser(userId);
    return res.json({ created: result });
  } catch (err: any) {
    console.error('[notifications.triggerRecommendation]', err);
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
};
