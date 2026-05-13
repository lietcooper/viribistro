import { z } from 'zod';

// Password rules: 12+ chars, no other complexity (per CLAUDE.md — long
// passphrases are more usable + secure than short complex passwords).
export const PasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters');

export const EmailSchema = z.string().trim().toLowerCase().email('Must be a valid email');

export const RegisterBodySchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().trim().min(1, 'Name is required').max(80),
});

export const LoginBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
});
