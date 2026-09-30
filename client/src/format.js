// Display formatting for API values.
//
// Decimal values arrive from the server as strings with a fixed number of decimal places
// ("18000.25", "-25.50"). These helpers only rearrange those characters (sign, "$",
// thousands separators); they never convert them to JavaScript numbers, so every digit the
// server sent is shown exactly. All financial arithmetic happens on the server.

// Shown for values the server sends as null (open trades, stats with nothing to average).
export const EMPTY = '—';

const dateTimeFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

// "-1234567.50" -> ["-", "1234567.50"]
function splitSign(value) {
  return value.startsWith('-') ? ['-', value.slice(1)] : ['', value];
}

// "1234567" -> "1,234,567"
function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A decimal string with thousands separators: "18000.25" -> "18,000.25". */
export function formatDecimal(value) {
  if (value === null) return EMPTY;
  const [sign, unsigned] = splitSign(value);
  const [integer, fraction] = unsigned.split('.');
  return sign + groupThousands(integer) + (fraction === undefined ? '' : `.${fraction}`);
}

/** A USD amount: "1234.50" -> "$1,234.50", "-25.50" -> "-$25.50". */
export function formatMoney(value) {
  if (value === null) return EMPTY;
  const [sign, unsigned] = splitSign(value);
  return `${sign}$${formatDecimal(unsigned)}`;
}

/** A percentage the server already computed: "50.00" -> "50.00%". */
export function formatPercent(value) {
  if (value === null) return EMPTY;
  return `${value}%`;
}

/** A UTC ISO timestamp shown in the browser's local time zone. */
export function formatDateTime(value) {
  if (value === null) return EMPTY;
  return dateTimeFormat.format(new Date(value));
}

/**
 * The CSS class for a trading outcome (P&L or points), read from the string's sign.
 * Only for outcomes: amounts such as fees are never colored.
 */
export function outcomeClass(value) {
  if (value === null) return undefined;
  if (/^-?0+(\.0+)?$/.test(value)) return 'outcome-zero';
  return value.startsWith('-') ? 'outcome-negative' : 'outcome-positive';
}
