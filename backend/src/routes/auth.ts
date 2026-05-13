// Email/password auth (Google OAuth is added in a later step). Issues a
// short-lived access token in the JSON body and a 7-day httpOnly refresh
// cookie. Cookie options are environment-aware: `secure` + `sameSite='none'`
// in prod (Vercel↔Railway cross-site), `sameSite='lax'` otherwise.
import { Router, type CookieOptions, type Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';
import { AppError } from '../lib/AppError.js';
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

authRouter.post(
  '/register',
  validate({ body: RegisterBodySchema }),
  async (req, res) => {
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
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppError(409, 'EMAIL_TAKEN', 'Email is already registered');
      }
      throw err;
    }

    const { accessToken, refreshToken } = issueTokens(user);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ user, accessToken });
  },
);

authRouter.post(
  '/login',
  validate({ body: LoginBodySchema }),
  async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    // Always look up by email + run a bcrypt compare even on a missing user,
    // so timing doesn't leak account existence.
    const dbUser = await prisma.user.findUnique({ where: { email } });

    // Use a dummy hash so the timing is similar whether the user exists or not.
    // bcrypt's compare will always return false for this synthetic hash.
    const passwordHash =
      dbUser?.passwordHash ??
      '$2b$12$abcdefghijklmnopqrstuvCkPmU2kfMTBSyq6ImpiV7B/4Z/qSyByO';
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
