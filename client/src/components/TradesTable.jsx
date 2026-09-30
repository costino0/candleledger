import { EMPTY, formatDateTime, formatDecimal, formatMoney, outcomeClass } from '../format.js';

// Lists trades in the order the server sent them (newest first), each with an Edit button
// that calls `onEdit(trade)`. `editDisabled` turns those buttons off.
export default function TradesTable({ trades, instruments, onEdit, editDisabled }) {
  return (
    <section className="panel" aria-labelledby="trades-heading">
      <h2 id="trades-heading">Trades</h2>
      {trades.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No trades yet.</p>
          <p>Trades you record will appear here.</p>
        </div>
      ) : (
        <TradeRows
          trades={trades}
          instruments={instruments}
          onEdit={onEdit}
          editDisabled={editDisabled}
        />
      )}
    </section>
  );
}

function TradeRows({ trades, instruments, onEdit, editDisabled }) {
  // Symbols come from the instruments response, so the client keeps no copy of them.
  const symbols = new Map(instruments.map((instrument) => [instrument.id, instrument.symbol]));

  return (
    <div className="table-scroll">
      <table className="trades">
        <thead>
          <tr>
            <th scope="col">Entered</th>
            <th scope="col">Symbol</th>
            <th scope="col">Side</th>
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              Entry
            </th>
            <th scope="col" className="num">
              Exit
            </th>
            <th scope="col">Exited</th>
            <th scope="col" className="num">
              Points
            </th>
            <th scope="col" className="num">
              Fees
            </th>
            <th scope="col" className="num">
              Net P&amp;L
            </th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => {
            const symbol = symbols.get(trade.instrumentId) ?? `#${trade.instrumentId}`;
            return (
              <tr key={trade.id}>
                <td>
                  <DateTime value={trade.enteredAt} />
                </td>
                <td>{symbol}</td>
                <td>{trade.direction}</td>
                <td className="num">{trade.quantity}</td>
                <td>
                  <span className={`badge badge-${trade.status.toLowerCase()}`}>
                    {trade.status}
                  </span>
                </td>
                <td className="num">{formatDecimal(trade.entryPrice)}</td>
                <td className="num">{formatDecimal(trade.exitPrice)}</td>
                <td>
                  <DateTime value={trade.exitedAt} />
                </td>
                <td className={cellClass(trade.pnlPoints)}>{formatDecimal(trade.pnlPoints)}</td>
                <td className="num">{formatMoney(trade.fees)}</td>
                <td className={cellClass(trade.netPnl)}>{formatMoney(trade.netPnl)}</td>
                <td className="actions">
                  <button
                    type="button"
                    aria-label={`Edit ${symbol} ${trade.direction} ${formatDateTime(trade.enteredAt)}`}
                    disabled={editDisabled}
                    onClick={() => onEdit(trade)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Local time for reading, with the exact UTC timestamp on hover.
function DateTime({ value }) {
  if (value === null) return EMPTY;
  return (
    <time dateTime={value} title={value}>
      {formatDateTime(value)}
    </time>
  );
}

function cellClass(outcome) {
  const colorClass = outcomeClass(outcome);
  return colorClass ? `num ${colorClass}` : 'num';
}
