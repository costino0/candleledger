import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TRADE_FIELDS,
  buildCreatePayload,
  defaultEnteredAt,
  initialTradeValues,
  splitIssues,
  toApiTimestamp,
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('toApiTimestamp', () => {
  it('converts a local date-time to a UTC ISO string ending in Z', () => {
    expect(toApiTimestamp('2026-09-30T14:30')).toBe('2026-09-30T14:30:00.000Z');
    expect(toApiTimestamp('2026-09-30T14:30:15')).toBe('2026-09-30T14:30:15.000Z');
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
