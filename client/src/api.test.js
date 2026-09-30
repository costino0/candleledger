import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrade, fetchJson, loadDashboard, updateTrade } from './api.js';

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

describe('createTrade', () => {
  const payload = { instrumentId: 2, direction: 'LONG', entryPrice: '18000.25' };

  it('POSTs the payload as JSON and resolves when the trade is created', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 7 }, 201));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createTrade(payload)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"instrumentId":2,"direction":"LONG","entryPrice":"18000.25"}',
    });
  });

  it('resolves even if the created response body is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('Created', { status: 201 }));

    await expect(createTrade(payload)).resolves.toBeUndefined();
  });

  it('rejects with the issues of a validation error', async () => {
    const issues = [{ path: ['entryPrice'], message: 'must be greater than 0' }];
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'Validation failed', issues }, 400));

    await expect(createTrade(payload)).rejects.toMatchObject({
      message: 'Validation failed (HTTP 400)',
      status: 400,
      serverError: 'Validation failed',
      issues,
    });
  });

  it('rejects without issues for a 400 that is not a validation error', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'Malformed JSON body' }, 400));

    const error = await createTrade(payload).catch((caught) => caught);
    expect(error.message).toBe('Malformed JSON body (HTTP 400)');
    expect(error.issues).toBeUndefined();
  });

  it("rejects with the server's message for a server error", async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'Internal server error' }, 500));

    await expect(createTrade(payload)).rejects.toThrow('Internal server error (HTTP 500)');
  });

  it('rejects with a generic message for an error response that is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('Bad Gateway', { status: 502 }));

    await expect(createTrade(payload)).rejects.toThrow('Request failed (HTTP 502)');
  });

  it('rejects with a readable message when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(createTrade(payload)).rejects.toThrow('Could not reach the server.');
  });
});

describe('updateTrade', () => {
  const payload = { instrumentId: 2, status: 'OPEN', fees: '0' };

  it('PUTs the payload as JSON to the trade and resolves when it is saved', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 7 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateTrade(7, payload)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/trades/7', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"instrumentId":2,"status":"OPEN","fees":"0"}',
    });
  });

  it('rejects with the issues of a validation error', async () => {
    const issues = [{ path: ['fees'], message: 'Invalid input: expected string' }];
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'Validation failed', issues }, 400));

    await expect(updateTrade(7, payload)).rejects.toMatchObject({
      message: 'Validation failed (HTTP 400)',
      issues,
    });
  });

  it('rejects with the status and server error of a missing trade', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'Trade not found' }, 404));

    await expect(updateTrade(7, payload)).rejects.toMatchObject({
      message: 'Trade not found (HTTP 404)',
      status: 404,
      serverError: 'Trade not found',
    });
  });

  it('rejects without a server error for an error response that is not JSON', async () => {
    vi.stubGlobal('fetch', async () => new Response('Bad Gateway', { status: 502 }));

    const error = await updateTrade(7, payload).catch((caught) => caught);
    expect(error.message).toBe('Request failed (HTTP 502)');
    expect(error.status).toBe(502);
    expect(error.serverError).toBeUndefined();
  });

  it('rejects with a readable message when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(updateTrade(7, payload)).rejects.toThrow('Could not reach the server.');
  });
});
