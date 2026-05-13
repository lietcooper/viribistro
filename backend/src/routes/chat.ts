// AI agent routes:
//   POST /api/chat              — main tool-calling loop endpoint
//   GET  /api/chat/history/:id  — replay persisted history (frontend boot)
//
// Auth is NOT required: anonymous visitors can chat and order, then attach
// the conversation to a user on login (handled in appendTurn via the
// optional userId — wired into POST /api/chat below as a TODO when the
// frontend starts sending auth headers).
import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { ChatBodySchema, ChatHistoryParamsSchema } from '../schemas/chat.js';
import { runAgentLoop } from '../services/agent/loop.js';
import { getAnthropicClient } from '../services/agent/anthropic.js';
import {
  appendTurn,
  loadHistory,
} from '../services/agent/persistence.js';
import type { MenuSnapshotItem } from '../services/agent/systemPrompt.js';

async function loadMenuSnapshot(): Promise<MenuSnapshotItem[]> {
  const items = await prisma.menuItem.findMany({
    where: { available: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      category: true,
      tags: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return items.map((i) => ({ ...i, price: i.price.toString() }));
}

export const chatRouter: Router = Router();

chatRouter.post(
  '/',
  validate({ body: ChatBodySchema }),
  async (req, res) => {
    const { sessionId, message } = req.body as {
      sessionId: string;
      message: string;
    };

    // Pre-load history + menu in parallel. Menu is small and cached by
    // Prisma's connection pool; history is per-session and usually short.
    const [priorMessages, menu] = await Promise.all([
      loadHistory(sessionId),
      loadMenuSnapshot(),
    ]);

    const anthropic = getAnthropicClient();
    const result = await runAgentLoop({
      anthropic,
      sessionId,
      menu,
      priorMessages,
      userMessage: message,
      model: env.ANTHROPIC_MODEL,
    });

    // Persist the whole turn (user message + every assistant/tool turn).
    try {
      await appendTurn(sessionId, null, result.newTurnMessages);
    } catch (err) {
      // Persistence failure must not destroy the user's reply — log and
      // continue. The frontend already has the new state in `result`.
      logger.error(
        { err, sessionId },
        'Failed to persist chat turn — reply was sent but conversation history is now out of sync',
      );
    }

    res.json({
      reply: result.reply,
      cartUpdate: result.cartUpdate,
      toolsUsed: result.toolsUsed,
    });
  },
);

chatRouter.get(
  '/history/:sessionId',
  validate({ params: ChatHistoryParamsSchema }),
  async (req, res) => {
    const { sessionId } = req.params as { sessionId: string };
    const messages = await loadHistory(sessionId);
    res.json({ messages });
  },
);
