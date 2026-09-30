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

// Stubs fetch with one response factory per API path.
function stubApi(overrides = {}) {
  const routes = {
    '/api/instruments': () => jsonResponse(INSTRUMENTS),
    '/api/trades': () => jsonResponse([OPEN_TRADE, LOSING_TRADE, WINNING_TRADE]),
    '/api/stats': () => jsonResponse(STATS),
    ...overrides,
  };
  const fetchMock = vi.fn(async (path) => routes[path]());
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
