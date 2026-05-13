// Conversation/Message persistence tests. Round-trips between the loop's
// MessageParam shape (what we hand the SDK) and the rows we write to the
// Conversation / Message tables.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { resetDb } from '../helpers/resetDb.js';
import { prisma } from '../../src/lib/prisma.js';
import {
  loadHistory,
  appendTurn,
  clearHistory,
} from '../../src/services/agent/persistence.js';

const SESSION = 'persistence-test-sess';

describe('agent persistence', () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.message.deleteMany({});
    await prisma.conversation.deleteMany({});
  });

  it('loadHistory returns [] for an unknown sessionId without throwing', async () => {
    const msgs = await loadHistory('does-not-exist');
    expect(msgs).toEqual([]);
  });

  it('appendTurn creates the conversation on first call, then reuses it', async () => {
    await appendTurn(SESSION, null, [
      { role: 'user', content: 'first hi' },
    ]);
    const convs1 = await prisma.conversation.findMany({ where: { sessionId: SESSION } });
    expect(convs1).toHaveLength(1);

    await appendTurn(SESSION, null, [
      { role: 'user', content: 'second hi' },
    ]);
    const convs2 = await prisma.conversation.findMany({ where: { sessionId: SESSION } });
    expect(convs2).toHaveLength(1);
    // Same conversation row, two messages now.
    const msgs = await prisma.message.findMany({
      where: { conversationId: convs2[0]!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(msgs).toHaveLength(2);
  });

  it('persists user, assistant, and tool_result turns exactly as MessageParam shape', async () => {
    const turn: Anthropic.MessageParam[] = [
      { role: 'user', content: 'add a burger' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'add_to_cart',
            input: { itemId: 'm-burger', quantity: 1 },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_1',
            content: '{"cart":{"items":[{"menuItemId":"m-burger","quantity":1}]}}',
          },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    ];

    await appendTurn(SESSION, null, turn);

    const reloaded = await loadHistory(SESSION);
    expect(reloaded).toHaveLength(4);
    expect(reloaded[0]).toEqual(turn[0]);
    expect(reloaded[1]).toEqual(turn[1]);
    expect(reloaded[2]).toEqual(turn[2]);
    expect(reloaded[3]).toEqual(turn[3]);
  });

  it('does not store the system prompt in the Message table', async () => {
    await appendTurn(SESSION, null, [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
    ]);
    const rows = await prisma.message.findMany({});
    for (const row of rows) {
      // MessageRole enum is user | assistant | tool — never 'system'.
      expect(['user', 'assistant', 'tool']).toContain(row.role);
    }
  });

  it('preserves message order on reload (createdAt ascending)', async () => {
    await appendTurn(SESSION, null, [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'first reply' },
    ]);
    await appendTurn(SESSION, null, [
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'second reply' },
    ]);
    const reloaded = await loadHistory(SESSION);
    expect(reloaded.map((m) => m.content)).toEqual([
      'one',
      'first reply',
      'two',
      'second reply',
    ]);
  });

  it('writes user role for tool_result turns since MessageRole has no `tool_result`', async () => {
    // Tool results live inside `user` MessageParams per the Anthropic
    // protocol, so we persist the row with role='user' even when content is
    // a tool_result block array — this keeps the SDK shape stable on reload.
    await appendTurn(SESSION, null, [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't', content: '{}' },
        ],
      },
    ]);
    const rows = await prisma.message.findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe('user');
  });

  it('preserves order even when multiple messages share createdAt (sequence tiebreaker)', async () => {
    // Insert a 4-row turn in one appendTurn — createdAt can collide at
    // millisecond granularity, so the [createdAt, sequence] ordering on
    // reload is the only thing keeping the protocol valid (tool_result
    // must directly follow its tool_use).
    const turn: Anthropic.MessageParam[] = [
      { role: 'user', content: 'add a burger' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu_a', name: 'add_to_cart', input: { itemId: 'm-burger' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu_a', content: '{}' }],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
    ];
    await appendTurn(SESSION, null, turn);

    // Force createdAt collisions across the four rows.
    const conv = await prisma.conversation.findUnique({ where: { sessionId: SESSION } });
    await prisma.$executeRawUnsafe(
      `UPDATE "Message" SET "createdAt" = NOW() WHERE "conversationId" = $1`,
      conv!.id,
    );

    const reloaded = await loadHistory(SESSION);
    expect(reloaded.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    // The tool_result content must come back where it was inserted (index 2).
    const third = reloaded[2]?.content as Array<{ type: string }>;
    expect(third[0]?.type).toBe('tool_result');
  });

  it('sequence numbers are monotonic across turns (later append continues from prior max)', async () => {
    await appendTurn(SESSION, null, [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'first' },
    ]);
    await appendTurn(SESSION, null, [
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'second' },
    ]);
    const conv = await prisma.conversation.findUnique({ where: { sessionId: SESSION } });
    const rows = await prisma.message.findMany({
      where: { conversationId: conv!.id },
      orderBy: { sequence: 'asc' },
      select: { sequence: true },
    });
    expect(rows.map((r) => r.sequence)).toEqual([0, 1, 2, 3]);
  });

  it('clearHistory wipes messages but keeps the conversation row + userId link', async () => {
    // Anonymous turn first, then attach to a user — clearHistory should leave
    // the userId link in place so the next turn re-uses the same conversation.
    await appendTurn(SESSION, null, [
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'first reply' },
    ]);
    const user = await prisma.user.create({
      data: { email: 'clear@example.com', name: 'Clear Test', provider: 'local' },
    });
    await appendTurn(SESSION, user.id, [
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'second reply' },
    ]);

    const deleted = await clearHistory(SESSION);
    expect(deleted).toBe(4);

    const reloaded = await loadHistory(SESSION);
    expect(reloaded).toEqual([]);

    const conv = await prisma.conversation.findUnique({
      where: { sessionId: SESSION },
    });
    expect(conv).not.toBeNull();
    expect(conv?.userId).toBe(user.id);
  });

  it('clearHistory returns 0 and does not throw when no conversation exists', async () => {
    const deleted = await clearHistory('no-such-session');
    expect(deleted).toBe(0);
  });

  it('attaches the conversation to the user when a userId is supplied later', async () => {
    // First, anonymous turn.
    await appendTurn(SESSION, null, [{ role: 'user', content: 'hi' }]);
    let conv = await prisma.conversation.findUnique({ where: { sessionId: SESSION } });
    expect(conv?.userId).toBeNull();

    // Create a user so the FK constraint is satisfiable.
    const user = await prisma.user.create({
      data: {
        email: 'persist@example.com',
        name: 'Persist Test',
        provider: 'local',
      },
    });

    // Second turn with userId — should attach.
    await appendTurn(SESSION, user.id, [{ role: 'user', content: 'now logged in' }]);
    conv = await prisma.conversation.findUnique({ where: { sessionId: SESSION } });
    expect(conv?.userId).toBe(user.id);
  });
});
