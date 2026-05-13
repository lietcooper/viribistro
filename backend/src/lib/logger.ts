import pino from 'pino';
import { env } from './env.js';

// Pretty-print in dev/test; structured JSON in prod.
export const logger = pino(
  env.NODE_ENV === 'production'
    ? { level: 'info' }
    : {
        level: env.NODE_ENV === 'test' ? 'silent' : 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      },
);
