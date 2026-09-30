// HTTP layer for stats. The calculation lives in services/stats.js.
import { Router } from 'express';
import { getStats } from '../services/stats.js';

export function createStatsRouter(prisma) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await getStats(prisma));
  });

  return router;
}
