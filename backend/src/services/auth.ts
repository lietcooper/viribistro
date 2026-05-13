// Auth service: password hashing (bcrypt) and JWT signing/verification.
//
// Cost factor 12 is the CLAUDE.md-mandated minimum. bcrypt's API is async;
// we await everywhere so we never block the event loop on a busy server.
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../lib/env.js';

const BCRYPT_COST = 12;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── JWT ─────────────────────────────────────────────────────────────────────

export interface TokenPayload {
  sub: string; // user id
  email: string;
  // anything else we want to surface in `req.user` after verification
  [key: string]: unknown;
}

function sign(payload: TokenPayload, secret: string, ttlSeconds: number): string {
  const options: SignOptions = { expiresIn: ttlSeconds };
  return jwt.sign(payload, secret, options);
}

function verify(token: string, secret: string): TokenPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string') {
    throw new Error('Unexpected string payload in JWT');
  }
  return decoded as TokenPayload;
}

export function signAccessToken(payload: TokenPayload): string {
  return sign(payload, env.JWT_SECRET, ACCESS_TOKEN_TTL_SECONDS);
}

export function verifyAccessToken(token: string): TokenPayload {
  return verify(token, env.JWT_SECRET);
}

export function signRefreshToken(payload: TokenPayload): string {
  return sign(payload, env.JWT_REFRESH_SECRET, REFRESH_TOKEN_TTL_SECONDS);
}

export function verifyRefreshToken(token: string): TokenPayload {
  return verify(token, env.JWT_REFRESH_SECRET);
}
