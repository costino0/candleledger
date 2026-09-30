// Load variables from server/.env (if present) before anything reads process.env.
import 'dotenv/config';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3001;

createApp().listen(port, () => {
  console.log(`CandleLedger API listening on http://localhost:${port}`);
});
