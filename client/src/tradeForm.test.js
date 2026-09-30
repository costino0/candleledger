import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TRADE_FIELDS,
  buildCreatePayload,
  buildUpdatePayload,
  defaultEnteredAt,
  initialTradeValues,
  splitIssues,
  toApiTimestamp,
  toLocalInputValue,
  tradeToFormValues,
} from './tradeForm.js';

// Tests run with TZ=UTC (see vite.config.js), so local time and UTC are the same here.

function formValues(overrides = {}) {
  return {
    ...initialTradeValues(new Date(2026, 8, 30, 14, 30)),
    instrumentId: '2',
    direction: 'LONG',
    entryPrice: '18000.25',
    ...overrides,
  };
}

// A trade as GET /api/trades sends it, with sub-minute precision in both timestamps.
const CLOSED_TRADE = {
  id: 7,
  instrumentId: 2,
  direction: 'SHORT',
  status: 'CLOSED',
  quantity: 2,
  entryPrice: '18000.00',
  exitPrice: '18005.75',
  enteredAt: '2026-09-30T14:30:42.375Z',
  exitedAt: '2026-09-30T15:00:00.375Z',
  fees: '2.50',
  pointValueSnapshot: '2.00',
  pnlPoints: '-5.75',
  grossPnl: '-23.00',
  netPnl: '-25.50',
  notes: 'chased the move',
  createdAt: '2026-09-30T15:01:00.000Z',
  updatedAt: '2026-09-30T15:01:00.000Z',
};

const OPEN_TRADE = {
  ...CLOSED_TRADE,
  status: 'OPEN',
  exitPrice: null,
  exitedAt: null,
  pnlPoints: null,
  grossPnl: null,
  netPnl: null,
  notes: null,
};

