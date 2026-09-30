// Turns a Trade row, as Prisma returns it, into the JSON the API sends.
// See docs/DATA_MODEL.md#responses-and-errors.

// Every Decimal column on Trade has scale 2 (see server/prisma/schema.prisma).
const DECIMAL_SCALE = 2;

/**
 * Builds the response body for one trade. Only the fields listed here are sent, so a
 * new column or an included relation never reaches clients by accident.
 *
 * @param {import('@prisma/client').Trade} trade
 */
export function serializeTrade(trade) {
  return {
    id: trade.id,
    instrumentId: trade.instrumentId,
    direction: trade.direction,
    status: trade.status,
    quantity: trade.quantity,
    entryPrice: decimalToString(trade.entryPrice),
    exitPrice: decimalToString(trade.exitPrice),
    enteredAt: dateToString(trade.enteredAt),
    exitedAt: dateToString(trade.exitedAt),
    fees: decimalToString(trade.fees),
    pointValueSnapshot: decimalToString(trade.pointValueSnapshot),
    pnlPoints: decimalToString(trade.pnlPoints),
    grossPnl: decimalToString(trade.grossPnl),
    netPnl: decimalToString(trade.netPnl),
    notes: trade.notes,
    createdAt: dateToString(trade.createdAt),
    updatedAt: dateToString(trade.updatedAt),
  };
}

// Prisma returns Decimal columns as decimal-like objects. `toFixed(2)` works on their
// decimal digits (never a JavaScript number) and, because the columns have scale 2, never
// rounds. A value with more places would mean the scale assumption is wrong, so it throws.
function decimalToString(value) {
  if (value === null) return null;
  if (value.decimalPlaces() > DECIMAL_SCALE) {
    throw new Error(`expected at most ${DECIMAL_SCALE} decimal places, got ${value.toFixed()}`);
  }
  return value.toFixed(DECIMAL_SCALE);
}

// Always UTC, e.g. "2026-09-30T14:30:00.000Z".
function dateToString(value) {
  return value === null ? null : value.toISOString();
}
