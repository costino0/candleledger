// Checks that the database has been migrated and seeded.
// Run with `npm run db:verify -w server`. Exits with code 1 if any check fails.
import { createPrismaClient } from '../src/db.js';
import { INSTRUMENTS } from './instruments.js';

const prisma = createPrismaClient();
let failures = 0;

function check(ok, message) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures += 1;
}

try {
  const rows = await prisma.instrument.findMany({ orderBy: { id: 'asc' } });
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));

  check(
    rows.length === INSTRUMENTS.length,
    `Instrument table has ${INSTRUMENTS.length} rows (found ${rows.length})`,
  );

  for (const expected of INSTRUMENTS) {
    const row = bySymbol.get(expected.symbol);
    const matches =
      row !== undefined &&
      row.name === expected.name &&
      row.pointValue.equals(expected.pointValue) &&
      row.tickSize.equals(expected.tickSize);

    let found = '';
    if (!row) found = ' (missing)';
    else if (!matches)
      found = ` (found: ${row.name}, $${row.pointValue}/point, ${row.tickSize} tick)`;

    check(
      matches,
      `${expected.symbol}: ${expected.name}, $${expected.pointValue}/point, ${expected.tickSize} tick${found}`,
    );
  }

  const tradeCount = await prisma.trade.count();
  check(true, `Trade table is queryable (${tradeCount} trades)`);
} catch (error) {
  check(false, `Database query failed: ${error.message.trim()}`);
} finally {
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\nDatabase verification failed (${failures} check(s)).`);
  process.exitCode = 1;
} else {
  console.log('\nDatabase verification passed.');
}
