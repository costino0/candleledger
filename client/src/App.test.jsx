import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const INSTRUMENTS = [
  { id: 1, symbol: 'NQ', name: 'E-mini Nasdaq-100', pointValue: '20.00', tickSize: '0.2500' },
  { id: 2, symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', pointValue: '2.00', tickSize: '0.2500' },
  { id: 3, symbol: 'ES', name: 'E-mini S&P 500', pointValue: '50.00', tickSize: '0.2500' },
  { id: 4, symbol: 'MES', name: 'Micro E-mini S&P 500', pointValue: '5.00', tickSize: '0.2500' },
];

const OPEN_TRADE = {
  id: 3,
  instrumentId: 1,
  direction: 'LONG',
  status: 'OPEN',
  quantity: 1,
  entryPrice: '18000.00',
  exitPrice: null,
  enteredAt: '2026-09-30T16:00:00.000Z',
  exitedAt: null,
  fees: '1.24',
  pointValueSnapshot: '20.00',
  pnlPoints: null,
  grossPnl: null,
  netPnl: null,
  notes: null,
  createdAt: '2026-09-30T16:00:01.000Z',
  updatedAt: '2026-09-30T16:00:01.000Z',
};

const LOSING_TRADE = {
  id: 2,
  instrumentId: 2,
  direction: 'SHORT',
  status: 'CLOSED',
  quantity: 2,
  entryPrice: '18000.00',
  exitPrice: '18005.75',
  enteredAt: '2026-09-30T14:30:00.000Z',
  exitedAt: '2026-09-30T15:00:00.000Z',
  fees: '2.50',
  pointValueSnapshot: '2.00',
  pnlPoints: '-5.75',
  grossPnl: '-23.00',
  netPnl: '-25.50',
  notes: 'chased the move',
  createdAt: '2026-09-30T15:01:00.000Z',
  updatedAt: '2026-09-30T15:01:00.000Z',
};

const WINNING_TRADE = {
  ...LOSING_TRADE,
  id: 1,
  instrumentId: 3,
  direction: 'LONG',
  quantity: 1,
  entryPrice: '5000.00',
  exitPrice: '5002.00',
  enteredAt: '2026-09-29T14:30:00.000Z',
  exitedAt: '2026-09-29T15:00:00.000Z',
  fees: '2.48',
  pointValueSnapshot: '50.00',
  pnlPoints: '2.00',
  grossPnl: '100.00',
  netPnl: '97.52',
  notes: null,
};

const STATS = {
  // More digits than a JavaScript number can hold, to prove the value is shown as sent.
  totalNetPnl: '12345678901234567.89',
  totalGrossPnl: '77.00',
  totalFees: '4.98',
  closedTrades: 2,
  openTrades: 1,
  wins: 1,
  losses: 1,
  breakEvens: 0,
  winRate: '50.00',
  averageWin: '97.52',
  averageLoss: '-25.50',
};

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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Stubs fetch with one response factory per API path. GET routes are keyed by path alone,
// other methods by "METHOD path". Each factory gets the request's init object.
function stubApi(overrides = {}) {
  const routes = {
    '/api/instruments': () => jsonResponse(INSTRUMENTS),
    '/api/trades': () => jsonResponse([OPEN_TRADE, LOSING_TRADE, WINNING_TRADE]),
    '/api/stats': () => jsonResponse(STATS),
    'POST /api/trades': () => jsonResponse(OPEN_TRADE, 201),
    ...overrides,
  };
  const fetchMock = vi.fn(async (path, init = {}) =>
    routes[init.method ? `${init.method} ${path}` : path](init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function statValue(label) {
  const summary = screen.getByRole('region', { name: 'Summary' });
  return within(summary).getByText(label).closest('.stat').querySelector('dd');
}

function rowCells(rowIndex) {
  const rows = within(screen.getByRole('table')).getAllByRole('row');
  return within(rows[rowIndex])
    .getAllByRole('cell')
    .map((cell) => cell.textContent);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('App', () => {
  it('shows a loading message until the data arrives', async () => {
    stubApi();
    render(<App />);

    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Loading journal…');
    await screen.findByRole('table');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('loads instruments, trades and stats from the API', async () => {
    const fetchMock = stubApi();
    render(<App />);
    await screen.findByRole('table');

    expect(fetchMock.mock.calls.map(([path]) => path).sort()).toEqual([
      '/api/instruments',
      '/api/stats',
      '/api/trades',
    ]);
  });

  it('shows the server stats without changing them', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('table');

    expect(statValue('Net P&L').textContent).toBe('$12,345,678,901,234,567.89');
    expect(statValue('Gross P&L').textContent).toBe('$77.00');
    expect(statValue('Fees').textContent).toBe('$4.98');
    expect(statValue('Win rate').textContent).toBe('50.00%');
    expect(screen.getByText('1W · 1L · 0BE')).toBeTruthy();
    expect(statValue('Average win').textContent).toBe('$97.52');
    expect(statValue('Average loss').textContent).toBe('-$25.50');
    expect(statValue('Closed trades').textContent).toBe('2');
    expect(statValue('Open trades').textContent).toBe('1');
  });

  it('colors P&L by sign but keeps fees neutral', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('table');

    expect(statValue('Net P&L').className).toBe('outcome-positive');
    expect(statValue('Average loss').className).toBe('outcome-negative');
    expect(statValue('Fees').className).toBe('');

    const losingRow = within(screen.getByRole('table')).getAllByRole('row')[2];
    const cells = within(losingRow).getAllByRole('cell');
    expect(cells[8].className).toBe('num outcome-negative'); // points
    expect(cells[9].className).toBe('num'); // fees
    expect(cells[10].className).toBe('num outcome-negative'); // net P&L
  });

  it('renders trades in server order, with symbols from the instruments response', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('table');

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual([
      'Entered',
      'Symbol',
      'Side',
      'Qty',
      'Status',
      'Entry',
      'Exit',
      'Exited',
      'Points',
      'Fees',
      'Net P&L',
    ]);

    expect(rowCells(2)).toEqual([
      expect.stringMatching(/^Sep 30, 2026, 2:30\sPM$/),
      'MNQ',
      'SHORT',
      '2',
      'CLOSED',
      '18,000.00',
      '18,005.75',
      expect.stringMatching(/^Sep 30, 2026, 3:00\sPM$/),
      '-5.75',
      '$2.50',
      '-$25.50',
    ]);
    expect(rowCells(3)[1]).toBe('ES');
  });

  it('shows dashes for the exit and P&L of an OPEN trade', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('table');

    expect(rowCells(1)).toEqual([
      expect.stringMatching(/^Sep 30, 2026, 4:00\sPM$/),
      'NQ',
      'LONG',
      '1',
      'OPEN',
      '18,000.00',
      '—',
      '—',
      '—',
      '$1.24',
      '—',
    ]);
  });

  it('puts the full UTC timestamp in the title of date cells', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('table');

    const time = screen.getByTitle('2026-09-30T14:30:00.000Z');
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('dateTime')).toBe('2026-09-30T14:30:00.000Z');
  });

  it('falls back to the instrument id when a trade has an unknown instrument', async () => {
    stubApi({ '/api/trades': () => jsonResponse([{ ...LOSING_TRADE, instrumentId: 99 }]) });
    render(<App />);
    await screen.findByRole('table');

    expect(rowCells(1)[1]).toBe('#99');
  });

  it('shows an empty state and zeroed stats when there are no trades', async () => {
    stubApi({
      '/api/trades': () => jsonResponse([]),
      '/api/stats': () => jsonResponse(EMPTY_STATS),
    });
    render(<App />);

    expect(await screen.findByText('No trades yet.')).toBeTruthy();
    expect(screen.getByText('Trades you record will appear here.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(statValue('Net P&L').textContent).toBe('$0.00');
    expect(statValue('Win rate').textContent).toBe('—');
    expect(statValue('Average win').textContent).toBe('—');
    expect(statValue('Average loss').textContent).toBe('—');
  });

  it('shows the error and no dashboard when any request fails', async () => {
    stubApi({ '/api/stats': () => jsonResponse({ error: 'Internal server error' }, 500) });
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load the journal.');
    expect(alert.textContent).toContain('Internal server error (HTTP 500)');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull();
  });

  it('loads again when Retry is clicked', async () => {
    let statsCalls = 0;
    const fetchMock = stubApi({
      '/api/stats': () => {
        statsCalls += 1;
        return statsCalls === 1
          ? jsonResponse({ error: 'Internal server error' }, 500)
          : jsonResponse(STATS);
      },
    });
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(screen.getByRole('status')).toBeTruthy();
    await screen.findByRole('table');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('does not show an error when StrictMode aborts the first load', async () => {
    // fetch honours the abort signal and otherwise waits until the test releases it.
    const pending = [];
    const aborted = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (path, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => {
              aborted.push(path);
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
            pending.push({ signal, release: () => resolve(stubResponse(path)) });
          }),
      ),
    );

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    // Let the aborted first load's rejections settle.
    await act(async () => {});

    expect(aborted).toHaveLength(3);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => {
      pending.filter(({ signal }) => !signal.aborted).forEach(({ release }) => release());
    });

    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

function stubResponse(path) {
  const bodies = {
    '/api/instruments': INSTRUMENTS,
    '/api/trades': [OPEN_TRADE, LOSING_TRADE, WINNING_TRADE],
    '/api/stats': STATS,
  };
  return jsonResponse(bodies[path]);
}

// The bodies of every POST /api/trades request the mock received.
function postedBodies(fetchMock) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([, init]) => JSON.parse(init.body));
}

function getCount(fetchMock) {
  return fetchMock.mock.calls.filter(([, init]) => !init?.method).length;
}

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add trade' }));
  return screen.getByRole('region', { name: 'Add trade' });
}

function change(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillOpenTrade() {
  change('Instrument', '2');
  change('Direction', 'SHORT');
  change('Entry price', '18000.25');
  change('Entered at', '2026-09-30T14:30');
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
}

describe('Add trade', () => {
  it('opens a form with instrument choices from the instruments response', async () => {
    stubApi();
    render(<App />);
    await openForm();

    const options = within(screen.getByLabelText('Instrument'))
      .getAllByRole('option')
      .map((option) => [option.value, option.textContent]);
    expect(options).toEqual([
      ['', 'Choose…'],
      ['1', 'NQ — E-mini Nasdaq-100'],
      ['2', 'MNQ — Micro E-mini Nasdaq-100'],
      ['3', 'ES — E-mini S&P 500'],
      ['4', 'MES — Micro E-mini S&P 500'],
    ]);
    expect(document.activeElement).toBe(screen.getByLabelText('Instrument'));
    expect(screen.queryByRole('button', { name: 'Add trade' })).toBeNull();
  });

  it('starts with the documented defaults and no exit fields', async () => {
    stubApi();
    render(<App />);
    await openForm();

    expect(screen.getByLabelText('Instrument').value).toBe('');
    expect(screen.getByLabelText('Direction').value).toBe('');
    expect(screen.getByLabelText('OPEN').checked).toBe(true);
    expect(screen.getByLabelText('Quantity').value).toBe('1');
    expect(screen.getByLabelText('Entered at').value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(screen.getByLabelText('Fees (USD, whole trade)').value).toBe('0');
    expect(screen.queryByLabelText('Exit price')).toBeNull();
    expect(screen.queryByLabelText('Exited at')).toBeNull();
  });

  it('creates an OPEN trade, then reloads trades and stats from the server', async () => {
    let created = false;
    const fetchMock = stubApi({
      'POST /api/trades': () => {
        created = true;
        return jsonResponse(OPEN_TRADE, 201);
      },
      '/api/trades': () => jsonResponse(created ? [OPEN_TRADE] : []),
      '/api/stats': () => jsonResponse(created ? STATS : EMPTY_STATS),
    });
    render(<App />);
    await screen.findByText('No trades yet.');
    await openForm();

    fillOpenTrade();
    change('Notes', '  waited for the retest ');
    save();

    expect(await screen.findByText('Trade added.')).toBeTruthy();
    expect(postedBodies(fetchMock)).toEqual([
      {
        instrumentId: 2,
        direction: 'SHORT',
        status: 'OPEN',
        quantity: 1,
        entryPrice: '18000.25',
        enteredAt: '2026-09-30T14:30:00.000Z',
        fees: '0',
        notes: '  waited for the retest ',
      },
    ]);
    expect(screen.queryByRole('region', { name: 'Add trade' })).toBeNull();

    // Everything shown now comes from the second load.
    await screen.findByRole('table');
    expect(getCount(fetchMock)).toBe(6);
    expect(statValue('Net P&L').textContent).toBe('$12,345,678,901,234,567.89');
    expect(statValue('Open trades').textContent).toBe('1');
  });

  it('shows exit fields for a CLOSED trade and sends them', async () => {
    const fetchMock = stubApi();
    render(<App />);
    await openForm();

    fillOpenTrade();
    fireEvent.click(screen.getByLabelText('CLOSED'));
    change('Exit price', '18005.75');
    change('Exited at', '2026-09-30T15:00');
    change('Fees (USD, whole trade)', '2.50');
    save();

    await screen.findByText('Trade added.');
    expect(postedBodies(fetchMock)).toEqual([
      {
        instrumentId: 2,
        direction: 'SHORT',
        status: 'CLOSED',
        quantity: 1,
        entryPrice: '18000.25',
        enteredAt: '2026-09-30T14:30:00.000Z',
        exitPrice: '18005.75',
        exitedAt: '2026-09-30T15:00:00.000Z',
        fees: '2.50',
      },
    ]);
  });

  it('hides and does not send exit values after switching back to OPEN', async () => {
    const fetchMock = stubApi();
    render(<App />);
    await openForm();

    fillOpenTrade();
    fireEvent.click(screen.getByLabelText('CLOSED'));
    change('Exit price', '18005.75');
    change('Exited at', '2026-09-30T15:00');
    fireEvent.click(screen.getByLabelText('OPEN'));

    expect(screen.queryByLabelText('Exit price')).toBeNull();
    expect(screen.queryByLabelText('Exited at')).toBeNull();

    save();
    await screen.findByText('Trade added.');
    const [body] = postedBodies(fetchMock);
    expect(body.status).toBe('OPEN');
    expect(body).not.toHaveProperty('exitPrice');
    expect(body).not.toHaveProperty('exitedAt');
  });

  it('shows server validation issues next to their fields and keeps the values', async () => {
    stubApi({
      'POST /api/trades': () =>
        jsonResponse(
          {
            error: 'Validation failed',
            issues: [
              { path: ['entryPrice'], message: "must be a multiple of the instrument's tick size" },
              { path: ['instrumentId'], message: 'Invalid input: expected number' },
              { path: [], message: 'netPnl 1e13 is too large to store' },
            ],
          },
          400,
        ),
    });
    render(<App />);
    await openForm();

    fillOpenTrade();
    change('Entry price', '18000.10');
    save();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not save the trade.');
    expect(alert.textContent).toContain('netPnl 1e13 is too large to store');

    const entryPrice = screen.getByLabelText('Entry price');
    expect(entryPrice.getAttribute('aria-invalid')).toBe('true');
    const entryError = document.getElementById(entryPrice.getAttribute('aria-describedby'));
    expect(entryError.textContent).toBe(
      "Entry price must be a multiple of the instrument's tick size",
    );

    const instrument = screen.getByLabelText('Instrument');
    expect(document.getElementById(instrument.getAttribute('aria-describedby')).textContent).toBe(
      'Invalid input: expected number',
    );

    expect(screen.getByLabelText('Direction').getAttribute('aria-invalid')).toBeNull();
    expect(entryPrice.value).toBe('18000.10');
    expect(screen.getByRole('button', { name: 'Save trade' }).matches(':disabled')).toBe(false);
  });

  it('shows a general error for a failure that is not a validation error', async () => {
    const fetchMock = stubApi({
      'POST /api/trades': () => jsonResponse({ error: 'Internal server error' }, 500),
    });
    render(<App />);
    await openForm();

    fillOpenTrade();
    save();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not save the trade. Internal server error (HTTP 500)');
    expect(screen.getByLabelText('Entry price').value).toBe('18000.25');
    expect(screen.queryByText('Trade added.')).toBeNull();
    // The dashboard is not reloaded when nothing was created.
    expect(getCount(fetchMock)).toBe(3);
  });

  it('disables the form while the request is in flight', async () => {
    let respond;
    const fetchMock = stubApi({
      'POST /api/trades': () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    });
    render(<App />);
    await openForm();

    fillOpenTrade();
    save();

    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving.matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Entry price').matches(':disabled')).toBe(true);

    fireEvent.submit(saving.closest('form'));
    expect(postedBodies(fetchMock)).toHaveLength(1);

    await act(async () => {
      respond(jsonResponse({ error: 'Internal server error' }, 500));
    });
    expect(screen.getByRole('button', { name: 'Save trade' }).matches(':disabled')).toBe(false);
  });

  it('closes the form on Cancel without sending anything', async () => {
    const fetchMock = stubApi();
    render(<App />);
    await openForm();

    fillOpenTrade();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('region', { name: 'Add trade' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add trade' })).toBeTruthy();
    expect(postedBodies(fetchMock)).toEqual([]);
  });

  it('shows a field error and does not submit a local time that does not exist', async (context) => {
    // Node applies a TZ change at runtime. If this environment doesn't, skip rather than
    // test the wrong zone.
    vi.stubEnv('TZ', 'America/New_York');
    if (new Date(2026, 0, 1).getTimezoneOffset() !== 300) context.skip();

    const fetchMock = stubApi();
    render(<App />);
    await openForm();

    fillOpenTrade();
    // New York clocks jump from 02:00 to 03:00 on 2026-03-08.
    change('Entered at', '2026-03-08T02:30');
    save();

    const enteredAt = screen.getByLabelText('Entered at');
    expect(enteredAt.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(enteredAt.getAttribute('aria-describedby')).textContent).toBe(
      'Entered at is not a valid time in your time zone',
    );
    expect(postedBodies(fetchMock)).toEqual([]);
  });
});
