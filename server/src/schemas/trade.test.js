import { describe, expect, it } from 'vitest';
import { createTradeSchema } from './trade.js';

function openTrade(overrides = {}) {
  return {
    instrumentId: 2,
    direction: 'LONG',
    quantity: 2,
    entryPrice: '18000.00',
    enteredAt: '2026-09-30T14:30:00Z',
    ...overrides,
  };
}

function closedTrade(overrides = {}) {
  return openTrade({
    status: 'CLOSED',
    exitPrice: '18010.25',
    exitedAt: '2026-09-30T15:00:00Z',
    fees: '2.48',
    ...overrides,
  });
}

function parse(input) {
  return createTradeSchema.safeParse(input);
}

// The paths of every issue, for asserting which fields were rejected.
function issuePaths(input) {
  const result = parse(input);
  expect(result.success).toBe(false);
  return result.error.issues.map((issue) => issue.path.join('.'));
}

describe('createTradeSchema', () => {
  describe('valid payloads', () => {
    it('accepts a minimal OPEN trade and fills in the defaults', () => {
      const result = parse(openTrade());

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        instrumentId: 2,
        direction: 'LONG',
        status: 'OPEN',
        quantity: 2,
        entryPrice: '18000.00',
        enteredAt: new Date('2026-09-30T14:30:00Z'),
        fees: '0',
      });
    });

    it('accepts a full CLOSED trade', () => {
      const result = parse(closedTrade({ notes: 'Breakout' }));

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        instrumentId: 2,
        direction: 'LONG',
        status: 'CLOSED',
        quantity: 2,
        entryPrice: '18000.00',
        exitPrice: '18010.25',
        enteredAt: new Date('2026-09-30T14:30:00Z'),
        exitedAt: new Date('2026-09-30T15:00:00Z'),
        fees: '2.48',
        notes: 'Breakout',
      });
    });
  });

  describe('fields', () => {
    it('ignores the server-owned fields', () => {
      const result = parse(
        closedTrade({
          id: 99,
          pointValueSnapshot: '999.00',
          pnlPoints: '1.00',
          grossPnl: '1000000.00',
          netPnl: '1000000.00',
          createdAt: '2020-01-01T00:00:00Z',
          updatedAt: '2020-01-01T00:00:00Z',
        }),
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(parse(closedTrade()).data);
    });

    it.each(['instrumntId', 'foo'])('rejects the unknown field %s', (field) => {
      const result = parse(openTrade({ [field]: 1 }));

      expect(result.success).toBe(false);
      expect(result.error.issues).toEqual([
        expect.objectContaining({ code: 'unrecognized_keys', keys: [field] }),
      ]);
    });

    it.each([null, [], 'trade', 42])('rejects a payload that is not an object (%s)', (input) => {
      expect(parse(input).success).toBe(false);
    });

    it('does not mutate the input', () => {
      const input = closedTrade({ pnlPoints: '1.00', id: 5 });
      const copy = structuredClone(input);

      parse(input);

      expect(input).toEqual(copy);
    });
  });

  describe('instrumentId', () => {
    it.each([undefined, 0, -1, 1.5, '1', 2147483648])('rejects %s', (instrumentId) => {
      expect(issuePaths(openTrade({ instrumentId }))).toContain('instrumentId');
    });

    it('accepts the int4 maximum', () => {
      expect(parse(openTrade({ instrumentId: 2147483647 })).success).toBe(true);
    });
  });

  describe('direction and status', () => {
    it.each(['long', 'BUY', undefined])('rejects direction %s', (direction) => {
      expect(issuePaths(openTrade({ direction }))).toContain('direction');
    });

    it.each(['closed', 'PENDING', null])('rejects status %s', (status) => {
      expect(issuePaths(openTrade({ status }))).toEqual(['status']);
    });
  });

  describe('quantity', () => {
    it.each([0, -1, 1.5, '2', 2147483648, undefined])('rejects %s', (quantity) => {
      expect(issuePaths(openTrade({ quantity }))).toEqual(['quantity']);
    });

    it.each([1, 2147483647])('accepts %s', (quantity) => {
      expect(parse(openTrade({ quantity })).success).toBe(true);
    });
  });

  describe('prices', () => {
    it.each([
      18000.25,
      '',
      'abc',
      '1e3',
      '-1.00',
      '0',
      '0.00',
      '18000.125',
      ' 18000',
      '18000.',
      '12345678901',
      undefined,
    ])('rejects entryPrice %s', (entryPrice) => {
      expect(issuePaths(openTrade({ entryPrice }))).toContain('entryPrice');
    });

    it.each(['18000', '18000.5', '18000.25', '0.25', '9999999999.99'])(
      'accepts entryPrice %s',
      (entryPrice) => {
        expect(parse(openTrade({ entryPrice })).success).toBe(true);
      },
    );

    it.each([18010.25, '-1.00', '0.00', '18010.255'])('rejects exitPrice %s', (exitPrice) => {
      expect(issuePaths(closedTrade({ exitPrice }))).toContain('exitPrice');
    });
  });

  describe('fees', () => {
    it.each(['-0.01', '1.234', 2.48, '123456789', '', 'abc'])('rejects %s', (fees) => {
      expect(issuePaths(openTrade({ fees }))).toEqual(['fees']);
    });

    it.each(['0', '0.00', '2.48', '99999999.99'])('accepts %s', (fees) => {
      expect(parse(openTrade({ fees })).data.fees).toBe(fees);
    });
  });

  describe('timestamps', () => {
    it.each([
      '2026-09-30',
      '2026-09-30T14:30:00',
      '2026-09-30 14:30:00Z',
      'not a date',
      1790000000000,
      undefined,
    ])('rejects enteredAt %s', (enteredAt) => {
      expect(issuePaths(openTrade({ enteredAt }))).toContain('enteredAt');
    });

    it.each([
      ['2026-09-30T14:30:00Z', '2026-09-30T14:30:00.000Z'],
      ['2026-09-30T14:30:00.123Z', '2026-09-30T14:30:00.123Z'],
      ['2026-09-30T16:30:00+02:00', '2026-09-30T14:30:00.000Z'],
      ['2026-09-30T09:30:00-05:00', '2026-09-30T14:30:00.000Z'],
    ])('parses %s as the UTC instant %s', (enteredAt, utc) => {
      expect(parse(openTrade({ enteredAt })).data.enteredAt).toEqual(new Date(utc));
    });
  });

  describe('notes', () => {
    it('rejects more than 10,000 characters', () => {
      expect(issuePaths(openTrade({ notes: 'x'.repeat(10_001) }))).toEqual(['notes']);
    });

    it.each([null, undefined, '', 'x'.repeat(10_000)])('accepts %s', (notes) => {
      expect(parse(openTrade({ notes })).success).toBe(true);
    });
  });

  describe('OPEN trades', () => {
    it('rejects an exitPrice', () => {
      expect(issuePaths(openTrade({ exitPrice: '18010.25' }))).toEqual(['exitPrice']);
    });

    it('rejects an exitedAt', () => {
      expect(issuePaths(openTrade({ exitedAt: '2026-09-30T15:00:00Z' }))).toEqual(['exitedAt']);
    });

    it('rejects both when both are given, with an explicit OPEN status', () => {
      const paths = issuePaths(
        openTrade({ status: 'OPEN', exitPrice: '18010.25', exitedAt: '2026-09-30T15:00:00Z' }),
      );

      expect(paths).toEqual(['exitPrice', 'exitedAt']);
    });

    it('accepts explicit nulls for the exit fields', () => {
      expect(parse(openTrade({ exitPrice: null, exitedAt: null })).success).toBe(true);
    });
  });

  describe('CLOSED trades', () => {
    it.each(['exitPrice', 'exitedAt'])('requires %s', (field) => {
      expect(issuePaths(closedTrade({ [field]: undefined }))).toEqual([field]);
      expect(issuePaths(closedTrade({ [field]: null }))).toEqual([field]);
    });

    it('reports both exit fields when both are missing', () => {
      expect(issuePaths(closedTrade({ exitPrice: undefined, exitedAt: undefined }))).toEqual([
        'exitPrice',
        'exitedAt',
      ]);
    });

    it('rejects exitedAt before enteredAt', () => {
      expect(issuePaths(closedTrade({ exitedAt: '2026-09-30T14:29:59.999Z' }))).toEqual([
        'exitedAt',
      ]);
    });

    it('accepts exitedAt equal to enteredAt', () => {
      expect(parse(closedTrade({ exitedAt: '2026-09-30T14:30:00Z' })).success).toBe(true);
    });

    it('compares instants, not local clock times', () => {
      // 15:00+02:00 is 13:00 UTC, which is before 14:30 UTC.
      expect(issuePaths(closedTrade({ exitedAt: '2026-09-30T15:00:00+02:00' }))).toEqual([
        'exitedAt',
      ]);
      // 10:00-05:00 is 15:00 UTC, which is after 14:30 UTC.
      expect(parse(closedTrade({ exitedAt: '2026-09-30T10:00:00-05:00' })).success).toBe(true);
    });

    it('does not add a time-order issue when enteredAt itself is invalid', () => {
      expect(issuePaths(closedTrade({ enteredAt: 'not a date' }))).toEqual(['enteredAt']);
    });
  });
});
