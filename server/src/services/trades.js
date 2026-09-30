// Trade domain logic. No Express: routes/trades.js calls these.
// See docs/DATA_MODEL.md for the rules enforced here.
import Decimal from 'decimal.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { createTradeSchema, tradeIdSchema, updateTradeSchema } from '../schemas/trade.js';
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
  const trade = parseTradeInput(createTradeSchema, input);
  const instrument = await findInstrument(prisma, trade.instrumentId);

  const data = buildTradeData(trade, {
    pointValueSnapshot: toDecimalString(instrument.pointValue),
    tickSize: toDecimalString(instrument.tickSize),
  });

  return prisma.trade.create({ data });
}

/**
 * Replaces every client-owned field of an existing trade (PUT is a full replacement).
 *
 * The snapshot is kept while the instrument stays the same and re-taken from the selected
 * instrument when it changes. Prices are always checked against the selected instrument's
 * tick size, and a CLOSED result always has its P&L recalculated. Snapshot and P&L are
 * saved in the same single update.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {unknown} rawId  untrusted id, e.g. the `:id` route param string
 * @param {unknown} input  untrusted payload, see docs/DATA_MODEL.md#input-validation
 * @returns {Promise<import('@prisma/client').Trade>} the updated row, as Prisma returns it
 * @throws {ValidationError} when the id, payload, instrument, prices or P&L break a rule
 * @throws {NotFoundError} when no trade has that id, including when it is deleted before
 *   the update runs
 */
export async function updateTrade(prisma, rawId, input) {
  const id = parseTradeId(rawId);

  // The target is checked before the body: a missing trade is a 404 whatever was sent.
  const existing = await prisma.trade.findUnique({
    where: { id },
    select: { instrumentId: true, pointValueSnapshot: true },
  });
  if (!existing) {
    throw new NotFoundError('Trade not found');
  }

  const trade = parseTradeInput(updateTradeSchema, input);
  const instrument = await findInstrument(prisma, trade.instrumentId);

  // The snapshot changes only when the trade's own instrument changes, so a later edit
  // to the Instrument table never alters an existing trade. See docs/DATA_MODEL.md.
  const snapshotSource =
    trade.instrumentId === existing.instrumentId
      ? existing.pointValueSnapshot
      : instrument.pointValue;

  const data = buildTradeData(trade, {
    pointValueSnapshot: toDecimalString(snapshotSource),
    tickSize: toDecimalString(instrument.tickSize),
  });

  try {
    return await prisma.trade.update({ where: { id }, data });
  } catch (error) {
    // The trade was deleted after the lookup above. Only this one condition becomes a 404;
    // any other database error propagates (and becomes a 500).
    if (isRecordNotFoundError(error)) {
      throw new NotFoundError('Trade not found');
    }
    throw error;
  }
}

/**
 * Lists every trade, newest first. Trades entered at the same instant are ordered by id,
 * newest first, so the order is always the same.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<import('@prisma/client').Trade[]>} the rows, as Prisma returns them
 */
export function listTrades(prisma) {
  return prisma.trade.findMany({ orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }] });
}

/**
 * Finds one trade by the id from the URL.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {unknown} rawId  untrusted id, e.g. the `:id` route param string
 * @returns {Promise<import('@prisma/client').Trade>} the row, as Prisma returns it
 * @throws {ValidationError} when the id is not a positive integer in the column's range
 * @throws {NotFoundError} when no trade has that id
 */
export async function getTrade(prisma, rawId) {
  const trade = await prisma.trade.findUnique({ where: { id: parseTradeId(rawId) } });
  if (!trade) {
    throw new NotFoundError('Trade not found');
  }
  return trade;
}

/**
 * Deletes one trade by the id from the URL.
 *
 * There is no lookup first: the delete itself reports a missing row.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {unknown} rawId  untrusted id, e.g. the `:id` route param string
 * @returns {Promise<void>}
 * @throws {ValidationError} when the id is not a positive integer in the column's range
 * @throws {NotFoundError} when no trade has that id
 */
export async function deleteTrade(prisma, rawId) {
  const id = parseTradeId(rawId);

  try {
    await prisma.trade.delete({ where: { id } });
  } catch (error) {
    // Only a missing row becomes a 404; any other database error propagates (and becomes
    // a 500).
    if (isRecordNotFoundError(error)) {
      throw new NotFoundError('Trade not found');
    }
    throw error;
  }
}

// Validates the `:id` route param and returns it as a number.
function parseTradeId(rawId) {
  const parsed = tradeIdSchema.safeParse(rawId);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: ['id'], message: issue.message })),
    );
  }
  return parsed.data;
}

// Validates a trade payload with the given schema and returns the parsed trade.
function parseTradeInput(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(toIssues(parsed.error));
  }
  return parsed.data;
}

// Returns the selected instrument's point value and tick size, or rejects the payload.
async function findInstrument(prisma, instrumentId) {
  const instrument = await prisma.instrument.findUnique({
    where: { id: instrumentId },
    select: { pointValue: true, tickSize: true },
  });
  if (!instrument) {
    throw new ValidationError([
      { path: ['instrumentId'], message: `instrument ${instrumentId} does not exist` },
    ]);
  }
  return instrument;
}

/**
 * Builds every writable Trade column from a parsed payload. Checks prices against the tick
 * size and, for a CLOSED trade, calculates P&L from `pointValueSnapshot` and checks that it
 * fits its columns. An OPEN trade always gets null exit and P&L fields.
 *
 * @param {object} trade  a payload parsed by createTradeSchema or updateTradeSchema
 * @param {{ pointValueSnapshot: string, tickSize: string }} instrumentValues
 * @throws {ValidationError} when a price or the P&L breaks a rule
 */
function buildTradeData(trade, { pointValueSnapshot, tickSize }) {
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

  return data;
}

// Prisma's error when an update's or delete's target row does not exist (code P2025).
// Matched by name and code, not `instanceof`, so this module does not import the
// generated client.
function isRecordNotFoundError(error) {
  return error?.name === 'PrismaClientKnownRequestError' && error.code === 'P2025';
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
