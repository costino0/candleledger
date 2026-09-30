import Decimal from 'decimal.js';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

// Instrument rows as Prisma would return them. decimal.js Decimals stand in for the
// decimal-like values Prisma returns.
const INSTRUMENTS = {
  1: { pointValue: new Decimal('20.00'), tickSize: new Decimal('0.2500') },
  2: { pointValue: new Decimal('2.00'), tickSize: new Decimal('0.2500') },
};
const MNQ = 2;

const CREATED_AT = new Date('2026-09-30T15:01:02.345Z');
const DECIMAL_COLUMNS = [
  'entryPrice',
  'exitPrice',
  'fees',
  'pointValueSnapshot',
  'pnlPoints',
  'grossPnl',
  'netPnl',
];

// A stand-in for the Prisma client with only the two calls createTrade makes.
// Like Prisma, `trade.create` returns Decimal columns as decimal-like objects and adds
// the columns the database fills in.
function fakePrisma() {
  return {
    instrument: {
      findUnique: vi.fn(async ({ where }) => INSTRUMENTS[where.id] ?? null),
    },
    trade: {
      create: vi.fn(async ({ data }) => {
        const row = { id: 1, ...data, createdAt: CREATED_AT, updatedAt: CREATED_AT };
        for (const column of DECIMAL_COLUMNS) {
          if (row[column] !== null) row[column] = new Decimal(row[column]);
        }
        return row;
      }),
    },
  };
}

function openTrade(overrides = {}) {
  return {
    instrumentId: MNQ,
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

function postTrade(app, body) {
  return request(app).post('/api/trades').send(body);
}

// The paths of the issues in a 400 validation response.
function issuePaths(res) {
  return res.body.issues.map((issue) => issue.path);
}

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createApp', () => {
  it('requires a Prisma client', () => {
    expect(() => createApp()).toThrow(/Prisma client is required/);
  });
});

