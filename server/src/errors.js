// Errors the server's domain services throw. app.js maps each one to an HTTP response.

// The input was rejected. `issues` says which fields were wrong and why, so a caller
// (for example a future route handler) can report them back field by field.
export class ValidationError extends Error {
  /** @param {{ path: (string | number)[], message: string }[]} issues */
  constructor(issues) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

// The requested record does not exist. Only construct this in server code with a fixed,
// client-safe message (it is sent as-is); never wrap a database error's message in it.
export class NotFoundError extends Error {
  /** @param {string} message  e.g. "Trade not found" */
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}
