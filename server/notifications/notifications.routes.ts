import { Router } from 'express';
import {
  create,
  list,
  read,
  readAll,
  triggerNewPost,
  triggerNewFollower,
  triggerRecommendation,
} from './notifications.controller';

const router = Router();

// ─── CRUD ─────────────────────────────────────────────────────────────────
router.post('/', create);                     // POST   /notifications
router.get('/:userId', list);                 // GET    /notifications/:userId
router.patch('/:id/read', read);              // PATCH  /notifications/:id/read
router.patch('/:userId/read-all', readAll);   // PATCH  /notifications/:userId/read-all

// ─── Triggers automáticos (opcionais — facilitam integração) ───────────────
router.post('/trigger/new-post', triggerNewPost);
router.post('/trigger/new-follower', triggerNewFollower);
router.post('/trigger/recommendation', triggerRecommendation);

export default router;
