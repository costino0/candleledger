// Read-only calls to the CandleLedger API. Paths are relative, so in development the Vite
// proxy forwards them to the Express server. Response bodies are returned as the server sent
// them: Decimal values stay strings (see docs/DATA_MODEL.md#responses-and-errors).

/**
 * GETs `path` and returns the parsed JSON body.
 *
 * Throws an Error with a readable message when the server can't be reached, answers with a
 * non-2xx status, or sends a body that isn't JSON. If `signal` is aborted, the original
 * AbortError is rethrown unchanged so callers can tell a cancelled request from a failure.
 *
 * @param {string} path
 * @param {AbortSignal} [signal]
 */
export async function fetchJson(path, signal) {
  let response;
  try {
    response = await fetch(path, { signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Could not reach the server.', { cause: error });
  }

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  try {
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('The server sent an invalid response.', { cause: error });
  }
}

// API errors are `{ "error": "..." }`. Anything else (for example the Vite proxy's reply
// when the Express server is down) gets a generic message with the status code.
async function errorMessage(response) {
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') {
      return `${body.error} (HTTP ${response.status})`;
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return `Request failed (HTTP ${response.status})`;
}

/**
 * Loads everything the dashboard shows, with the three requests in parallel.
 * Rejects if any of them fails.
 *
 * @param {AbortSignal} [signal]
 */
export async function loadDashboard(signal) {
  const [instruments, trades, stats] = await Promise.all([
    fetchJson('/api/instruments', signal),
    fetchJson('/api/trades', signal),
    fetchJson('/api/stats', signal),
  ]);
  return { instruments, trades, stats };
}
