// Email/password auth (Google OAuth is added in a later step). Issues a
// short-lived access token in the JSON body and a 7-day httpOnly refresh
// cookie. Cookie options are environment-aware: `secure` + `sameSite='none'`
// in prod (Vercel↔Railway cross-site), `sameSite='lax'` otherwise.
import { Router, type CookieOptions, type Response } from 'express';
import passport from 'passport';
import {
  Strategy as GoogleStrategy,
  type Profile as GoogleProfile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';
import { validate } from '../middleware/validate.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../services/auth.js';
import { RegisterBodySchema, LoginBodySchema } from '../schemas/auth.js';
import { loginRateLimit } from '../middleware/rateLimit.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';

export function refreshCookieOptions(): CookieOptions {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: 'local' | 'google';
  createdAt: Date;
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

function issueTokens(user: PublicUser): { accessToken: string; refreshToken: string } {
  const payload = { sub: user.id, email: user.email };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export const authRouter: Router = Router();

authRouter.post('/register', validate({ body: RegisterBodySchema }), async (req, res) => {
  const { email, password, name } = req.body as {
    email: string;
    password: string;
    name: string;
  };

  const passwordHash = await hashPassword(password);

  let user: PublicUser;
  try {
    user = await prisma.user.create({
      data: { email, name, passwordHash, provider: 'local' },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        provider: true,
        createdAt: true,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
    }
    throw err;
  }

  const { accessToken, refreshToken } = issueTokens(user);
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ user, accessToken });
});

authRouter.post(
  '/login',
  loginRateLimit,
  validate({ body: LoginBodySchema }),
  async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    // Always look up by email + run a bcrypt compare even on a missing user,
    // so timing doesn't leak account existence.
    const dbUser = await prisma.user.findUnique({ where: { email } });

    // Use a dummy hash so the timing is similar whether the user exists or not.
    // bcrypt's compare will always return false for this synthetic hash.
    const passwordHash =
      dbUser?.passwordHash ?? '$2b$12$abcdefghijklmnopqrstuvCkPmU2kfMTBSyq6ImpiV7B/4Z/qSyByO';
    const ok = await verifyPassword(password, passwordHash);

    if (!dbUser || !dbUser.passwordHash || !ok) {
      // Generic message — never reveal whether the email exists.
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const publicUser: PublicUser = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      avatarUrl: dbUser.avatarUrl,
      provider: dbUser.provider,
      createdAt: dbUser.createdAt,
    };
    const { accessToken, refreshToken } = issueTokens(publicUser);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ user: publicUser, accessToken });
  },
);

// Known limitation: refresh-token rotation is NOT implemented. Each
// successful /refresh issues a new pair, but the old refresh token
// remains valid until its 7-day TTL expires. A stolen cookie therefore
// keeps working for up to a week. Production-grade systems track
// issued refresh tokens in a revocation table so the previous token is
// invalidated on every rotation. For this portfolio project we accept
// the trade-off; if you ever wire token rotation, add a `RefreshToken`
// model keyed by jti and verify it on every call.
authRouter.post('/refresh', async (req, res) => {
  const token = (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ?? '';
  if (!token) {
    throw new AppError(401, 'NO_REFRESH_TOKEN', 'Missing refresh token');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    // Don't differentiate expired vs malformed in the user-facing message —
    // both mean "your session is gone, log in again".
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
  }

  // Confirm the user still exists (handles deleted accounts mid-session).
  const dbUser = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      provider: true,
      createdAt: true,
    },
  });
  if (!dbUser) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
  }

  const { accessToken, refreshToken } = issueTokens(dbUser);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ user: dbUser, accessToken });
});

authRouter.post('/logout', (_req, res) => {
  // Clear with the same path + sameSite as we set, so the browser actually
  // matches and removes it. clearCookie ignores maxAge — it always emits
  // Max-Age=0 / Expires=Thu, 01 Jan 1970.
  const { maxAge: _maxAge, ...clearOpts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, clearOpts);
  res.status(204).end();
});

// ─── Google OAuth ────────────────────────────────────────────────────────────
//
// Callback handoff decision:
//   We DO NOT put the access token in a URL fragment. The callback only sets
//   the refresh cookie and redirects the browser back to FRONTEND_URL. The
//   frontend then calls /auth/refresh on mount to obtain a fresh access
//   token. Why: URL fragments end up in browser history and ref logs;
//   keeping the access token strictly in JSON+memory is safer. The brief
//   "no token on first paint" UX issue is documented in docs/plans/frontend.md.

