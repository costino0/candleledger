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
      'Actions',
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
      'EditDelete',
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
      'EditDelete',
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

// A CLOSED trade whose timestamps have sub-minute precision. The form can show at most the
// seconds, so the milliseconds only survive if untouched timestamps are sent back as-is.
const PRECISE_TRADE = {
  ...LOSING_TRADE,
  enteredAt: '2026-09-30T14:30:42.375Z',
  exitedAt: '2026-09-30T15:00:00.375Z',
};

// The bodies of every PUT request the mock received, as [path, body] pairs.
function putRequests(fetchMock) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'PUT')
    .map(([path, init]) => [path, JSON.parse(init.body)]);
}

function editButton(name) {
  return screen.getByRole('button', { name });
}

async function openEdit(name) {
  await screen.findByRole('table');
  fireEvent.click(editButton(name));
  return screen.getByRole('region', { name: 'Edit trade' });
}

function stubEditApi(overrides = {}) {
  return stubApi({
    '/api/trades': () => jsonResponse([OPEN_TRADE, PRECISE_TRADE, WINNING_TRADE]),
    'PUT /api/trades/2': () => jsonResponse(PRECISE_TRADE),
    'PUT /api/trades/3': () => jsonResponse(OPEN_TRADE),
    ...overrides,
  });
}

