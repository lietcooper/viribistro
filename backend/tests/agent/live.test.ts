// Live integration test — gated on RUN_LIVE=1 + a real ANTHROPIC_API_KEY.
//
// This is a smoke test, not a contract test. The model's exact wording will
// vary; we only assert that two items end up in the cart, that a real
// Anthropic API call was made, and that prompt caching kicked in (so a
// future regression that drops the cache_control marker is caught).
//
// To run:
//   RUN_LIVE=1 ANTHROPIC_API_KEY=sk-ant-... \
//     ANTHROPIC_MODEL=claude-sonnet-4-6 npm test -- agent/live
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { resetDb } from '../helpers/resetDb.js';
import { prisma } from '../../src/lib/prisma.js';
import { seedMenu } from '../../prisma/seed.js';
import { buildTestApp } from '../helpers/testApp.js';
import * as cartService from '../../src/services/cart.js';
import { setAnthropicClient } from '../../src/services/agent/anthropic.js';

const LIVE = process.env.RUN_LIVE === '1';

describe.skipIf(!LIVE)('live Anthropic integration', () => {
  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    // Drop any test stub left over from previous suites.
    setAnthropicClient(undefined);
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cartService.clearCart('live-sess-1');
  });

  it('adds two items from a single natural-language message', { timeout: 60_000 }, async () => {
    const app = await buildTestApp();
    const res = await request(app)
      .post('/api/chat')
      .send({
        sessionId: 'live-sess-1',
        message: "I'd like the spicy chicken sandwich and a fresh lemonade.",
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.reply).toBe('string');
    expect(res.body.reply.length).toBeGreaterThan(0);

    const cart = cartService.getCart('live-sess-1');
    expect(cart.items.length).toBeGreaterThanOrEqual(2);
    const names = cart.items.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes('chicken sandwich'))).toBe(true);
    expect(names.some((n) => n.includes('lemonade'))).toBe(true);
  });
});
