// Entrypoint for `node dist/server.js` (prod) and `tsx watch src/server.ts` (dev).
// Load .env BEFORE importing env.ts so the Zod validator sees the values.
// In production, env vars come from the platform (Railway) and dotenv is a no-op.
import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Bistro API listening');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      { port: env.PORT },
      `Port ${env.PORT} is already in use. Stop the other process or set PORT to another value.`,
    );
    process.exit(1);
  }
  logger.error({ err }, 'Server failed to start');
  process.exit(1);
});

// Graceful shutdown — important on Railway where SIGTERM is sent on redeploy.
function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'Shutting down');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
