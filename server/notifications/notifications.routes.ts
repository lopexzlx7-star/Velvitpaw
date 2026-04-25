import { Router } from 'express';
import {
  create,
  list,
  read,
  readAll,
  remove,
  cleanupOld,
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
router.delete('/:id', remove);                // DELETE /notifications/:id
router.delete('/:userId/old', cleanupOld);    // DELETE /notifications/:userId/old?days=7

// ─── Triggers automáticos (opcionais — facilitam integração) ───────────────
router.post('/trigger/new-post', triggerNewPost);
router.post('/trigger/new-follower', triggerNewFollower);
router.post('/trigger/recommendation', triggerRecommendation);

export default router;
