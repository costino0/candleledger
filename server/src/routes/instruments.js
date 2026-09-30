// HTTP layer for instruments. Queries live in services/instruments.js.
import { Router } from 'express';
import { serializeInstrument } from '../serializers/instrument.js';
import { listInstruments } from '../services/instruments.js';

export function createInstrumentsRouter(prisma) {
  const router = Router();

  router.get('/', async (req, res) => {
    const instruments = await listInstruments(prisma);
    res.json(instruments.map(serializeInstrument));
  });

  return router;
}
