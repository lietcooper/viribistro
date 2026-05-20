import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { resetDb } from './helpers/resetDb.js';
import { prisma } from '../src/lib/prisma.js';
import { seedMenu } from '../prisma/seed.js';
import * as cartService from '../src/services/cart.js';
import { normalizePrice } from '../src/services/cart.js';

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
  let burgerCustomizations: Record<string, string[]>;

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const b = await prisma.menuItem.findFirst({ where: { name: 'Wagyu Beef Burger' } });
    const s = await prisma.menuItem.findFirst({ where: { name: 'Pan-Seared Salmon' } });
    if (!b || !s) throw new Error('seed missing items');
    burgerId = b.id;
    salmonId = s.id;
    const temperature = await prisma.customizationGroup.findFirst({
      where: { menuItemId: b.id, name: 'Temperature' },
      include: { options: true },
    });
    const mediumRare = temperature?.options.find((o) => o.name === 'Medium rare');
    if (!temperature || !mediumRare) throw new Error('seed missing burger customizations');
    burgerCustomizations = { [temperature.id]: [mediumRare.id] };
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cartService.clearCart('order-sess');
    // Wipe orders + users so register/login can reuse the same email.
    await prisma.order.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('POST /api/orders', () => {
    it('allows guest checkout when a cart exists', async () => {
      await cartService.addItem('order-sess', burgerId, 1, burgerCustomizations);
      const app = await buildTestApp();
      const res = await request(app).post('/api/orders').send({ sessionId: 'order-sess' });
      expect(res.status).toBe(201);
      expect(res.body.order.userId).toBeNull();
      // Cart is cleared after a successful guest checkout, same as authed.
      expect((await cartService.getCart('order-sess')).items).toEqual([]);
    });

    it('falls through to a guest order when the Bearer token is invalid', async () => {
      // A malformed / expired Authorization header must NOT 401 the
      // request — anonymous checkout should still succeed. Guards
      // against a regression where requireAuth gets reintroduced.
      await cartService.addItem('order-sess', burgerId, 1, burgerCustomizations);
      const app = await buildTestApp();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', 'Bearer not-a-real-token')
        .send({ sessionId: 'order-sess' });
      expect(res.status).toBe(201);
      expect(res.body.order.userId).toBeNull();
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
      const owner = { sessionId: 'order-sess', userId };
      await cartService.addItem(owner, burgerId, 2, burgerCustomizations);
      await cartService.addItem(owner, salmonId, 1);

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
      expect((await cartService.getCart(owner)).items).toEqual([]);

      // DB row exists.
      const dbOrder = await prisma.order.findUnique({
        where: { id: res.body.order.id },
        include: { items: true },
      });
      expect(dbOrder).toBeTruthy();
      expect(dbOrder?.items).toHaveLength(2);
    });

    it('rejects concurrent confirmations of the same sessionId with 409 ORDER_IN_PROGRESS', async () => {
      const { accessToken, userId } = await registerAndLogin();
      await cartService.addItem(
        { sessionId: 'order-sess', userId },
        burgerId,
        1,
        burgerCustomizations,
      );

      const app = await buildTestApp();
      // Fire two simultaneous requests. The in-memory mutex keyed by
      // sessionId must let exactly one through; the other gets 409.
      const [a, b] = await Promise.all([
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ sessionId: 'order-sess' }),
        request(app)
          .post('/api/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ sessionId: 'order-sess' }),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 409]);
      const conflict = a.status === 409 ? a : b;
      expect(conflict.body.error.code).toBe('ORDER_IN_PROGRESS');

      // Only one Order row exists.
      const orders = await prisma.order.findMany({});
      expect(orders).toHaveLength(1);
    });

    it('releases the per-session lock after a failed confirmation', async () => {
      const { accessToken, userId } = await registerAndLogin();
      const app = await buildTestApp();

      // First call fails (empty cart).
      const fail = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' });
      expect(fail.status).toBe(400);
      expect(fail.body.error.code).toBe('CART_EMPTY');

      // Then a real order with the same sessionId should still succeed.
      await cartService.addItem(
        { sessionId: 'order-sess', userId },
        burgerId,
        1,
        burgerCustomizations,
      );
      const ok = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' });
      expect(ok.status).toBe(201);
    });

    it('snapshots unitPrice from the menu item at confirmation time', async () => {
      const { accessToken, userId } = await registerAndLogin();
      await cartService.addItem(
        { sessionId: 'order-sess', userId },
        burgerId,
        1,
        burgerCustomizations,
      );
      const item = await prisma.menuItem.findUnique({ where: { id: burgerId } });

      const app = await buildTestApp();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' })
        .expect(201);

      const orderItem = res.body.order.items[0];
      expect(orderItem.unitPrice).toBe(normalizePrice(item!.price));
    });

    it('preserves selected customizations and adjusted unit prices on order items', async () => {
      const { accessToken, userId } = await registerAndLogin();
      const cheese = await prisma.customizationGroup.findFirst({
        where: { menuItemId: burgerId, name: 'Cheese' },
        include: { options: true },
      });
      const blue = cheese?.options.find((o) => o.name === 'Blue cheese');
      if (!cheese || !blue) throw new Error('seed missing burger cheese');

      await cartService.addItem(
        { sessionId: 'order-sess', userId },
        burgerId,
        1,
        { ...burgerCustomizations, [cheese.id]: [blue.id] },
      );

      const app = await buildTestApp();
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' })
        .expect(201);

      const orderItem = res.body.order.items[0];
      expect(orderItem.unitPrice).toBe('29.00');
      expect(orderItem.customizationHash).toMatch(/^[a-f0-9]{64}$/);
      expect(orderItem.customizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            groupName: 'Cheese',
            options: [
              expect.objectContaining({
                optionName: 'Blue cheese',
                priceDelta: '3.00',
              }),
            ],
          }),
        ]),
      );
    });
  });

  describe('GET /api/orders', () => {
    it('returns 401 when unauthenticated', async () => {
      const app = await buildTestApp();
      const res = await request(app).get('/api/orders');
      expect(res.status).toBe(401);
    });

    it("returns only the authenticated user's orders, newest first", async () => {
      const { accessToken, userId } = await registerAndLogin();
      // place two orders sequentially
      const app = await buildTestApp();
      await cartService.addItem(
        { sessionId: 'order-sess', userId },
        burgerId,
        1,
        burgerCustomizations,
      );
      await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sessionId: 'order-sess' })
        .expect(201);

      await cartService.addItem({ sessionId: 'order-sess', userId }, salmonId, 1);
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
