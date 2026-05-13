import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildTestApp } from './helpers/testApp.js';
import { resetDb } from './helpers/resetDb.js';
import { prisma } from '../src/lib/prisma.js';

function extractRefreshCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((c) => c.startsWith('refreshToken='));
  if (!cookie) throw new Error('No refreshToken cookie in response');
  return cookie.split(';')[0]!; // "refreshToken=<value>"
}

async function registerAndGetCookie(): Promise<{ cookie: string; userId: string }> {
  const app = await buildTestApp();
  const res = await request(app)
    .post('/auth/register')
    .send({
      email: 'refresh@b.com',
      password: 'correcthorsebatterystaple',
      name: 'R',
    })
    .expect(201);
  const cookie = extractRefreshCookie(res.headers['set-cookie']);
  return { cookie, userId: res.body.user.id };
}

describe('Token refresh + logout', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe('POST /auth/refresh', () => {
    it('returns a new access token and rotates the refresh cookie', async () => {
      const { cookie } = await registerAndGetCookie();
      const app = await buildTestApp();
      const res = await request(app).post('/auth/refresh').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTypeOf('string');

      // New cookie should be set, and its value should differ from the input
      // (rotation requirement).
      const newCookie = extractRefreshCookie(res.headers['set-cookie']);
      expect(newCookie).not.toBe(cookie);
    });

    it('returns 401 when the refresh cookie is missing', async () => {
      const app = await buildTestApp();
      const res = await request(app).post('/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
    });

    it('returns 401 when the refresh cookie is expired', async () => {
      const { userId } = await registerAndGetCookie();
      const expired = jwt.sign(
        { sub: userId, email: 'refresh@b.com' },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: '-1s' },
      );
      const app = await buildTestApp();
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${expired}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('returns 401 when the refresh cookie is bogus', async () => {
      const app = await buildTestApp();
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', 'refreshToken=not-a-jwt');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the refresh cookie', async () => {
      const { cookie } = await registerAndGetCookie();
      const app = await buildTestApp();
      const res = await request(app).post('/auth/logout').set('Cookie', cookie);
      expect(res.status).toBe(204);

      const setCookie = res.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      const cleared = cookies.find((c) => c.startsWith('refreshToken='));
      expect(cleared).toBeDefined();
      // Cleared cookies appear with an immediate expiry — either Max-Age=0 or
      // an Expires in the past, depending on the cookie lib.
      expect(/Max-Age=0|Expires=Thu, 01 Jan 1970/.test(cleared!)).toBe(true);
    });

    it('succeeds even when no cookie was sent (idempotent)', async () => {
      const app = await buildTestApp();
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(204);
    });
  });
});
