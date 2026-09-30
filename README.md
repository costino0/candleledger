# CandleLedger

A full-stack trading journal and analytics platform for tracking trades, reviewing
performance, and improving execution.

CandleLedger starts with futures (NQ, MNQ, ES, MES). All P&L is calculated on the server
with decimal arithmetic, using each contract's dollar value per point.

> **Status:** project skeleton. v0.1 features are in progress. See the
> [roadmap](docs/ROADMAP.md).

## Tech stack

| Layer    | Tools                            |
| -------- | -------------------------------- |
| Frontend | React, Vite                      |
| Backend  | Node.js, Express                 |
| Database | PostgreSQL, Prisma               |
| Testing  | Vitest, Supertest                |
| Tooling  | ESLint, Prettier, npm workspaces |

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

## Documentation

- [Roadmap](docs/ROADMAP.md)
- [v0.1 data model](docs/DATA_MODEL.md)
