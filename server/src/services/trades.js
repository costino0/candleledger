// Trade creation domain logic. No Express: routes will call this later.
// See docs/DATA_MODEL.md for the rules enforced here.
import Decimal from 'decimal.js';
import { ValidationError } from '../errors.js';
import { createTradeSchema } from '../schemas/trade.js';
import { calculateClosedTradePnl } from './pnl.js';
import { isMultipleOfTickSize } from './tickSize.js';

// A private Decimal constructor for the column range checks below.
const Dec = Decimal.clone({ precision: 100 });

// Exclusive upper bounds on the absolute value each P&L column can store:
// Decimal(12,2) holds 10 integer digits and Decimal(14,2) holds 12.
const PNL_COLUMN_LIMITS = {
  pnlPoints: new Dec('1e10'),
  grossPnl: new Dec('1e12'),
  netPnl: new Dec('1e12'),
};

/**
 * Validates a client payload and creates an OPEN or CLOSED trade.
 *
 * The server-owned fields (`pointValueSnapshot` and the P&L fields) are always set here,
 * never taken from `input`.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {unknown} input  untrusted payload, see docs/DATA_MODEL.md#input-validation
 * @returns {Promise<import('@prisma/client').Trade>} the created row, as Prisma returns it
 * @throws {ValidationError} when the payload, instrument, prices or P&L break a rule
 */
export async function createTrade(prisma, input) {
  const parsed = createTradeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(toIssues(parsed.error));
  }
  const trade = parsed.data;

  const instrument = await prisma.instrument.findUnique({
    where: { id: trade.instrumentId },
    select: { pointValue: true, tickSize: true },
  });
  if (!instrument) {
    throw new ValidationError([
      { path: ['instrumentId'], message: `instrument ${trade.instrumentId} does not exist` },
    ]);
  }

  const pointValueSnapshot = toDecimalString(instrument.pointValue);
  const tickSize = toDecimalString(instrument.tickSize);

  const tickIssues = ['entryPrice', 'exitPrice']
    .filter((field) => trade[field] != null && !isMultipleOfTickSize(trade[field], tickSize))
    .map((field) => ({
      path: [field],
      message: `must be a multiple of the instrument's tick size (${tickSize})`,
    }));
  if (tickIssues.length > 0) {
    throw new ValidationError(tickIssues);
  }

  // Built field by field, never by spreading the input, so only these columns are written.
  const data = {
    instrumentId: trade.instrumentId,
    direction: trade.direction,
    status: trade.status,
    quantity: trade.quantity,
    entryPrice: trade.entryPrice,
    exitPrice: null,
    enteredAt: trade.enteredAt,
    exitedAt: null,
    fees: trade.fees,
    pointValueSnapshot,
    pnlPoints: null,
    grossPnl: null,
    netPnl: null,
    notes: trade.notes ?? null,
  };

  if (trade.status === 'CLOSED') {
    // The same snapshot string is stored and used for P&L, so the two always agree.
    const pnl = calculateClosedTradePnl({
      direction: trade.direction,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pointValueSnapshot,
      quantity: trade.quantity,
      fees: trade.fees,
    });

    const overflowIssues = Object.entries(PNL_COLUMN_LIMITS)
      .filter(([field, limit]) => new Dec(pnl[field]).abs().gte(limit))
      .map(([field]) => ({ path: [], message: `${field} ${pnl[field]} is too large to store` }));
    if (overflowIssues.length > 0) {
      throw new ValidationError(overflowIssues);
    }

    Object.assign(data, {
      exitPrice: trade.exitPrice,
      exitedAt: trade.exitedAt,
      pnlPoints: pnl.pnlPoints,
      grossPnl: pnl.grossPnl,
      netPnl: pnl.netPnl,
    });
  }

  return prisma.trade.create({ data });
}

// Prisma returns Decimal columns as decimal-like objects. `toFixed()` with no argument
// gives plain decimal notation (never an exponent, which pnl.js rejects) without rounding.
function toDecimalString(value) {
  return value.toFixed();
}

// Flattens Zod issues to { path, message }. An unrecognized-keys issue becomes one issue
// per key, so each unexpected field is reported at its own path.
function toIssues(zodError) {
  return zodError.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({ path: [...issue.path, key], message: 'is not a known field' }))
      : [{ path: issue.path, message: issue.message }],
  );
}
