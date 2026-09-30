// Errors the server's domain services throw for problems with client input.

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
