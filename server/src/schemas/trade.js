// Zod schemas for trade input: the payloads that create and replace a trade, and the `:id`
// route param. See docs/DATA_MODEL.md#input-validation.
//
// Prices and fees stay strings (they are never converted to JavaScript numbers), and
// timestamps become Date objects. Checks that need the database, such as whether the
// instrument exists and whether prices fit its tick size, live in services/trades.js.
import { z } from 'zod';

// Fields only the server sets. The data model says a client that sends them is ignored,
// so they are dropped before validation. Any other unexpected field is an error.
export const SERVER_OWNED_FIELDS = [
  'id',
  'pointValueSnapshot',
  'pnlPoints',
  'grossPnl',
  'netPnl',
  'createdAt',
  'updatedAt',
];

// Largest value of a Postgres `integer` (int4) column.
const INT4_MAX = 2147483647;
const NOTES_MAX_LENGTH = 10_000;

// Plain decimal notation, no sign, at most 2 decimal places. The integer digit limits
// match the columns: Decimal(12,2) for prices and Decimal(10,2) for fees.
const PRICE = /^\d{1,10}(\.\d{1,2})?$/;
const FEES = /^\d{1,8}(\.\d{1,2})?$/;

const price = z
  .string({ error: 'must be a decimal string such as "18000.25"' })
  .regex(PRICE, 'must be a positive price with at most 2 decimal places')
  // The regex allows only digits and one dot, so any non-zero digit means > 0.
  .refine((value) => /[1-9]/.test(value), 'must be greater than 0');

const fees = z
  .string({ error: 'must be a decimal string such as "2.48"' })
  .regex(FEES, 'must be 0 or greater with at most 2 decimal places');

// Requires `Z` or an explicit offset such as `+02:00`, so the instant is unambiguous.
const timestamp = z.iso
  .datetime({ offset: true, error: 'must be an ISO 8601 date-time with Z or a UTC offset' })
  .transform((value) => new Date(value));

function omitServerOwnedFields(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const rest = { ...input };
  for (const field of SERVER_OWNED_FIELDS) delete rest[field];
  return rest;
}

// The rules for each client-owned field. Create and replace share these; they differ only in
// which fields have defaults (see the two schemas below).
const tradeFieldRules = {
  instrumentId: z.int().min(1).max(INT4_MAX),
  direction: z.enum(['LONG', 'SHORT']),
  status: z.enum(['OPEN', 'CLOSED']),
  quantity: z.int().min(1).max(INT4_MAX),
  entryPrice: price,
  exitPrice: price.nullish(),
  enteredAt: timestamp,
  exitedAt: timestamp.nullish(),
  fees,
  notes: z.string().max(NOTES_MAX_LENGTH).nullish(),
};

// The rules between fields, which depend on the status. Zod 4 also runs this when other
// fields already failed, so it only relies on values that passed: a valid status, and Date
// objects (not raw strings) for the time check.
function checkStatusRules(trade, ctx) {
  if (trade.status === 'OPEN') {
    for (const field of ['exitPrice', 'exitedAt']) {
      if (trade[field] != null) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'must be empty while the trade is OPEN',
        });
      }
    }
    return;
  }
  if (trade.status !== 'CLOSED') return;

  for (const field of ['exitPrice', 'exitedAt']) {
    if (trade[field] == null) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'is required for a CLOSED trade' });
    }
  }
  if (
    trade.exitedAt instanceof Date &&
    trade.enteredAt instanceof Date &&
    trade.exitedAt < trade.enteredAt
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['exitedAt'],
      message: 'must be at or after enteredAt',
    });
  }
}

// POST: `status` defaults to OPEN and `fees` to "0".
export const createTradeSchema = z.preprocess(
  omitServerOwnedFields,
  z
    .strictObject({
      ...tradeFieldRules,
      status: tradeFieldRules.status.default('OPEN'),
      fees: tradeFieldRules.fees.default('0'),
    })
    .superRefine(checkStatusRules),
);

// PUT replaces every client-owned field, so nothing has a default: a forgotten `status`
// must not silently reopen a CLOSED trade, nor a forgotten `fees` reset fees to 0. Omitted
// nullable fields (`exitPrice`, `exitedAt`, `notes`) mean null.
export const updateTradeSchema = z.preprocess(
  omitServerOwnedFields,
  z.strictObject(tradeFieldRules).superRefine(checkStatusRules),
);

// A trade id from a URL path segment: canonical decimal digits only (no sign, leading zero,
// decimal point, exponent or whitespace), 1 to INT4_MAX. The regex caps the length before
// Number(), so the conversion is exact.
const TRADE_ID = /^[1-9]\d{0,9}$/;
const TRADE_ID_MESSAGE = `must be a positive integer no greater than ${INT4_MAX}`;

export const tradeIdSchema = z
  .string({ error: TRADE_ID_MESSAGE })
  .regex(TRADE_ID, TRADE_ID_MESSAGE)
  .transform(Number)
  .refine((id) => id <= INT4_MAX, TRADE_ID_MESSAGE);
