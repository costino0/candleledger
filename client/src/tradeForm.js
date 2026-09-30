// Pure helpers for the trade form: turning a trade into form values, turning what the user
// typed into the POST or PUT /api/trades payload, and sorting the server's validation issues
// by field.
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

// A `datetime-local` value: "2026-09-30T14:30", with optional seconds and fraction. Browsers
// differ in how they write the same time (jsdom, for one, turns "14:30:42" into
// "14:30:42.000"), so values are compared by their parts, never as strings.
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

// The [year, month, day, hour, minute, second, millisecond] of a `datetime-local` value, or
// null if it isn't one. Missing seconds and milliseconds are 0.
function parseLocalValue(localValue) {
  const match = LOCAL_DATE_TIME.exec(localValue);
  if (!match) return null;
  const [year, month, day, hour, minute, second, fraction] = match.slice(1);
  return [
    ...[year, month, day, hour, minute].map(Number),
    Number(second ?? 0),
    // ".5" is 500 ms.
    Number((fraction ?? '').padEnd(3, '0')),
  ];
}

// Whether two `datetime-local` values name the same wall-clock time.
function sameLocalValue(a, b) {
  const partsA = parseLocalValue(a);
  const partsB = parseLocalValue(b);
  return (
    partsA !== null && partsB !== null && partsA.every((part, index) => part === partsB[index])
  );
}

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
  const parts = parseLocalValue(localValue);
  if (parts === null) return null;

  const [year, month, day, hour, minute, second, millisecond] = parts;
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);

  const unchanged =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second;
  return unchanged ? date.toISOString() : null;
}

const pad = (value) => String(value).padStart(2, '0');

/** The `datetime-local` value for `now` in local time, to the minute: "2026-09-30T14:30". */
export function defaultEnteredAt(now = new Date()) {
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

/**
 * The `datetime-local` value for an API timestamp, in the browser's time zone:
 * "2026-09-30T14:30", or "2026-09-30T14:30:42" when the seconds aren't zero.
 *
 * Milliseconds are never shown. buildUpdatePayload recognizes an untouched timestamp by
 * comparing the input's value with this one.
 *
 * @param {string} isoValue  e.g. "2026-09-30T14:30:42.375Z"
 */
export function toLocalInputValue(isoValue) {
  const date = new Date(isoValue);
  const seconds = date.getSeconds();
  return defaultEnteredAt(date) + (seconds === 0 ? '' : `:${pad(seconds)}`);
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

/** The form values for editing an existing trade, as the API sent it. */
export function tradeToFormValues(trade) {
  return {
    instrumentId: String(trade.instrumentId),
    direction: trade.direction,
    status: trade.status,
    quantity: String(trade.quantity),
    entryPrice: trade.entryPrice,
    enteredAt: toLocalInputValue(trade.enteredAt),
    exitPrice: trade.exitPrice ?? '',
    exitedAt: trade.exitedAt === null ? '' : toLocalInputValue(trade.exitedAt),
    fees: trade.fees,
    notes: trade.notes ?? '',
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
  return buildPayload(values, () => null);
}

/**
 * Builds the PUT /api/trades/:id body from the form values. PUT replaces every client-owned
 * field, so this is the same body as for a new trade: blank fields are left out (the server
 * reports a missing `fees` instead of defaulting it, and a missing `notes` means null).
 *
 * A timestamp the user didn't change is sent back exactly as the API sent it. The input only
 * shows it to the second (or minute), so converting the shown value back would drop its
 * milliseconds, and a local time repeated when clocks fall back could turn into the other
 * instant, an hour away. An edited timestamp is converted by toApiTimestamp as usual, which
 * still rejects a local time that doesn't exist.
 *
 * @param {ReturnType<typeof tradeToFormValues>} values
 * @param {object} trade  the trade being edited, as the API sent it
 * @returns {{ payload: object, errors: Record<string, string[]> }}
 */
export function buildUpdatePayload(values, trade) {
  return buildPayload(values, (field, value) => {
    const original = trade[field];
    return original !== null && sameLocalValue(value, toLocalInputValue(original))
      ? original
      : null;
  });
}

// `unchangedTimestamp(field, value)` returns the timestamp to send as-is, or null to
// convert `value` from local time.
function buildPayload(values, unchangedTimestamp) {
  const payload = {};
  const errors = {};

  function addTimestamp(field) {
    const value = values[field];
    if (value === '') return;
    const timestamp = unchangedTimestamp(field, value) ?? toApiTimestamp(value);
    if (timestamp === null) {
      errors[field] = [TIME_ERROR];
    } else {
      payload[field] = timestamp;
    }
  }

  if (values.instrumentId !== '') payload.instrumentId = Number(values.instrumentId);
  if (values.direction !== '') payload.direction = values.direction;
  payload.status = values.status;

  // Digits only become a JSON integer. Anything else is sent as typed, so the server
  // rejects it with its own message.
  const quantity = values.quantity.trim();
  if (quantity !== '') payload.quantity = /^\d+$/.test(quantity) ? Number(quantity) : quantity;

  addTrimmed(payload, 'entryPrice', values.entryPrice);
  addTimestamp('enteredAt');

  if (values.status === 'CLOSED') {
    addTrimmed(payload, 'exitPrice', values.exitPrice);
    addTimestamp('exitedAt');
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
