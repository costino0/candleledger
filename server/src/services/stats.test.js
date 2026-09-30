import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { calculateStats, getStats } from './stats.js';

// Rows as Prisma returns them for the stats query. decimal.js Decimals stand in for the
// decimal-like values Prisma returns; the service only calls `toFixed()` on them.
function closed(netPnl, { grossPnl = netPnl, fees = '0' } = {}) {
  return {
    status: 'CLOSED',
    grossPnl: new Decimal(grossPnl),
    netPnl: new Decimal(netPnl),
    fees: new Decimal(fees),
  };
}

function open() {
  return { status: 'OPEN', grossPnl: null, netPnl: null, fees: new Decimal('1.24') };
}

const EMPTY_STATS = {
  totalNetPnl: '0.00',
  totalGrossPnl: '0.00',
  totalFees: '0.00',
  closedTrades: 0,
  openTrades: 0,
  wins: 0,
  losses: 0,
  breakEvens: 0,
  winRate: null,
  averageWin: null,
  averageLoss: null,
};

describe('calculateStats', () => {
  describe('with no CLOSED trades', () => {
    it('returns zero totals and null rates when there are no trades', () => {
      expect(calculateStats([])).toEqual(EMPTY_STATS);
    });

    it('counts OPEN trades and nothing else', () => {
      expect(calculateStats([open(), open()])).toEqual({ ...EMPTY_STATS, openTrades: 2 });
    });
  });

  describe('with a mix of trades', () => {
    // Stored values: grossPnl − fees = netPnl for each row.
    const rows = [
      closed('38.52', { grossPnl: '41.00', fees: '2.48' }),
      closed('100.02', { grossPnl: '102.50', fees: '2.48' }),
      closed('-25.50', { grossPnl: '-23.02', fees: '2.48' }),
      closed('0.00', { grossPnl: '0.00', fees: '0.00' }),
      open(),
    ];

    it('returns every field exactly', () => {
      expect(calculateStats(rows)).toEqual({
        totalNetPnl: '113.04',
        totalGrossPnl: '120.48',
        totalFees: '7.44',
        closedTrades: 4,
        openTrades: 1,
        wins: 2,
        losses: 1,
        breakEvens: 1,
        winRate: '50.00',
        averageWin: '69.27',
        averageLoss: '-25.50',
      });
    });

    it('is unaffected by OPEN trades apart from openTrades', () => {
      const withoutOpen = calculateStats(rows.filter((row) => row.status === 'CLOSED'));
      expect(calculateStats(rows)).toEqual({ ...withoutOpen, openTrades: 1 });
    });

    it('does not depend on row order', () => {
      expect(calculateStats([...rows].reverse())).toEqual(calculateStats(rows));
    });
  });

  describe('totals', () => {
    it('sums the stored values without recalculating them', () => {
      // Deliberately inconsistent: grossPnl − fees ≠ netPnl. The stored values are used.
      const stats = calculateStats([closed('10.00', { grossPnl: '99.99', fees: '5.55' })]);

      expect(stats).toMatchObject({
        totalNetPnl: '10.00',
        totalGrossPnl: '99.99',
        totalFees: '5.55',
      });
    });

    it('counts fees of CLOSED trades only', () => {
      expect(calculateStats([closed('1.00', { fees: '0.62' }), open()]).totalFees).toBe('0.62');
    });

    it('sums exactly where binary floating point would not', () => {
      expect(calculateStats([closed('0.10'), closed('0.20')]).totalNetPnl).toBe('0.30');
    });

    it('sums values near the Decimal(14,2) limit exactly, without rounding', () => {
      const rows = Array.from({ length: 1000 }, () => closed('999999999999.99'));
      expect(calculateStats(rows).totalNetPnl).toBe('999999999999990.00');
    });

    it('returns "0.00", never "-0.00", when totals net to zero', () => {
      const stats = calculateStats([
        closed('-5.00', { grossPnl: '-5.00' }),
        closed('5.00', { grossPnl: '5.00' }),
      ]);
      expect(stats).toMatchObject({ totalNetPnl: '0.00', totalGrossPnl: '0.00' });
    });
  });

  describe('outcomes', () => {
    it.each([
      ['0.01', { wins: 1, losses: 0, breakEvens: 0 }],
      ['0.00', { wins: 0, losses: 0, breakEvens: 1 }],
      ['-0.01', { wins: 0, losses: 1, breakEvens: 0 }],
    ])('classifies a netPnl of %s', (netPnl, expected) => {
      expect(calculateStats([closed(netPnl)])).toMatchObject(expected);
    });

    it('classifies by netPnl: a gross win eaten by fees is a break-even', () => {
      const stats = calculateStats([closed('0.00', { grossPnl: '2.48', fees: '2.48' })]);
      expect(stats).toMatchObject({ wins: 0, losses: 0, breakEvens: 1 });
    });

    it('classifies by netPnl: a gross win smaller than fees is a loss', () => {
      const stats = calculateStats([closed('-1.48', { grossPnl: '1.00', fees: '2.48' })]);
      expect(stats).toMatchObject({ wins: 0, losses: 1, averageLoss: '-1.48' });
    });
  });

  describe('winRate', () => {
    it.each([
      [['1.00', '-1.00', '-1.00'], '33.33'],
      [['1.00', '1.00', '-1.00'], '66.67'],
      [['1.00', '1.00'], '100.00'],
      [['-1.00', '-1.00'], '0.00'],
      [['0.00', '0.00'], '0.00'],
      [['1.00', '0.00'], '50.00'],
      [['1.00', '-1.00', '-1.00', '-1.00', '-1.00', '-1.00', '-1.00', '-1.00'], '12.50'],
    ])('for net P&L %j is %s', (netPnls, expected) => {
      expect(calculateStats(netPnls.map((netPnl) => closed(netPnl))).winRate).toBe(expected);
    });

    it('counts break-evens in the denominator', () => {
      const stats = calculateStats([closed('1.00'), closed('0.00'), closed('0.00')]);
      expect(stats.winRate).toBe('33.33');
    });
  });

  describe('averages', () => {
    it('averages winning and losing netPnl separately', () => {
      const stats = calculateStats([
        closed('10.00'),
        closed('20.00'),
        closed('-4.00'),
        closed('-8.00'),
        closed('0.00'),
      ]);
      expect(stats).toMatchObject({ averageWin: '15.00', averageLoss: '-6.00' });
    });

    it('rounds half up to exactly 2 places', () => {
      // 0.03 ÷ 2 = 0.015
      expect(calculateStats([closed('0.01'), closed('0.02')]).averageWin).toBe('0.02');
    });

    it('rounds a negative half away from zero', () => {
      // −0.03 ÷ 2 = −0.015
      expect(calculateStats([closed('-0.01'), closed('-0.02')]).averageLoss).toBe('-0.02');
    });

    it('rounds a repeating quotient', () => {
      // 100.00 ÷ 3 = 33.333…, −200.00 ÷ 3 = −66.666…
      const stats = calculateStats([
        closed('33.33'),
        closed('33.33'),
        closed('33.34'),
        closed('-66.66'),
        closed('-66.67'),
        closed('-66.67'),
      ]);
      expect(stats).toMatchObject({ averageWin: '33.33', averageLoss: '-66.67' });
    });

    it('sums exactly first and rounds only the final quotient', () => {
      // (1.00 + 1.01) ÷ 2 = 1.005 exactly → 1.01. Through a JavaScript number it would be
      // 1.00499… and round down to 1.00.
      expect(calculateStats([closed('1.00'), closed('1.01')]).averageWin).toBe('1.01');
      expect(calculateStats([closed('-1.00'), closed('-1.01')]).averageLoss).toBe('-1.01');

      // 1000 wins: 999 of 0.01 and one of 0.02. Exact: 10.01 ÷ 1000 = 0.01001 → 0.01.
      const many = [...Array.from({ length: 999 }, () => closed('0.01')), closed('0.02')];
      expect(calculateStats(many).averageWin).toBe('0.01');
    });

    it('averages a single trade to its own value', () => {
      expect(calculateStats([closed('38.52'), closed('-25.50')])).toMatchObject({
        averageWin: '38.52',
        averageLoss: '-25.50',
      });
    });

    it('returns a null averageWin when there are no wins', () => {
      const stats = calculateStats([closed('-1.00'), closed('0.00')]);
      expect(stats).toMatchObject({ averageWin: null, averageLoss: '-1.00' });
    });

    it('returns a null averageLoss when there are no losses', () => {
      const stats = calculateStats([closed('1.00'), closed('0.00')]);
      expect(stats).toMatchObject({ averageWin: '1.00', averageLoss: null });
    });

    it('returns null averages when every CLOSED trade is a break-even', () => {
      const stats = calculateStats([closed('0.00')]);
      expect(stats).toMatchObject({ winRate: '0.00', averageWin: null, averageLoss: null });
    });
  });

  describe('integrity', () => {
    it.each(['grossPnl', 'netPnl', 'fees'])('throws when a CLOSED trade has a null %s', (field) => {
      const row = { ...closed('1.00'), [field]: null };
      expect(() => calculateStats([closed('2.00'), row])).toThrow(
        `stats: CLOSED trade has no ${field}`,
      );
    });

    it('throws on an unknown status', () => {
      expect(() => calculateStats([{ ...closed('1.00'), status: 'PENDING' }])).toThrow(
        'stats: unexpected trade status PENDING',
      );
    });
  });
});

describe('getStats', () => {
  it('reads every trade once with only the columns stats need', async () => {
    const prisma = { trade: { findMany: vi.fn(async () => [closed('38.52'), open()]) } };

    const stats = await getStats(prisma);

    expect(prisma.trade.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.trade.findMany).toHaveBeenCalledWith({
      select: { status: true, grossPnl: true, netPnl: true, fees: true },
    });
    expect(stats).toMatchObject({ closedTrades: 1, openTrades: 1, totalNetPnl: '38.52' });
  });

  it('propagates a query error', async () => {
    const prisma = { trade: { findMany: vi.fn().mockRejectedValue(new Error('timeout')) } };
    await expect(getStats(prisma)).rejects.toThrow('timeout');
  });
});
