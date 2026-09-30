import Decimal from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../errors.js';
import { createTrade, deleteTrade, getTrade, listTrades, updateTrade } from './trades.js';

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

describe('listTrades', () => {
  it('returns every trade, newest entry first, then highest id first', async () => {
    const rows = [{ id: 2 }, { id: 1 }];
    const prisma = { trade: { findMany: vi.fn(async () => rows) } };

    await expect(listTrades(prisma)).resolves.toBe(rows);
    expect(prisma.trade.findMany).toHaveBeenCalledWith({
      orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('returns an empty array when there are no trades', async () => {
    const prisma = { trade: { findMany: vi.fn(async () => []) } };

    await expect(listTrades(prisma)).resolves.toEqual([]);
  });
});

describe('getTrade', () => {
  function prismaWith(row) {
    return { trade: { findUnique: vi.fn(async () => row) } };
  }

  it('looks the trade up by its numeric id and returns the row', async () => {
    const row = { id: 7 };
    const prisma = prismaWith(row);

    await expect(getTrade(prisma, '7')).resolves.toBe(row);
    expect(prisma.trade.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('throws NotFoundError with a fixed message when no trade has the id', async () => {
    const error = await getTrade(prismaWith(null), '7').catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('Trade not found');
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648'])(
    'throws ValidationError at path ["id"] for %j without querying',
    async (raw) => {
      const prisma = prismaWith({ id: 1 });
      const error = await getTrade(prisma, raw).catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.issues).toEqual([
        { path: ['id'], message: 'must be a positive integer no greater than 2147483647' },
      ]);
      expect(prisma.trade.findUnique).not.toHaveBeenCalled();
    },
  );

  it('passes errors from prisma.trade.findUnique through unchanged', async () => {
    const dbError = new Error('connection lost');
    const prisma = { trade: { findUnique: vi.fn().mockRejectedValue(dbError) } };

    await expect(getTrade(prisma, '1')).rejects.toBe(dbError);
  });
});

describe('updateTrade', () => {
  // Stored trade 5 is an MNQ trade whose snapshot is 2.00.
  const TRADE_ID = 5;

  // A stand-in for the Prisma client with only the calls updateTrade makes. `existing` is
  // what the trade lookup selects; `instruments` maps ids to { pointValue, tickSize }.
  function fakeUpdatePrisma({
    existing = { instrumentId: ID.MNQ, pointValueSnapshot: new Decimal('2.00') },
    instruments = INSTRUMENTS,
  } = {}) {
    return {
      trade: {
        findUnique: vi.fn(async () => existing),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      instrument: {
        findUnique: vi.fn(async ({ where }) => {
          const row = instruments[where.id];
          return row ? { pointValue: row.pointValue, tickSize: row.tickSize } : null;
        }),
      },
    };
  }

  // Full replacement bodies: status and fees are always sent.
  function openBody(overrides = {}) {
    return openTrade({ status: 'OPEN', fees: '0', ...overrides });
  }
  function closedBody(overrides = {}) {
    return closedTrade(overrides);
  }

  // The `data` passed to the single trade.update call.
  function updateData(prisma) {
    expect(prisma.trade.update).toHaveBeenCalledTimes(1);
    return prisma.trade.update.mock.calls[0][0].data;
  }

  const NULL_EXIT_AND_PNL = {
    exitPrice: null,
    exitedAt: null,
    pnlPoints: null,
    grossPnl: null,
    netPnl: null,
  };

  function prismaKnownError(code, message) {
    return Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code });
  }

  describe('transitions', () => {
    it('OPEN → OPEN: writes the edited fields with null exit and P&L', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(prisma, String(TRADE_ID), openBody({ quantity: 5, notes: 'scaled' }));

      expect(updateData(prisma)).toEqual({
        instrumentId: ID.MNQ,
        direction: 'LONG',
        status: 'OPEN',
        quantity: 5,
        entryPrice: '18000.00',
        enteredAt: new Date('2026-09-30T14:30:00Z'),
        fees: '0',
        pointValueSnapshot: '2',
        notes: 'scaled',
        ...NULL_EXIT_AND_PNL,
      });
    });

    it('OPEN → CLOSED: calculates P&L from the stored snapshot', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(prisma, String(TRADE_ID), closedBody());

      expect(updateData(prisma)).toMatchObject({
        status: 'CLOSED',
        exitPrice: '18010.25',
        exitedAt: new Date('2026-09-30T15:00:00Z'),
        pointValueSnapshot: '2',
        pnlPoints: '10.25',
        grossPnl: '41.00',
        netPnl: '38.52',
      });
    });

    it('CLOSED → OPEN: overwrites exit and P&L fields with null', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(prisma, String(TRADE_ID), openBody());

      expect(updateData(prisma)).toMatchObject({ status: 'OPEN', ...NULL_EXIT_AND_PNL });
    });

    it('CLOSED → CLOSED: recalculates P&L even when only notes change', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(prisma, String(TRADE_ID), closedBody({ notes: 'reviewed' }));

      expect(updateData(prisma)).toMatchObject({
        notes: 'reviewed',
        pnlPoints: '10.25',
        grossPnl: '41.00',
        netPnl: '38.52',
      });
    });

    it('CLOSED → CLOSED: uses the new quantity and fees', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(prisma, String(TRADE_ID), closedBody({ quantity: 3, fees: '3.72' }));

      // 10.25 × 2 × 3 = 61.50; 61.50 − 3.72 = 57.78
      expect(updateData(prisma)).toMatchObject({ grossPnl: '61.50', netPnl: '57.78' });
    });
  });

  describe('instrument and snapshot', () => {
    it("keeps the stored snapshot when the instrument is unchanged, even if the instrument's point value changed", async () => {
      const prisma = fakeUpdatePrisma({
        instruments: {
          ...INSTRUMENTS,
          [ID.MNQ]: { pointValue: new Decimal('4.00'), tickSize: new Decimal('0.2500') },
        },
      });

      await updateTrade(prisma, String(TRADE_ID), closedBody());

      expect(updateData(prisma)).toMatchObject({
        pointValueSnapshot: '2',
        grossPnl: '41.00',
        netPnl: '38.52',
      });
    });

    it('takes a new snapshot when an OPEN trade changes instrument', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(prisma, String(TRADE_ID), openBody({ instrumentId: ID.NQ }));

      expect(updateData(prisma)).toMatchObject({
        instrumentId: ID.NQ,
        pointValueSnapshot: '20',
        ...NULL_EXIT_AND_PNL,
      });
    });

    it('takes a new snapshot and recalculates P&L in the same update when a CLOSED trade changes instrument', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(prisma, String(TRADE_ID), closedBody({ instrumentId: ID.NQ }));

      // 10.25 × 20 × 2 = 410.00; 410.00 − 2.48 = 407.52
      expect(updateData(prisma)).toMatchObject({
        instrumentId: ID.NQ,
        pointValueSnapshot: '20',
        pnlPoints: '10.25',
        grossPnl: '410.00',
        netPnl: '407.52',
      });
    });

    it("checks prices against the new instrument's tick size", async () => {
      const prisma = fakeUpdatePrisma({
        instruments: {
          ...INSTRUMENTS,
          9: { pointValue: new Decimal('10.00'), tickSize: new Decimal('0.5000') },
        },
      });

      // 18010.25 fits MNQ's 0.25 tick but not the new instrument's 0.50 tick.
      const error = await updateTrade(
        prisma,
        String(TRADE_ID),
        closedBody({ instrumentId: 9 }),
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.issues).toEqual([
        { path: ['exitPrice'], message: "must be a multiple of the instrument's tick size (0.5)" },
      ]);
      expect(prisma.trade.update).not.toHaveBeenCalled();
    });

    it('rejects an instrument that does not exist', async () => {
      const prisma = fakeUpdatePrisma();

      const error = await updateTrade(
        prisma,
        String(TRADE_ID),
        openBody({ instrumentId: 404 }),
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.issues).toEqual([
        { path: ['instrumentId'], message: 'instrument 404 does not exist' },
      ]);
      expect(prisma.trade.update).not.toHaveBeenCalled();
    });
  });

  describe('server-owned fields from the client', () => {
    it('ignores stale P&L, snapshot and id values, updating the trade from the URL', async () => {
      const prisma = fakeUpdatePrisma();

      await updateTrade(
        prisma,
        String(TRADE_ID),
        closedBody({
          id: 99,
          pointValueSnapshot: '999.00',
          pnlPoints: '1.00',
          grossPnl: '1.00',
          netPnl: '1000000.00',
          createdAt: '2020-01-01T00:00:00Z',
          updatedAt: '2020-01-01T00:00:00Z',
        }),
      );

      const { where, data } = prisma.trade.update.mock.calls[0][0];
      expect(where).toEqual({ id: TRADE_ID });
      expect(data).toMatchObject({
        pointValueSnapshot: '2',
        pnlPoints: '10.25',
        grossPnl: '41.00',
        netPnl: '38.52',
      });
      expect(data).not.toHaveProperty('id');
      expect(data).not.toHaveProperty('createdAt');
      expect(data).not.toHaveProperty('updatedAt');
    });
  });

  describe('rejections', () => {
    it.each(['abc', '0', '-1', '1.5', '2147483648'])(
      'rejects the id %j without querying',
      async (raw) => {
        const prisma = fakeUpdatePrisma();
        const error = await updateTrade(prisma, raw, openBody()).catch((e) => e);

        expect(error).toBeInstanceOf(ValidationError);
        expect(error.issues).toEqual([
          { path: ['id'], message: 'must be a positive integer no greater than 2147483647' },
        ]);
        expect(prisma.trade.findUnique).not.toHaveBeenCalled();
      },
    );

    it('throws NotFoundError when the initial lookup finds no trade', async () => {
      const prisma = fakeUpdatePrisma({ existing: null });
      const error = await updateTrade(prisma, '404', openBody()).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Trade not found');
      expect(prisma.trade.findUnique).toHaveBeenCalledWith({
        where: { id: 404 },
        select: { instrumentId: true, pointValueSnapshot: true },
      });
      expect(prisma.trade.update).not.toHaveBeenCalled();
    });

    it('checks that the trade exists before validating the body', async () => {
      const prisma = fakeUpdatePrisma({ existing: null });
      const error = await updateTrade(prisma, '404', {}).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundError);
      expect(prisma.instrument.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an invalid body without updating', async () => {
      const prisma = fakeUpdatePrisma();
      const error = await updateTrade(prisma, String(TRADE_ID), openTrade()).catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.issues.map((issue) => issue.path)).toEqual([['status'], ['fees']]);
      expect(prisma.trade.update).not.toHaveBeenCalled();
    });

    it('rejects P&L too large for its column', async () => {
      const prisma = fakeUpdatePrisma();
      const error = await updateTrade(
        prisma,
        String(TRADE_ID),
        closedBody({
          instrumentId: ID.NQ,
          entryPrice: '0.25',
          exitPrice: '9999999999.75',
          quantity: 10,
          fees: '0',
        }),
      ).catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.issues.map((issue) => issue.message)).toEqual([
        'grossPnl 1999999999900.00 is too large to store',
        'netPnl 1999999999900.00 is too large to store',
      ]);
      expect(prisma.trade.update).not.toHaveBeenCalled();
    });
  });

  describe('behaviour', () => {
    it('makes exactly one update, writing every writable column', async () => {
      const prisma = fakeUpdatePrisma();

      const result = await updateTrade(prisma, String(TRADE_ID), closedBody());

      expect(prisma.trade.update).toHaveBeenCalledTimes(1);
      const { where, data } = prisma.trade.update.mock.calls[0][0];
      expect(where).toEqual({ id: TRADE_ID });
      expect(Object.keys(data).sort()).toEqual([...DATA_KEYS].sort());
      expect(result).toEqual({ id: TRADE_ID, ...data });
    });

    it('throws NotFoundError when the trade is deleted before the update runs', async () => {
      const prisma = fakeUpdatePrisma();
      prisma.trade.update.mockRejectedValue(
        prismaKnownError(
          'P2025',
          'An operation failed because it depends on one or more records that were required but not found',
        ),
      );

      const error = await updateTrade(prisma, String(TRADE_ID), openBody()).catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Trade not found');
    });

    it.each([
      ['a plain error', new Error('connection lost')],
      ['a different Prisma error code', prismaKnownError('P2003', 'Foreign key constraint')],
      [
        'a P2025 code on an error that is not from Prisma',
        Object.assign(new Error('x'), { code: 'P2025' }),
      ],
    ])('passes %s from trade.update through unchanged', async (_, dbError) => {
      const prisma = fakeUpdatePrisma();
      prisma.trade.update.mockRejectedValue(dbError);

      await expect(updateTrade(prisma, String(TRADE_ID), openBody())).rejects.toBe(dbError);
    });

    it('passes errors from the initial trade lookup through unchanged', async () => {
      const prisma = fakeUpdatePrisma();
      const dbError = prismaKnownError('P2025', 'not found');
      prisma.trade.findUnique.mockRejectedValue(dbError);

      await expect(updateTrade(prisma, String(TRADE_ID), openBody())).rejects.toBe(dbError);
    });

    it('does not mutate its input', async () => {
      const input = closedBody({ pointValueSnapshot: '999.00' });
      const copy = structuredClone(input);

      await updateTrade(fakeUpdatePrisma(), String(TRADE_ID), input);

      expect(input).toEqual(copy);
    });
  });
});

