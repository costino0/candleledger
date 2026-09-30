import express from 'express';

// Builds and returns the Express app without starting it.
// Keeping this separate from index.js lets tests import the app directly.
export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Any /api route not matched above.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
