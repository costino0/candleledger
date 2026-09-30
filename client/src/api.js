// Calls to the CandleLedger API. Paths are relative, so in development the Vite
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
    throw new Error((await readError(response)).message);
  }

  try {
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('The server sent an invalid response.', { cause: error });
  }
}

// API errors are `{ "error": "..." }`, plus `issues` for a validation error. Anything else
// (for example the Vite proxy's reply when the Express server is down) gets a generic message
// with the status code.
async function readError(response) {
  try {
    const body = await response.json();
    if (typeof body?.error === 'string') {
      return {
        message: `${body.error} (HTTP ${response.status})`,
        issues: Array.isArray(body.issues) ? body.issues : undefined,
      };
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return { message: `Request failed (HTTP ${response.status})`, issues: undefined };
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

/**
 * POSTs a new trade. Resolves once the server has created it; the response body isn't
 * used, because the caller reloads the dashboard from the server anyway.
 *
 * Rejects with an Error with a readable message, like fetchJson. For a validation error the
 * Error also has `issues`: the server's `[{ path, message }]` list.
 *
 * There is no abort signal on purpose: cancelling a write the server may already have saved
 * would only hide the result.
 *
 * @param {object} payload  see docs/DATA_MODEL.md#input-validation
 */
export async function createTrade(payload) {
  let response;
  try {
    response = await fetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error('Could not reach the server.', { cause: error });
  }

  if (!response.ok) {
    const { message, issues } = await readError(response);
    const error = new Error(message);
    if (issues) error.issues = issues;
    throw error;
  }
}
