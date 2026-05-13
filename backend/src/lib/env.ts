// Validates environment variables at boot. Failing fast here eliminates
// a class of "works on my machine" bugs (CLAUDE.md: no hardcoded secrets).
import { z } from 'zod';

const EnvSchema = z
  .object({
    DATABASE_URL: z.string().url(),

    // 32 chars is the NIST-recommended minimum for HMAC-SHA256 keys
    // (256 bits). Generate one with `openssl rand -hex 32`.
    JWT_SECRET: z
      .string()
      .min(32, 'JWT_SECRET must be at least 32 chars (use `openssl rand -hex 32`)'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(
        32,
        'JWT_REFRESH_SECRET must be at least 32 chars (use `openssl rand -hex 32`)',
      ),

    // OAuth values may be blank in dev — Google routes will 503 if missing.
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    // No hardcoded default: when GOOGLE_CLIENT_ID is set we require the
    // callback URL to be set too (validated in superRefine below). A
    // localhost default was silently shipping broken OAuth callbacks to
    // production when an operator forgot the var.
    GOOGLE_CALLBACK_URL: z.string().url().optional(),

    // Optional at boot so non-chat routes still work without AI configured.
    // /api/chat returns 503 when this is blank.
    ANTHROPIC_API_KEY: z.string().default(''),
    // Configurable so newer Sonnet snapshots are swappable without a code
    // change. NOTE: CLAUDE.md still lists `claude-sonnet-4-20250514`, which
    // is deprecated and retires 2026-06-15 — keep this default on the
    // current `claude-sonnet-4-6` alias. See docs/plans/ai-agent.md and
    // the agent-memory `anthropic_sdk_decisions` note.
    ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),

    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    FRONTEND_URL: z.string().url(),
    E2E_FAKE_AI: z.coerce.boolean().default(false),
  })
  .superRefine((env, ctx) => {
    // OAuth is opt-in: if a client id is configured, the callback URL
    // must be too. The previous localhost default let a prod deploy boot
    // with a broken redirect_uri without anyone noticing.
    if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CALLBACK_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CALLBACK_URL'],
        message:
          'GOOGLE_CALLBACK_URL is required when GOOGLE_CLIENT_ID is set (no localhost fallback in production).',
      });
    }
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
