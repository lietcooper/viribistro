// Per-IP rate limiters for cost-exposed and brute-force-target endpoints.
//
// - /api/chat hits the Anthropic API on every request, so an unbounded
//   client could exhaust our quota in minutes.
// - /auth/login is the obvious password-spray target — bcrypt cost 12 is
//   slow on purpose, but we still want to cap attempts per IP.
//
// Skipped in test runs so concurrent supertest calls don't flake; the
// middleware is a pass-through no-op under NODE_ENV=test.
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../lib/env.js';

const ONE_MINUTE = 60 * 1000;

function structuredError(code: string, message: string) {
  return { error: { code, message } };
}

function makeLimiter(opts: {
  windowMs: number;
  max: number;
  code: string;
  message: string;
}): RequestHandler {
  if (env.NODE_ENV === 'test') {
    // No-op limiter under test; supertest's bursts trip the real limits.
    const passthrough: RequestHandler = (_req, _res, next) => next();
    return passthrough;
  }
  const limiter: RateLimitRequestHandler = rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(structuredError(opts.code, opts.message));
    },
  });
  return limiter;
}

/** 10 req/min/IP — LLM cost exposure on /api/chat. */
export const chatRateLimit: RequestHandler = makeLimiter({
  windowMs: ONE_MINUTE,
  max: 10,
  code: 'RATE_LIMITED',
  message: 'Too many chat requests — please slow down and try again in a minute.',
});

/** 5 req/min/IP — brute-force gate on /auth/login. */
export const loginRateLimit: RequestHandler = makeLimiter({
  windowMs: ONE_MINUTE,
  max: 5,
  code: 'RATE_LIMITED',
  message: 'Too many login attempts — please wait a minute before trying again.',
});
