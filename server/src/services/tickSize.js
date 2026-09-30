// Tick-size checks for prices. Pure: no Express, no Prisma, no database.
// See docs/DATA_MODEL.md#instrument.
//
// Arithmetic is done with decimal.js on decimal strings, never JavaScript numbers:
// with numbers, 0.3 % 0.1 is 0.0999…, so a valid price would be rejected.
import Decimal from 'decimal.js';

// A private Decimal constructor, so global decimal.js settings cannot affect the check.
const Dec = Decimal.clone({ precision: 100 });

/**
 * @param {string} price     decimal string, such as "18000.25"
 * @param {string} tickSize  decimal string > 0, such as "0.25"
 * @returns {boolean} whether `price` is a whole number of ticks
 */
export function isMultipleOfTickSize(price, tickSize) {
  const tick = new Dec(tickSize);
  if (!tick.gt(0)) {
    throw new RangeError(`tickSize must be greater than 0, got ${tickSize}`);
  }
  return new Dec(price).mod(tick).isZero();
}
