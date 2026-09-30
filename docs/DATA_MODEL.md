# CandleLedger v0.1 Data Model

This document describes the v0.1 data model and the rules the server enforces on it.
The schema itself lives in [`server/prisma/schema.prisma`](../server/prisma/schema.prisma).

## Scope

v0.1 supports futures only: **NQ, MNQ, ES, MES**.
One trade has exactly one entry and at most one exit, for a whole number of contracts.

Not in v0.1: partial fills, multiple executions, screenshots, authentication,
broker integrations, market data, other instruments, multiple accounts.

## Instrument

A tradable futures contract. The server seeds these four rows.

| symbol | name                    | pointValue (USD) | tickSize |
| ------ | ----------------------- | ---------------: | -------: |
| NQ     | E-mini Nasdaq-100       |            20.00 |     0.25 |
| MNQ    | Micro E-mini Nasdaq-100 |             2.00 |     0.25 |
| ES     | E-mini S&P 500          |            50.00 |     0.25 |
| MES    | Micro E-mini S&P 500    |             5.00 |     0.25 |

- `pointValue`: dollars gained or lost per 1.00 point move, per contract.
- `tickSize`: minimum price increment. Entry and exit prices must be multiples of it.

## Trade

| Field                | Type               | Set by | Notes                                             |
| -------------------- | ------------------ | ------ | ------------------------------------------------- |
| `id`                 | Int                | server |                                                   |
| `instrumentId`       | Int                | client | Must reference an existing Instrument             |
| `direction`          | `LONG` \| `SHORT`  | client |                                                   |
| `status`             | `OPEN` \| `CLOSED` | client | Explicit; defaults to `OPEN` on create            |
| `quantity`           | Int                | client | Whole contracts, > 0                              |
| `entryPrice`         | Decimal(12,2)      | client | Multiple of the instrument's tick size            |
| `exitPrice`          | Decimal(12,2)?     | client | Required when CLOSED, must be null when OPEN      |
| `enteredAt`          | Timestamptz        | client | Stored in UTC                                     |
| `exitedAt`           | Timestamptz?       | client | Required when CLOSED, must be null when OPEN      |
| `fees`               | Decimal(10,2)      | client | Total USD for the whole trade, >= 0, default 0    |
| `pointValueSnapshot` | Decimal(10,2)      | server | See [Point value snapshot](#point-value-snapshot) |
| `pnlPoints`          | Decimal(12,2)?     | server | Null while OPEN                                   |
| `grossPnl`           | Decimal(14,2)?     | server | Null while OPEN                                   |
| `netPnl`             | Decimal(14,2)?     | server | Null while OPEN                                   |
| `notes`              | String?            | client |                                                   |
| `createdAt`          | Timestamptz        | server |                                                   |
| `updatedAt`          | Timestamptz        | server |                                                   |

Fields marked **server** are never trusted from client input. If a request includes them,
they are ignored and the server supplies its own values. Any other field not in this table
is rejected (see [Input validation](#input-validation)).

## Input validation

Rules for the trade payload a client sends, checked by the server before anything is saved:

| Field          | Rule                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `instrumentId` | JSON integer, 1 to 2147483647 (Postgres `integer`); the instrument must exist                      |
| `direction`    | `"LONG"` or `"SHORT"`                                                                              |
| `status`       | `"OPEN"` or `"CLOSED"`; on create optional, defaults to `"OPEN"`                                   |
| `quantity`     | JSON integer, 1 to 2147483647                                                                      |
| `entryPrice`   | String, > 0, at most 10 integer digits and 2 decimal places, multiple of the tick size             |
| `exitPrice`    | Same as `entryPrice`; null or omitted when OPEN                                                    |
| `enteredAt`    | ISO 8601 date-time string with `Z` or a UTC offset, e.g. `"2026-09-30T14:30:00-04:00"`             |
| `exitedAt`     | Same as `enteredAt`; null or omitted when OPEN                                                     |
| `fees`         | String, >= 0, at most 8 integer digits and 2 decimal places; on create optional, defaults to `"0"` |
| `notes`        | String of at most 10,000 characters; optional                                                      |

- Prices and fees sent as JSON numbers are rejected. Timestamps without `Z` or an offset are
  rejected, because they don't identify a single instant.
- The server-owned fields `id`, `pointValueSnapshot`, `pnlPoints`, `grossPnl`, `netPnl`,
  `createdAt` and `updatedAt` are ignored. Any other unknown field (for example a typo such
  as `instrumntId`) is rejected.
- A CLOSED trade is also rejected if its computed P&L is too large for its column.

### Editing (`PUT /api/trades/:id`)

`PUT` is a **full replacement** of every client-owned field: the trade becomes exactly what
the body describes, plus the fields the server computes. The rules above apply, except:

- `status` and `fees` are **required** (no defaults), so a forgotten field never silently
  reopens a trade or resets its fees.
- Omitted nullable fields mean `null`: leaving out `notes` clears the notes.

## Status rules

|                         | OPEN         | CLOSED              |
| ----------------------- | ------------ | ------------------- |
| `exitPrice`, `exitedAt` | must be null | required            |
| `exitedAt >= enteredAt` | n/a          | required            |
| P&L fields              | null         | computed and stored |

- **Closing** a trade: `PUT` with `status: "CLOSED"` plus `exitPrice` and `exitedAt`.
- **Reopening** a trade: `PUT` with `status: "OPEN"` and no exit fields. The server clears
  the exit fields and P&L. Sending exit fields with `status: "OPEN"` is rejected.
- **Editing a CLOSED trade** always makes the server recalculate and overwrite its P&L,
  including when its instrument changes (see [Point value snapshot](#point-value-snapshot)).

## Point value snapshot

- When a trade is **created**, the server copies the selected Instrument's `pointValue`
  into `pointValueSnapshot`.
- All P&L for that trade uses `pointValueSnapshot`, never the live Instrument row.
- Changing the Instrument table afterwards does **not** change existing trades.
- The snapshot changes only when an edit changes the trade's own `instrumentId`. An edit that
  keeps the same instrument keeps the stored snapshot, even if the Instrument row's
  `pointValue` has changed since.

| Trade status when edited | What the server does in that same operation                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OPEN                     | Replaces `pointValueSnapshot` with the new Instrument's `pointValue`. P&L fields stay null.                                                  |
| CLOSED                   | Replaces `pointValueSnapshot` with the new Instrument's `pointValue`, then recalculates and overwrites `pnlPoints`, `grossPnl` and `netPnl`. |

For a CLOSED trade, the new snapshot and the recalculated P&L are saved in a single
database write, so a trade is never stored with a snapshot that doesn't match its P&L.
Prices are checked against the **new** instrument's tick size.

## P&L calculation

The server is the single source of truth for P&L.

```
sign      = LONG → +1, SHORT → −1
pnlPoints = (exitPrice − entryPrice) × sign
grossPnl  = pnlPoints × pointValueSnapshot × quantity
netPnl    = grossPnl − fees
```

Example: LONG 2 MNQ, entry 18000.00, exit 18010.25, fees $2.48

```
pnlPoints = 10.25
grossPnl  = 10.25 × 2 × 2 = 41.00
netPnl    = 41.00 − 2.48  = 38.52
```

### Precision rules

- All monetary and price arithmetic uses `decimal.js`, never JavaScript `number`.
- Prices, fees, point values and P&L are sent and received in JSON as **strings**
  (for example `"18000.25"`, `"38.52"`). The client formats them for display only and
  never does arithmetic on them.
- P&L is computed when a trade is closed or edited, then stored. Reads and stats use the
  stored values.

## Stats (`GET /api/stats`)

Computed on the server with `decimal.js` from one read of every trade:

- Money totals and outcomes use **CLOSED** trades only. OPEN trades only add to `openTrades`.
- They use each trade's **stored** `grossPnl`, `netPnl` and `fees`; nothing is recalculated.
- A trade's outcome is set by its `netPnl`: a win if `> 0`, a loss if `< 0`, a
  break-even if `= 0`.

```json
{
  "totalNetPnl": "113.04",
  "totalGrossPnl": "120.48",
  "totalFees": "7.44",
  "closedTrades": 4,
  "openTrades": 1,
  "wins": 2,
  "losses": 1,
  "breakEvens": 1,
  "winRate": "50.00",
  "averageWin": "69.27",
  "averageLoss": "-25.50"
}
```

| Field                                       | Meaning                                                        | When undefined     |
| ------------------------------------------- | -------------------------------------------------------------- | ------------------ |
| `totalNetPnl`, `totalGrossPnl`, `totalFees` | Sum over CLOSED trades                                         | `"0.00"` (no sum)  |
| `closedTrades`, `openTrades`                | Number of trades with that status (JSON integers)              | `0`                |
| `wins`, `losses`, `breakEvens`              | Number of CLOSED trades with that outcome (JSON integers)      | `0`                |
| `winRate`                                   | Percentage: `wins ÷ closedTrades × 100`; break-evens count     | `null` (no CLOSED) |
| `averageWin`                                | Sum of winning `netPnl` ÷ `wins`                               | `null` (no wins)   |
| `averageLoss`                               | Sum of losing `netPnl` ÷ `losses`; **negative**, like `netPnl` | `null` (no losses) |

- Every field is always present. Money and `winRate` are strings with exactly two decimal
  places; `winRate` runs from `"0.00"` to `"100.00"`.
- **Totals are exact.** They are sums of two-place values and are never rounded.
- **`winRate` and the averages are rounded once**, half up (away from zero, so `-0.015`
  becomes `"-0.02"`), to two places. Sums are exact first; only the final quotient is
  rounded. This is the one place the server rounds: a quotient such as 100 ÷ 3 often has no
  exact decimal value, and these values are computed on each request, never stored or used
  in further arithmetic. Stored trade P&L is never rounded.
- `-0.00` is never returned; zero is `"0.00"`.
- A CLOSED trade with a null `grossPnl`, `netPnl` or `fees` breaks a server invariant.
  Stats then fail with a 500 instead of skipping the trade.

## API (v0.1)

```
GET    /api/instruments     ordered by id (NQ, MNQ, ES, MES)
GET    /api/trades          newest first: enteredAt descending, then id descending
POST   /api/trades
GET    /api/trades/:id
PUT    /api/trades/:id
DELETE /api/trades/:id
GET    /api/stats
```

### Responses and errors

- **Trade bodies** list every Trade column (no relations). Decimal fields are strings with
  exactly two decimal places (`"18000.00"`, `"0.00"`); timestamps are ISO 8601 strings in
  UTC (`"2026-09-30T14:30:00.000Z"`); unset optional fields are `null`, never omitted.
- **Instrument bodies** list `id`, `symbol`, `name`, `pointValue` and `tickSize`. Decimal
  fields are strings with their column's scale: `pointValue` has two decimal places
  (`"20.00"`) and `tickSize` has four (`"0.2500"`).
- `GET /api/instruments` and `GET /api/trades` return **200** with a JSON array (`[]` when
  empty). v0.1 has no pagination.
- `GET /api/trades/:id` returns **200** with the trade. `:id` must be canonical digits from
  1 to 2147483647 (no sign, leading zero, decimal point, exponent or whitespace).
- `POST /api/trades` returns **201** with the created trade.
- `PUT /api/trades/:id` returns **200** with the updated trade. The target is checked
  before the body, so a missing trade is a 404 whatever was sent.
- `DELETE /api/trades/:id` returns **204** with no body. The same `:id` rules apply.
- `GET /api/stats` returns **200** with the stats object described in
  [Stats](#stats-get-apistats), including when there are no trades.
- **400 validation error**: the payload broke a rule above. Each issue gives the field path
  (`[]` for the payload as a whole) and a message:

  ```json
  {
    "error": "Validation failed",
    "issues": [{ "path": ["entryPrice"], "message": "must be greater than 0" }]
  }
  ```

- **400 invalid id**: a malformed `:id` is a validation error at path `["id"]`:

  ```json
  {
    "error": "Validation failed",
    "issues": [
      { "path": ["id"], "message": "must be a positive integer no greater than 2147483647" }
    ]
  }
  ```

- **400 malformed JSON**: `{ "error": "Malformed JSON body" }`.
- **404 missing trade**: a valid id with no trade returns `{ "error": "Trade not found" }`.
  This includes a trade that disappears between a `PUT`'s lookup and its update, and a
  trade that is already gone when a `DELETE` runs.
- **404**: any unknown `/api` route returns `{ "error": "Not found" }`.
- **500**: any other failure, including database errors, returns
  `{ "error": "Internal server error" }`. Details are logged on the server, never sent.
