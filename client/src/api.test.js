import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, loadDashboard } from './api.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('returns the parsed body, keeping decimal strings as strings', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ totalNetPnl: '113.04' }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;

    await expect(fetchJson('/api/stats', signal)).resolves.toEqual({ totalNetPnl: '113.04' });
    expect(fetchMock).toHaveBeenCalledWith('/api/stats', { signal });
  });

  it("throws the server's error message for a JSON error response", async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'Internal server error' }, 500));

    await expect(fetchJson('/api/stats')).rejects.toThrow('Internal server error (HTTP 500)');
  });

  it('throws a generic message for an error response that is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('Bad Gateway', { status: 502 }));

    await expect(fetchJson('/api/stats')).rejects.toThrow('Request failed (HTTP 502)');
  });

  it('throws when a successful response is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('<!doctype html>', { status: 200 }));

    await expect(fetchJson('/api/stats')).rejects.toThrow('The server sent an invalid response.');
  });

  it('throws a readable message when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(fetchJson('/api/stats')).rejects.toThrow('Could not reach the server.');
  });

  it('rethrows the AbortError unchanged when the request is aborted', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', async () => {
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    await expect(fetchJson('/api/stats', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('loadDashboard', () => {
  it('requests instruments, trades and stats in parallel', async () => {
    const pending = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (path) =>
          new Promise((resolve) => {
            pending.push(() => resolve(jsonResponse({ path })));
          }),
      ),
    );

    const result = loadDashboard();

    // All three requests start before any of them has answered.
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/instruments',
      '/api/trades',
      '/api/stats',
    ]);

    pending.forEach((resolve) => resolve());
    await expect(result).resolves.toEqual({
      instruments: { path: '/api/instruments' },
      trades: { path: '/api/trades' },
      stats: { path: '/api/stats' },
    });
  });

  it('rejects if any request fails', async () => {
    vi.stubGlobal('fetch', async (path) =>
      path === '/api/trades'
        ? jsonResponse({ error: 'Internal server error' }, 500)
        : jsonResponse([]),
    );

    await expect(loadDashboard()).rejects.toThrow('Internal server error (HTTP 500)');
  });
});
