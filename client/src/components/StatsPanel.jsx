import { formatMoney, formatPercent, outcomeClass } from '../format.js';

// Shows the server's stats as-is. Nothing here is calculated in the browser.
export default function StatsPanel({ stats }) {
  return (
    <section className="panel" aria-labelledby="stats-heading">
      <h2 id="stats-heading">Summary</h2>
      <dl className="stats">
        <Stat
          label="Net P&L"
          value={formatMoney(stats.totalNetPnl)}
          valueClass={outcomeClass(stats.totalNetPnl)}
          featured
        />
        <Stat
          label="Gross P&L"
          value={formatMoney(stats.totalGrossPnl)}
          valueClass={outcomeClass(stats.totalGrossPnl)}
        />
        <Stat label="Fees" value={formatMoney(stats.totalFees)} />
        <Stat
          label="Win rate"
          value={formatPercent(stats.winRate)}
          detail={`${stats.wins}W · ${stats.losses}L · ${stats.breakEvens}BE`}
        />
        <Stat
          label="Average win"
          value={formatMoney(stats.averageWin)}
          valueClass={outcomeClass(stats.averageWin)}
        />
        <Stat
          label="Average loss"
          value={formatMoney(stats.averageLoss)}
          valueClass={outcomeClass(stats.averageLoss)}
        />
        <Stat label="Closed trades" value={stats.closedTrades} />
        <Stat label="Open trades" value={stats.openTrades} />
      </dl>
    </section>
  );
}

function Stat({ label, value, valueClass, detail, featured = false }) {
  return (
    <div className={featured ? 'stat stat-featured' : 'stat'}>
      <dt>{label}</dt>
      <dd className={valueClass}>{value}</dd>
      {detail && <dd className="stat-detail">{detail}</dd>}
    </div>
  );
}
