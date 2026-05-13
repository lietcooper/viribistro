import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const e2eRouter: Router = Router();

e2eRouter.post('/reset', async (_req, res) => {
  await prisma.$transaction([
    prisma.order.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  res.json({ ok: true });
});
