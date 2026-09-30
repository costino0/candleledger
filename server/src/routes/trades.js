// HTTP layer for trades. Business rules live in services/trades.js; errors thrown there
// reach the error handler in app.js (Express 5 forwards rejected promises).
import { Router } from 'express';
import { serializeTrade } from '../serializers/trade.js';
import { createTrade, deleteTrade, getTrade, listTrades, updateTrade } from '../services/trades.js';

export function createTradesRouter(prisma) {
  const router = Router();

  router.get('/', async (req, res) => {
    const trades = await listTrades(prisma);
    res.json(trades.map(serializeTrade));
  });

  router.get('/:id', async (req, res) => {
    const trade = await getTrade(prisma, req.params.id);
    res.json(serializeTrade(trade));
  });

  router.post('/', async (req, res) => {
    const trade = await createTrade(prisma, req.body);
    res.status(201).json(serializeTrade(trade));
  });

  router.put('/:id', async (req, res) => {
    const trade = await updateTrade(prisma, req.params.id, req.body);
    res.json(serializeTrade(trade));
  });

  router.delete('/:id', async (req, res) => {
    await deleteTrade(prisma, req.params.id);
    res.status(204).end();
  });

  return router;
}
