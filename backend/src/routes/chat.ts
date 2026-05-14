// AI agent routes:
//   POST /api/chat              — main tool-calling loop endpoint
//   GET  /api/chat/history/:id  — replay persisted history (frontend boot)
//
// Auth is NOT required: anonymous visitors can chat and order, then attach
// the conversation to their user account once they log in. If the frontend
// happens to send an Authorization header, we opportunistically verify it
// and link the conversation to that user — but a missing/invalid token is
// not an error.
import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { chatRateLimit } from '../middleware/rateLimit.js';
import { ChatBodySchema, ChatHistoryParamsSchema } from '../schemas/chat.js';
import { runAgentLoop } from '../services/agent/loop.js';
import { getAnthropicClient } from '../services/agent/anthropic.js';
import { appendTurn, clearHistory, loadHistory } from '../services/agent/persistence.js';
import type { MenuSnapshotItem } from '../services/agent/systemPrompt.js';
import { optionalUserId } from '../lib/optionalUserId.js';

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

chatRouter.post('/', chatRateLimit, validate({ body: ChatBodySchema }), async (req, res) => {
  const { sessionId, message } = req.body as {
    sessionId: string;
    message: string;
  };
  const userId = optionalUserId(req, 'Chat');

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
    userId,
    menu,
    priorMessages,
    userMessage: message,
    model: env.ANTHROPIC_MODEL,
  });

  // Persist the whole turn (user message + every assistant/tool turn).
  // If a valid access token was supplied, link the conversation to that
  // user — appendTurn upserts on sessionId so a session that started
  // anonymous gets attached on the first authenticated turn.
  let historyPersisted = true;
  try {
    await appendTurn(sessionId, userId, result.newTurnMessages);
  } catch (err) {
    // Persistence failure must not destroy the user's reply — log and
    // continue. We DO tell the client about it via historyPersisted: false
    // so the UI can surface a subtle warning; without that signal the
    // agent silently loses memory of this turn on the next request.
    historyPersisted = false;
    logger.error(
      { err, sessionId },
      'Failed to persist chat turn — reply was sent but conversation history is now out of sync',
    );
  }

  res.json({
    reply: result.reply,
    cartUpdate: result.cartUpdate,
    toolsUsed: result.toolsUsed,
    suggestedReplies: result.suggestedReplies,
    historyPersisted,
  });
});

chatRouter.get(
  '/history/:sessionId',
  validate({ params: ChatHistoryParamsSchema }),
  async (req, res) => {
    const { sessionId } = req.params as { sessionId: string };
    const messages = await loadHistory(sessionId);
    res.json({ messages });
  },
);

// "New chat" — wipes the persisted Message rows for this sessionId but
// keeps the Conversation row + cart intact. Anonymous (no auth) by
// design: the chat itself is anonymous, so its reset path is too.
chatRouter.delete(
  '/history/:sessionId',
  validate({ params: ChatHistoryParamsSchema }),
  async (req, res) => {
    const { sessionId } = req.params as { sessionId: string };
    const deleted = await clearHistory(sessionId);
    res.json({ deleted });
  },
);
