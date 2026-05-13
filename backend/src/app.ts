// Express app factory. Kept separate from `server.ts` so tests can import
// the app without binding a port. Mounting order:
//   1. security + parsers (helmet, cors, json, cookie-parser)
//   2. structured request log (pino-http)
//   3. health route
//   4. feature routes (added in later steps)
//   5. global error handler (added in step 12)
import 'express-async-errors';
import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { menuRouter } from './routes/menu.js';
import { cartRouter } from './routes/cart.js';
import { ordersRouter } from './routes/orders.js';
import { chatRouter } from './routes/chat.js';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      // Quiet 200s in test mode; pino logger is already 'silent' in test env.
      autoLogging: env.NODE_ENV !== 'test',
    }),
  );

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use('/auth', authRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/chat', chatRouter);

  // Must be the LAST middleware mounted.
  app.use(errorHandler);

  return app;
}
