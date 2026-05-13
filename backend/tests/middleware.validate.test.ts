import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validate } from '../src/middleware/validate.js';

function makeAppWithRoute(): express.Express {
  const app = express();
  app.use(express.json());

  app.post(
    '/echo',
    validate({
      body: z.object({
        name: z.string().min(1),
        age: z.coerce.number().int().positive(),
      }),
    }),
    (req, res) => {
      res.json({ received: req.body });
    },
  );

  app.get(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().regex(/^[a-z0-9]+$/) }),
      query: z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }),
    }),
    (req, res) => {
      res.json({ id: req.params.id, limit: req.query.limit ?? null });
    },
  );

  // Bare error middleware so failed validation surfaces a structured shape.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err && typeof err === 'object' && 'issues' in err) {
        const zerr = err as { issues: { path: (string | number)[]; message: string }[] };
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            fields: zerr.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
      return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal error' } });
    },
  );

  return app;
}

describe('validate() middleware', () => {
  it('passes a valid body through and runs the handler', async () => {
    const app = makeAppWithRoute();
    const res = await request(app).post('/echo').send({ name: 'Alice', age: 30 });
    expect(res.status).toBe(200);
    expect(res.body.received).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns 400 with field-level errors on an invalid body', async () => {
    const app = makeAppWithRoute();
    const res = await request(app).post('/echo').send({ name: '', age: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.fields.map((f: { path: string }) => f.path);
    expect(paths).toContain('body.name');
    expect(paths).toContain('body.age');
  });

  it('validates params and query and coerces types', async () => {
    const app = makeAppWithRoute();
    const ok = await request(app).get('/items/abc123?limit=10');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: 'abc123', limit: 10 });

    const bad = await request(app).get('/items/HAS_CAPS?limit=999');
    expect(bad.status).toBe(400);
    const paths = bad.body.error.fields.map((f: { path: string }) => f.path);
    expect(paths).toContain('params.id');
    expect(paths).toContain('query.limit');
  });
});
