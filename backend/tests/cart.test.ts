import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { resetDb } from './helpers/resetDb.js';
import { prisma } from '../src/lib/prisma.js';
import { seedMenu } from '../prisma/seed.js';
import * as cartService from '../src/services/cart.js';
import { signAccessToken } from '../src/services/auth.js';

describe('Cart HTTP routes', () => {
  let burgerId: string;
  let burgerCustomizations: Record<string, string[]>;

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const b = await prisma.menuItem.findFirst({ where: { name: 'Wagyu Beef Burger' } });
    if (!b) throw new Error('seed missing burger');
    burgerId = b.id;
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
    await cartService.clearCart('sess-1');
    await cartService.clearCart('sess-2');
  });

  it('GET /api/cart returns the cart for a session (empty by default)', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/cart?sessionId=sess-1');
    expect(res.status).toBe(200);
    expect(res.body.cart.items).toEqual([]);
    expect(res.body.cart.total).toBe('0.00');
  });

  it('GET /api/cart without sessionId returns 400', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/cart');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/cart adds an item', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/cart')
      .send({
        sessionId: 'sess-1',
        menuItemId: burgerId,
        quantity: 2,
        customizations: burgerCustomizations,
      });
    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].quantity).toBe(2);
  });

  it('uses authenticated user cart instead of shared browser session cart', async () => {
    const app = await buildTestApp();
    const userA = await prisma.user.create({
      data: { email: 'route-cart-a@example.com', name: 'Route Cart A', provider: 'google' },
    });
    const userB = await prisma.user.create({
      data: { email: 'route-cart-b@example.com', name: 'Route Cart B', provider: 'google' },
    });
    const tokenA = signAccessToken({ sub: userA.id, email: userA.email });
    const tokenB = signAccessToken({ sub: userB.id, email: userB.email });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sessionId: 'same-browser-session',
        menuItemId: burgerId,
        quantity: 1,
        customizations: burgerCustomizations,
      })
      .expect(200);

    const resB = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${tokenB}`)
      .query({ sessionId: 'same-browser-session' });

    expect(resB.status).toBe(200);
    expect(resB.body.cart.items).toEqual([]);
  });

  it('POST /api/cart with unknown menuItemId returns 400', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/cart')
      .send({ sessionId: 'sess-1', menuItemId: 'cnotreal', quantity: 1 });
    expect(res.status).toBe(400);
    expect(['UNKNOWN_MENU_ITEM', 'VALIDATION_ERROR']).toContain(res.body.error.code);
  });

  it('PATCH /api/cart modifies quantity', async () => {
    const app = await buildTestApp();
    await request(app)
      .post('/api/cart')
      .send({
        sessionId: 'sess-1',
        menuItemId: burgerId,
        quantity: 1,
        customizations: burgerCustomizations,
      })
      .expect(200);

    const cart = await cartService.getCart('sess-1');
    const res = await request(app)
      .patch('/api/cart')
      .send({ sessionId: 'sess-1', cartItemId: cart.items[0].id, quantity: 4 });
    expect(res.status).toBe(200);
    expect(res.body.cart.items[0].quantity).toBe(4);
  });

  it('DELETE /api/cart/:menuItemId removes an item', async () => {
    const app = await buildTestApp();
    await request(app)
      .post('/api/cart')
      .send({
        sessionId: 'sess-1',
        menuItemId: burgerId,
        quantity: 1,
        customizations: burgerCustomizations,
      })
      .expect(200);

    const cart = await cartService.getCart('sess-1');
    const res = await request(app)
      .delete(`/api/cart/${cart.items[0].id}`)
      .query({ sessionId: 'sess-1' });
    expect(res.status).toBe(200);
    expect(res.body.cart.items).toEqual([]);
  });

  it('POST /api/cart/reset empties the cart', async () => {
    const app = await buildTestApp();
    await request(app)
      .post('/api/cart')
      .send({
        sessionId: 'sess-1',
        menuItemId: burgerId,
        quantity: 1,
        customizations: burgerCustomizations,
      })
      .expect(200);

    const res = await request(app).post('/api/cart/reset').send({ sessionId: 'sess-1' });
    expect(res.status).toBe(200);
    expect(res.body.cart.items).toEqual([]);
  });

  it('POST /api/cart validates required customizations', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/cart')
      .send({ sessionId: 'sess-1', menuItemId: burgerId, quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_CUSTOMIZATION');
  });
});
