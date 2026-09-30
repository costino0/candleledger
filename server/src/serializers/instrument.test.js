import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { serializeInstrument } from './instrument.js';

// An Instrument row as Prisma returns it. decimal.js Decimals stand in for the
// decimal-like values Prisma returns.
function row(overrides = {}) {
  return {
    id: 2,
    symbol: 'MNQ',
    name: 'Micro E-mini Nasdaq-100',
    pointValue: new Decimal('2.00'),
    tickSize: new Decimal('0.2500'),
    ...overrides,
  };
}

describe('serializeInstrument', () => {
  it('returns every field, with Decimals as fixed-scale strings', () => {
    expect(serializeInstrument(row())).toEqual({
      id: 2,
      symbol: 'MNQ',
      name: 'Micro E-mini Nasdaq-100',
      pointValue: '2.00',
      tickSize: '0.2500',
    });
  });

  it('pads values to the column scale: 2 places for pointValue, 4 for tickSize', () => {
    const result = serializeInstrument(
      row({ pointValue: new Decimal('20'), tickSize: new Decimal('0.25') }),
    );

    expect(result.pointValue).toBe('20.00');
    expect(result.tickSize).toBe('0.2500');
  });

  it('keeps a tick size that uses all four decimal places', () => {
    expect(serializeInstrument(row({ tickSize: new Decimal('0.0001') })).tickSize).toBe('0.0001');
  });

  it('throws instead of rounding a pointValue with more than two decimal places', () => {
    expect(() => serializeInstrument(row({ pointValue: new Decimal('2.005') }))).toThrow(
      /at most 2 decimal places, got 2.005/,
    );
  });

  it('throws instead of rounding a tickSize with more than four decimal places', () => {
    expect(() => serializeInstrument(row({ tickSize: new Decimal('0.25001') }))).toThrow(
      /at most 4 decimal places, got 0.25001/,
    );
  });

  it('sends only the whitelisted fields', () => {
    const result = serializeInstrument(row({ trades: [{ id: 1 }], internalFlag: true }));

    expect(Object.keys(result)).toEqual(['id', 'symbol', 'name', 'pointValue', 'tickSize']);
  });
});