// The shape Passport sees — never includes passwordHash. Keeping this in
// one place stops a future "just add the field" tweak from leaking secrets.
const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  provider: true,
  createdAt: true,
} as const;

export async function googleVerifyCallback(
  _accessToken: string,
  _refreshToken: string,
  profile: GoogleProfile,
  done: VerifyCallback,
): Promise<void> {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(
        new AppError(400, 'GOOGLE_NO_EMAIL', 'Google profile did not include an email'),
      );
    }
    const avatarUrl = profile.photos?.[0]?.value ?? null;
    const name = profile.displayName?.trim() || email.split('@')[0]!;

    // Look up the existing account by email. Two important security rules:
    //  1. If a *local-provider* account already exists with this email, we
    //     REFUSE the Google sign-in. Auto-linking would let anyone holding
    //     the Google account of an email take over the password account —
    //     a real account-takeover vector if the user signed up with
    //     email/password and later someone else gains control of that
    //     Google address (org admin, recovered domain, etc.). The safe
    //     path is to make the user log in with their original method.
    //  2. We always select PUBLIC_USER_SELECT so `passwordHash` never
    //     reaches the Passport pipeline (and therefore never reaches
    //     downstream req.user / logs / serializers).
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { ...PUBLIC_USER_SELECT, provider: true },
    });
    if (existing) {
      if (existing.provider === 'local') {
        logger.warn(
          { email },
          'Google sign-in attempted for an email registered locally — refusing to auto-link',
        );
        return done(
          new AppError(
            409,
            'EMAIL_TAKEN_LOCAL',
            'An account with this email already exists. Please sign in with your password.',
          ),
        );
      }
      return done(null, existing);
    }
    const created = await prisma.user.create({
      data: {
        email,
        name,
        avatarUrl,
        provider: 'google',
      },
      select: PUBLIC_USER_SELECT,
    });
    return done(null, created);
  } catch (err) {
    logger.error({ err }, 'Google verify callback failed');
    return done(err as Error);
  }
}

// Register the strategy only if credentials are present. If a developer hasn't
// configured Google yet, the routes still mount but return 503 — that's
// clearer than crashing at boot.
const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
if (googleConfigured) {
  // env.GOOGLE_CALLBACK_URL is enforced by the env superRefine whenever
  // GOOGLE_CLIENT_ID is non-empty, but TS sees the type as `string | undefined`
  // — assert with the same precondition that gates this block.
  if (!env.GOOGLE_CALLBACK_URL) {
    throw new Error(
      'GOOGLE_CALLBACK_URL is required when GOOGLE_CLIENT_ID is set (env schema should have caught this).',
    );
  }
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      googleVerifyCallback,
    ),
  );
}

authRouter.get('/google', (req, res, next) => {
  if (!googleConfigured) {
    return next(
      new AppError(
        503,
        'GOOGLE_NOT_CONFIGURED',
        'Google sign-in is not configured on this server',
      ),
    );
  }
  // Each OAuth init carries a fresh CSRF `state` and (post-rotation) a fresh
  // redirect_uri. Caching the 302 makes Safari serve a stale Google URL on
  // the next click, which Google rejects as redirect_uri_mismatch.
  res.setHeader('Cache-Control', 'no-store');
  return passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })(req, res, next);
});

authRouter.get('/google/callback', (req, res, next) => {
  if (!googleConfigured) {
    return next(
      new AppError(
        503,
        'GOOGLE_NOT_CONFIGURED',
        'Google sign-in is not configured on this server',
      ),
    );
  }
  return passport.authenticate(
    'google',
    { session: false },
    (err: Error | null, user: PublicUser | false) => {
      if (err) return next(err);
      if (!user) {
        return next(new AppError(401, 'GOOGLE_AUTH_FAILED', 'Google authentication failed'));
      }
      const { refreshToken } = issueTokens(user);
      setRefreshCookie(res, refreshToken);
      // Bounce the user back to the frontend. The frontend's bootstrap effect
      // hits /auth/refresh on mount and exchanges the cookie for an access token.
      res.redirect(env.FRONTEND_URL);
    },
  )(req, res, next);
});
