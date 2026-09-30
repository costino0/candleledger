import { useState } from 'react';
import { deleteTrade } from '../api.js';
import { tradeLabel } from '../format.js';

// Asks before deleting `trade`, then deletes it. Nothing is sent until the user confirms.
//
// `onTradeMissing` is called instead of showing an error when the trade is already gone,
// because what the user asked for has already happened.
export default function DeleteTradeConfirm({
  trade,
  instruments,
  onDeleted,
  onCancel,
  onTradeMissing,
}) {
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState(null);

  const instrument = instruments.find((candidate) => candidate.id === trade.instrumentId);
  const symbol = instrument?.symbol ?? `#${trade.instrumentId}`;

  async function confirm() {
    if (deleting) return;

    setFailure(null);
    setDeleting(true);
    try {
      await deleteTrade(trade.id);
    } catch (error) {
      if (error.status === 404 && error.serverError === 'Trade not found') {
        onTradeMissing();
        return;
      }
      setFailure(error.message);
      setDeleting(false);
      return;
    }
    onDeleted();
  }

  return (
    <section className="panel" aria-labelledby="delete-trade-heading">
      <h2 id="delete-trade-heading">Delete trade</h2>
      <div className="delete-confirm">
        {failure && (
          <div className="message message-error" role="alert">
            <p>
              <strong>Could not delete the trade.</strong> {failure}
            </p>
          </div>
        )}
        <p>Delete the {tradeLabel(trade, symbol)} trade? This cannot be undone.</p>
        <div className="form-actions">
          <button type="button" className="button-danger" disabled={deleting} onClick={confirm}>
            {deleting ? 'Deleting…' : 'Delete trade'}
          </button>
          {/* The prompt opens on demand; the safe choice takes focus. */}
          <button type="button" disabled={deleting} onClick={onCancel} autoFocus>
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
}
