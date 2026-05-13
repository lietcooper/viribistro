// Global error middleware. Must be the LAST middleware mounted on the app.
//
// Recognizes:
//   ZodError    → 400 with { code: 'VALIDATION_ERROR', fields: [{ path, message }] }
//   AppError    → status + { code, message, details? } as authored
//   anything    → 500 generic; logs the full stack with pino at `error` level
//                 (CLAUDE.md line 20: no silent failures).
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        fields: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Anything else is unexpected — log everything we know about it. We never
  // leak the raw message to the client (it might contain stack traces or
  // DB error strings) — the response is intentionally generic.
  logger.error(
    {
      err,
      method: req.method,
      url: req.originalUrl,
    },
    'Unhandled error in request pipeline',
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
};
