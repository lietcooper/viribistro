import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { resetDb } from './helpers/resetDb.js';
import { prisma } from '../src/lib/prisma.js';
import { googleVerifyCallback } from '../src/routes/auth.js';

describe('Google OAuth', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  describe('GET /auth/google', () => {
    it('redirects to accounts.google.com with the configured client_id and redirect_uri', async () => {
      const app = await buildTestApp();
      const res = await request(app).get('/auth/google');
      expect(res.status).toBe(302);
      const loc = res.headers.location;
      expect(loc).toMatch(/^https:\/\/accounts\.google\.com\//);
      expect(loc).toContain(`client_id=${encodeURIComponent('test-client-id')}`);
      expect(loc).toContain(
        `redirect_uri=${encodeURIComponent('http://localhost:3000/auth/google/callback')}`,
      );
      // Profile + email scopes requested.
      expect(decodeURIComponent(loc)).toContain('email');
      expect(decodeURIComponent(loc)).toContain('profile');
    });
  });

  describe('googleVerifyCallback', () => {
    it('upserts a User (provider=google) for a brand-new Google profile', async () => {
      const profile = {
        id: 'google-user-1',
        displayName: 'Grace Hopper',
        emails: [{ value: 'grace@example.com', verified: true }],
        photos: [{ value: 'https://example.com/avatar.png' }],
      };

      await new Promise<void>((resolve, reject) => {
        googleVerifyCallback('access', 'refresh', profile, (err, user) => {
          if (err) return reject(err);
          try {
            expect(user).toBeTruthy();
            expect(user.email).toBe('grace@example.com');
            expect(user.provider).toBe('google');
            resolve();
          } catch (e) {
            reject(e as Error);
          }
        });
      });

      const dbUser = await prisma.user.findUnique({ where: { email: 'grace@example.com' } });
      expect(dbUser).toBeTruthy();
      expect(dbUser?.provider).toBe('google');
      expect(dbUser?.passwordHash).toBeNull();
      expect(dbUser?.avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('returns the existing User when one already exists for that email', async () => {
      // Pre-seed a Google user.
      const existing = await prisma.user.create({
        data: {
          email: 'returning@example.com',
          name: 'Returning Customer',
          provider: 'google',
          avatarUrl: 'https://example.com/old.png',
        },
      });

      const profile = {
        id: 'google-user-2',
        displayName: 'Returning Customer',
        emails: [{ value: 'returning@example.com' }],
        photos: [{ value: 'https://example.com/new.png' }],
      };

      const user = await new Promise<{ id: string; email: string; provider: string }>((resolve, reject) => {
        googleVerifyCallback('access', 'refresh', profile, (err, u) => {
          if (err) return reject(err);
          resolve(u);
        });
      });

      expect(user.id).toBe(existing.id);
      expect(user.email).toBe('returning@example.com');
    });

    it('rejects a profile with no email', async () => {
      const profile = {
        id: 'google-user-3',
        displayName: 'No Email',
        emails: [],
      };
      await expect(
        new Promise((resolve, reject) => {
          googleVerifyCallback('access', 'refresh', profile, (err, u) => {
            if (err) return reject(err);
            resolve(u);
          });
        }),
      ).rejects.toThrow();
    });
  });
});
