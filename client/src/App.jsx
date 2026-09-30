import { useEffect, useState } from 'react';
import { loadDashboard } from './api.js';
import StatsPanel from './components/StatsPanel.jsx';
import TradesTable from './components/TradesTable.jsx';

// state is one of:
//   { status: 'loading' }
//   { status: 'error', message }
//   { status: 'ready', instruments, trades, stats }
export default function App() {
  const [state, setState] = useState({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    loadDashboard(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', ...data });
      },
      (error) => {
        // Aborting is how cleanup cancels this load (unmount, StrictMode remount, retry).
        // That is not a failure, so it never shows the error UI.
        if (!controller.signal.aborted) setState({ status: 'error', message: error.message });
      },
    );

    return () => controller.abort();
  }, [reloadKey]);

  function retry() {
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }

  return (
    <main className="app">
      <header className="app-header">
        <h1>CandleLedger</h1>
        <p>Futures trading journal</p>
      </header>

      {state.status === 'loading' && (
        <p className="message" role="status">
          Loading journal…
        </p>
      )}

      {state.status === 'error' && (
        <div className="message message-error" role="alert">
          <p>
            <strong>Could not load the journal.</strong> {state.message}
          </p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <StatsPanel stats={state.stats} />
          <TradesTable trades={state.trades} instruments={state.instruments} />
        </>
      )}
    </main>
  );
}
