import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';

describe('Prisma client', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('connects to the test database', async () => {
    await expect(prisma.$connect()).resolves.toBeUndefined();
  });

  it('can execute a trivial query', async () => {
    const rows = await prisma.$queryRawUnsafe<{ one: number }[]>('SELECT 1 AS one');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.one)).toBe(1);
  });
});
