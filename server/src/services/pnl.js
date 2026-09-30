// P&L for a CLOSED futures trade. Pure: no Express, no Prisma, no database.
// See docs/DATA_MODEL.md#pl-calculation.
//
// All decimal inputs are strings and all outputs are strings with exactly two decimal
// places. Arithmetic is done with decimal.js, never JavaScript numbers. Callers holding
// Prisma Decimal values convert them with `.toString()` before calling.
import Decimal from 'decimal.js';

// A private Decimal constructor, so global decimal.js settings cannot affect P&L.
// The precision is far above anything a trade can need, so no intermediate result is
// ever rounded; results that don't fit two decimal places are rejected below instead.
const Dec = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_UP });

const DIRECTIONS = ['LONG', 'SHORT'];
const MAX_DECIMAL_PLACES = 2;

// Plain decimal notation only: optional minus, digits, optional fraction.
// Rejects '', whitespace, exponents, 'Infinity' and 'NaN'.
const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

/**
 * @param {object} trade
 * @param {'LONG' | 'SHORT'} trade.direction
 * @param {string} trade.entryPrice          decimal string, at most 2 decimal places
 * @param {string} trade.exitPrice           decimal string, at most 2 decimal places
 * @param {string} trade.pointValueSnapshot  decimal string > 0, at most 2 decimal places
 * @param {number} trade.quantity            positive safe integer
 * @param {string} trade.fees                decimal string >= 0, at most 2 decimal places
 * @returns {{ pnlPoints: string, grossPnl: string, netPnl: string }}
 */
export function calculateClosedTradePnl({
  direction,
  entryPrice,
  exitPrice,
  pointValueSnapshot,
  quantity,
  fees,
}) {
  if (!DIRECTIONS.includes(direction)) {
    throw new TypeError(`direction must be LONG or SHORT, got ${String(direction)}`);
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new TypeError(`quantity must be a positive safe integer, got ${String(quantity)}`);
  }

  const entry = parseDecimal('entryPrice', entryPrice);
  const exit = parseDecimal('exitPrice', exitPrice);
  const pointValue = parseDecimal('pointValueSnapshot', pointValueSnapshot);
  const feesTotal = parseDecimal('fees', fees);

  if (pointValue.lte(0)) {
    throw new RangeError(`pointValueSnapshot must be greater than 0, got ${pointValueSnapshot}`);
  }
  if (feesTotal.lt(0)) {
    throw new RangeError(`fees must be 0 or greater, got ${fees}`);
  }

  // Subtract in the profitable order instead of multiplying by -1, so a break-even
  // SHORT is +0, not -0.
  const pnlPoints = direction === 'LONG' ? exit.minus(entry) : entry.minus(exit);
  const grossPnl = pnlPoints.times(pointValue).times(quantity);
  const netPnl = grossPnl.minus(feesTotal);

  return {
    pnlPoints: toMoneyString('pnlPoints', pnlPoints),
    grossPnl: toMoneyString('grossPnl', grossPnl),
    netPnl: toMoneyString('netPnl', netPnl),
  };
}

function parseDecimal(name, value) {
  if (typeof value !== 'string' || !DECIMAL_STRING.test(value)) {
    throw new TypeError(
      `${name} must be a decimal string such as "18000.25", got ${String(value)}`,
    );
  }
  const decimal = new Dec(value);
  if (decimal.decimalPlaces() > MAX_DECIMAL_PLACES) {
    throw new RangeError(`${name} must have at most 2 decimal places, got ${value}`);
  }
  return decimal;
}

// Formats a result with exactly two decimal places. Throws instead of rounding when the
// exact value has more, so a stored P&L is never silently different from the formula.
function toMoneyString(name, value) {
  if (value.decimalPlaces() > MAX_DECIMAL_PLACES) {
    throw new RangeError(
      `${name} ${value.toFixed()} cannot be represented exactly with 2 decimal places`,
    );
  }
  // decimal.js keeps the sign of zero ("-0.00"); P&L never needs it.
  return value.isZero() ? '0.00' : value.toFixed(MAX_DECIMAL_PLACES);
}