describe('deleteTrade', () => {
  // Only `delete` exists, so any other call (such as a lookup first) would throw.
  function fakeDeletePrisma() {
    return { trade: { delete: vi.fn(async ({ where }) => ({ id: where.id })) } };
  }

  function prismaKnownError(code, message) {
    return Object.assign(new Error(message), { name: 'PrismaClientKnownRequestError', code });
  }

  it('deletes the trade by its numeric id with one delete and no lookup', async () => {
    const prisma = fakeDeletePrisma();

    await expect(deleteTrade(prisma, '7')).resolves.toBeUndefined();
    expect(prisma.trade.delete).toHaveBeenCalledTimes(1);
    expect(prisma.trade.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648'])(
    'throws ValidationError at path ["id"] for %j without deleting',
    async (raw) => {
      const prisma = fakeDeletePrisma();
      const error = await deleteTrade(prisma, raw).catch((e) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.issues).toEqual([
        { path: ['id'], message: 'must be a positive integer no greater than 2147483647' },
      ]);
      expect(prisma.trade.delete).not.toHaveBeenCalled();
    },
  );

  it('throws NotFoundError with a fixed message when no trade has the id', async () => {
    const prisma = fakeDeletePrisma();
    prisma.trade.delete.mockRejectedValue(
      prismaKnownError(
        'P2025',
        'An operation failed because it depends on one or more records that were required but not found',
      ),
    );

    const error = await deleteTrade(prisma, '7').catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('Trade not found');
  });

  it.each([
    ['a plain error', new Error('connection lost')],
    ['a different Prisma error code', prismaKnownError('P2003', 'Foreign key constraint')],
    [
      'a P2025 code on an error that is not from Prisma',
      Object.assign(new Error('x'), { code: 'P2025' }),
    ],
  ])('passes %s from trade.delete through unchanged', async (_, dbError) => {
    const prisma = fakeDeletePrisma();
    prisma.trade.delete.mockRejectedValue(dbError);

    await expect(deleteTrade(prisma, '7')).rejects.toBe(dbError);
  });
});
