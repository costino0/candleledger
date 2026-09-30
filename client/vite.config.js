import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Forward API calls to the Express server so the browser only talks to one origin.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    // Pin the time zone so date formatting tests give the same output on every machine.
    // Set here rather than in the npm script so it also works on Windows. The app itself
    // still formats dates in the browser's local time zone.
    env: { TZ: 'UTC' },
  },
});
