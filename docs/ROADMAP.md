# CandleLedger Roadmap

CandleLedger grows in small, working increments. Each version should be usable on its own,
and nothing is added before it is needed.

## Guiding principles

- **Explainable over clever.** Prefer tools and patterns that can be understood and explained.
- **The server owns the numbers.** All P&L and stats are computed on the server with
  decimal arithmetic. The client only displays them.
- **Postpone model-changing features** (partial fills, market data) until the simple model
  has proven itself.

## Status

| Version | Theme                  | Status  |
| ------- | ---------------------- | ------- |
| v0.0    | Project skeleton       | Done    |
| v0.1    | Core futures journal   | Next    |
| v0.2    | Better journaling + CI | Planned |
| v0.3    | TypeScript migration   | Planned |
| v0.4    | Data in bulk           | Planned |
| v0.5    | Users                  | Planned |
| v0.6    | Deployment             | Planned |
| v0.7    | Deeper analytics       | Planned |

---

## v0.0: Project skeleton

- npm workspaces: `client/` (React + Vite) and `server/` (Express)
- ESLint, Prettier, Vitest, EditorConfig
- Prisma schema for the v0.1 data model (no migrations yet)
- `GET /api/health` with a test
- Documentation: README, this roadmap, [data model](DATA_MODEL.md)

## v0.1: Core futures journal

Single user, no login. Instruments: NQ, MNQ, ES, MES. See [DATA_MODEL.md](DATA_MODEL.md).

- Connect to a hosted PostgreSQL development database through `DATABASE_URL`
- First Prisma migration, plus a seed for the four instruments
- Trade CRUD API with Zod validation
- Explicit `OPEN` / `CLOSED` status, with the rules enforced by the server
- `pointValueSnapshot` taken from the instrument when a trade is created
- Server-side P&L with `decimal.js`, stored on the trade, recalculated on every edit of a
  CLOSED trade
- `GET /api/stats`: totals, counts, win rate, average win and loss
- UI: trades table, add/edit form with validation errors, delete with confirmation,
  stats dashboard
- Tests: unit tests for P&L and stats (every instrument, long and short, fees,
  break-even) and API tests

**Out of scope:** partial fills, multiple executions, screenshots, authentication, broker
integrations, market data.

## v0.2: Better journaling + CI

- Tags / setups on trades
- Filtering and sorting (instrument, direction, status, date range, tag)
- Per-instrument stats
- Equity curve chart
- GitHub Actions: lint, format check, and tests on every push

## v0.3: TypeScript migration

- Migrate the server to TypeScript, then the client
- Replace the temporary `prisma-client-js` generator with the modern `prisma-client`
  generator (see [Dependency policy](../README.md#dependency-policy))
- Shared types for the API contract
- Done early, while the codebase is still small

## v0.4: Data in bulk

- CSV import of broker exports, with typed parsing and validation
- CSV export

## v0.5: Users

- Authentication
- Per-user data (every trade belongs to a user)

## v0.6: Deployment

- Deploy client and server
- Production database, environment configuration

## v0.7: Deeper analytics

- Max drawdown, expectancy, profit factor, R-multiples
- Breakdowns by time of day and weekday

## Later

These change the data model significantly and are deliberately postponed:

- Partial fills and multiple executions per trade
- Trade screenshots
- More instruments, multiple accounts and currencies
- Broker API sync
- Market data and candlestick charts
