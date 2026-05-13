import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../src/services/auth.js';

describe('JWT utilities', () => {
  const payload = { sub: 'user_abc123', email: 'a@b.com' };

  describe('access tokens', () => {
    it('round-trips sign + verify', () => {
      const token = signAccessToken(payload);
      const decoded = verifyAccessToken(token);
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
    });

    it('throws on expired token', () => {
      const expired = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '-1s' });
      expect(() => verifyAccessToken(expired)).toThrow(/jwt expired|expired/i);
    });

    it('throws on token signed with wrong secret', () => {
      const bogus = jwt.sign(payload, 'someone-elses-secret-32-bytes-padding', {
        expiresIn: '15m',
      });
      expect(() => verifyAccessToken(bogus)).toThrow();
    });

    it('embeds a 15-minute expiry', () => {
      const token = signAccessToken(payload);
      const decoded = jwt.decode(token) as { exp: number; iat: number };
      expect(decoded.exp - decoded.iat).toBe(15 * 60);
    });
  });

  describe('refresh tokens', () => {
    it('round-trips sign + verify with the refresh secret', () => {
      const token = signRefreshToken(payload);
      const decoded = verifyRefreshToken(token);
      expect(decoded.sub).toBe(payload.sub);
    });

    it('access token is not accepted as refresh token (different secret)', () => {
      const accessToken = signAccessToken(payload);
      expect(() => verifyRefreshToken(accessToken)).toThrow();
    });

    it('embeds a 7-day expiry', () => {
      const token = signRefreshToken(payload);
      const decoded = jwt.decode(token) as { exp: number; iat: number };
      expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    });
  });
});
