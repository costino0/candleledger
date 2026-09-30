-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('LONG', 'SHORT');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Instrument" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pointValue" DECIMAL(10,2) NOT NULL,
    "tickSize" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "instrumentId" INTEGER NOT NULL,
    "direction" "Direction" NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OPEN',
    "quantity" INTEGER NOT NULL,
    "entryPrice" DECIMAL(12,2) NOT NULL,
    "exitPrice" DECIMAL(12,2),
    "enteredAt" TIMESTAMPTZ(3) NOT NULL,
    "exitedAt" TIMESTAMPTZ(3),
    "fees" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pointValueSnapshot" DECIMAL(10,2) NOT NULL,
    "pnlPoints" DECIMAL(12,2),
    "grossPnl" DECIMAL(14,2),
    "netPnl" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_key" ON "Instrument"("symbol");

-- CreateIndex
CREATE INDEX "Trade_instrumentId_idx" ON "Trade"("instrumentId");

-- CreateIndex
CREATE INDEX "Trade_enteredAt_idx" ON "Trade"("enteredAt");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
