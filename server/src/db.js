// The one place that creates a Prisma client.
// Prisma 7 has no built-in database driver, so the client connects through `pg`
// via the @prisma/adapter-pg driver adapter.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'CandleLedger: DATABASE_URL is not set. Copy server/.env.example to server/.env ' +
        'and set DATABASE_URL to your PostgreSQL connection string.',
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
