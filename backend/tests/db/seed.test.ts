import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { resetDb } from '../helpers/resetDb.js';
import { seedMenu } from '../../prisma/seed.js';

const REQUIRED_TAGS = ['vegan', 'vegetarian', 'spicy', 'gluten-free', 'signature'] as const;

describe('Menu seed', () => {
  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it('inserts at least 24 menu items', async () => {
    const count = await prisma.menuItem.count();
    expect(count).toBeGreaterThanOrEqual(24);
  });

  it('hits the per-category minimums (6/8/4/6)', async () => {
    const [starters, mains, desserts, drinks] = await Promise.all([
      prisma.menuItem.count({ where: { category: 'starters' } }),
      prisma.menuItem.count({ where: { category: 'mains' } }),
      prisma.menuItem.count({ where: { category: 'desserts' } }),
      prisma.menuItem.count({ where: { category: 'drinks' } }),
    ]);
    expect(starters).toBeGreaterThanOrEqual(6);
    expect(mains).toBeGreaterThanOrEqual(8);
    expect(desserts).toBeGreaterThanOrEqual(4);
    expect(drinks).toBeGreaterThanOrEqual(6);
  });

  it('covers every tag at least once', async () => {
    for (const tag of REQUIRED_TAGS) {
      const count = await prisma.menuItem.count({ where: { tags: { has: tag } } });
      expect(count, `expected at least one item tagged "${tag}"`).toBeGreaterThanOrEqual(1);
    }
  });

  it('every item has a non-empty description, positive price, and https imageUrl', async () => {
    const items = await prisma.menuItem.findMany();
    for (const item of items) {
      expect(item.description.length, `${item.name} description`).toBeGreaterThan(0);
      expect(item.price.toNumber(), `${item.name} price`).toBeGreaterThan(0);
      expect(item.imageUrl, `${item.name} imageUrl`).toMatch(/^https:\/\//);
    }
  });

  it('is idempotent — running seed twice does not duplicate items', async () => {
    const before = await prisma.menuItem.count();
    await seedMenu(prisma);
    const after = await prisma.menuItem.count();
    expect(after).toBe(before);
  });
});
