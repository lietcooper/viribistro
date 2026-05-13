import { prisma } from '../../src/lib/prisma.js';

/**
 * Truncate every domain table in dependency order so each test starts
 * from a known empty state without paying the cost of dropping/recreating
 * the schema.
 *
 * Order matters: children before parents. `RESTART IDENTITY CASCADE`
 * keeps cuid()-based ids deterministic-ish and resets any sequences.
 */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Message", "Conversation", "OrderItem", "Order", "MenuItem", "User" RESTART IDENTITY CASCADE;',
  );
}
