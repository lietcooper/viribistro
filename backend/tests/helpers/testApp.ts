// Test helper that returns the Express app instance for supertest.
// We rely on .env.test being loaded by tests/helpers/setup.ts (vitest setupFile)
// before this module is imported.
import type { Express } from 'express';

export async function buildTestApp(): Promise<Express> {
  // Dynamic import so env vars are validated AFTER .env.test is loaded.
  const { createApp } = await import('../../src/app.js');
  return createApp();
}
