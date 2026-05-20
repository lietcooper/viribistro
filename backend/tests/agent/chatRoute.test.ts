// POST /api/chat end-to-end tests. The Anthropic client is replaced with a
// scripted FakeAnthropic before each test via setAnthropicClient().
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { resetDb } from '../helpers/resetDb.js';
import { prisma } from '../../src/lib/prisma.js';
import { seedMenu } from '../../prisma/seed.js';
import { buildTestApp } from '../helpers/testApp.js';
import * as cartService from '../../src/services/cart.js';
import {
  createFakeAnthropic,
  textBlock,
  toolUseBlock,
  type FakeAnthropic,
} from './fakeAnthropic.js';
import { setAnthropicClient } from '../../src/services/agent/anthropic.js';
import { appendTurn } from '../../src/services/agent/persistence.js';
import { signAccessToken } from '../../src/services/auth.js';
import { vi } from 'vitest';

describe('POST /api/chat', () => {
  let burgerId: string;
  let salmonId: string;
  let redWineId: string;
  let whiteWineId: string;
  let burgerCustomizations: Record<string, string[]>;
  let fake: FakeAnthropic;

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const burger = await prisma.menuItem.findFirst({
      where: { name: 'Wagyu Beef Burger' },
    });
    const salmon = await prisma.menuItem.findFirst({
      where: { name: 'Pan-Seared Salmon' },
    });
    const red = await prisma.menuItem.findFirst({
      where: { name: 'House Red Wine' },
    });
    const white = await prisma.menuItem.findFirst({
      where: { name: 'House White Wine' },
    });
    if (!burger || !salmon || !red || !white) throw new Error('seed missing fixtures');
    burgerId = burger.id;
    salmonId = salmon.id;
    redWineId = red.id;
    whiteWineId = white.id;
    const temperature = await prisma.customizationGroup.findFirst({
      where: { menuItemId: burger.id, name: 'Temperature' },
      include: { options: true },
    });
    const mediumRare = temperature?.options.find((o) => o.name === 'Medium rare');
    if (!temperature || !mediumRare) throw new Error('seed missing burger customizations');
    burgerCustomizations = { [temperature.id]: [mediumRare.id] };
  });

  afterAll(async () => {
    setAnthropicClient(undefined);
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    fake = createFakeAnthropic();
    setAnthropicClient(fake);
    await cartService.clearCart('chat-sess-1');
    await cartService.clearCart('chat-sess-2');
    await cartService.clearCart('chat-sess-multi');
    await cartService.clearCart('chat-sess-ambig');
    await cartService.clearCart('chat-sess-off');
    await prisma.message.deleteMany({});
    await prisma.conversation.deleteMany({});
  });

  it('happy path: adds an item via the agent and returns reply + cartUpdate', async () => {
    fake.enqueue({
      stop_reason: 'tool_use',
      content: [
        toolUseBlock('tu_1', 'add_to_cart', {
          itemId: burgerId,
          quantity: 1,
          customizations: burgerCustomizations,
        }),
      ],
    });
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('Added a Wagyu Beef Burger to your cart.')],
    });

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'chat-sess-1', message: 'add the wagyu beef burger' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Added a Wagyu Beef Burger to your cart.');
    expect(res.body.toolsUsed.map((t: { name: string }) => t.name)).toEqual(['add_to_cart']);
    expect(res.body.toolsUsed[0].input).toMatchObject({ itemId: burgerId, quantity: 1 });
    expect(res.body.cartUpdate.items[0].menuItemId).toBe(burgerId);
    expect(res.body.cartUpdate.items[0].quantity).toBe(1);

    // Cart was actually mutated.
    expect((await cartService.getCart('chat-sess-1')).items[0]?.menuItemId).toBe(burgerId);

    // 4 messages were persisted: user → assistant(tool_use) → user(tool_result) → assistant(text).
    const conv = await prisma.conversation.findUnique({
      where: { sessionId: 'chat-sess-1' },
    });
    expect(conv).not.toBeNull();
    const rows = await prisma.message.findMany({
      where: { conversationId: conv!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(4);
    expect(rows[0]?.role).toBe('user');
    expect(rows[1]?.role).toBe('assistant');
    expect(rows[2]?.role).toBe('user');
    expect(rows[3]?.role).toBe('assistant');
  });

  it('returns 400 with VALIDATION_ERROR when sessionId or message is missing', async () => {
    const app = await buildTestApp();
    let res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    res = await request(app).post('/api/chat').send({ sessionId: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    res = await request(app).post('/api/chat').send({ message: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('off-topic: pure-text turn returns reply with null cartUpdate and no toolsUsed', async () => {
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [
        textBlock("I don't have a table booking system, but I can help you order food."),
      ],
    });

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'chat-sess-off', message: 'can I book a table for two?' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/table booking|order food/);
    expect(res.body.cartUpdate).toBeNull();
    expect(res.body.toolsUsed).toEqual([]);
  });

  it('ambiguity: clarify short-circuit returns the question as reply (cartUpdate null)', async () => {
    // Two wines exist in the seeded menu — verify the contract works.
    expect(redWineId).not.toEqual(whiteWineId);

    fake.enqueue({
      stop_reason: 'tool_use',
      content: [
        toolUseBlock('tu_amb_1', 'clarify', {
          question: 'Did you mean House Red Wine or House White Wine?',
        }),
      ],
    });
    // No second response — clarify must short-circuit.

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'chat-sess-ambig', message: 'add a glass of wine' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/red|white/i);
    expect(res.body.cartUpdate).toBeNull();
    expect(res.body.toolsUsed.map((t: { name: string }) => t.name)).toEqual(['clarify']);
    // Cart untouched.
    expect((await cartService.getCart('chat-sess-ambig')).items).toEqual([]);
  });

  it('multi-turn: "actually make that three" uses prior history to call modify_item', async () => {
    // Seed a prior turn: user added a salmon, assistant confirmed.
    await appendTurn('chat-sess-multi', null, [
      { role: 'user', content: 'add a salmon' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_prior_1',
            name: 'add_to_cart',
            input: { itemId: salmonId, quantity: 1 },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_prior_1',
            content: JSON.stringify({
              cart: { items: [{ menuItemId: salmonId, quantity: 1 }], total: '28' },
            }),
          },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Added a salmon.' }] },
    ]);
    // Cart side-effect from the prior turn (simulate state continuity).
    await cartService.addItem('chat-sess-multi', salmonId, 1);

    // Now the model should see the history and call modify_item.
    fake.enqueue({
      stop_reason: 'tool_use',
      content: [
        toolUseBlock('tu_multi_1', 'modify_item', {
          itemId: salmonId,
          newQuantity: 3,
        }),
      ],
    });
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('Got it — three salmon now.')],
    });

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'chat-sess-multi', message: 'actually make that three' });

    expect(res.status).toBe(200);
    expect(res.body.toolsUsed.map((t: { name: string }) => t.name)).toEqual(['modify_item']);
    expect(res.body.cartUpdate.items[0].menuItemId).toBe(salmonId);
    expect(res.body.cartUpdate.items[0].quantity).toBe(3);

    // The history visible to the model must include the prior turn.
    const firstCall = fake.calls[0]!;
    expect(firstCall.messages.length).toBeGreaterThanOrEqual(5);
    // First entry was the prior user message.
    expect(firstCall.messages[0]?.role).toBe('user');
    expect(firstCall.messages[0]?.content).toBe('add a salmon');
  });

  it('opportunistically links the conversation to the authenticated user when a token is sent', async () => {
    const user = await prisma.user.create({
      data: {
        email: `chatlink-${Date.now()}@example.com`,
        name: 'Linkable',
        provider: 'local',
      },
    });
    const token = signAccessToken({ sub: user.id, email: user.email });

    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('Hi.')],
    });

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: 'chat-sess-1', message: 'hi' });

    expect(res.status).toBe(200);
    const conv = await prisma.conversation.findUnique({
      where: { sessionId: 'chat-sess-1' },
    });
    expect(conv?.userId).toBe(user.id);

    // Clean up so other tests in this block don't see this user.
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('proceeds anonymously when the Authorization header is invalid', async () => {
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('Hi.')],
    });

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', 'Bearer not-a-real-jwt')
      .send({ sessionId: 'chat-sess-1', message: 'hi' });

    expect(res.status).toBe(200);
    const conv = await prisma.conversation.findUnique({
      where: { sessionId: 'chat-sess-1' },
    });
    // Conversation was created but not linked to any user.
    expect(conv?.userId).toBeNull();
  });

  it('returns historyPersisted: true on a successful turn', async () => {
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('hello')],
    });

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'chat-sess-1', message: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.historyPersisted).toBe(true);
  });

  it('returns historyPersisted: false when appendTurn throws (reply still sent)', async () => {
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('reply')],
    });

    // Force the persistence write to fail. The route MUST still return
    // the model's reply with historyPersisted: false so the frontend can
    // warn the user that the conversation memory is out of sync.
    const spy = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('db unavailable'));

    const app = await buildTestApp();
    try {
      const res = await request(app)
        .post('/api/chat')
        .send({ sessionId: 'chat-sess-1', message: 'hi' });
      expect(res.status).toBe(200);
      expect(res.body.reply).toBe('reply');
      expect(res.body.historyPersisted).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('returns 500 with INTERNAL_ERROR when the LLM call throws', async () => {
    // Throw on first call.
    const brokenClient = {
      messages: {
        async create(): Promise<never> {
          throw new Error('API down');
        },
      },
    };
    setAnthropicClient(brokenClient);

    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({ sessionId: 'chat-sess-1', message: 'hi' });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/chat/history/:sessionId', () => {
  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
  });

  afterAll(async () => {
    setAnthropicClient(undefined);
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.message.deleteMany({});
    await prisma.conversation.deleteMany({});
  });

  it('returns persisted messages in order (no system prompt in the array)', async () => {
    await appendTurn('hist-sess-1', null, [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'hello' },
    ]);

    const app = await buildTestApp();
    const res = await request(app).get('/api/chat/history/hist-sess-1');
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0]).toEqual({ role: 'user', content: 'first' });
    expect(res.body.messages[1]).toEqual({ role: 'assistant', content: 'hello' });
    // No system role in payload.
    for (const m of res.body.messages as Array<{ role: string }>) {
      expect(m.role).not.toBe('system');
    }
  });

  it('returns an empty array for an unknown sessionId (not 404)', async () => {
    const app = await buildTestApp();
    const res = await request(app).get('/api/chat/history/never-seen');
    expect(res.status).toBe(200);
    expect(res.body.messages).toEqual([]);
  });
});

describe('DELETE /api/chat/history/:sessionId', () => {
  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
  });

  afterAll(async () => {
    setAnthropicClient(undefined);
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.message.deleteMany({});
    await prisma.conversation.deleteMany({});
  });

  it('wipes message rows for the session but preserves the conversation', async () => {
    await appendTurn('clear-sess-1', null, [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);

    const app = await buildTestApp();
    const res = await request(app).delete('/api/chat/history/clear-sess-1');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    const after = await request(app).get('/api/chat/history/clear-sess-1');
    expect(after.body.messages).toEqual([]);

    const conv = await prisma.conversation.findUnique({
      where: { sessionId: 'clear-sess-1' },
    });
    expect(conv).not.toBeNull();
  });

  it('returns deleted: 0 for an unknown sessionId without erroring', async () => {
    const app = await buildTestApp();
    const res = await request(app).delete('/api/chat/history/never-seen');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(0);
  });

  it('400s when sessionId fails validation', async () => {
    const app = await buildTestApp();
    const res = await request(app).delete('/api/chat/history/' + '!'.repeat(5));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
