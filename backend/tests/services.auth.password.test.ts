import { describe, expect, it } from 'vitest';
import bcrypt from 'bcrypt';
import { hashPassword, verifyPassword } from '../src/services/auth.js';

describe('password hashing service', () => {
  it('hashes a password and verifies the correct plaintext', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt prefix
    await expect(verifyPassword('correcthorsebatterystaple', hash)).resolves.toBe(true);
  });

  it('rejects the wrong plaintext', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    await expect(verifyPassword('wrongpassword', hash)).resolves.toBe(false);
  });

  it('uses a cost factor of at least 12', async () => {
    const hash = await hashPassword('any-password');
    // bcrypt format: $2b$<rounds>$<saltAndHash>
    const rounds = bcrypt.getRounds(hash);
    expect(rounds).toBeGreaterThanOrEqual(12);
  });
});
