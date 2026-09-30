# CandleLedger

A full-stack trading journal and analytics platform for tracking trades, reviewing
performance, and improving execution.

CandleLedger starts with futures (NQ, MNQ, ES, MES). All P&L is calculated on the server
with decimal arithmetic, using each contract's dollar value per point.

> **Status:** project skeleton. v0.1 features are in progress. See the
> [roadmap](docs/ROADMAP.md).

## Tech stack

| Layer    | Tools                                    |
| -------- | ---------------------------------------- |
| Frontend | React, Vite                              |
| Backend  | Node.js, Express                         |
| Database | PostgreSQL, Prisma                       |
| Testing  | Vitest, Supertest, React Testing Library |
| Tooling  | ESLint, Prettier, npm workspaces         |

## Project structure

```
candleledger/
├── client/          React app (Vite)
│   └── src/
├── server/          Express API
│   ├── prisma/      Database schema and migrations
│   └── src/
└── docs/            Roadmap and data model
```

## Getting started

Requirements: Node.js 22.12 or newer and a PostgreSQL database.

```bash
npm install
cp server/.env.example server/.env   # then set DATABASE_URL
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:3001 (the client proxies `/api` to it)

## Database setup

The schema lives in `server/prisma/schema.prisma` and the committed migrations in
`server/prisma/migrations/`. With `DATABASE_URL` set in `server/.env`, run these in order:

```bash
npm run db:deploy -w server     # apply the committed migrations
npm run db:generate -w server   # generate the Prisma client (not done automatically in Prisma 7)
npm run db:seed -w server       # insert or update the instruments NQ, MNQ, ES, MES
npm run db:verify -w server     # check tables and instrument rows; exits 1 on failure
```

- The seed is idempotent: it upserts each instrument by symbol, so it is safe to run again.
  It never deletes anything.
- `npm run db:status -w server` shows whether any migration is still unapplied.
- `db:deploy` only applies committed migrations and needs no extra database permissions.
  Creating new migrations (`npm run db:migrate -w server`, i.e. `prisma migrate dev`)
  needs a shadow database, so do that against a local PostgreSQL database, not the hosted one.

## Scripts

Run from the repository root:

| Command                | What it does                            |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Start server and client together        |
| `npm test`             | Run all tests                           |
| `npm run lint`         | Lint the whole repository               |
| `npm run format`       | Format all files with Prettier          |
| `npm run format:check` | Check formatting without changing files |
| `npm run build`        | Build the client for production         |

## Dependency policy

- **Prisma ORM is intentionally pinned to 7.x.** `prisma`, `@prisma/client` and
  `@prisma/adapter-pg` use exact versions (currently `7.10.0`) and must be upgraded
  together. Prisma 8 is a release candidate, and npm's `latest` tag already points to it,
  so always install with an explicit version, for example `npm i -w server -E prisma@7.x.y`.
- **The `prisma-client-js` generator is temporary.** It produces plain JavaScript for the
  JavaScript phase. It will be replaced with the modern `prisma-client` generator during
  the TypeScript migration in v0.3.

## Documentation

- [Roadmap](docs/ROADMAP.md)
- [v0.1 data model](docs/DATA_MODEL.md)
