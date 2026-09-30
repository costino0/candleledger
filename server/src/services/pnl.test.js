import { describe, expect, it } from 'vitest';
import { calculateClosedTradePnl } from './pnl.js';

// Point values from docs/DATA_MODEL.md, as the server would snapshot them.
const POINT_VALUE = { NQ: '20.00', MNQ: '2.00', ES: '50.00', MES: '5.00' };

const TWO_DECIMALS = /^-?\d+\.\d{2}$/;

function trade(overrides = {}) {
  return {
    direction: 'LONG',
    entryPrice: '18000.00',
    exitPrice: '18010.25',
    pointValueSnapshot: POINT_VALUE.MNQ,
    quantity: 2,
    fees: '2.48',
    ...overrides,
  };
}

describe('calculateClosedTradePnl', () => {
  describe('instruments, directions, wins and losses', () => {
    it.each([
      // [label, symbol, direction, entry, exit, qty, fees, pnlPoints, gross, net]
      ['NQ LONG win', 'NQ', 'LONG', '18000.00', '18010.25', 1, '4.50', '10.25', '205.00', '200.50'],
      [
        'NQ SHORT win',
        'NQ',
        'SHORT',
        '18010.25',
        '18000.00',
        1,
        '4.50',
        '10.25',
        '205.00',
        '200.50',
      ],
      [
        'MNQ LONG win (DATA_MODEL example)',
        'MNQ',
        'LONG',
        '18000.00',
        '18010.25',
        2,
        '2.48',
        '10.25',
        '41.00',
        '38.52',
      ],
      [
        'MNQ SHORT loss',
        'MNQ',
        'SHORT',
        '18000.00',
        '18012.50',
        3,
        '1.86',
        '-12.50',
        '-75.00',
        '-76.86',
      ],
      [
        'ES LONG loss',
        'ES',
        'LONG',
        '5000.25',
        '4995.50',
        2,
        '5.00',
        '-4.75',
        '-475.00',
        '-480.00',
      ],
      ['ES SHORT win', 'ES', 'SHORT', '5000.75', '4990.00', 1, '2.50', '10.75', '537.50', '535.00'],
      [
        'MES LONG win, 10 contracts',
        'MES',
        'LONG',
        '5000.00',
        '5000.25',
        10,
        '6.20',
        '0.25',
        '12.50',
        '6.30',
      ],
      [
        'MES SHORT loss',
        'MES',
        'SHORT',
        '5000.50',
        '5003.75',
        4,
        '2.48',
        '-3.25',
        '-65.00',
        '-67.48',
      ],
    ])(
      '%s',
      (
        _label,
        symbol,
        direction,
        entryPrice,
        exitPrice,
        quantity,
        fees,
        pnlPoints,
        grossPnl,
        netPnl,
      ) => {
        const result = calculateClosedTradePnl({
          direction,
          entryPrice,
          exitPrice,
          pointValueSnapshot: POINT_VALUE[symbol],
          quantity,
          fees,
        });

        expect(result).toEqual({ pnlPoints, grossPnl, netPnl });
      },
    );
  });

  describe('break-even', () => {
    it('NQ LONG with no fees is zero everywhere', () => {
      const result = calculateClosedTradePnl(
        trade({
          entryPrice: '18000.50',
          exitPrice: '18000.50',
          pointValueSnapshot: POINT_VALUE.NQ,
          quantity: 1,
          fees: '0.00',
        }),
      );

      expect(result).toEqual({ pnlPoints: '0.00', grossPnl: '0.00', netPnl: '0.00' });
    });

    it('ES SHORT with no fees is zero everywhere and never "-0.00"', () => {
      const result = calculateClosedTradePnl(
        trade({
          direction: 'SHORT',
          entryPrice: '5000.75',
          exitPrice: '5000.75',
          pointValueSnapshot: POINT_VALUE.ES,
          quantity: 2,
          fees: '0.00',
        }),
      );

      expect(result).toEqual({ pnlPoints: '0.00', grossPnl: '0.00', netPnl: '0.00' });
      for (const value of Object.values(result)) {
        expect(value.startsWith('-')).toBe(false);
      }
    });

    it('MNQ LONG gross break-even becomes a net loss of the fees', () => {
      const result = calculateClosedTradePnl(
        trade({ entryPrice: '18000.25', exitPrice: '18000.25', quantity: 1, fees: '1.24' }),
      );

      expect(result).toEqual({ pnlPoints: '0.00', grossPnl: '0.00', netPnl: '-1.24' });
    });

    it('MES LONG net break-even when gross equals fees', () => {
      const result = calculateClosedTradePnl(
        trade({
          entryPrice: '5000.00',
          exitPrice: '5000.25',
          pointValueSnapshot: POINT_VALUE.MES,
          quantity: 2,
          fees: '2.50',
        }),
      );

      expect(result).toEqual({ pnlPoints: '0.25', grossPnl: '2.50', netPnl: '0.00' });
    });
  });

  describe('precision', () => {
    it('avoids floating-point error (12.50 - 1.12 is 11.379999… with numbers)', () => {
      expect(12.5 - 1.12).not.toBe(11.38);

      const result = calculateClosedTradePnl(
        trade({
          entryPrice: '5000.00',
          exitPrice: '5002.50',
          pointValueSnapshot: POINT_VALUE.MES,
          quantity: 1,
          fees: '1.12',
        }),
      );

      expect(result).toEqual({ pnlPoints: '2.50', grossPnl: '12.50', netPnl: '11.38' });
    });

    it('handles large values exactly (NQ LONG, 50 contracts, 1000.75 points)', () => {
      const result = calculateClosedTradePnl(
        trade({
          entryPrice: '17000.00',
          exitPrice: '18000.75',
          pointValueSnapshot: POINT_VALUE.NQ,
          quantity: 50,
          fees: '0.00',
        }),
      );

      expect(result).toEqual({
        pnlPoints: '1000.75',
        grossPnl: '1000750.00',
        netPnl: '1000750.00',
      });
    });

    it.each([
      // [entry, exit, pnlPoints, grossPnl] for 1 NQ LONG, no fees
      ['18000.25', '18000.50', '0.25', '5.00'],
      ['18000.50', '18000.75', '0.25', '5.00'],
      ['18000.75', '18001.25', '0.50', '10.00'],
      ['18000.25', '18000.00', '-0.25', '-5.00'],
      ['18000.50', '17999.75', '-0.75', '-15.00'],
      ['18000.75', '18000.00', '-0.75', '-15.00'],
    ])('handles quarter-point prices: %s -> %s', (entryPrice, exitPrice, pnlPoints, grossPnl) => {
      const result = calculateClosedTradePnl(
        trade({
          entryPrice,
          exitPrice,
          pointValueSnapshot: POINT_VALUE.NQ,
          quantity: 1,
          fees: '0.00',
        }),
      );

      expect(result).toEqual({ pnlPoints, grossPnl, netPnl: grossPnl });
    });
  });

  describe('input and output contract', () => {
    it.each(['20', '20.0', '20.00'])(
      'treats point value %s the same as 20.00',
      (pointValueSnapshot) => {
        const result = calculateClosedTradePnl(
          trade({ pointValueSnapshot, quantity: 1, fees: '4.50' }),
        );

        expect(result).toEqual({ pnlPoints: '10.25', grossPnl: '205.00', netPnl: '200.50' });
      },
    );

    it('treats equivalent price and fee strings the same', () => {
      const short = calculateClosedTradePnl(
        trade({ entryPrice: '18000', exitPrice: '18010.5', fees: '3' }),
      );
      const padded = calculateClosedTradePnl(
        trade({ entryPrice: '18000.00', exitPrice: '18010.50', fees: '3.00' }),
      );

      expect(short).toEqual(padded);
      expect(short).toEqual({ pnlPoints: '10.50', grossPnl: '42.00', netPnl: '39.00' });
    });

    it('always returns strings with exactly two decimal places', () => {
      const results = [
        calculateClosedTradePnl(trade()),
        calculateClosedTradePnl(trade({ entryPrice: '18000', exitPrice: '18010', fees: '0' })),
        calculateClosedTradePnl(trade({ direction: 'SHORT', fees: '1.5' })),
        calculateClosedTradePnl(trade({ exitPrice: '18000', fees: '0' })),
      ];

      for (const result of results) {
        for (const value of Object.values(result)) {
          expect(typeof value).toBe('string');
          expect(value).toMatch(TWO_DECIMALS);
        }
      }
    });

    it('does not mutate its input', () => {
      const input = trade();
      const copy = structuredClone(input);

      calculateClosedTradePnl(input);

      expect(input).toEqual(copy);
    });
  });

  describe('guards', () => {
    it.each(['long', 'BUY', undefined, null])('rejects direction %s', (direction) => {
      expect(() => calculateClosedTradePnl(trade({ direction }))).toThrow(TypeError);
    });

    it.each([0, -1, 1.5, '2', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
      'rejects quantity %s',
      (quantity) => {
        expect(() => calculateClosedTradePnl(trade({ quantity }))).toThrow(TypeError);
      },
    );

    it.each([null, undefined])('rejects a missing exitPrice (%s)', (exitPrice) => {
      expect(() => calculateClosedTradePnl(trade({ exitPrice }))).toThrow(TypeError);
    });

    it.each(['entryPrice', 'exitPrice', 'pointValueSnapshot', 'fees'])(
      'rejects a non-string or malformed %s',
      (field) => {
        for (const bad of ['abc', '', ' 1.00', '1e3', 'Infinity', 'NaN', '1.', 18000.25]) {
          expect(() => calculateClosedTradePnl(trade({ [field]: bad }))).toThrow(TypeError);
        }
      },
    );

    it.each([
      ['entryPrice', '18000.125'],
      ['exitPrice', '18010.255'],
      ['pointValueSnapshot', '2.001'],
      ['fees', '2.485'],
    ])('rejects %s with more than 2 decimal places (%s)', (field, value) => {
      expect(() => calculateClosedTradePnl(trade({ [field]: value }))).toThrow(RangeError);
    });

    it.each(['0', '0.00', '-2.00'])('rejects pointValueSnapshot %s', (pointValueSnapshot) => {
      expect(() => calculateClosedTradePnl(trade({ pointValueSnapshot }))).toThrow(RangeError);
    });

    it('rejects negative fees', () => {
      expect(() => calculateClosedTradePnl(trade({ fees: '-0.01' }))).toThrow(RangeError);
    });

    it('throws instead of rounding when gross P&L needs more than 2 decimal places', () => {
      // 0.25 points × 12.50 × 1 = 3.125
      expect(() =>
        calculateClosedTradePnl(
          trade({
            entryPrice: '100.00',
            exitPrice: '100.25',
            pointValueSnapshot: '12.50',
            quantity: 1,
            fees: '0.00',
          }),
        ),
      ).toThrow(/grossPnl 3\.125 cannot be represented exactly/);
    });
  });
});
