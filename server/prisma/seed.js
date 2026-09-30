// Seeds the four v0.1 instruments. Run with `npm run db:seed -w server`.
//
// Idempotent: each instrument is upserted by its unique symbol, so running this again
// creates no duplicates and keeps existing ids (and therefore existing trades) intact.
// It only inserts or updates these rows; it never deletes anything.
import { createPrismaClient } from '../src/db.js';
import { INSTRUMENTS } from './instruments.js';

const prisma = createPrismaClient();

try {
  await prisma.$transaction(
    INSTRUMENTS.map(({ symbol, name, pointValue, tickSize }) =>
      prisma.instrument.upsert({
        where: { symbol },
        create: { symbol, name, pointValue, tickSize },
        update: { name, pointValue, tickSize },
      }),
    ),
  );
  console.log(
    `Seeded ${INSTRUMENTS.length} instruments: ${INSTRUMENTS.map((i) => i.symbol).join(', ')}`,
  );
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