describe('app', () => {
  const app = createApp({ prisma: {} });

  it('responds to GET /api/health', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it.each(['/api/trades/1/extra', '/api/instrumentz'])(
    'returns the generic JSON 404 for GET %s',
    async (path) => {
      const res = await request(app).get(path);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    },
  );
});

describe('POST /api/trades', () => {
  describe('success', () => {
    it('creates an OPEN trade and returns 201 with the serialized trade', async () => {
      const prisma = fakePrisma();
      const res = await postTrade(createApp({ prisma }), openTrade());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: 1,
        instrumentId: MNQ,
        direction: 'LONG',
        status: 'OPEN',
        quantity: 2,
        entryPrice: '18000.00',
        exitPrice: null,
        enteredAt: '2026-09-30T14:30:00.000Z',
        exitedAt: null,
        fees: '0.00',
        pointValueSnapshot: '2.00',
        pnlPoints: null,
        grossPnl: null,
        netPnl: null,
        notes: null,
        createdAt: '2026-09-30T15:01:02.345Z',
        updatedAt: '2026-09-30T15:01:02.345Z',
      });
      expect(prisma.trade.create).toHaveBeenCalledTimes(1);
    });

    it('creates a CLOSED trade with server-computed P&L', async () => {
      const res = await postTrade(createApp({ prisma: fakePrisma() }), closedTrade());

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'CLOSED',
        entryPrice: '18000.00',
        exitPrice: '18010.25',
        exitedAt: '2026-09-30T15:00:00.000Z',
        fees: '2.48',
        pointValueSnapshot: '2.00',
        pnlPoints: '10.25',
        grossPnl: '41.00',
        netPnl: '38.52',
      });
    });

    it('sends every Decimal field as a string', async () => {
      const res = await postTrade(createApp({ prisma: fakePrisma() }), closedTrade());

      for (const field of DECIMAL_COLUMNS) {
        expect(typeof res.body[field], field).toBe('string');
      }
    });

    it('returns timestamps sent with a UTC offset as ISO strings in UTC', async () => {
      const res = await postTrade(
        createApp({ prisma: fakePrisma() }),
        openTrade({ enteredAt: '2026-09-30T10:30:00-04:00' }),
      );

      expect(res.status).toBe(201);
      expect(res.body.enteredAt).toBe('2026-09-30T14:30:00.000Z');
    });

    it('ignores server-owned fields sent by the client', async () => {
      const res = await postTrade(
        createApp({ prisma: fakePrisma() }),
        closedTrade({ id: 99, netPnl: '1000000.00', pointValueSnapshot: '999.00' }),
      );

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ id: 1, netPnl: '38.52', pointValueSnapshot: '2.00' });
    });
  });

  describe('validation errors', () => {
    it('returns 400 with an issue for each missing field', async () => {
      const prisma = fakePrisma();
      const res = await postTrade(createApp({ prisma }), {});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(issuePaths(res)).toEqual(
        expect.arrayContaining([
          ['instrumentId'],
          ['direction'],
          ['quantity'],
          ['entryPrice'],
          ['enteredAt'],
        ]),
      );
      for (const issue of res.body.issues) {
        expect(typeof issue.message).toBe('string');
      }
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it('rejects a price sent as a JSON number', async () => {
      const res = await postTrade(
        createApp({ prisma: fakePrisma() }),
        openTrade({ entryPrice: 18000.25 }),
      );

      expect(res.status).toBe(400);
      expect(issuePaths(res)).toEqual([['entryPrice']]);
    });

    it('rejects an unknown field at its own path', async () => {
      const res = await postTrade(
        createApp({ prisma: fakePrisma() }),
        openTrade({ instrumntId: MNQ }),
      );

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Validation failed',
        issues: [{ path: ['instrumntId'], message: 'is not a known field' }],
      });
    });

    it('rejects an instrument that does not exist', async () => {
      const prisma = fakePrisma();
      const res = await postTrade(createApp({ prisma }), openTrade({ instrumentId: 404 }));

      expect(res.status).toBe(400);
      expect(issuePaths(res)).toEqual([['instrumentId']]);
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it("rejects a price that is not a multiple of the instrument's tick size", async () => {
      const prisma = fakePrisma();
      const res = await postTrade(createApp({ prisma }), openTrade({ entryPrice: '18000.10' }));

      expect(res.status).toBe(400);
      expect(issuePaths(res)).toEqual([['entryPrice']]);
      expect(prisma.trade.create).not.toHaveBeenCalled();
    });

    it('rejects a JSON array body', async () => {
      const res = await postTrade(createApp({ prisma: fakePrisma() }), [openTrade()]);

      expect(res.status).toBe(400);
      expect(issuePaths(res)).toEqual([[]]);
    });

    it('rejects a request with no body', async () => {
      const res = await request(createApp({ prisma: fakePrisma() })).post('/api/trades');

      expect(res.status).toBe(400);
      expect(issuePaths(res)).toEqual([[]]);
    });

    it('rejects a body that is not sent as JSON', async () => {
      const res = await request(createApp({ prisma: fakePrisma() }))
        .post('/api/trades')
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(openTrade()));

      expect(res.status).toBe(400);
      expect(issuePaths(res)).toEqual([[]]);
    });

    it('returns a JSON 400 for malformed JSON', async () => {
      const prisma = fakePrisma();
      const res = await request(createApp({ prisma }))
        .post('/api/trades')
        .set('Content-Type', 'application/json')
        .send('{"instrumentId": 2,');

      expect(res.status).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({ error: 'Malformed JSON body' });
      expect(prisma.instrument.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('unexpected errors', () => {
    it('returns 500 without leaking the message when the insert fails', async () => {
      const consoleError = silenceConsoleError();
      const prisma = fakePrisma();
      prisma.trade.create.mockRejectedValue(new Error('connection lost'));

      const res = await postTrade(createApp({ prisma }), openTrade());

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(res.text).not.toContain('connection lost');
      expect(consoleError).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when the instrument lookup fails', async () => {
      silenceConsoleError();
      const prisma = fakePrisma();
      prisma.instrument.findUnique.mockRejectedValue(new Error('timeout'));

      const res = await postTrade(createApp({ prisma }), openTrade());

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    it('returns 500, not 400, for a database constraint error', async () => {
      silenceConsoleError();
      const prisma = fakePrisma();
      const foreignKeyError = Object.assign(new Error('Foreign key constraint violated'), {
        code: 'P2003',
      });
      prisma.trade.create.mockRejectedValue(foreignKeyError);

      const res = await postTrade(createApp({ prisma }), openTrade());

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    it('returns 500 for an error that has issues but is not a ValidationError', async () => {
      silenceConsoleError();
      const prisma = fakePrisma();
      const lookalike = Object.assign(new Error('not validation'), {
        issues: [{ path: ['entryPrice'], message: 'bad' }],
      });
      prisma.trade.create.mockRejectedValue(lookalike);

      const res = await postTrade(createApp({ prisma }), openTrade());

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });
});

// Full Instrument rows as Prisma would return them, in id order.
const INSTRUMENT_ROWS = [
  { id: 1, symbol: 'NQ', name: 'E-mini Nasdaq-100', pointValue: '20', tickSize: '0.25' },
  { id: 2, symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', pointValue: '2', tickSize: '0.25' },
  { id: 3, symbol: 'ES', name: 'E-mini S&P 500', pointValue: '50', tickSize: '0.25' },
  { id: 4, symbol: 'MES', name: 'Micro E-mini S&P 500', pointValue: '5', tickSize: '0.25' },
].map((row) => ({
  ...row,
  pointValue: new Decimal(row.pointValue),
  tickSize: new Decimal(row.tickSize),
}));

// A full Trade row as Prisma would return it.
function tradeRow(overrides = {}) {
  return {
    id: 7,
    instrumentId: MNQ,
    direction: 'LONG',
    status: 'CLOSED',
    quantity: 2,
    entryPrice: new Decimal('18000'),
    exitPrice: new Decimal('18010.25'),
    enteredAt: new Date('2026-09-30T14:30:00Z'),
    exitedAt: new Date('2026-09-30T15:00:00Z'),
    fees: new Decimal('2.48'),
    pointValueSnapshot: new Decimal('2'),
    pnlPoints: new Decimal('10.25'),
    grossPnl: new Decimal('41'),
    netPnl: new Decimal('38.52'),
    notes: 'Breakout',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

const SERIALIZED_TRADE = {
  id: 7,
  instrumentId: MNQ,
  direction: 'LONG',
  status: 'CLOSED',
  quantity: 2,
  entryPrice: '18000.00',
  exitPrice: '18010.25',
  enteredAt: '2026-09-30T14:30:00.000Z',
  exitedAt: '2026-09-30T15:00:00.000Z',
  fees: '2.48',
  pointValueSnapshot: '2.00',
  pnlPoints: '10.25',
  grossPnl: '41.00',
  netPnl: '38.52',
  notes: 'Breakout',
  createdAt: '2026-09-30T15:01:02.345Z',
  updatedAt: '2026-09-30T15:01:02.345Z',
};

// A stand-in for the Prisma client with only the read calls.
function fakeReadPrisma({ instruments = INSTRUMENT_ROWS, trades = [] } = {}) {
  return {
    instrument: {
      findMany: vi.fn(async () => instruments),
    },
    trade: {
      findMany: vi.fn(async () => trades),
      findUnique: vi.fn(async ({ where }) => trades.find((t) => t.id === where.id) ?? null),
    },
  };
}

describe('GET /api/instruments', () => {
  it('returns every instrument in id order with fixed-scale Decimal strings', async () => {
    const prisma = fakeReadPrisma();
    const res = await request(createApp({ prisma })).get('/api/instruments');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, symbol: 'NQ', name: 'E-mini Nasdaq-100', pointValue: '20.00', tickSize: '0.2500' },
      {
        id: 2,
        symbol: 'MNQ',
        name: 'Micro E-mini Nasdaq-100',
        pointValue: '2.00',
        tickSize: '0.2500',
      },
      { id: 3, symbol: 'ES', name: 'E-mini S&P 500', pointValue: '50.00', tickSize: '0.2500' },
      {
        id: 4,
        symbol: 'MES',
        name: 'Micro E-mini S&P 500',
        pointValue: '5.00',
        tickSize: '0.2500',
      },
    ]);
    expect(prisma.instrument.findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } });
  });

  it('returns 500 without leaking the message when the query fails', async () => {
    silenceConsoleError();
    const prisma = fakeReadPrisma();
    prisma.instrument.findMany.mockRejectedValue(new Error('connection lost'));

    const res = await request(createApp({ prisma })).get('/api/instruments');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/trades', () => {
  it('returns the serialized trades in the order the query returns them', async () => {
    const newer = tradeRow({ id: 8, enteredAt: new Date('2026-10-01T14:30:00Z') });
    const prisma = fakeReadPrisma({ trades: [newer, tradeRow()] });

    const res = await request(createApp({ prisma })).get('/api/trades');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { ...SERIALIZED_TRADE, id: 8, enteredAt: '2026-10-01T14:30:00.000Z' },
      SERIALIZED_TRADE,
    ]);
    expect(prisma.trade.findMany).toHaveBeenCalledWith({
      orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('returns an empty array when there are no trades', async () => {
    const res = await request(createApp({ prisma: fakeReadPrisma() })).get('/api/trades');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 when the query fails', async () => {
    silenceConsoleError();
    const prisma = fakeReadPrisma();
    prisma.trade.findMany.mockRejectedValue(new Error('connection lost'));

    const res = await request(createApp({ prisma })).get('/api/trades');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});

describe('GET /api/trades/:id', () => {
  it('returns the serialized trade', async () => {
    const prisma = fakeReadPrisma({ trades: [tradeRow()] });
    const res = await request(createApp({ prisma })).get('/api/trades/7');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(SERIALIZED_TRADE);
    expect(prisma.trade.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('returns a JSON 404 when no trade has the id', async () => {
    const res = await request(createApp({ prisma: fakeReadPrisma() })).get('/api/trades/999');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Trade not found' });
  });

  it.each(['abc', '0', '-1', '01', '1.5', '1e3', '%201', '2147483648'])(
    'returns a 400 validation error for the id %j without querying',
    async (id) => {
      const prisma = fakeReadPrisma({ trades: [tradeRow({ id: 1 })] });
      const res = await request(createApp({ prisma })).get(`/api/trades/${id}`);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Validation failed',
        issues: [
          { path: ['id'], message: 'must be a positive integer no greater than 2147483647' },
        ],
      });
      expect(prisma.trade.findUnique).not.toHaveBeenCalled();
    },
  );

  it('returns 500 when the query fails', async () => {
    silenceConsoleError();
    const prisma = fakeReadPrisma();
    prisma.trade.findUnique.mockRejectedValue(new Error('connection lost'));

    const res = await request(createApp({ prisma })).get('/api/trades/7');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('returns 500, not 404, for a database error that mentions "not found"', async () => {
    silenceConsoleError();
    const prisma = fakeReadPrisma();
    const prismaNotFound = Object.assign(new Error('Record to update not found.'), {
      code: 'P2025',
    });
    prisma.trade.findUnique.mockRejectedValue(prismaNotFound);

    const res = await request(createApp({ prisma })).get('/api/trades/7');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });
});
