// Instrument read logic. No Express: routes/instruments.js calls this.

/**
 * Lists every instrument in id order, which is seed order (NQ, MNQ, ES, MES).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<import('@prisma/client').Instrument[]>} the rows, as Prisma returns them
 */
export function listInstruments(prisma) {
  return prisma.instrument.findMany({ orderBy: { id: 'asc' } });
}
