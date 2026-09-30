import express from 'express';
import { ValidationError } from './errors.js';
import { createTradesRouter } from './routes/trades.js';

// Builds and returns the Express app without starting it.
// Keeping this separate from index.js lets tests import the app directly.
// `prisma` is passed in so tests can supply a fake instead of a real database client.
export function createApp({ prisma } = {}) {
  if (!prisma) {
    throw new Error('createApp: a Prisma client is required');
  }

  const app = express();

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/trades', createTradesRouter(prisma));

  // Any /api route not matched above.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(handleError);

  return app;
}

// Error middleware: Express recognizes it by its four parameters.
function handleError(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ValidationError) {
    return res.status(400).json({ error: 'Validation failed', issues: err.issues });
  }

  // Errors from express.json(). `expose` marks messages that are safe to show clients.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.expose === true && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
