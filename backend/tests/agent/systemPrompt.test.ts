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
    customizationGroups: [
      {
        id: 'g-temp',
        name: 'Temperature',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [
          {
            id: 'o-medium-rare',
            name: 'Medium rare',
            priceDelta: '0.00',
            available: true,
          },
        ],
      },
    ],
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
    expect(out.toLowerCase()).toContain('required customization');
    // And the off-topic redirect rule (CLAUDE.md "Quality bar").
    expect(out.toLowerCase()).toMatch(/(off[- ]topic|table booking|don't have)/);
  });

  it('tells the model the CURRENT CART block is authoritative over stale tool_results', () => {
    // Regression: the agent used to claim "it's already in your cart" after
    // the user cleared the cart, because the conversation history still
    // contained an old add_to_cart tool_result. The persona must explicitly
    // anoint the live CURRENT CART block as the source of truth.
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    expect(out.toLowerCase()).toMatch(/authoritative|source of truth/);
    expect(out).toContain('CURRENT CART');
    // And the directive must precede the actual === CURRENT CART === section
    // so the model reads the rule before it reads the data it applies to.
    // Use lastIndexOf because the directive text itself mentions
    // "=== CURRENT CART ===" — the standalone section header is the LAST
    // occurrence in the prompt.
    const directiveIdx = out.toLowerCase().indexOf('authoritative');
    const cartSectionIdx = out.lastIndexOf('=== CURRENT CART ===');
    expect(directiveIdx).toBeGreaterThan(-1);
    expect(cartSectionIdx).toBeGreaterThan(directiveIdx);
  });

  it('lists every menu item with its id, name, and price', () => {
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    for (const item of FAKE_MENU) {
      expect(out).toContain(item.id);
      expect(out).toContain(item.name);
      expect(out).toContain(`$${item.price}`);
    }
  });

  it('lists customization groups and option ids in the menu snapshot', () => {
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    expect(out).toContain('Temperature');
    expect(out).toContain('groupId: g-temp');
    expect(out).toContain('optionId: o-medium-rare');
  });

  it('marks an empty cart explicitly so the model does not hallucinate items', () => {
    const out = buildSystemPrompt(FAKE_MENU, { items: [], total: '0' });
    expect(out.toLowerCase()).toMatch(/cart is (currently )?empty/);
  });

  it('renders cart line items with quantity and a running total', () => {
    const cart = {
      items: [
        {
          id: 'line-burger',
          menuItemId: 'm-burger',
          name: 'Wagyu Beef Burger',
          quantity: 2,
          unitPrice: '26.00',
          customizationHash: 'hash-burger',
          customizations: [
            {
              groupId: 'g-temp',
              groupName: 'Temperature',
              options: [
                {
                  optionId: 'o-medium-rare',
                  optionName: 'Medium rare',
                  priceDelta: '0.00',
                },
              ],
            },
          ],
        },
        {
          id: 'line-brulee',
          menuItemId: 'd-brulee',
          name: 'Crème Brûlée',
          quantity: 1,
          unitPrice: '12.00',
          customizationHash: 'base',
          customizations: [],
        },
      ],
      total: '64.00',
    };
    const out = buildSystemPrompt(FAKE_MENU, cart);
    expect(out).toContain('Wagyu Beef Burger');
    expect(out).toContain('lineId: line-burger');
    expect(out).toContain('Temperature: Medium rare');
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
      3. If an item has required customization groups and the user did not choose them, ALWAYS call \`clarify\` and name the required choices. Do not guess defaults.
      4. When calling \`add_to_cart\` for a customized item, pass \`customizations\` as { groupId: [optionId] } using exact IDs from the menu or \`get_item_customizations\`.
      5. If the user goes off-topic (table bookings, delivery, hours, dietary advice that requires a human, etc.), politely redirect: \"I don't have a table booking system, but I can help you order food. Want me to recommend something?\"
      6. Reply in plain text with no markdown, no bullet lists, no headers. Two short sentences is plenty.
      7. After a cart mutation, briefly confirm what changed — don't recite the whole cart unless asked.
      8. Prices are in USD.
      9. The \`=== CURRENT CART ===\` block below is the authoritative cart state for this turn — it is recomputed from the database on every request. If earlier tool_results in the conversation history disagree (e.g. an old \`add_to_cart\` confirmation showing items that are no longer there), trust the CURRENT CART block instead; those earlier results are stale. When in doubt, call \`get_cart\` rather than relying on memory of past turns.
      10. After your reply text, ALWAYS append a single line with 2–4 short follow-up suggestions in this exact format:
         <SUGGEST>[\"Suggestion one\",\"Suggestion two\",\"Suggestion three\"]</SUGGEST>
         The suggestions must be phrased as messages the user could send next (≤6 words each, no trailing punctuation). Tailor them to the current cart and last reply — e.g. after recommending a dish, offer \"Add it to my cart\"; if the cart has items, include something like \"What's in my cart?\" or \"Place my order\". Never include the tag if you are calling a tool — only on text replies."
    `);
  });
});
