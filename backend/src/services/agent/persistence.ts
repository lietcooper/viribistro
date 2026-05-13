// Conversation + Message persistence for the AI agent.
//
// `Message.content` is `Json` in Prisma so we can store the exact Anthropic
// MessageParam content (string OR ContentBlockParam[]) verbatim — replaying
// history on the next turn is then a 1:1 map from rows to MessageParam.
//
// Ordering: `createdAt` is millisecond-granular, so several rows written in
// the same appendTurn() can share a timestamp. We therefore stamp every row
// with a monotonically-increasing `sequence` (per conversation) inside the
// transaction, and read back ordered by [createdAt asc, sequence asc]. This
// is load-bearing for the Anthropic protocol: a `tool_result` MUST replay
// immediately after the matching `tool_use`.
//
// Concurrency: all writes for a single turn happen inside one $transaction
// so a crash mid-turn never leaves dangling messages. The Conversation row
// is upserted by sessionId (unique index in the schema).
import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

/**
 * Load all messages for this sessionId in chronological order, shaped as
 * Anthropic MessageParams so they can be threaded back into the loop
 * runner's `priorMessages` argument without any reshaping. One round-trip
 * via include.
 */
export async function loadHistory(sessionId: string): Promise<Anthropic.MessageParam[]> {
  const conv = await prisma.conversation.findUnique({
    where: { sessionId },
    select: {
      messages: {
        // `sequence` is the deterministic tiebreaker for rows that share a
        // millisecond timestamp (multiple inserts inside one transaction).
        orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
        select: { role: true, content: true },
      },
    },
  });
  if (!conv) return [];
  return conv.messages.map(rowToMessageParam);
}

/**
 * Append a turn's worth of messages to the conversation, creating (or
 * attaching to) the Conversation row keyed by sessionId.
 *
 * `userId` may be null for anonymous chats; pass a non-null id on a
 * subsequent call once the visitor logs in and we want to attach the
 * existing conversation to them (CLAUDE.md: chat works pre-login).
 */
export async function appendTurn(
  sessionId: string,
  userId: string | null,
  messages: Anthropic.MessageParam[],
): Promise<{ conversationId: string }> {
  return prisma.$transaction(async (tx) => {
    const conv = await tx.conversation.upsert({
      where: { sessionId },
      update: userId ? { userId } : {},
      create: { sessionId, userId },
      select: { id: true },
    });

    if (messages.length > 0) {
      // Read the current max sequence so we keep numbering monotonic across
      // turns. aggregate inside the same transaction is consistent.
      const agg = await tx.message.aggregate({
        where: { conversationId: conv.id },
        _max: { sequence: true },
      });
      const startSeq = (agg._max.sequence ?? -1) + 1;

      await tx.message.createMany({
        data: messages.map((m, idx) => ({
          conversationId: conv.id,
          role: messageRoleForDb(m),
          content: contentToJson(m.content),
          sequence: startSeq + idx,
        })),
      });
    }

    return { conversationId: conv.id };
  });
}

/**
 * Wipe every Message row for the given sessionId while keeping the
 * Conversation row itself. This is what the frontend's "New chat" button
 * triggers — the user wants a fresh thread but we still want the same
 * sessionId to keep linking to the same user (and to anything else keyed
 * by sessionId, like the cart). Returns the number of rows deleted so
 * callers / tests can assert against it. A no-op (returns 0) if no
 * conversation exists for the session.
 */
export async function clearHistory(sessionId: string): Promise<number> {
  const conv = await prisma.conversation.findUnique({
    where: { sessionId },
    select: { id: true },
  });
  if (!conv) return 0;
  const result = await prisma.message.deleteMany({
    where: { conversationId: conv.id },
  });
  return result.count;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function messageRoleForDb(m: Anthropic.MessageParam): 'user' | 'assistant' {
  // The protocol only uses user / assistant; tool_result blocks live inside a
  // user-role message. We mirror that in the DB so reloading yields the same
  // MessageParam shape.
  return m.role === 'assistant' ? 'assistant' : 'user';
}

function contentToJson(content: Anthropic.MessageParam['content']): Prisma.InputJsonValue {
  // Anthropic accepts either a string or a ContentBlockParam[] for
  // MessageParam.content. Both are JSON-safe.
  return content as unknown as Prisma.InputJsonValue;
}

function rowToMessageParam(row: {
  role: 'user' | 'assistant' | 'tool';
  content: Prisma.JsonValue;
}): Anthropic.MessageParam {
  // tool-role rows shouldn't exist (we never write them) — coerce to 'user'
  // defensively so a stray legacy row doesn't blow up the API contract.
  const role: 'user' | 'assistant' = row.role === 'assistant' ? 'assistant' : 'user';
  return {
    role,
    content: row.content as Anthropic.MessageParam['content'],
  };
}
