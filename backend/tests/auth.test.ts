import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { resetDb } from './helpers/resetDb.js';
import { prisma } from '../src/lib/prisma.js';

describe('Email/password auth', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe('POST /auth/register', () => {
    it('creates a User (provider=local) and returns user + access token + refresh cookie', async () => {
      const app = await buildTestApp();
      const res = await request(app)
        .post('/auth/register')
        .send({
          email: 'a@b.com',
          password: 'correcthorsebatterystaple',
          name: 'Alice',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: 'a@b.com',
        name: 'Alice',
        provider: 'local',
      });
      expect(res.body.user.id).toMatch(/^c/);
      // Sensitive fields should not be exposed.
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.accessToken).toBeTypeOf('string');
      expect(res.body.accessToken.length).toBeGreaterThan(20);

      const setCookie = res.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      expect(cookies.some((c) => /refreshToken=/.test(c) && /HttpOnly/i.test(c))).toBe(true);

      const dbUser = await prisma.user.findUnique({ where: { email: 'a@b.com' } });
      expect(dbUser?.provider).toBe('local');
      expect(dbUser?.passwordHash).toBeTruthy();
      expect(dbUser?.passwordHash).not.toBe('correcthorsebatterystaple');
    });

    it('rejects a duplicate email with 409', async () => {
      const app = await buildTestApp();
      const body = { email: 'dup@b.com', password: 'correcthorsebatterystaple', name: 'A' };
      await request(app).post('/auth/register').send(body).expect(201);
      const res = await request(app).post('/auth/register').send(body);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('rejects a weak password with 400', async () => {
      const app = await buildTestApp();
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'weak@b.com', password: 'short', name: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects malformed email with 400', async () => {
      const app = await buildTestApp();
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'correcthorsebatterystaple', name: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /auth/login', () => {
    it('returns access token + refresh cookie on correct credentials', async () => {
      const app = await buildTestApp();
      await request(app)
        .post('/auth/register')
        .send({
          email: 'login@b.com',
          password: 'correcthorsebatterystaple',
          name: 'L',
        })
        .expect(201);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'login@b.com', password: 'correcthorsebatterystaple' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('login@b.com');
      expect(res.body.accessToken).toBeTypeOf('string');
      const setCookie = res.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      expect(cookies.some((c) => /refreshToken=/.test(c))).toBe(true);
    });

    it('returns 401 with a generic message on wrong password', async () => {
      const app = await buildTestApp();
      await request(app)
        .post('/auth/register')
        .send({
          email: 'wrong@b.com',
          password: 'correcthorsebatterystaple',
          name: 'W',
        })
        .expect(201);

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'wrong@b.com', password: 'wrong-password-here' });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('returns 401 (not 404) when the user does not exist', async () => {
      const app = await buildTestApp();
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'ghost@b.com', password: 'anything-here-ok' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    });
  });
});
