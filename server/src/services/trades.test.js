import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../errors.js';
import { createTrade } from './trades.js';

// Instrument rows as Prisma would return them. decimal.js Decimals stand in for the
// decimal-like values Prisma returns; the service only calls `toFixed()` on them.
const INSTRUMENTS = {
  1: { symbol: 'NQ', pointValue: new Decimal('20.00'), tickSize: new Decimal('0.2500') },
  2: { symbol: 'MNQ', pointValue: new Decimal('2.00'), tickSize: new Decimal('0.2500') },
  3: { symbol: 'ES', pointValue: new Decimal('50.00'), tickSize: new Decimal('0.2500') },
  4: { symbol: 'MES', pointValue: new Decimal('5.00'), tickSize: new Decimal('0.2500') },
};
const ID = { NQ: 1, MNQ: 2, ES: 3, MES: 4 };

const DATA_KEYS = [
  'instrumentId',
  'direction',
  'status',
  'quantity',
  'entryPrice',
  'exitPrice',
  'enteredAt',
  'exitedAt',
  'fees',
  'pointValueSnapshot',
  'pnlPoints',
  'grossPnl',
  'netPnl',
  'notes',
];

// A stand-in for the Prisma client with only the two calls the service makes.
function fakePrisma(instruments = INSTRUMENTS) {
  return {
    instrument: {
      findUnique: vi.fn(async ({ where }) => {
        const row = instruments[where.id];
        return row ? { pointValue: row.pointValue, tickSize: row.tickSize } : null;
      }),
    },
    trade: {
      create: vi.fn(async ({ data }) => ({ id: 1, ...data })),
    },
  };
}

