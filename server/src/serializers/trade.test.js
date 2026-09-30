import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { serializeTrade } from './trade.js';

// A CLOSED trade row as Prisma returns it. decimal.js Decimals stand in for the
// decimal-like values Prisma returns.
function closedRow(overrides = {}) {
  return {
    id: 7,
    instrumentId: 2,
    direction: 'SHORT',
    status: 'CLOSED',
    quantity: 3,
    entryPrice: new Decimal('18010.25'),
    exitPrice: new Decimal('18000'),
    enteredAt: new Date('2026-09-30T14:30:00Z'),
    exitedAt: new Date('2026-09-30T15:00:00Z'),
    fees: new Decimal('3.72'),
    pointValueSnapshot: new Decimal('2'),
    pnlPoints: new Decimal('10.25'),
    grossPnl: new Decimal('61.5'),
    netPnl: new Decimal('57.78'),
    notes: 'faded the open',
    createdAt: new Date('2026-09-30T15:01:02.345Z'),
    updatedAt: new Date('2026-09-30T15:05:00Z'),
    ...overrides,
  };
}

function openRow() {
  return closedRow({
    status: 'OPEN',
    exitPrice: null,
    exitedAt: null,
    fees: new Decimal('0'),
    pnlPoints: null,
    grossPnl: null,
    netPnl: null,
    notes: null,
  });
}

describe('serializeTrade', () => {
  it('serializes a CLOSED trade', () => {
    expect(serializeTrade(closedRow())).toEqual({
      id: 7,
      instrumentId: 2,
      direction: 'SHORT',
      status: 'CLOSED',
      quantity: 3,
      entryPrice: '18010.25',
      exitPrice: '18000.00',
      enteredAt: '2026-09-30T14:30:00.000Z',
      exitedAt: '2026-09-30T15:00:00.000Z',
      fees: '3.72',
      pointValueSnapshot: '2.00',
      pnlPoints: '10.25',
      grossPnl: '61.50',
      netPnl: '57.78',
      notes: 'faded the open',
      createdAt: '2026-09-30T15:01:02.345Z',
      updatedAt: '2026-09-30T15:05:00.000Z',
    });
  });

  it('keeps null exit, P&L and notes fields as null for an OPEN trade', () => {
    expect(serializeTrade(openRow())).toMatchObject({
      exitPrice: null,
      exitedAt: null,
      pnlPoints: null,
      grossPnl: null,
      netPnl: null,
      notes: null,
      fees: '0.00',
    });
  });

  it('writes Decimals with exactly two decimal places', () => {
    const result = serializeTrade(
      closedRow({ entryPrice: new Decimal('18000'), fees: new Decimal('0') }),
    );

    expect(result.entryPrice).toBe('18000.00');
    expect(result.fees).toBe('0.00');
  });

  it('keeps every digit of a value beyond JavaScript number precision', () => {
    // 19 significant digits: Number('12345678901234567.89') would come back as 12345678901234568.
    const result = serializeTrade(closedRow({ grossPnl: new Decimal('12345678901234567.89') }));

    expect(result.grossPnl).toBe('12345678901234567.89');
  });

  it('writes negative values in plain notation', () => {
    const result = serializeTrade(closedRow({ netPnl: new Decimal('-0.5') }));

    expect(result.netPnl).toBe('-0.50');
  });

  it('throws instead of rounding a value with more than two decimal places', () => {
    expect(() => serializeTrade(closedRow({ netPnl: new Decimal('1.005') }))).toThrow(
      /at most 2 decimal places, got 1.005/,
    );
  });

  it('sends only the whitelisted fields', () => {
    const result = serializeTrade(closedRow({ instrument: { symbol: 'MNQ' }, internalFlag: true }));

    expect(result).not.toHaveProperty('instrument');
    expect(result).not.toHaveProperty('internalFlag');
    expect(Object.keys(result)).toHaveLength(17);
  });
});
