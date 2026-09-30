// Turns a Trade row, as Prisma returns it, into the JSON the API sends.
// See docs/DATA_MODEL.md#responses-and-errors.
import { dateToString, decimalToString } from './format.js';

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
    entryPrice: decimalToString(trade.entryPrice, DECIMAL_SCALE),
    exitPrice: decimalToString(trade.exitPrice, DECIMAL_SCALE),
    enteredAt: dateToString(trade.enteredAt),
    exitedAt: dateToString(trade.exitedAt),
    fees: decimalToString(trade.fees, DECIMAL_SCALE),
    pointValueSnapshot: decimalToString(trade.pointValueSnapshot, DECIMAL_SCALE),
    pnlPoints: decimalToString(trade.pnlPoints, DECIMAL_SCALE),
    grossPnl: decimalToString(trade.grossPnl, DECIMAL_SCALE),
    netPnl: decimalToString(trade.netPnl, DECIMAL_SCALE),
    notes: trade.notes,
    createdAt: dateToString(trade.createdAt),
    updatedAt: dateToString(trade.updatedAt),
  };
}
