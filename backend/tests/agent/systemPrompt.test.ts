import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, PERSONA_HEADER } from '../../src/services/agent/systemPrompt.js';

// Minimal fake menu / cart objects so this test is fully synchronous and
// doesn't touch Prisma. The system prompt builder is pure.
const FAKE_MENU = [
  {
    id: 'm-burger',
    name: 'Wagyu Beef Burger',
    description: 'American Wagyu with aged cheddar.',
    price: '26.00',
    category: 'mains' as const,
    tags: ['signature'],
  },
  {
    id: 'm-salmon',
    name: 'Pan-Seared Salmon',
    description: 'Crispy-skin Atlantic salmon.',
    price: '28.00',
    category: 'mains' as const,
    tags: ['gluten-free'],
  },
  {
    id: 'd-brulee',
    name: 'Crème Brûlée',
    description: 'Vanilla bean custard, torched sugar crust.',
    price: '12.00',
    category: 'desserts' as const,
    tags: ['vegetarian', 'signature'],
  },
];

describe('buildSystemPrompt', () => {
  it('renders the persona header so the model sees the bistro role and rules', () => {
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    expect(out).toContain(PERSONA_HEADER);
    // Persona block must mention the ambiguity + clarify rule (CLAUDE.md line 100).
    expect(out.toLowerCase()).toContain('clarify');
    // And the off-topic redirect rule (CLAUDE.md "Quality bar").
    expect(out.toLowerCase()).toMatch(/(off[- ]topic|table booking|don't have)/);
  });

  it('lists every menu item with its id, name, and price', () => {
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    for (const item of FAKE_MENU) {
      expect(out).toContain(item.id);
      expect(out).toContain(item.name);
      expect(out).toContain(`$${item.price}`);
    }
  });

  it('marks an empty cart explicitly so the model does not hallucinate items', () => {
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    expect(out.toLowerCase()).toMatch(/cart is (currently )?empty/);
  });

  it('renders cart line items with quantity and a running total', () => {
    const cart = {
      items: [
        {
          menuItemId: 'm-burger',
          name: 'Wagyu Beef Burger',
          quantity: 2,
          unitPrice: '26.00',
        },
        {
          menuItemId: 'd-brulee',
          name: 'Crème Brûlée',
          quantity: 1,
          unitPrice: '12.00',
        },
      ],
      total: '64.00',
    };
    const out = buildSystemPrompt(FAKE_MENU, cart);
    expect(out).toContain('Wagyu Beef Burger');
    expect(out).toContain('× 2');
    expect(out).toContain('Crème Brûlée');
    expect(out).toContain('× 1');
    expect(out).toContain('$64.00');
  });

  it('groups menu items by category in the snapshot', () => {
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    expect(out.toLowerCase()).toContain('mains');
    expect(out.toLowerCase()).toContain('desserts');
    const mainsIdx = out.toLowerCase().indexOf('mains');
    const dessertsIdx = out.toLowerCase().indexOf('desserts');
    // Both categories exist and aren't the same offset (i.e. real headers).
    expect(mainsIdx).toBeGreaterThan(-1);
    expect(dessertsIdx).toBeGreaterThan(mainsIdx);
  });

  it('produces a stable persona header (snapshot — change only deliberately)', () => {
    // The literal header is exported so it can change as a single unit. If
    // future-you intentionally edits PERSONA_HEADER, update this snapshot.
    expect(PERSONA_HEADER).toMatchInlineSnapshot(`
      "You are the AI maître d' for The Intelligent Bistro — a friendly, concise upscale waiter.

      Your only job is to take food orders by manipulating the user's cart through tool calls.

      Rules:
      1. NEVER guess menu item IDs. Only use the exact IDs from the MENU section below.
      2. If a request matches more than one menu item, ALWAYS call \`clarify\` with a question that NAMES the candidates rather than picking one.
      3. If the user goes off-topic (table bookings, delivery, hours, dietary advice that requires a human, etc.), politely redirect: \"I don't have a table booking system, but I can help you order food. Want me to recommend something?\"
      4. Reply in plain text with no markdown, no bullet lists, no headers. Two short sentences is plenty.
      5. After a cart mutation, briefly confirm what changed — don't recite the whole cart unless asked.
      6. Prices are in USD."
    `);
  });
});
