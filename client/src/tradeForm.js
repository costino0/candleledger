// Pure helpers for the Add Trade form: turning what the user typed into the POST /api/trades
// payload, and sorting the server's validation issues by field.
//
// The server is the only validator of trade rules (see docs/DATA_MODEL.md#input-validation).
// The one check made here is converting local times to UTC instants, because the server
// can't know which time zone the user meant.

// The form fields that can show a server issue next to them, in display order.
export const TRADE_FIELDS = [
  'instrumentId',
  'direction',
  'status',
  'quantity',
  'entryPrice',
  'enteredAt',
  'exitPrice',
  'exitedAt',
  'fees',
  'notes',
];

// A `datetime-local` value: "2026-09-30T14:30", with optional seconds.
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Converts a `datetime-local` value, a wall-clock time in the browser's time zone, to a UTC
 * ISO string such as "2026-09-30T18:30:00.000Z".
 *
 * Returns null when that local time doesn't exist, instead of silently saving another time.
 * `new Date(y, m, d, ...)` moves a time that falls in a spring-forward DST gap (for example
 * 02:30 on the day clocks jump from 02:00 to 03:00) to a real time, and rolls impossible
 * dates such as Feb 30 into the next month. Reading the local parts back catches both.
 *
 * Limitation: a time repeated when clocks fall back (for example 01:30 twice) is ambiguous.
 * JavaScript picks one of the two instants and this helper accepts that choice. The saved
 * trade shows its instant back in local time, so the user can check it.
 *
 * @param {string} localValue
 * @returns {string | null}
 */
export function toApiTimestamp(localValue) {
  const match = LOCAL_DATE_TIME.exec(localValue);
  if (!match) return null;

  // Seconds are optional: a missing group is undefined, which Number() would make NaN.
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const date = new Date(year, month - 1, day, hour, minute, second);

  const unchanged =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second;
  return unchanged ? date.toISOString() : null;
}

/** The `datetime-local` value for `now` in local time, to the minute: "2026-09-30T14:30". */
export function defaultEnteredAt(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

/** The starting values of the form. Every value is a string, as the inputs hold them. */
export function initialTradeValues(now = new Date()) {
  return {
    instrumentId: '',
    direction: '',
    status: 'OPEN',
    quantity: '1',
    entryPrice: '',
    enteredAt: defaultEnteredAt(now),
    exitPrice: '',
    exitedAt: '',
    fees: '0',
    notes: '',
  };
}

const TIME_ERROR = 'is not a valid time in your time zone';

/**
 * Builds the POST /api/trades body from the form values.
 *
 * Only client-owned fields are ever added, one by one, so server-owned fields such as
 * `pointValueSnapshot` or the P&L can't be sent. Prices and fees stay strings. A blank
 * field is left out, so the server reports it as missing (or, for fees, applies its "0"
 * default). Exit fields are sent only for a CLOSED trade.
 *
 * `errors` holds local times that don't exist (see toApiTimestamp). When it's not empty,
 * the form shows them and doesn't submit.
 *
 * @param {ReturnType<typeof initialTradeValues>} values
 * @returns {{ payload: object, errors: Record<string, string[]> }}
 */
export function buildCreatePayload(values) {
  const payload = {};
  const errors = {};

  if (values.instrumentId !== '') payload.instrumentId = Number(values.instrumentId);
  if (values.direction !== '') payload.direction = values.direction;
  payload.status = values.status;

  // Digits only become a JSON integer. Anything else is sent as typed, so the server
  // rejects it with its own message.
  const quantity = values.quantity.trim();
  if (quantity !== '') payload.quantity = /^\d+$/.test(quantity) ? Number(quantity) : quantity;

  addTrimmed(payload, 'entryPrice', values.entryPrice);
  addTimestamp(payload, errors, 'enteredAt', values.enteredAt);

  if (values.status === 'CLOSED') {
    addTrimmed(payload, 'exitPrice', values.exitPrice);
    addTimestamp(payload, errors, 'exitedAt', values.exitedAt);
  }

  addTrimmed(payload, 'fees', values.fees);

  // Notes are journal text: sent exactly as written, unless there is nothing in them.
  if (values.notes.trim() !== '') payload.notes = values.notes;

  return { payload, errors };
}

function addTrimmed(payload, field, value) {
  const trimmed = value.trim();
  if (trimmed !== '') payload[field] = trimmed;
}

function addTimestamp(payload, errors, field, value) {
  if (value === '') return;
  const timestamp = toApiTimestamp(value);
  if (timestamp === null) {
    errors[field] = [TIME_ERROR];
  } else {
    payload[field] = timestamp;
  }
}

/**
 * Sorts validation issues from the server into those shown next to a form field and those
 * shown for the form as a whole (for example `path: []`, or an unknown field).
 *
 * @param {{ path: (string | number)[], message: string }[]} issues
 * @param {string[]} visibleFields  the fields currently on screen
 * @returns {{ fieldErrors: Record<string, string[]>, generalErrors: string[] }}
 */
export function splitIssues(issues, visibleFields) {
  const fieldErrors = {};
  const generalErrors = [];

  for (const issue of issues) {
    const field = issue.path[0];
    if (issue.path.length > 0 && visibleFields.includes(field)) {
      (fieldErrors[field] ??= []).push(issue.message);
    } else {
      const where = issue.path.length > 0 ? `${issue.path.join('.')} ` : '';
      generalErrors.push(where + issue.message);
    }
  }

  return { fieldErrors, generalErrors };
}
