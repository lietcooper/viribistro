import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { resetDb } from './helpers/resetDb.js';
import { prisma } from '../src/lib/prisma.js';
import { seedMenu } from '../prisma/seed.js';

describe('Public menu routes', () => {
  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe('GET /api/menu', () => {
    it('returns all available items sorted by category (enum order) then name', async () => {
      const app = await buildTestApp();
      const res = await request(app).get('/api/menu');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(24);

      // Postgres orders enums by declaration order, not alphabetically.
      // Prisma schema enum: starters | mains | desserts | drinks.
      const order = ['starters', 'mains', 'desserts', 'drinks'];
      const items = res.body.items as { category: string; name: string }[];
      const sorted = [...items].sort((a, b) => {
        const ca = order.indexOf(a.category);
        const cb = order.indexOf(b.category);
        return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
      });
      expect(items).toEqual(sorted);
      expect(items[0]!.category).toBe('starters');
      expect(items[items.length - 1]!.category).toBe('drinks');

      // Shape of one item.
      const item = res.body.items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('price');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('tags');
      expect(item).toHaveProperty('imageUrl');
      // price serialized as string for Decimal safety.
      expect(typeof item.price).toBe('string');
    });

    it('hides items where available=false', async () => {
      const any = await prisma.menuItem.findFirst();
      if (!any) throw new Error('No menu items seeded');
      await prisma.menuItem.update({ where: { id: any.id }, data: { available: false } });
      try {
        const app = await buildTestApp();
        const res = await request(app).get('/api/menu');
        expect(res.status).toBe(200);
        const ids = res.body.items.map((i: { id: string }) => i.id);
        expect(ids).not.toContain(any.id);
      } finally {
        await prisma.menuItem.update({ where: { id: any.id }, data: { available: true } });
      }
    });

    it('filters by ?category=mains', async () => {
      const app = await buildTestApp();
      const res = await request(app).get('/api/menu?category=mains');
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(8);
      expect(res.body.items.every((i: { category: string }) => i.category === 'mains')).toBe(
        true,
      );
    });

    it('rejects an invalid ?category with 400', async () => {
      const app = await buildTestApp();
      const res = await request(app).get('/api/menu?category=appetizers');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/menu/:id', () => {
    it('returns the single item', async () => {
      const any = await prisma.menuItem.findFirst();
      if (!any) throw new Error('No menu items seeded');
      const app = await buildTestApp();
      const res = await request(app).get(`/api/menu/${any.id}`);
      expect(res.status).toBe(200);
      expect(res.body.item.id).toBe(any.id);
      expect(res.body.item.name).toBe(any.name);
    });

    it('returns 404 when not found', async () => {
      const app = await buildTestApp();
      // Syntactically valid CUID v1 (`c` + 24 lowercase alphanumerics)
      // that the DB doesn't know about — exercises the route-layer 404,
      // not the schema-layer 400.
      const res = await request(app).get('/api/menu/c000000000000000000000000');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for a malformed id (rejected by MenuParamsSchema)', async () => {
      const app = await buildTestApp();
      const res = await request(app).get('/api/menu/not-a-cuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
