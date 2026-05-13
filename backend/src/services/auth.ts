// Auth service: password hashing (bcrypt) and JWT signing/verification.
//
// Cost factor 12 is the CLAUDE.md-mandated minimum. bcrypt's API is async;
// we await everywhere so we never block the event loop on a busy server.
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