describe('Edit trade', () => {
  it('has an Edit button for every trade', async () => {
    stubEditApi();
    render(<App />);
    await screen.findByRole('table');

    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(3);
    expect(editButton(/^Edit NQ LONG Sep 30, 2026, 4:00\sPM$/)).toBeTruthy();
  });

  it('opens a form filled with the trade, including its exit', async () => {
    stubEditApi();
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    expect(screen.getByLabelText('Instrument').value).toBe('2');
    expect(screen.getByLabelText('Direction').value).toBe('SHORT');
    expect(screen.getByLabelText('CLOSED').checked).toBe(true);
    expect(screen.getByLabelText('Quantity').value).toBe('2');
    expect(screen.getByLabelText('Entry price').value).toBe('18000.00');
    // jsdom writes a value with seconds as "…:42.000"; browsers following the spec keep
    // "…:42". The form treats both as the same time.
    expect(screen.getByLabelText('Entered at').value).toMatch(/^2026-09-30T14:30:42(\.000)?$/);
    expect(screen.getByLabelText('Exit price').value).toBe('18005.75');
    expect(screen.getByLabelText('Exited at').value).toBe('2026-09-30T15:00');
    expect(screen.getByLabelText('Fees (USD, whole trade)').value).toBe('2.50');
    expect(screen.getByLabelText('Notes').value).toBe('chased the move');
    expect(document.activeElement).toBe(screen.getByLabelText('Instrument'));
  });

  it('lets both time inputs hold seconds', async () => {
    stubEditApi();
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    expect(screen.getByLabelText('Entered at').getAttribute('step')).toBe('1');
    expect(screen.getByLabelText('Exited at').getAttribute('step')).toBe('1');
  });

  it('disables every Edit and Delete button and hides Add trade while a form is open', async () => {
    stubEditApi();
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    for (const button of screen.getAllByRole('button', { name: /^(Edit|Delete) / })) {
      expect(button.matches(':disabled')).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'Add trade' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Edit trade' })).toBeNull();
    expect(editButton(/^Edit NQ LONG/).matches(':disabled')).toBe(false);
  });

  it('sends the full trade with untouched timestamps unchanged, then reloads', async () => {
    let updated = false;
    const fetchMock = stubEditApi({
      'PUT /api/trades/2': () => {
        updated = true;
        return jsonResponse(PRECISE_TRADE);
      },
      '/api/stats': () => jsonResponse(updated ? STATS : EMPTY_STATS),
    });
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    change('Quantity', '3');
    save();

    expect(await screen.findByText('Trade updated.')).toBeTruthy();
    expect(putRequests(fetchMock)).toEqual([
      [
        '/api/trades/2',
        {
          instrumentId: 2,
          direction: 'SHORT',
          status: 'CLOSED',
          quantity: 3,
          entryPrice: '18000.00',
          enteredAt: '2026-09-30T14:30:42.375Z',
          exitPrice: '18005.75',
          exitedAt: '2026-09-30T15:00:00.375Z',
          fees: '2.50',
          notes: 'chased the move',
        },
      ],
    ]);
    expect(screen.queryByRole('region', { name: 'Edit trade' })).toBeNull();

    // Everything shown now comes from the second load.
    await waitForReload(fetchMock);
    expect(statValue('Net P&L').textContent).toBe('$12,345,678,901,234,567.89');
  });

  it('closes an OPEN trade', async () => {
    const fetchMock = stubEditApi();
    render(<App />);
    await openEdit(/^Edit NQ LONG/);

    fireEvent.click(screen.getByLabelText('CLOSED'));
    expect(screen.getByLabelText('Exit price').value).toBe('');
    expect(screen.getByLabelText('Exited at').value).toBe('');
    change('Exit price', '18010.00');
    change('Exited at', '2026-09-30T16:30:15');
    save();

    await screen.findByText('Trade updated.');
    expect(putRequests(fetchMock)).toEqual([
      [
        '/api/trades/3',
        {
          instrumentId: 1,
          direction: 'LONG',
          status: 'CLOSED',
          quantity: 1,
          entryPrice: '18000.00',
          enteredAt: '2026-09-30T16:00:00.000Z',
          exitPrice: '18010.00',
          exitedAt: '2026-09-30T16:30:15.000Z',
          fees: '1.24',
        },
      ],
    ]);
  });

  it('reopens a CLOSED trade without sending its exit', async () => {
    const fetchMock = stubEditApi();
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    expect(screen.queryByText(/Saving as OPEN clears/)).toBeNull();
    fireEvent.click(screen.getByLabelText('OPEN'));
    expect(
      screen.getByText('Saving as OPEN clears the exit price, exit time and P&L.'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Exit price')).toBeNull();
    save();

    await screen.findByText('Trade updated.');
    const [[, body]] = putRequests(fetchMock);
    expect(body.status).toBe('OPEN');
    expect(body).not.toHaveProperty('exitPrice');
    expect(body).not.toHaveProperty('exitedAt');
    expect(body.enteredAt).toBe('2026-09-30T14:30:42.375Z');
  });

  it('shows server validation issues next to their fields and keeps the values', async () => {
    const fetchMock = stubEditApi({
      'PUT /api/trades/2': () =>
        jsonResponse(
          {
            error: 'Validation failed',
            issues: [
              { path: ['exitedAt'], message: 'must be at or after enteredAt' },
              { path: [], message: 'netPnl 1e13 is too large to store' },
            ],
          },
          400,
        ),
    });
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    change('Exited at', '2026-09-30T14:00');
    save();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not save the trade.');
    expect(alert.textContent).toContain('netPnl 1e13 is too large to store');

    const exitedAt = screen.getByLabelText('Exited at');
    expect(exitedAt.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(exitedAt.getAttribute('aria-describedby')).textContent).toBe(
      'Exited at must be at or after enteredAt',
    );
    expect(exitedAt.value).toBe('2026-09-30T14:00');
    expect(screen.getByRole('region', { name: 'Edit trade' })).toBeTruthy();
    expect(getCount(fetchMock)).toBe(3);
  });

  it('shows a field error and does not submit an edited local time that does not exist', async (context) => {
    vi.stubEnv('TZ', 'America/New_York');
    if (new Date(2026, 0, 1).getTimezoneOffset() !== 300) context.skip();

    const fetchMock = stubEditApi();
    render(<App />);
    await openEdit(/^Edit NQ LONG/);

    change('Entered at', '2026-03-08T02:30');
    save();

    const enteredAt = screen.getByLabelText('Entered at');
    expect(document.getElementById(enteredAt.getAttribute('aria-describedby')).textContent).toBe(
      'Entered at is not a valid time in your time zone',
    );
    expect(putRequests(fetchMock)).toEqual([]);
  });

  it('shows a general error for a failure that is not a validation error', async () => {
    const fetchMock = stubEditApi({
      'PUT /api/trades/2': () => jsonResponse({ error: 'Internal server error' }, 500),
    });
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    save();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not save the trade. Internal server error (HTTP 500)');
    expect(screen.getByRole('region', { name: 'Edit trade' })).toBeTruthy();
    expect(getCount(fetchMock)).toBe(3);
  });

  it('disables the form while the request is in flight', async () => {
    let respond;
    const fetchMock = stubEditApi({
      'PUT /api/trades/2': () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    });
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    save();

    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving.matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Exit price').matches(':disabled')).toBe(true);

    fireEvent.submit(saving.closest('form'));
    expect(putRequests(fetchMock)).toHaveLength(1);

    await act(async () => {
      respond(jsonResponse({ error: 'Internal server error' }, 500));
    });
    expect(screen.getByRole('button', { name: 'Save trade' }).matches(':disabled')).toBe(false);
  });

  it('closes the form and reloads when the trade no longer exists', async () => {
    const fetchMock = stubEditApi({
      'PUT /api/trades/2': () => jsonResponse({ error: 'Trade not found' }, 404),
    });
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    save();

    expect(
      await screen.findByText('That trade no longer exists. The journal has been reloaded.'),
    ).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Edit trade' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitForReload(fetchMock);
  });

  it('treats any other 404 as a failed save', async () => {
    stubEditApi({
      'PUT /api/trades/2': () => jsonResponse({ error: 'Not found' }, 404),
    });
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    save();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not save the trade. Not found (HTTP 404)');
    expect(screen.getByRole('region', { name: 'Edit trade' })).toBeTruthy();
  });

  it('keeps Edit disabled until the reloaded trades arrive', async () => {
    let tradesCalls = 0;
    let releaseTrades;
    stubEditApi({
      '/api/trades': () => {
        tradesCalls += 1;
        if (tradesCalls === 1) return jsonResponse([OPEN_TRADE, PRECISE_TRADE]);
        return new Promise((resolve) => {
          releaseTrades = () => resolve(jsonResponse([OPEN_TRADE, PRECISE_TRADE]));
        });
      },
    });
    render(<App />);
    await openEdit(/^Edit MNQ SHORT/);

    save();
    await screen.findByText('Trade updated.');

    // The table still shows the values from before the save.
    expect(editButton(/^Edit MNQ SHORT/).matches(':disabled')).toBe(true);
    expect(editButton(/^Edit NQ LONG/).matches(':disabled')).toBe(true);

    await act(async () => {
      releaseTrades();
    });
    expect(editButton(/^Edit MNQ SHORT/).matches(':disabled')).toBe(false);
  });

  it('keeps an instrument that is not in the instruments list', async () => {
    const fetchMock = stubEditApi({
      '/api/trades': () => jsonResponse([{ ...PRECISE_TRADE, instrumentId: 99 }]),
    });
    render(<App />);
    await openEdit(/^Edit #99 SHORT/);

    const instrument = screen.getByLabelText('Instrument');
    expect(instrument.value).toBe('99');
    expect(instrument.selectedOptions[0].textContent).toBe('#99');

    save();
    await screen.findByText('Trade updated.');
    const [[, body]] = putRequests(fetchMock);
    expect(body.instrumentId).toBe(99);
  });
});

// Waits until the dashboard has been loaded a second time and the table is back.
async function waitForReload(fetchMock) {
  await act(async () => {});
  expect(getCount(fetchMock)).toBe(6);
  await screen.findByRole('table');
}

// Every DELETE request the mock received, as [path, init] pairs.
function deleteRequests(fetchMock) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
}

async function openDelete(name) {
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.getByRole('region', { name: 'Delete trade' });
}

function confirmDelete() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
}

// Stats the server reports once LOSING_TRADE is gone.
const STATS_AFTER_DELETE = {
  ...STATS,
  totalNetPnl: '97.52',
  closedTrades: 1,
  losses: 0,
  winRate: '100.00',
  averageLoss: null,
};

function stubDeleteApi(overrides = {}) {
  let deleted = false;
  return stubApi({
    'DELETE /api/trades/2': () => {
      deleted = true;
      return new Response(null, { status: 204 });
    },
    '/api/trades': () =>
      jsonResponse(
        deleted ? [OPEN_TRADE, WINNING_TRADE] : [OPEN_TRADE, LOSING_TRADE, WINNING_TRADE],
      ),
    '/api/stats': () => jsonResponse(deleted ? STATS_AFTER_DELETE : STATS),
    ...overrides,
  });
}

describe('Delete trade', () => {
  it('has a Delete button for every trade', async () => {
    stubDeleteApi();
    render(<App />);
    await screen.findByRole('table');

    expect(screen.getAllByRole('button', { name: /^Delete / })).toHaveLength(3);
    expect(
      screen.getByRole('button', { name: /^Delete NQ LONG Sep 30, 2026, 4:00\sPM$/ }),
    ).toBeTruthy();
  });

  it('asks for confirmation without sending anything', async () => {
    const fetchMock = stubDeleteApi();
    render(<App />);
    const panel = await openDelete(/^Delete MNQ SHORT/);

    expect(panel.textContent).toMatch(
      /Delete the MNQ SHORT Sep 30, 2026, 2:30\sPM trade\? This cannot be undone\./,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteRequests(fetchMock)).toHaveLength(0);

    const table = screen.getByRole('table');
    for (const button of within(table).getAllByRole('button')) {
      expect(button.matches(':disabled')).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'Add trade' })).toBeNull();
  });

  it('closes the confirmation on Cancel without sending anything', async () => {
    const fetchMock = stubDeleteApi();
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('region', { name: 'Delete trade' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add trade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Delete MNQ SHORT/ }).matches(':disabled')).toBe(
      false,
    );
    expect(deleteRequests(fetchMock)).toHaveLength(0);
    expect(getCount(fetchMock)).toBe(3);
  });

  it('deletes the trade, then reloads trades and stats from the server', async () => {
    const fetchMock = stubDeleteApi();
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();

    expect(await screen.findByText('Trade deleted.')).toBeTruthy();
    expect(deleteRequests(fetchMock)).toEqual([['/api/trades/2', { method: 'DELETE' }]]);
    expect(screen.queryByRole('region', { name: 'Delete trade' })).toBeNull();

    // Everything shown now comes from the second load.
    await waitForReload(fetchMock);
    expect(screen.getAllByRole('button', { name: /^Delete / })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Delete MNQ SHORT/ })).toBeNull();
    expect(statValue('Net P&L').textContent).toBe('$97.52');
    expect(statValue('Win rate').textContent).toBe('100.00%');
  });

  it('shows the empty state after deleting the last trade', async () => {
    let deleted = false;
    const fetchMock = stubApi({
      'DELETE /api/trades/2': () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
      '/api/trades': () => jsonResponse(deleted ? [] : [LOSING_TRADE]),
      '/api/stats': () => jsonResponse(deleted ? EMPTY_STATS : STATS),
    });
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();

    expect(await screen.findByText('No trades yet.')).toBeTruthy();
    expect(getCount(fetchMock)).toBe(6);
    expect(statValue('Net P&L').textContent).toBe('$0.00');
  });

  it('disables the confirmation while the request is in flight', async () => {
    let respond;
    const fetchMock = stubDeleteApi({
      'DELETE /api/trades/2': () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    });
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();

    const deleting = screen.getByRole('button', { name: 'Deleting…' });
    expect(deleting.matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(true);

    fireEvent.click(deleting);
    expect(deleteRequests(fetchMock)).toHaveLength(1);

    await act(async () => {
      respond(jsonResponse({ error: 'Internal server error' }, 500));
    });
    expect(screen.getByRole('button', { name: 'Delete trade' }).matches(':disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(false);
  });

  it('keeps Edit and Delete disabled until the reloaded trades arrive', async () => {
    let tradesCalls = 0;
    let releaseTrades;
    stubDeleteApi({
      '/api/trades': () => {
        tradesCalls += 1;
        if (tradesCalls === 1) return jsonResponse([OPEN_TRADE, LOSING_TRADE]);
        return new Promise((resolve) => {
          releaseTrades = () => resolve(jsonResponse([OPEN_TRADE]));
        });
      },
    });
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();
    await screen.findByText('Trade deleted.');

    // The table still shows the trade from before the delete.
    expect(screen.getByRole('button', { name: /^Delete MNQ SHORT/ }).matches(':disabled')).toBe(
      true,
    );
    expect(editButton(/^Edit NQ LONG/).matches(':disabled')).toBe(true);

    await act(async () => {
      releaseTrades();
    });
    expect(screen.queryByRole('button', { name: /^Delete MNQ SHORT/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Delete NQ LONG/ }).matches(':disabled')).toBe(
      false,
    );
  });

  it('closes the confirmation and reloads when the trade is already gone', async () => {
    const fetchMock = stubDeleteApi({
      'DELETE /api/trades/2': () => jsonResponse({ error: 'Trade not found' }, 404),
    });
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();

    expect(
      await screen.findByText(
        'That trade had already been deleted. The journal has been reloaded.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Delete trade' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await waitForReload(fetchMock);
  });

  it('treats any other 404 as a failed delete', async () => {
    const fetchMock = stubDeleteApi({
      'DELETE /api/trades/2': () => jsonResponse({ error: 'Not found' }, 404),
    });
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not delete the trade. Not found (HTTP 404)');
    expect(screen.getByRole('region', { name: 'Delete trade' })).toBeTruthy();
    expect(getCount(fetchMock)).toBe(3);
  });

  it('shows the error, keeps the confirmation open and does not reload on a server error', async () => {
    const fetchMock = stubDeleteApi({
      'DELETE /api/trades/2': () => jsonResponse({ error: 'Internal server error' }, 500),
    });
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not delete the trade. Internal server error (HTTP 500)');
    expect(screen.getByRole('region', { name: 'Delete trade' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete trade' }).matches(':disabled')).toBe(false);
    expect(getCount(fetchMock)).toBe(3);
    expect(screen.getByRole('button', { name: /^Delete MNQ SHORT/ })).toBeTruthy();
  });

  it('shows a readable error when the server cannot be reached', async () => {
    const fetchMock = stubDeleteApi({
      'DELETE /api/trades/2': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    render(<App />);
    await openDelete(/^Delete MNQ SHORT/);

    confirmDelete();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Could not delete the trade. Could not reach the server.');
    expect(screen.getByRole('button', { name: 'Cancel' }).matches(':disabled')).toBe(false);
    expect(getCount(fetchMock)).toBe(3);
  });
});
