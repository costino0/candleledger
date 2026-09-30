// Prisma CLI configuration (used by `prisma migrate`, `prisma generate`, etc.).
// Prisma 7 does not read .env on its own, so we load it with dotenv here.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Read directly (not via Prisma's env() helper) so commands that don't need a
    // database, like `prisma validate` and `prisma generate`, work before .env exists.
    url: process.env.DATABASE_URL,
  },
});
