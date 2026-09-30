// Formatting helpers shared by the serializers. See docs/DATA_MODEL.md#responses-and-errors.

/**
 * Formats a Decimal column as a string with exactly `scale` decimal places.
 *
 * Prisma returns Decimal columns as decimal-like objects. `toFixed(scale)` works on their
 * decimal digits (never a JavaScript number) and, when `scale` is the column's scale, never
 * rounds. A value with more places would mean the scale assumption is wrong, so it throws.
 *
 * @param {import('@prisma/client').Prisma.Decimal | null} value
 * @param {number} scale  the column's scale, e.g. 2 for Decimal(12,2)
 */
export function decimalToString(value, scale) {
  if (value === null) return null;
  if (value.decimalPlaces() > scale) {
    throw new Error(`expected at most ${scale} decimal places, got ${value.toFixed()}`);
  }
  return value.toFixed(scale);
}

// Always UTC, e.g. "2026-09-30T14:30:00.000Z".
export function dateToString(value) {
  return value === null ? null : value.toISOString();
}
