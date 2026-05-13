import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { buildTestApp } from './helpers/testApp.js';
import { prisma } from '../src/lib/prisma.js';

describe('GET /healthz', () => {
  let app: Express;

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns 200 { ok: true }', async () => {
    app = await buildTestApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
