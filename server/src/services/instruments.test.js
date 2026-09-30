import { describe, expect, it, vi } from 'vitest';
import { listInstruments } from './instruments.js';

describe('listInstruments', () => {
  it('returns every instrument ordered by id', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const prisma = { instrument: { findMany: vi.fn(async () => rows) } };

    await expect(listInstruments(prisma)).resolves.toBe(rows);
    expect(prisma.instrument.findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } });
  });
});
