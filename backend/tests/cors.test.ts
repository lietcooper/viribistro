import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { prisma } from '../src/lib/prisma.js';

describe('CORS configuration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows the configured FRONTEND_URL with credentials', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/healthz').set('Origin', 'http://localhost:8081');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does NOT echo back an unrelated origin', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/healthz').set('Origin', 'https://evil.example.com');
    // Same-origin request from supertest still gets a 200 body — the browser
    // is what enforces the CORS check on the client. What we assert is that
    // we do not echo the evil origin back as allow-origin (which would be a
    // server-side misconfiguration).
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  it('responds to a preflight OPTIONS with the right headers', async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .options('/auth/login')
      .set('Origin', 'http://localhost:8081')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(res.status).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect((res.headers['access-control-allow-methods'] ?? '').toUpperCase()).toContain(
      'POST',
    );
  });
});
