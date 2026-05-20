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
  '3. If an item has REQUIRED customization groups and the user did not specify them, ALWAYS call `clarify` and name each required group with its option choices. Do not guess defaults.\n' +
  '4. CRITICAL — OPTIONAL groups. Whenever the item the user wants has any OPTIONAL customization groups they did not specify, your `clarify` MUST also mention each optional group by NAME (just the group name, not every option). Example for Spicy Chicken Sandwich: `clarify({ question: "Which heat level — Classic hot honey, Extra Nashville hot, or Mild? You can also pick a bun, side, add-ons, or ingredients to skip if you\'d like." })`. This applies whether or not the item has a required group — if it has required AND optional, combine them into ONE clarify. If the user replies without picking the optional ones, proceed without them. NEVER silently skip surfacing optional groups when they exist on the item.\n' +
  '5. When calling `add_to_cart` for a customized item, pass `customizations` as { groupId: [optionId] } using exact IDs from the menu or `get_item_customizations`.\n' +
  '6. For cart removals and quantity changes, use cartItemId from CURRENT CART whenever possible. Use menuItemId only when exactly one cart line matches.\n' +
  "7. If multiple cart lines match a requested item name, ALWAYS call `clarify`; mention each line's customizations so the user can choose. Never remove multiple customized lines unless the user clearly asks to remove all matching lines.\n" +
  '8. `remove_from_cart` removes an entire cart line. For requests like "remove one" or "take one off" when quantity is greater than 1, call `modify_item` with the decremented quantity instead.\n' +
  '9. If the user goes off-topic (table bookings, delivery, hours, dietary advice that requires a human, etc.), politely redirect: "I don\'t have a table booking system, but I can help you order food. Want me to recommend something?"\n' +
  '10. Reply in plain text with no markdown, no bullet lists, no headers. Two short sentences is plenty (a `clarify` question that surfaces optional groups per rule 4 may be 2–3 sentences).\n' +
  "11. After a cart mutation, briefly confirm what changed — don't recite the whole cart unless asked.\n" +
  '12. Prices are in USD.\n' +
  '13. The `=== CURRENT CART ===` block below is the authoritative cart state for this turn — it is recomputed from the database on every request. If earlier tool_results in the conversation history disagree (e.g. an old `add_to_cart` confirmation showing items that are no longer there), trust the CURRENT CART block instead; those earlier results are stale. When in doubt, call `get_cart` rather than relying on memory of past turns.\n' +
  '14. After your reply text, ALWAYS append a single line with 2–4 short follow-up suggestions in this exact format:\n' +
  '   <SUGGEST>["Suggestion one","Suggestion two","Suggestion three"]</SUGGEST>\n' +
  '   The suggestions must be phrased as messages the user could send next (≤6 words each, no trailing punctuation). Tailor them to the current cart and last reply — e.g. after recommending a dish, offer "Add it to my cart"; if the cart has items, include something like "What\'s in my cart?" or "Place my order". Never include the tag if you are calling a tool — only on text replies.';

export interface MenuSnapshotItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: 'starters' | 'mains' | 'desserts' | 'drinks';
  tags: string[];
  customizationGroups?: Array<{
    id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    options: Array<{
      id: string;
      name: string;
      priceDelta: string;
      available: boolean;
    }>;
  }>;
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
      for (const group of it.customizationGroups ?? []) {
        const required = group.required ? 'required' : 'optional';
        const options = group.options
          .filter((option) => option.available)
          .map((option) => {
            const delta = option.priceDelta === '0.00' ? '' : ` +$${option.priceDelta}`;
            return `${option.name} (optionId: ${option.id}${delta})`;
          })
          .join('; ');
        sections.push(
          `  Customization ${group.name} (groupId: ${group.id}, ${required}, select ${group.minSelect}-${group.maxSelect}): ${options}`,
        );
      }
    }
    sections.push('');
  }
  return sections.join('\n').trimEnd();
}

/**
 * Sanitize a freeform user-provided cart note before embedding it in the
 * system prompt. Notes are user input and the renderer embeds them inside
 * a quoted segment of plain text — a raw newline or quote would let a
 * malicious note break out of that segment and inject content the model
 * could parse as new instructions (prompt injection). The Zod cap on note
 * length (200 chars) bounds the surface but does NOT prevent newline
 * injection on its own.
 *
 * Strips ASCII control characters (including \r\n, \t, vertical-tab) by
 * folding them to a single space, then escapes backslashes and double
 * quotes so the surrounding `"..."` delimiter stays well-formed.
 */
export function sanitizeNote(note: string | null | undefined): string {
  if (!note) return '';
  return note
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim();
}

function renderCart(cart: Cart): string {
  if (cart.items.length === 0) {
    return 'The cart is currently empty.';
  }
  const lines = cart.items.map((i) => {
    const choices =
      i.customizations.length === 0
        ? ''
        : ` [${i.customizations
            .map(
              (group) =>
                `${group.groupName}: ${group.options.map((option) => option.optionName).join(', ')}`,
            )
            .join('; ')}]`;
    const safeNote = sanitizeNote(i.note);
    const note = safeNote ? ` note: "${safeNote}"` : '';
    return `- ${i.name} (cartItemId: ${i.id}, menuItemId: ${i.menuItemId})${choices}${note} × ${i.quantity} @ $${i.unitPrice}`;
  });
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
  return [PERSONA_HEADER, '', '=== MENU ===', renderMenu(menu)].join('\n');
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
// WARNING: do NOT call buildSystemPrompt() from runAgentLoop — concatenating the volatile cart block busts the prefix cache; use the two builders separately there.
export function buildSystemPrompt(menu: MenuSnapshotItem[], cart: Cart): string {
  return [buildStaticSystemPrompt(menu), '', renderCartBlock(cart)].join('\n');
}
