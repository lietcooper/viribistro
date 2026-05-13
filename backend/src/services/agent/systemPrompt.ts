// System prompt builder.
//
// Per CLAUDE.md line 119 the system prompt is rebuilt fresh on every request
// and is NOT persisted to the Message table. It carries three things:
//   1. A stable persona header (the agent's rules)
//   2. A live menu snapshot grouped by category
//   3. The current cart state for this session
//
// The output is a single string. The loop runner wraps it in an
// `{ type: 'text', text: ..., cache_control: { type: 'ephemeral' } }` block
// so Anthropic can cache the prefix between requests in the same session
// (the menu doesn't change for the duration of a chat).
import type { Cart } from '../cart.js';

/** Exposed so a test can pin the persona header as a snapshot. */
export const PERSONA_HEADER: string =
  "You are the AI maître d' for The Intelligent Bistro — a friendly, concise upscale waiter.\n" +
  '\n' +
  "Your only job is to take food orders by manipulating the user's cart through tool calls.\n" +
  '\n' +
  'Rules:\n' +
  '1. NEVER guess menu item IDs. Only use the exact IDs from the MENU section below.\n' +
  '2. If a request matches more than one menu item, ALWAYS call `clarify` with a question that NAMES the candidates rather than picking one.\n' +
  "3. If the user goes off-topic (table bookings, delivery, hours, dietary advice that requires a human, etc.), politely redirect: \"I don't have a table booking system, but I can help you order food. Want me to recommend something?\"\n" +
  "4. Reply in plain text with no markdown, no bullet lists, no headers. Two short sentences is plenty.\n" +
  "5. After a cart mutation, briefly confirm what changed — don't recite the whole cart unless asked.\n" +
  '6. Prices are in USD.';

export interface MenuSnapshotItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: 'starters' | 'mains' | 'desserts' | 'drinks';
  tags: string[];
}

const CATEGORY_ORDER: Array<MenuSnapshotItem['category']> = [
  'starters',
  'mains',
  'desserts',
  'drinks',
];

function renderMenu(menu: MenuSnapshotItem[]): string {
  const byCategory = new Map<MenuSnapshotItem['category'], MenuSnapshotItem[]>();
  for (const item of menu) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = byCategory.get(cat);
    if (!items || items.length === 0) continue;
    const heading = cat.charAt(0).toUpperCase() + cat.slice(1);
    sections.push(`### ${heading}`);
    for (const it of items) {
      const tagSuffix = it.tags.length > 0 ? ` [${it.tags.join(', ')}]` : '';
      sections.push(
        `- ${it.name} (id: ${it.id}) — $${it.price}${tagSuffix}\n  ${it.description}`,
      );
    }
    sections.push('');
  }
  return sections.join('\n').trimEnd();
}

function renderCart(cart: Cart): string {
  if (cart.items.length === 0) {
    return 'The cart is currently empty.';
  }
  const lines = cart.items.map(
    (i) => `- ${i.name} (id: ${i.menuItemId}) × ${i.quantity} @ $${i.unitPrice}`,
  );
  lines.push(`Total: $${cart.total}`);
  return lines.join('\n');
}

/**
 * The STATIC half of the system prompt: persona + menu. Byte-identical for
 * every request in a chat session (the menu doesn't change mid-session), so
 * the loop runner wraps this in cache_control: ephemeral and Anthropic
 * returns a cache hit on subsequent requests.
 *
 * IMPORTANT: do NOT include cart state here. Even a single quantity change
 * mutates the text and busts the prefix cache for that session.
 */
export function buildStaticSystemPrompt(menu: MenuSnapshotItem[]): string {
  return [
    PERSONA_HEADER,
    '',
    '=== MENU ===',
    renderMenu(menu),
  ].join('\n');
}

/**
 * The VOLATILE half: cart state. Emitted as a separate (uncached) text
 * block in the system array — Anthropic still receives it as part of the
 * system prompt, but the static prefix above keeps caching.
 */
export function renderCartBlock(cart: Cart): string {
  return ['=== CURRENT CART ===', renderCart(cart)].join('\n');
}

/**
 * Convenience helper that concatenates both halves — kept for tests and
 * any caller that wants the full prompt as one string. Production code
 * (the loop runner) uses the two builders directly so the static half can
 * be cached.
 */
export function buildSystemPrompt(menu: MenuSnapshotItem[], cart: Cart): string {
  return [buildStaticSystemPrompt(menu), '', renderCartBlock(cart)].join('\n');
}