// Node applies a TZ change at runtime. If this environment doesn't, skip rather than test
// the wrong zone.
function useNewYorkTime(context) {
  vi.stubEnv('TZ', 'America/New_York');
  if (new Date(2026, 0, 1).getTimezoneOffset() !== 300) context.skip();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('toApiTimestamp', () => {
  it('converts a local date-time to a UTC ISO string ending in Z', () => {
    expect(toApiTimestamp('2026-09-30T14:30')).toBe('2026-09-30T14:30:00.000Z');
    expect(toApiTimestamp('2026-09-30T14:30:15')).toBe('2026-09-30T14:30:15.000Z');
  });

  it('accepts the fraction of a second some browsers add to the value', () => {
    expect(toApiTimestamp('2026-09-30T14:30:15.000')).toBe('2026-09-30T14:30:15.000Z');
    expect(toApiTimestamp('2026-09-30T14:30:15.5')).toBe('2026-09-30T14:30:15.500Z');
  });

  it('rejects a date the Date constructor would roll into another day', () => {
    // new Date(2026, 1, 30) is March 2: saving that would change what the user entered.
    expect(toApiTimestamp('2026-02-30T10:00')).toBeNull();
    expect(toApiTimestamp('2026-09-30T24:00')).toBeNull();
  });

  it('rejects anything that is not a datetime-local value', () => {
    expect(toApiTimestamp('')).toBeNull();
    expect(toApiTimestamp('2026-09-30 14:30')).toBeNull();
    expect(toApiTimestamp('2026-09-30T14:30Z')).toBeNull();
    expect(toApiTimestamp('2026-09-30T14:30.000')).toBeNull();
  });

  it('rejects a local time skipped by a spring-forward DST change', (context) => {
    // Node applies a TZ change at runtime. If this environment doesn't, skip rather than
    // test the wrong zone.
    vi.stubEnv('TZ', 'America/New_York');
    if (new Date(2026, 0, 1).getTimezoneOffset() !== 300) context.skip();

    // On 2026-03-08 New York clocks jump from 02:00 to 03:00, so 02:30 never happens.
    expect(toApiTimestamp('2026-03-08T02:30')).toBeNull();
    // Times either side of the gap use the offset in force at that moment.
    expect(toApiTimestamp('2026-03-08T01:30')).toBe('2026-03-08T06:30:00.000Z');
    expect(toApiTimestamp('2026-03-08T03:30')).toBe('2026-03-08T07:30:00.000Z');
  });
});

describe('defaultEnteredAt', () => {
  it('formats a local time to the minute, as a datetime-local input expects', () => {
    expect(defaultEnteredAt(new Date(2026, 0, 5, 9, 7, 45))).toBe('2026-01-05T09:07');
  });
});

describe('toLocalInputValue', () => {
  it('shows minutes, and seconds only when they are not zero', () => {
    expect(toLocalInputValue('2026-09-30T14:30:00.000Z')).toBe('2026-09-30T14:30');
    expect(toLocalInputValue('2026-09-30T14:30:42.000Z')).toBe('2026-09-30T14:30:42');
  });

  it('never shows milliseconds', () => {
    expect(toLocalInputValue('2026-09-30T14:30:42.375Z')).toBe('2026-09-30T14:30:42');
    expect(toLocalInputValue('2026-09-30T14:30:00.375Z')).toBe('2026-09-30T14:30');
  });

  it('uses the local time zone', (context) => {
    useNewYorkTime(context);
    expect(toLocalInputValue('2026-09-30T18:30:00.000Z')).toBe('2026-09-30T14:30');
  });

  it('gives a value that converts back to the same instant, to the second', () => {
    const value = toLocalInputValue('2026-09-30T14:30:42.000Z');
    expect(toApiTimestamp(value)).toBe('2026-09-30T14:30:42.000Z');
  });
});

describe('tradeToFormValues', () => {
  it('turns a CLOSED trade into strings for the inputs', () => {
    expect(tradeToFormValues(CLOSED_TRADE)).toEqual({
      instrumentId: '2',
      direction: 'SHORT',
      status: 'CLOSED',
      quantity: '2',
      entryPrice: '18000.00',
      enteredAt: '2026-09-30T14:30:42',
      exitPrice: '18005.75',
      exitedAt: '2026-09-30T15:00',
      fees: '2.50',
      notes: 'chased the move',
    });
  });

  it('shows the null fields of an OPEN trade as empty inputs', () => {
    expect(tradeToFormValues(OPEN_TRADE)).toMatchObject({
      status: 'OPEN',
      exitPrice: '',
      exitedAt: '',
      notes: '',
    });
  });
});

describe('buildUpdatePayload', () => {
  it('sends every client-owned field, and nothing the server owns', () => {
    const { payload, errors } = buildUpdatePayload(tradeToFormValues(CLOSED_TRADE), CLOSED_TRADE);

    expect(errors).toEqual({});
    expect(payload).toEqual({
      instrumentId: 2,
      direction: 'SHORT',
      status: 'CLOSED',
      quantity: 2,
      entryPrice: '18000.00',
      enteredAt: '2026-09-30T14:30:42.375Z',
      exitPrice: '18005.75',
      exitedAt: '2026-09-30T15:00:00.375Z',
      fees: '2.50',
      notes: 'chased the move',
    });
  });

  it('sends an untouched timestamp back exactly, milliseconds included', () => {
    const values = { ...tradeToFormValues(CLOSED_TRADE), quantity: '3' };
    const { payload } = buildUpdatePayload(values, CLOSED_TRADE);

    expect(payload.enteredAt).toBe('2026-09-30T14:30:42.375Z');
  });

  it('keeps the milliseconds of an untouched timestamp shown only to the minute', () => {
    // The input shows "…T15:00": everything below the minute is hidden, yet must survive
    // an unrelated edit.
    const values = { ...tradeToFormValues(CLOSED_TRADE), fees: '3.00' };
    expect(values.exitedAt).toBe('2026-09-30T15:00');

    const { payload } = buildUpdatePayload(values, CLOSED_TRADE);
    expect(payload.exitedAt).toBe('2026-09-30T15:00:00.375Z');
  });

  it('recognizes an untouched timestamp however the browser writes it', () => {
    // jsdom reports "…T14:30:42" as "…T14:30:42.000"; other browsers may do the same.
    for (const enteredAt of ['2026-09-30T14:30:42.000', '2026-09-30T14:30:42.0']) {
      const values = { ...tradeToFormValues(CLOSED_TRADE), enteredAt };
      expect(buildUpdatePayload(values, CLOSED_TRADE).payload.enteredAt).toBe(
        '2026-09-30T14:30:42.375Z',
      );
    }
    const values = { ...tradeToFormValues(CLOSED_TRADE), exitedAt: '2026-09-30T15:00:00' };
    expect(buildUpdatePayload(values, CLOSED_TRADE).payload.exitedAt).toBe(
      '2026-09-30T15:00:00.375Z',
    );
  });

  it('converts an edited timestamp from local time', () => {
    const values = { ...tradeToFormValues(CLOSED_TRADE), enteredAt: '2026-09-30T14:31:42' };
    const { payload } = buildUpdatePayload(values, CLOSED_TRADE);

    expect(payload.enteredAt).toBe('2026-09-30T14:31:42.000Z');
  });

  it('sends the original timestamp when an edit is changed back', () => {
    const values = { ...tradeToFormValues(CLOSED_TRADE), enteredAt: '2026-09-30T14:30:42' };
    expect(buildUpdatePayload(values, CLOSED_TRADE).payload.enteredAt).toBe(
      '2026-09-30T14:30:42.375Z',
    );
  });

  it('reopens a CLOSED trade without sending its exit fields', () => {
    const values = { ...tradeToFormValues(CLOSED_TRADE), status: 'OPEN' };
    const { payload } = buildUpdatePayload(values, CLOSED_TRADE);

    expect(payload.status).toBe('OPEN');
    expect(payload).not.toHaveProperty('exitPrice');
    expect(payload).not.toHaveProperty('exitedAt');
  });

  it('closes an OPEN trade with the exit the user typed', () => {
    const values = {
      ...tradeToFormValues(OPEN_TRADE),
      status: 'CLOSED',
      exitPrice: '18010.00',
      exitedAt: '2026-09-30T16:00',
    };
    const { payload } = buildUpdatePayload(values, OPEN_TRADE);

    expect(payload).toMatchObject({
      status: 'CLOSED',
      enteredAt: '2026-09-30T14:30:42.375Z',
      exitPrice: '18010.00',
      exitedAt: '2026-09-30T16:00:00.000Z',
    });
  });

  it('leaves out empty notes and fees, so the server clears or reports them', () => {
    const values = { ...tradeToFormValues(OPEN_TRADE), fees: '' };
    const { payload } = buildUpdatePayload(values, OPEN_TRADE);

    expect(payload).not.toHaveProperty('notes');
    expect(payload).not.toHaveProperty('fees');
    expect(payload.status).toBe('OPEN');
  });

  it('keeps either instant of a local time repeated when clocks fall back', (context) => {
    useNewYorkTime(context);
    // On 2026-11-01 New York shows 01:30 twice: at 05:30Z (EDT) and at 06:30Z (EST).
    for (const enteredAt of ['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']) {
      const trade = { ...OPEN_TRADE, enteredAt };
      expect(tradeToFormValues(trade).enteredAt).toBe('2026-11-01T01:30');
      expect(buildUpdatePayload(tradeToFormValues(trade), trade).payload.enteredAt).toBe(enteredAt);
    }
  });

  it('still reports an edited local time skipped by a spring-forward DST change', (context) => {
    useNewYorkTime(context);
    const values = { ...tradeToFormValues(OPEN_TRADE), enteredAt: '2026-03-08T02:30' };
    const { payload, errors } = buildUpdatePayload(values, OPEN_TRADE);

    expect(errors).toEqual({ enteredAt: ['is not a valid time in your time zone'] });
    expect(payload).not.toHaveProperty('enteredAt');
  });
});

describe('buildCreatePayload', () => {
  it('builds an OPEN trade with only client-owned fields', () => {
    const { payload, errors } = buildCreatePayload(formValues());

    expect(errors).toEqual({});
    expect(payload).toEqual({
      instrumentId: 2,
      direction: 'LONG',
      status: 'OPEN',
      quantity: 1,
      entryPrice: '18000.25',
      enteredAt: '2026-09-30T14:30:00.000Z',
      fees: '0',
    });
  });

  it('never sends exit values for an OPEN trade, even if they were typed', () => {
    const { payload } = buildCreatePayload(
      formValues({ exitPrice: '18010.00', exitedAt: '2026-09-30T15:00' }),
    );

    expect(payload).not.toHaveProperty('exitPrice');
    expect(payload).not.toHaveProperty('exitedAt');
  });

  it('sends exit values for a CLOSED trade', () => {
    const { payload } = buildCreatePayload(
      formValues({ status: 'CLOSED', exitPrice: '18010.00', exitedAt: '2026-09-30T15:00' }),
    );

    expect(payload).toMatchObject({
      status: 'CLOSED',
      exitPrice: '18010.00',
      exitedAt: '2026-09-30T15:00:00.000Z',
    });
  });

  it('keeps prices and fees as strings, with every digit', () => {
    const { payload } = buildCreatePayload(
      formValues({ entryPrice: ' 1234567890.25 ', fees: '2.48' }),
    );

    expect(payload.entryPrice).toBe('1234567890.25');
    expect(payload.fees).toBe('2.48');
  });

  it('sends quantity digits as an integer and anything else as typed', () => {
    expect(buildCreatePayload(formValues({ quantity: '3' })).payload.quantity).toBe(3);
    expect(buildCreatePayload(formValues({ quantity: '1.5' })).payload.quantity).toBe('1.5');
  });

  it('leaves blank fields out so the server can report or default them', () => {
    const { payload } = buildCreatePayload({
      ...initialTradeValues(),
      quantity: '',
      enteredAt: '',
      fees: ' ',
      notes: '  \n',
    });

    expect(payload).toEqual({ status: 'OPEN' });
  });

  it('sends notes exactly as written', () => {
    const notes = '  - waited for the retest\n';
    expect(buildCreatePayload(formValues({ notes })).payload.notes).toBe(notes);
  });

  it('reports a local time that does not exist instead of sending it', () => {
    const { payload, errors } = buildCreatePayload(
      formValues({ status: 'CLOSED', exitPrice: '18010.00', exitedAt: '2026-02-30T10:00' }),
    );

    expect(errors).toEqual({ exitedAt: ['is not a valid time in your time zone'] });
    expect(payload).not.toHaveProperty('exitedAt');
  });
});

describe('splitIssues', () => {
  it('puts issues for visible fields next to them and the rest in a general list', () => {
    const visible = TRADE_FIELDS.filter((field) => field !== 'exitPrice');
    const { fieldErrors, generalErrors } = splitIssues(
      [
        { path: ['entryPrice'], message: 'must be greater than 0' },
        { path: ['entryPrice'], message: "must be a multiple of the instrument's tick size" },
        { path: ['exitPrice'], message: 'must be empty while the trade is OPEN' },
        { path: ['instrumntId'], message: 'is not a known field' },
        { path: [], message: 'netPnl 1e13 is too large to store' },
      ],
      visible,
    );

    expect(fieldErrors).toEqual({
      entryPrice: ['must be greater than 0', "must be a multiple of the instrument's tick size"],
    });
    expect(generalErrors).toEqual([
      'exitPrice must be empty while the trade is OPEN',
      'instrumntId is not a known field',
      'netPnl 1e13 is too large to store',
    ]);
  });
});
