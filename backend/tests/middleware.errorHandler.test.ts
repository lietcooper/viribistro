import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AppError } from '../src/lib/AppError.js';
import { logger } from '../src/lib/logger.js';

function makeApp(handler: express.RequestHandler): express.Express {
  const app = express();
  app.use(express.json());
  app.get('/boom', handler);
  app.use(errorHandler);
  return app;
}

describe('global error middleware', () => {
  it('renders ZodError as 400 with field-level errors', async () => {
    const app = makeApp((_req, _res, next) => {
      const schema = z.object({ name: z.string() });
      try {
        schema.parse({ name: 42 });
      } catch (e) {
        next(e);
      }
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields[0].path).toBe('name');
  });

  it('renders AppError as its status + code + message', async () => {
    const app = makeApp((_req, _res, next) => {
      next(new AppError(403, 'FORBIDDEN', 'Nope'));
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('Nope');
  });

  it('forwards details when AppError has details', async () => {
    const app = makeApp((_req, _res, next) => {
      next(new AppError(409, 'CONFLICT', 'Bad', { which: 'email' }));
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ which: 'email' });
  });

  it('renders unknown errors as 500 generic and logs the stack with pino', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never);
    try {
      const app = makeApp((_req, _res, next) => {
        next(new Error('boom'));
      });
      const res = await request(app).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).toBe('Internal server error');
      // pino.error called with an err field.
      expect(spy).toHaveBeenCalled();
      const firstCall = spy.mock.calls[0]!;
      expect(firstCall[0]).toHaveProperty('err');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not leak the raw error message to the client on 500', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never);
    try {
      const app = makeApp((_req, _res, next) => {
        next(new Error('SECRET-DB-PASSWORD-LEAKED'));
      });
      const res = await request(app).get('/boom');
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('SECRET-DB-PASSWORD-LEAKED');
    } finally {
      spy.mockRestore();
    }
  });
});
