// Validates environment variables at boot. Failing fast here eliminates
// a class of "works on my machine" bugs (CLAUDE.md: no hardcoded secrets).
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),

  // OAuth values may be blank in dev — Google routes will 503 if missing.
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z
    .string()
    .url()
    .default('http://localhost:3000/auth/google/callback'),

  // Required so /api/chat can boot. Tests load a dummy value via .env.test.
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  // Configurable so newer Sonnet snapshots are swappable without a code
  // change. The default tracks the current Sonnet — see docs/plans/ai-agent.md.
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),

  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  FRONTEND_URL: z.string().url(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate env. Pass an explicit source for tests; defaults to
 * `process.env`. Throws an aggregated, human-readable error on missing vars.
 */
export function loadEnv(source: NodeJS.ProcessEnv | Record<string, unknown> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

// Eagerly validated singleton used by app code. Tests can re-parse via loadEnv().
export const env: Env = loadEnv();
