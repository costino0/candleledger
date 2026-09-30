// HTTP layer for trades. Business rules live in services/trades.js; errors thrown there
// reach the error handler in app.js (Express 5 forwards rejected promises).
import { Router } from 'express';
import { serializeTrade } from '../serializers/trade.js';
import { createTrade } from '../services/trades.js';

export function createTradesRouter(prisma) {
  const router = Router();

  router.post('/', async (req, res) => {
    const trade = await createTrade(prisma, req.body);
    res.status(201).json(serializeTrade(trade));
  });

  return router;
}
