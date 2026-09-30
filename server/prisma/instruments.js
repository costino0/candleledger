// The v0.1 instruments. Used by seed.js (to write them) and verify.js (to check them).
// See docs/DATA_MODEL.md. Decimal values are strings so they are never rounded as numbers.
export const INSTRUMENTS = [
  { symbol: 'NQ', name: 'E-mini Nasdaq-100', pointValue: '20.00', tickSize: '0.25' },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', pointValue: '2.00', tickSize: '0.25' },
  { symbol: 'ES', name: 'E-mini S&P 500', pointValue: '50.00', tickSize: '0.25' },
  { symbol: 'MES', name: 'Micro E-mini S&P 500', pointValue: '5.00', tickSize: '0.25' },
];
