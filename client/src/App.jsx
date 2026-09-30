import { useEffect, useState } from 'react';
import { loadDashboard } from './api.js';
import AddTradeForm from './components/AddTradeForm.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import TradesTable from './components/TradesTable.jsx';

// state is one of:
//   { status: 'loading' }
//   { status: 'error', message }
//   { status: 'ready', instruments, trades, stats }
export default function App() {
  const [state, setState] = useState({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

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
    setJustAdded(false);
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }

  // After a trade is created, trades and stats are loaded from the server again. The current
  // dashboard stays on screen until the new data replaces it.
  function handleCreated() {
    setFormOpen(false);
    setJustAdded(true);
    setReloadKey((key) => key + 1);
  }

  function openForm() {
    setJustAdded(false);
    setFormOpen(true);
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
          {formOpen ? (
            <AddTradeForm
              instruments={state.instruments}
              onCreated={handleCreated}
              onCancel={() => setFormOpen(false)}
            />
          ) : (
            <div className="toolbar">
              <button type="button" className="button-primary" onClick={openForm}>
                Add trade
              </button>
              {justAdded && <p role="status">Trade added.</p>}
            </div>
          )}
          <StatsPanel stats={state.stats} />
          <TradesTable trades={state.trades} instruments={state.instruments} />
        </>
      )}
    </main>
  );
}
