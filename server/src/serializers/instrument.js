// Turns an Instrument row, as Prisma returns it, into the JSON the API sends.
// See docs/DATA_MODEL.md#responses-and-errors.
import { decimalToString } from './format.js';

// The scales of the Instrument Decimal columns (see server/prisma/schema.prisma).
const POINT_VALUE_SCALE = 2;
const TICK_SIZE_SCALE = 4;

/**
 * Builds the response body for one instrument. Only the fields listed here are sent, so a
 * new column or an included relation never reaches clients by accident.
 *
 * @param {import('@prisma/client').Instrument} instrument
 */
export function serializeInstrument(instrument) {
  return {
    id: instrument.id,
    symbol: instrument.symbol,
    name: instrument.name,
    pointValue: decimalToString(instrument.pointValue, POINT_VALUE_SCALE),
    tickSize: decimalToString(instrument.tickSize, TICK_SIZE_SCALE),
  };
}
