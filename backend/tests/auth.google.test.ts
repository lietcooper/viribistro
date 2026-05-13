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
            // The Passport callback must NEVER receive passwordHash.
            // Even if the DB column is null for OAuth users, leaking the
            // key would let a future code change silently expose hashes.
            expect(user).not.toHaveProperty('passwordHash');
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

    it('rejects Google sign-in when a local-provider account exists for that email', async () => {
      // Pre-seed a *local* user. Auto-linking this account to a Google
      // identity would be an account-takeover vector — the verify
      // callback must refuse it instead of silently merging.
      await prisma.user.create({
        data: {
          email: 'returning@example.com',
          name: 'Returning Customer',
          provider: 'local',
          avatarUrl: 'https://example.com/old.png',
          passwordHash: '$2b$12$abcdefghijklmnopqrstuvCkPmU2kfMTBSyq6ImpiV7B/4Z/qSyByO',
        },
      });

      const profile = {
        id: 'google-user-2',
        displayName: 'Returning Customer',
        emails: [{ value: 'returning@example.com' }],
        photos: [{ value: 'https://example.com/new.png' }],
      };

      await expect(
        new Promise((resolve, reject) => {
          googleVerifyCallback('access', 'refresh', profile, (err, u) => {
            if (err) return reject(err);
            resolve(u);
          });
        }),
      ).rejects.toMatchObject({ code: 'EMAIL_TAKEN_LOCAL' });
    });

    it('returns the existing User when a google-provider account already exists for that email', async () => {
      // Returning Google user — auto-link is safe because the existing
      // account was itself created via Google. The callback must NOT
      // leak passwordHash even though google accounts have it as null.
      const existing = await prisma.user.create({
        data: {
          email: 'google-returning@example.com',
          name: 'Returning Google User',
          provider: 'google',
          avatarUrl: 'https://example.com/old.png',
        },
      });

      const profile = {
        id: 'google-user-2b',
        displayName: 'Returning Google User',
        emails: [{ value: 'google-returning@example.com' }],
        photos: [{ value: 'https://example.com/new.png' }],
      };

      const user = await new Promise<{
        id: string;
        email: string;
        provider: string;
        passwordHash?: string;
      }>((resolve, reject) => {
        googleVerifyCallback('access', 'refresh', profile, (err, u) => {
          if (err) return reject(err);
          resolve(u);
        });
      });

      expect(user.id).toBe(existing.id);
      expect(user.email).toBe('google-returning@example.com');
      expect(user).not.toHaveProperty('passwordHash');
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
