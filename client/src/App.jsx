import { useEffect, useState } from 'react';
import { loadDashboard } from './api.js';
import StatsPanel from './components/StatsPanel.jsx';
import TradeForm from './components/TradeForm.jsx';
import TradesTable from './components/TradesTable.jsx';

// state is one of:
//   { status: 'loading' }
//   { status: 'error', message }
//   { status: 'ready', instruments, trades, stats }
//
// form is null (no form open), { mode: 'add' } or { mode: 'edit', trade }.
export default function App() {
  const [state, setState] = useState({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(null);
  // A short message about the last save: { text, warning }.
  const [notice, setNotice] = useState(null);
  // True from a save until the dashboard has been loaded again. Meanwhile the table still
  // shows the old values, so editing a row could send them back.
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    loadDashboard(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', ...data });
        setReloading(false);
      },
      (error) => {
        // Aborting is how cleanup cancels this load (unmount, StrictMode remount, retry).
        // That is not a failure, so it never shows the error UI.
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error.message });
        setReloading(false);
      },
    );

    return () => controller.abort();
  }, [reloadKey]);

  function retry() {
    setNotice(null);
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }

  // After a save, everything is loaded from the server again. The current dashboard stays on
  // screen until the new data replaces it.
  function reloadWithNotice(text, warning = false) {
    setForm(null);
    setNotice({ text, warning });
    setReloading(true);
    setReloadKey((key) => key + 1);
  }

  function openForm(nextForm) {
    setNotice(null);
    setForm(nextForm);
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
          {form ? (
            <TradeForm
              // A new key per trade, so each form starts from its own values.
              key={form.mode === 'edit' ? form.trade.id : 'add'}
              instruments={state.instruments}
              trade={form.mode === 'edit' ? form.trade : null}
              onSaved={() =>
                reloadWithNotice(form.mode === 'edit' ? 'Trade updated.' : 'Trade added.')
              }
              onTradeMissing={() =>
                reloadWithNotice(
                  'That trade no longer exists. The journal has been reloaded.',
                  true,
                )
              }
              onCancel={() => setForm(null)}
            />
          ) : (
            <div className="toolbar">
              <button
                type="button"
                className="button-primary"
                onClick={() => openForm({ mode: 'add' })}
              >
                Add trade
              </button>
              {notice && (
                <p role="status" className={notice.warning ? 'notice-warning' : undefined}>
                  {notice.text}
                </p>
              )}
            </div>
          )}
          <StatsPanel stats={state.stats} />
          <TradesTable
            trades={state.trades}
            instruments={state.instruments}
            onEdit={(trade) => openForm({ mode: 'edit', trade })}
            editDisabled={form !== null || reloading}
          />
        </>
      )}
    </main>
  );
}