function openTrade(overrides = {}) {
  return {
    instrumentId: ID.MNQ,
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

// The `data` object the service passed to prisma.trade.create.
function createdData(prisma) {
  expect(prisma.trade.create).toHaveBeenCalledTimes(1);
  return prisma.trade.create.mock.calls[0][0].data;
}

// Runs createTrade expecting a ValidationError and returns its issues.
async function validationIssues(prisma, input) {
  const error = await createTrade(prisma, input).catch((caught) => caught);
  expect(error).toBeInstanceOf(ValidationError);
  return error.issues;
}

describe('createTrade', () => {
  describe('OPEN trades', () => {
    it('snapshots the point value and stores no exit or P&L', async () => {
      const prisma = fakePrisma();

      const trade = await createTrade(prisma, openTrade({ notes: 'Opening range' }));

      expect(prisma.instrument.findUnique).toHaveBeenCalledWith({
        where: { id: ID.MNQ },
        select: { pointValue: true, tickSize: true },
      });
      const data = createdData(prisma);
      expect(Object.keys(data).sort()).toEqual([...DATA_KEYS].sort());
      expect(data).toEqual({
        instrumentId: ID.MNQ,
        direction: 'LONG',
        status: 'OPEN',
        quantity: 2,
        entryPrice: '18000.00',
        exitPrice: null,
        enteredAt: new Date('2026-09-30T14:30:00Z'),
        exitedAt: null,
        fees: '0',
        pointValueSnapshot: '2',
        pnlPoints: null,
        grossPnl: null,
        netPnl: null,
        notes: 'Opening range',
      });
      expect(trade).toEqual({ id: 1, ...data });
    });

    it('stores missing notes as null', async () => {
      const prisma = fakePrisma();

      await createTrade(prisma, openTrade());

      expect(createdData(prisma).notes).toBeNull();
    });
  });

  describe('CLOSED trades', () => {
    it('stores the DATA_MODEL example P&L (LONG 2 MNQ)', async () => {
      const prisma = fakePrisma();

      await createTrade(prisma, closedTrade());

      const data = createdData(prisma);
      expect(Object.keys(data).sort()).toEqual([...DATA_KEYS].sort());
      expect(data).toEqual({
        instrumentId: ID.MNQ,
        direction: 'LONG',
        status: 'CLOSED',
        quantity: 2,
        entryPrice: '18000.00',
        exitPrice: '18010.25',
        enteredAt: new Date('2026-09-30T14:30:00Z'),
        exitedAt: new Date('2026-09-30T15:00:00Z'),
        fees: '2.48',
        pointValueSnapshot: '2',
        pnlPoints: '10.25',
        grossPnl: '41.00',
        netPnl: '38.52',
        notes: null,
      });
    });

    it.each([
      // [label, symbol, direction, entry, exit, qty, fees, pnlPoints, gross, net]
      ['ES SHORT win', 'ES', 'SHORT', '5000.75', '4990.00', 1, '2.50', '10.75', '537.50', '535.00'],
      [
        'NQ LONG loss',
        'NQ',
        'LONG',
        '18000.50',
        '17990.25',
        2,
        '9.00',
        '-10.25',
        '-410.00',
        '-419.00',
      ],
      [
        'MES break-even with fees',
        'MES',
        'SHORT',
        '5000.25',
        '5000.25',
        3,
        '3.72',
        '0.00',
        '0.00',
        '-3.72',
      ],
    ])(
      '%s',
      async (
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
        const prisma = fakePrisma();

        await createTrade(
          prisma,
          closedTrade({
            instrumentId: ID[symbol],
            direction,
            entryPrice,
            exitPrice,
            quantity,
            fees,
          }),
        );

        const data = createdData(prisma);
        expect(data.pointValueSnapshot).toBe(INSTRUMENTS[ID[symbol]].pointValue.toFixed());
        expect(data).toMatchObject({ pnlPoints, grossPnl, netPnl });
      },
    );

    it('takes the snapshot and the P&L from the instrument row', async () => {
      const prisma = fakePrisma({
        7: { pointValue: new Decimal('12.00'), tickSize: new Decimal('0.2500') },
      });

      await createTrade(prisma, closedTrade({ instrumentId: 7, quantity: 1, fees: '0' }));

      expect(createdData(prisma)).toMatchObject({
        pointValueSnapshot: '12',
        pnlPoints: '10.25',
        grossPnl: '123.00',
        netPnl: '123.00',
      });
    });

    it('needs only toFixed() from the decimal values Prisma returns', async () => {
      const prisma = fakePrisma({
        7: { pointValue: { toFixed: () => '20' }, tickSize: { toFixed: () => '0.25' } },
      });

      await createTrade(prisma, closedTrade({ instrumentId: 7, quantity: 1, fees: '4.50' }));

      expect(createdData(prisma)).toMatchObject({
        pointValueSnapshot: '20',
        pnlPoints: '10.25',
        grossPnl: '205.00',
        netPnl: '200.50',
      });
    });
  });

  describe('server-owned fields from the client', () => {
    const clientValues = {
      id: 99,
      pointValueSnapshot: '999.00',
      pnlPoints: '1.00',
      grossPnl: '1000000.00',
      netPnl: '1000000.00',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    };

    it('ignores them for an OPEN trade', async () => {
      const prisma = fakePrisma();

      await createTrade(prisma, openTrade(clientValues));

      const data = createdData(prisma);
      expect(Object.keys(data).sort()).toEqual([...DATA_KEYS].sort());
      expect(data).toMatchObject({
        pointValueSnapshot: '2',
        pnlPoints: null,
        grossPnl: null,
        netPnl: null,
      });
    });

    it('ignores them for a CLOSED trade', async () => {
      const prisma = fakePrisma();

      await createTrade(prisma, closedTrade(clientValues));

      const data = createdData(prisma);
      expect(Object.keys(data).sort()).toEqual([...DATA_KEYS].sort());
      expect(data).toMatchObject({
        pointValueSnapshot: '2',
        pnlPoints: '10.25',
        grossPnl: '41.00',
        netPnl: '38.52',
      });
    });
  });

  describe('rejections', () => {
    it.each(['instrumntId', 'foo'])('rejects the unknown field %s', async (field) => {
      const prisma = fakePrisma();

      const issues = await validationIssues(prisma, openTrade({ [field]: 1 }));

      expect(issues).toEqual([{ path: [field], message: 'is not a known field' }]);
      expect(prisma.instrument.findUnique).not.toHaveBeenCalled();
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it('reports schema issues by field without touching the database', async () => {
      const prisma = fakePrisma();

      const issues = await validationIssues(prisma, openTrade({ exitPrice: '18010.25' }));

      expect(issues).toEqual([
        { path: ['exitPrice'], message: 'must be empty while the trade is OPEN' },
      ]);
      expect(prisma.instrument.findUnique).not.toHaveBeenCalled();
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it('rejects an instrument that does not exist', async () => {
      const prisma = fakePrisma();

      const issues = await validationIssues(prisma, openTrade({ instrumentId: 42 }));

      expect(issues).toEqual([{ path: ['instrumentId'], message: 'instrument 42 does not exist' }]);
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it.each([
      ['entryPrice', openTrade({ entryPrice: '18000.10' })],
      ['exitPrice', closedTrade({ exitPrice: '18010.30' })],
    ])('rejects an off-tick %s', async (field, input) => {
      const prisma = fakePrisma();

      const issues = await validationIssues(prisma, input);

      expect(issues).toEqual([
        { path: [field], message: "must be a multiple of the instrument's tick size (0.25)" },
      ]);
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it('reports both prices when both are off-tick', async () => {
      const prisma = fakePrisma();

      const issues = await validationIssues(
        prisma,
        closedTrade({ entryPrice: '18000.10', exitPrice: '18010.30' }),
      );

      expect(issues.map((issue) => issue.path)).toEqual([['entryPrice'], ['exitPrice']]);
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it("uses the instrument's own tick size", async () => {
      const prisma = fakePrisma({
        7: { pointValue: new Decimal('10.00'), tickSize: new Decimal('0.1000') },
      });

      await createTrade(
        prisma,
        closedTrade({ instrumentId: 7, entryPrice: '18000.10', exitPrice: '18000.30', fees: '0' }),
      );

      expect(createdData(prisma)).toMatchObject({ pnlPoints: '0.20', grossPnl: '4.00' });
    });

    it('rejects P&L too large for its columns', async () => {
      const prisma = fakePrisma();

      // 9999999999.50 points × 20 × 10 = 1999999999900.00, over Decimal(14,2).
      const issues = await validationIssues(
        prisma,
        closedTrade({
          instrumentId: ID.NQ,
          entryPrice: '0.25',
          exitPrice: '9999999999.75',
          quantity: 10,
          fees: '0',
        }),
      );

      expect(issues).toEqual([
        { path: [], message: 'grossPnl 1999999999900.00 is too large to store' },
        { path: [], message: 'netPnl 1999999999900.00 is too large to store' },
      ]);
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });
  });

  describe('behaviour', () => {
    it('passes errors from prisma.trade.create through unchanged', async () => {
      const prisma = fakePrisma();
      const dbError = new Error('connection lost');
      prisma.trade.create.mockRejectedValueOnce(dbError);

      await expect(createTrade(prisma, openTrade())).rejects.toBe(dbError);
    });

    it('does not mutate its input', async () => {
      const input = closedTrade({ pointValueSnapshot: '999.00' });
      const copy = structuredClone(input);

      await createTrade(fakePrisma(), input);

      expect(input).toEqual(copy);
    });
  });
});
