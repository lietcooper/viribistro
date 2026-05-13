// Agent loop runner unit tests. The Anthropic client is injected as a stub
// (FakeAnthropic) so we never hit the network. Cart mutations go through
// the real cart service against a real DB row.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../helpers/resetDb.js';
import { prisma } from '../../src/lib/prisma.js';
import { seedMenu } from '../../prisma/seed.js';
import { runAgentLoop, MAX_LOOP_ITERATIONS } from '../../src/services/agent/loop.js';
import * as cartService from '../../src/services/cart.js';
import {
  createFakeAnthropic,
  textBlock,
  toolUseBlock,
} from './fakeAnthropic.js';
import type Anthropic from '@anthropic-ai/sdk';

const SESSION = 'loop-test-sess';

async function loadMenuSnapshot() {
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
  });
  return items.map((i) => ({ ...i, price: i.price.toString() }));
}

describe('runAgentLoop', () => {
  let burgerId: string;

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const burger = await prisma.menuItem.findFirst({
      where: { name: 'Wagyu Beef Burger' },
    });
    if (!burger) throw new Error('seed missing burger');
    burgerId = burger.id;
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cartService.clearCart(SESSION);
  });

  it('happy path: tool_use → tool_result → final text response', async () => {
    const fake = createFakeAnthropic();
    fake.enqueue({
      stop_reason: 'tool_use',
      content: [toolUseBlock('tu_1', 'add_to_cart', { itemId: burgerId, quantity: 1 })],
    });
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('Added a Wagyu Beef Burger to your cart.')],
    });

    const menu = await loadMenuSnapshot();
    const result = await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'Add a burger',
      model: 'test-model',
    });

    expect(result.reply).toBe('Added a Wagyu Beef Burger to your cart.');
    expect(result.toolsUsed).toEqual(['add_to_cart']);
    expect(result.cartUpdate).not.toBeNull();
    expect(result.cartUpdate?.items[0]?.menuItemId).toBe(burgerId);
    // Cart was mutated in the real service.
    expect(cartService.getCart(SESSION).items[0]?.menuItemId).toBe(burgerId);
    // Two model calls (turn 1 with tool_use, turn 2 with final text).
    expect(fake.calls.length).toBe(2);
    // The second call's messages should contain the assistant tool_use turn
    // and the user tool_result turn that we appended.
    const secondCallMessages = fake.calls[1]!.messages;
    expect(secondCallMessages).toHaveLength(3); // user → assistant(tool_use) → user(tool_result)
    expect(secondCallMessages[0]?.role).toBe('user');
    expect(secondCallMessages[1]?.role).toBe('assistant');
    expect(secondCallMessages[2]?.role).toBe('user');
  });

  it('clarify short-circuits the loop and returns the question as reply', async () => {
    const fake = createFakeAnthropic();
    fake.enqueue({
      stop_reason: 'tool_use',
      content: [
        toolUseBlock('tu_1', 'clarify', {
          question: 'Did you mean red or white wine?',
        }),
      ],
    });
    // No second response enqueued — if the loop calls the model again the
    // FakeAnthropic will throw.

    const menu = await loadMenuSnapshot();
    const result = await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'Add some wine',
      model: 'test-model',
    });

    expect(result.reply).toBe('Did you mean red or white wine?');
    expect(result.toolsUsed).toEqual(['clarify']);
    expect(result.cartUpdate).toBeNull();
    expect(fake.calls.length).toBe(1);
    // Cart untouched.
    expect(cartService.getCart(SESSION).items).toEqual([]);
  });

  it('clarify persists a synthetic tool_result so replayed history is well-formed', async () => {
    // Turn 1: user → assistant(clarify) short-circuits.
    const fake1 = createFakeAnthropic();
    fake1.enqueue({
      stop_reason: 'tool_use',
      content: [
        toolUseBlock('tu_clr', 'clarify', { question: 'Red or white?' }),
      ],
    });

    const menu = await loadMenuSnapshot();
    const turn1 = await runAgentLoop({
      anthropic: fake1,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'add some wine',
      model: 'test-model',
    });

    // The persisted turn must be: user → assistant(tool_use) → user(tool_result).
    // Without the synthetic tool_result, Anthropic rejects the next call.
    expect(turn1.newTurnMessages).toHaveLength(3);
    expect(turn1.newTurnMessages[0]?.role).toBe('user');
    expect(turn1.newTurnMessages[1]?.role).toBe('assistant');
    expect(turn1.newTurnMessages[2]?.role).toBe('user');
    const lastBlock = (turn1.newTurnMessages[2]?.content as Array<{ type: string; tool_use_id?: string }>)[0]!;
    expect(lastBlock.type).toBe('tool_result');
    expect(lastBlock.tool_use_id).toBe('tu_clr');

    // Turn 2: replay the prior turn as history — the loop must accept it
    // and the FakeAnthropic must see well-formed Anthropic messages.
    const fake2 = createFakeAnthropic();
    fake2.enqueue({ stop_reason: 'end_turn', content: [textBlock('OK, red.')] });

    await runAgentLoop({
      anthropic: fake2,
      sessionId: SESSION,
      menu,
      priorMessages: turn1.newTurnMessages,
      userMessage: 'red please',
      model: 'test-model',
    });

    // Sanity: history threaded correctly — first call sees 4 prior messages
    // (the 3 from turn 1 plus the new user message).
    const params = fake2.calls[0]!;
    expect(params.messages).toHaveLength(4);
  });

  it('max-iteration guard: stops after MAX_LOOP_ITERATIONS and returns a graceful reply', async () => {
    const fake = createFakeAnthropic();
    // Enqueue MAX_LOOP_ITERATIONS + a buffer of tool_use loops with a benign
    // get_cart call so we can't accidentally fail by other means.
    for (let i = 0; i < MAX_LOOP_ITERATIONS + 5; i++) {
      fake.enqueue({
        stop_reason: 'tool_use',
        content: [toolUseBlock(`tu_${i}`, 'get_cart', {})],
      });
    }

    const menu = await loadMenuSnapshot();
    const result = await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'do something',
      model: 'test-model',
    });

    expect(result.reply).toMatch(/got stuck|try rephrasing/i);
    expect(result.cartUpdate).toBeNull();
    // The runner should have stopped at MAX_LOOP_ITERATIONS — initial call
    // plus MAX_LOOP_ITERATIONS follow-ups = MAX_LOOP_ITERATIONS + 1 calls.
    // (Exact arithmetic: depending on where the guard fires this is either
    // MAX_LOOP_ITERATIONS or MAX_LOOP_ITERATIONS + 1; assert <= cap + 1.)
    expect(fake.calls.length).toBeLessThanOrEqual(MAX_LOOP_ITERATIONS + 1);
  });

  it('plain text response (no tool use) returns the text and an empty toolsUsed', async () => {
    const fake = createFakeAnthropic();
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [
        textBlock(
          "I don't have a table booking system, but I can help you order food.",
        ),
      ],
    });

    const menu = await loadMenuSnapshot();
    const result = await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'can I book a table?',
      model: 'test-model',
    });

    expect(result.reply).toMatch(/table booking|order food/);
    expect(result.toolsUsed).toEqual([]);
    expect(result.cartUpdate).toBeNull();
    expect(fake.calls.length).toBe(1);
  });

  it('wraps the system prompt as a text block with cache_control: ephemeral', async () => {
    const fake = createFakeAnthropic();
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('hi')],
    });

    const menu = await loadMenuSnapshot();
    await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'hello',
      model: 'test-model',
    });

    const params = fake.calls[0]!;
    expect(Array.isArray(params.system)).toBe(true);
    const systemArray = params.system as Anthropic.TextBlockParam[];
    expect(systemArray).toHaveLength(1);
    expect(systemArray[0]?.type).toBe('text');
    expect(systemArray[0]?.cache_control).toEqual({ type: 'ephemeral' });
    // And the menu snapshot was injected.
    expect(systemArray[0]?.text).toContain('Wagyu Beef Burger');
  });

  it('refusal stop_reason terminates the loop with a graceful fallback reply', async () => {
    const fake = createFakeAnthropic();
    fake.enqueue({
      stop_reason: 'refusal',
      content: [],
    });

    const menu = await loadMenuSnapshot();
    const result = await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'do something weird',
      model: 'test-model',
    });

    expect(result.reply).toMatch(/can(?:'|no)t help|help you (with )?that|sorry/i);
    expect(result.cartUpdate).toBeNull();
    expect(result.toolsUsed).toEqual([]);
  });

  it('threads prior messages into the request so multi-turn context is preserved', async () => {
    const fake = createFakeAnthropic();
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('Okay.')],
    });

    const menu = await loadMenuSnapshot();
    const prior: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Add a burger' },
      { role: 'assistant', content: 'Done.' },
    ];
    await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: prior,
      userMessage: 'actually make that two',
      model: 'test-model',
    });

    const params = fake.calls[0]!;
    expect(params.messages).toHaveLength(3);
    expect(params.messages[0]?.role).toBe('user');
    expect(params.messages[1]?.role).toBe('assistant');
    expect(params.messages[2]?.role).toBe('user');
    expect(params.messages[2]?.content).toBe('actually make that two');
  });

  it('returns the recorded conversation turn so the route can persist it', async () => {
    const fake = createFakeAnthropic();
    fake.enqueue({
      stop_reason: 'tool_use',
      content: [toolUseBlock('tu_1', 'add_to_cart', { itemId: burgerId, quantity: 1 })],
    });
    fake.enqueue({
      stop_reason: 'end_turn',
      content: [textBlock('Done.')],
    });

    const menu = await loadMenuSnapshot();
    const result = await runAgentLoop({
      anthropic: fake,
      sessionId: SESSION,
      menu,
      priorMessages: [],
      userMessage: 'Add a burger',
      model: 'test-model',
    });

    // The "newTurnMessages" should be everything since the prior history:
    // user → assistant(tool_use) → user(tool_result) → assistant(text).
    expect(result.newTurnMessages).toHaveLength(4);
    expect(result.newTurnMessages[0]?.role).toBe('user');
    expect(result.newTurnMessages[1]?.role).toBe('assistant');
    expect(result.newTurnMessages[2]?.role).toBe('user');
    expect(result.newTurnMessages[3]?.role).toBe('assistant');
  });
});
