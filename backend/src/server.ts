// Entrypoint for `node dist/server.js` (prod) and `tsx watch src/server.ts` (dev).
import { createApp } from './app.js';
import { env } from './lib/env.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Bistro API listening');
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
