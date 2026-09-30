// Trade stats for GET /api/stats. No Express: routes/stats.js calls these.
// See docs/DATA_MODEL.md#stats-get-apistats for the rules enforced here.
import Decimal from 'decimal.js';

// A private Decimal constructor, so global decimal.js settings cannot affect stats.
// Sums of 2-place values are exact at this precision. Quotients are carried far past
// 2 places and rounded only once, when they are formatted.
const Dec = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_UP });

const MONEY_DECIMAL_PLACES = 2;

/**
 * Reads every trade once and returns the stats as the JSON response body.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<ReturnType<typeof calculateStats>>}
 * @throws {Error} when a CLOSED trade is missing a value stats need (a broken invariant)
 */
export async function getStats(prisma) {
  // One read of every trade, OPEN included, so every count and total comes from the same
  // snapshot of the table.
  const rows = await prisma.trade.findMany({
    select: { status: true, grossPnl: true, netPnl: true, fees: true },
  });
  return calculateStats(rows);
}

/**
 * Calculates the stats from trade rows. Pure: no Prisma, no database.
 *
 * Money totals and outcomes use CLOSED trades only and their stored `grossPnl`, `netPnl`
 * and `fees`; nothing is recalculated. OPEN trades only add to `openTrades`.
 *
 * @param {{ status: 'OPEN' | 'CLOSED', grossPnl: object | null, netPnl: object | null,
 *   fees: object | null }[]} rows  Decimal columns as Prisma's decimal-like values
 * @returns {{
 *   totalNetPnl: string, totalGrossPnl: string, totalFees: string,
 *   closedTrades: number, openTrades: number,
 *   wins: number, losses: number, breakEvens: number,
 *   winRate: string | null, averageWin: string | null, averageLoss: string | null,
 * }}
 * @throws {Error} when a CLOSED row has a null `grossPnl`, `netPnl` or `fees`, or a row
 *   has an unknown status
 */
export function calculateStats(rows) {
  let openTrades = 0;
  let closedTrades = 0;
  let wins = 0;
  let losses = 0;
  let breakEvens = 0;
  let totalGrossPnl = new Dec(0);
  let totalNetPnl = new Dec(0);
  let totalFees = new Dec(0);
  let winningNetPnl = new Dec(0);
  let losingNetPnl = new Dec(0);

  for (const row of rows) {
    if (row.status === 'OPEN') {
      openTrades += 1;
      continue;
    }
    if (row.status !== 'CLOSED') {
      throw new Error(`stats: unexpected trade status ${String(row.status)}`);
    }

    const grossPnl = toDec('grossPnl', row.grossPnl);
    const netPnl = toDec('netPnl', row.netPnl);
    const fees = toDec('fees', row.fees);

    closedTrades += 1;
    totalGrossPnl = totalGrossPnl.plus(grossPnl);
    totalNetPnl = totalNetPnl.plus(netPnl);
    totalFees = totalFees.plus(fees);

    if (netPnl.gt(0)) {
      wins += 1;
      winningNetPnl = winningNetPnl.plus(netPnl);
    } else if (netPnl.lt(0)) {
      losses += 1;
      losingNetPnl = losingNetPnl.plus(netPnl);
    } else {
      breakEvens += 1;
    }
  }

  return {
    totalNetPnl: formatExact('totalNetPnl', totalNetPnl),
    totalGrossPnl: formatExact('totalGrossPnl', totalGrossPnl),
    totalFees: formatExact('totalFees', totalFees),
    closedTrades,
    openTrades,
    wins,
    losses,
    breakEvens,
    // Break-evens count in the denominator: win rate is wins ÷ CLOSED trades.
    winRate: closedTrades === 0 ? null : formatRounded(new Dec(wins).times(100).div(closedTrades)),
    // Each average sums exactly first, then rounds only the final quotient.
    averageWin: wins === 0 ? null : formatRounded(winningNetPnl.div(wins)),
    averageLoss: losses === 0 ? null : formatRounded(losingNetPnl.div(losses)),
  };
}

// Converts a Prisma Decimal column to this module's Decimal through its plain decimal
// string, never a JavaScript number. A CLOSED trade always has these values, so a null
// means the stored data breaks an invariant: fail loudly instead of skipping it.
function toDec(field, value) {
  if (value === null || value === undefined) {
    throw new Error(`stats: CLOSED trade has no ${field}`);
  }
  return new Dec(value.toFixed());
}

// Totals are exact sums of 2-place values, so they are never rounded. More places would
// mean the input was not what the columns store, so it throws instead.
function formatExact(name, value) {
  if (value.decimalPlaces() > MONEY_DECIMAL_PLACES) {
    throw new Error(`stats: ${name} ${value.toFixed()} has more than 2 decimal places`);
  }
  return toFixedString(value);
}

// Win rate and averages are quotients, which often have no exact 2-place value, so they
// are rounded half up (away from zero) to exactly 2 places, once, here.
function formatRounded(value) {
  return toFixedString(value.toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP));
}

// decimal.js keeps the sign of zero ("-0.00"); stats never need it.
function toFixedString(value) {
  return value.isZero() ? '0.00' : value.toFixed(MONEY_DECIMAL_PLACES);
}
