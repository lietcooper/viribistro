import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { resetDb } from './helpers/resetDb.js';
import { prisma } from '../src/lib/prisma.js';
import { seedMenu } from '../prisma/seed.js';
import * as cartService from '../src/services/cart.js';

async function registerAndLogin(): Promise<{ accessToken: string; userId: string }> {
  const app = await buildTestApp();
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'orderer@b.com', password: 'correcthorsebatterystaple', name: 'O' })
    .expect(201);
  return { accessToken: res.body.accessToken, userId: res.body.user.id };
}

describe('Orders routes', () => {
  let burgerId: string;
  let salmonId: string;

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const b = await prisma.menuItem.findFirst({ where: { name: 'Wagyu Beef Burger' } });
    const s = await prisma.menuItem.findFirst({ where: { name: 'Pan-Seared Salmon' } });
    if (!b || !s) throw new Error('seed missing items');
    burgerId = b.id;
    salmonId = s.id;
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    cartService.clearCart('order-sess');
    // Wipe orders + users so register/login can reuse the same email.
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('POST /api/orders', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = await buildTestApp();
      const res = await request(app)
        .post('/api/orders')
        .send({ sessionId: 'order-sess' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when the cart is empty', async () => {
      const { accessToken } = await registerAndLogin();
      const app = await buildTestApp();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CART_EMPTY');
    });

    it('creates an Order + OrderItems in a transaction, clears the cart', async () => {
      const { accessToken, userId } = await registerAndLogin();
      await cartService.addItem('order-sess', burgerId, 2);
      await cartService.addItem('order-sess', salmonId, 1);

      const app = await buildTestApp();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' });

      expect(res.status).toBe(201);
      expect(res.body.order.status).toBe('confirmed');
      expect(res.body.order.userId).toBe(userId);
      expect(res.body.order.items).toHaveLength(2);
      const totals = res.body.order.items.map((i: { quantity: number }) => i.quantity);
      expect(totals).toContain(2);
      expect(totals).toContain(1);

      // Cart cleared.
      expect(cartService.getCart('order-sess').items).toEqual([]);

      // DB row exists.
      const dbOrder = await prisma.order.findUnique({
        where: { id: res.body.order.id },
        include: { items: true },
      });
      expect(dbOrder).toBeTruthy();
      expect(dbOrder?.items).toHaveLength(2);
    });

    it('snapshots unitPrice from the menu item at confirmation time', async () => {
      const { accessToken } = await registerAndLogin();
      await cartService.addItem('order-sess', burgerId, 1);
      const item = await prisma.menuItem.findUnique({ where: { id: burgerId } });

      const app = await buildTestApp();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' })
        .expect(201);

      const orderItem = res.body.order.items[0];
      expect(orderItem.unitPrice).toBe(item!.price.toString());
    });
  });

  describe('GET /api/orders', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = await buildTestApp();
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
    });

    it('returns only the authenticated user\'s orders, newest first', async () => {
      const { accessToken } = await registerAndLogin();
      // place two orders sequentially
      const app = await buildTestApp();
      await cartService.addItem('order-sess', burgerId, 1);
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' })
        .expect(201);

      await cartService.addItem('order-sess', salmonId, 1);
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' })
        .expect(201);

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(2);
      // Newest first: the salmon order should come before the burger order.
      const t0 = new Date(res.body.orders[0].createdAt).getTime();
      const t1 = new Date(res.body.orders[1].createdAt).getTime();
      expect(t0).toBeGreaterThanOrEqual(t1);
    });
  });
});
