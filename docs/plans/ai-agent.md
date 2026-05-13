# AI Agent Plan — /api/chat tool-calling loop

## Context

This is the centerpiece of the project (`CLAUDE.md` line 91: "this is the most important part"). The `/api/chat` endpoint runs a tool-calling loop with Anthropic's Claude. The model can call six tools — `add_to_cart`, `remove_from_cart`, `modify_item`, `get_cart`, `get_menu`, `clarify` — to manipulate the user's cart through natural language. The agent must handle multi-turn context, ambiguity, and off-topic messages gracefully.

This plan depends on `database.md` (Conversation + Message tables) and `backend.md` (cart service, Express bootstrap, auth middleware).

---

## Tech stack & key decisions

- **Anthropic SDK** (`@anthropic-ai/sdk`).
- **Model**: `claude-sonnet-4-20250514` (per `CLAUDE.md` line 41). Configured via env var so it's swappable for newer models without code changes.
- **Prompt caching**: cache the system prompt block (it contains the full menu snapshot, ~24 items × ~150 tokens ≈ 3.6K tokens — well above the 1024-token cache floor for Sonnet, so caching saves real money). Use `cache_control: { type: 'ephemeral' }` on the system block.
- **Loop guard**: hard cap of 6 tool-call iterations per turn. If exceeded, the response is `{ reply: "Sorry, I got stuck — could you try rephrasing?", cartUpdate: null, toolsUsed: [...] }`. Prevents runaway costs and infinite loops.
- **Tool dispatcher** is a thin wrapper around `services/cart.ts` from the backend module. The two REST cart routes and the AI tools call the exact same functions — no duplication, no drift.
- **System prompt** is rebuilt fresh on every request (per `CLAUDE.md` line 119). It includes:
  - A persona/instructions block: friendly bistro waiter, tool-use guidance, ambiguity rule (must call `clarify` when uncertain), off-topic graceful fallback example.
  - Live menu snapshot (name, id, price, category, tags, description).
  - Live cart state for this `sessionId`.
- **Response shape** to frontend: `{ reply: string, cartUpdate: { items, total } | null, toolsUsed: string[] }`. `cartUpdate` is null when no mutating tool was called this turn.
- **`Message.content` as JSON** lets us persist `tool_use` / `tool_result` blocks exactly as the Anthropic API returned/expects them, so replaying history into the next turn is a trivial mapping.

### Tool schemas (Anthropic tool-use format)

```ts
{
  name: 'add_to_cart',
  description: 'Add a menu item to the cart by its exact menuItemId. Quantity defaults to 1.',
  input_schema: {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: 'The exact menu item ID from the menu snapshot.' },
      quantity: { type: 'integer', minimum: 1, default: 1 }
    },
    required: ['itemId']
  }
}
```

Repeat with appropriate signatures for `remove_from_cart(itemId)`, `modify_item(itemId, newQuantity)`, `get_cart()`, `get_menu(category?)`, `clarify(question)`.

### Ambiguity contract

If a user message like "add a burger" matches multiple items (`Wagyu beef burger`, `Mushroom burger`, etc.), the system prompt instructs the model: *"If a request matches more than one menu item, ALWAYS call `clarify` with a question naming the candidates rather than guessing."*

`clarify` is a special tool: its result is short-circuited by the loop runner. Instead of executing anything, the runner stops the loop and returns the model's clarification question to the frontend as the `reply`. This means a `clarify` call ends the turn — the model doesn't need to follow up with text.

### Off-topic handling

System prompt example: *"If the user asks about table bookings, delivery, hours, or other things outside ordering food, politely redirect: 'I don't have a table booking system, but I can help you order food. Want me to recommend something?'"* No tool call needed — the model just replies in text.

### Multi-turn context

Because we persist full conversation history (including `tool_use` and `tool_result` blocks), the model sees prior actions on every request. So "actually make that three" resolves naturally: the model sees its prior `add_to_cart(itemId='x', quantity=1)`, understands "that" refers to item `x`, and calls `modify_item(itemId='x', newQuantity=3)`.

---

## File/folder layout

```
backend/src/
├── routes/
│   └── chat.ts                       # POST /api/chat, GET /api/chat/history/:sessionId
├── services/
│   └── agent/
│       ├── tools.ts                  # tool schemas + tool dispatcher
│       ├── systemPrompt.ts           # builder: (menu, cart) → system block
│       ├── loop.ts                   # runAgentLoop(messages, deps) — model + tools
│       ├── anthropic.ts              # configured client + thin retry wrapper
│       └── persistence.ts            # load/save Conversation + Message rows
└── tests/
    └── agent/
        ├── tools.test.ts
        ├── systemPrompt.test.ts
        ├── loop.test.ts
        ├── persistence.test.ts
        ├── chatRoute.test.ts         # supertest integration with stubbed model
        └── live.test.ts              # gated on RUN_LIVE=1
```

---

## TDD task list

### 1. Tool schemas
- **Test**: `tools.test.ts` — import the schemas, assert all six exist with the right name + `input_schema.required` fields. Also validate sample inputs against the schemas with Zod equivalents (so the dispatcher rejects malformed tool inputs before touching the cart service).
- **Implement**: `services/agent/tools.ts` exporting:
  - `toolSchemas: AnthropicTool[]` — the array passed to `client.messages.create({ tools })`.
  - `toolInputZod` — per-tool Zod schemas mirroring the JSON schemas for runtime validation.
- **Commit**: `Define AI agent tool schemas`.

### 2. System prompt builder
- **Test**:
  - Given a menu of 24 items and an empty cart, the returned system block contains every item name and price, the persona instructions, the ambiguity rule, and an explicit empty-cart marker.
  - Given a cart with 2 items, the cart section lists both with quantities and totals.
  - Snapshot test: the persona/instructions section is stable (changing it should be a deliberate snapshot update).
- **Implement**: `services/agent/systemPrompt.ts` exporting `buildSystemPrompt(menu, cart) => string`.
- **Commit**: `Add system prompt builder`.

### 3. Tool dispatcher
- **Test**:
  - `dispatchTool('add_to_cart', { itemId, quantity }, { sessionId })` calls `cartService.addItem(...)` and returns `{ type: 'tool_result', tool_use_id, content }` with the updated cart serialized.
  - `dispatchTool('clarify', { question }, ...)` returns a special `{ type: 'clarify', question }` marker (NOT a tool_result) so the loop runner can short-circuit.
  - Unknown tool name throws.
  - Malformed input (Zod fails) returns a `tool_result` with `is_error: true` so the model can recover.
- **Implement**: `services/agent/tools.ts` adds the dispatcher.
- **Commit**: `Add tool dispatcher`.

### 4. Loop runner — happy path
- **Test**: with a fake Anthropic client that returns:
  - Turn 1: a `tool_use` for `add_to_cart`.
  - Turn 2: a final text response "Done — added to your cart."
  ...the runner returns `{ reply: 'Done — added to your cart.', toolsUsed: ['add_to_cart'], cartUpdate: <new cart> }`.
- **Implement**: `services/agent/loop.ts` exporting `runAgentLoop({ messages, cart, sessionId, anthropic })`.
  - Pseudocode:
    ```
    let assistantMessage = await anthropic.messages.create({ system, messages, tools, model });
    while (assistantMessage.stop_reason === 'tool_use' && iterations++ < MAX_ITER):
      execute each tool_use block in parallel via dispatcher
      append assistant message + tool_result blocks to messages
      assistantMessage = await anthropic.messages.create({ system, messages, tools, model })
    return { reply: text from final assistantMessage, toolsUsed, cartUpdate }
    ```
- **Commit**: `Add agent loop runner happy path`.

### 5. Loop runner — clarify short-circuit
- **Test**: fake client returns a `clarify` tool_use. The runner does NOT call the model a second time; it returns `{ reply: <clarify question>, toolsUsed: ['clarify'], cartUpdate: null }`.
- **Implement**: handle the `clarify` marker in the dispatcher loop — break out and return the question immediately.
- **Commit**: `Handle clarify tool as short-circuit`.

### 6. Loop runner — max iterations guard
- **Test**: fake client returns `tool_use` indefinitely; after 6 iterations the runner returns the graceful fallback message.
- **Implement**: enforce `MAX_ITER = 6` in `loop.ts`.
- **Commit**: `Add max-iteration guard to agent loop`.

### 7. Conversation persistence
- **Test**:
  - After a chat call, the `Conversation` row exists for the `sessionId`, and all `user`, `assistant`, and `tool` messages from this turn are persisted in order with `Message.content` as the original block-array JSON.
  - The system prompt is NOT in the `Message` table.
  - On the next request for the same `sessionId`, `loadHistory(sessionId)` returns the messages in the exact shape the Anthropic API expects to be re-passed.
- **Implement**: `services/agent/persistence.ts` with `loadHistory(sessionId)` and `appendMessages(conversationId, msgs)`. Use a single transaction per turn.
- **Commit**: `Persist conversation history per session`.

### 8. POST /api/chat — integration with stubbed model
- **Test** (`chatRoute.test.ts` with supertest + a stub Anthropic client injected via dependency injection):
  - Send `{ sessionId, message: "add the spicy chicken sandwich" }`. Stub returns a `tool_use` for `add_to_cart` then a final text response.
  - Assert response body is `{ reply: '...', cartUpdate: { items: [...], total: ... }, toolsUsed: ['add_to_cart'] }`.
  - Assert the in-memory cart for `sessionId` now contains the item.
  - Assert four messages were persisted (user, assistant-with-tool-use, tool-result, assistant-text).
- **Implement**: `routes/chat.ts` — orchestrates: load history → append user message → run loop → persist → respond. Also handles dependency injection of the anthropic client so tests can stub it.
- **Commit**: `Add POST /api/chat endpoint`.

### 9. Ambiguity end-to-end
- **Test**: send "add a burger" with two burgers in the seeded menu; stub model returns a `clarify` tool_use. Assert the response `reply` is the clarification question and `cartUpdate` is null.
- **Implement**: nothing new — verifies the clarify short-circuit through the full route.
- **Commit**: `Verify ambiguity clarification end-to-end`.

### 10. GET /api/chat/history/:sessionId
- **Test**:
  - For a known sessionId, returns the persisted messages in order, with `role` and `content`.
  - System prompt is absent from the response.
  - Unknown sessionId returns an empty array (not 404 — frontend can render an empty chat).
- **Implement**: `routes/chat.ts` adds the history handler.
- **Commit**: `Add chat history endpoint`.

### 11. Off-topic graceful handling
- **Test**: stub model returns a plain text reply (no tool_use) to a message like "can I book a table for two?". Assert the route returns the text as `reply` and `cartUpdate: null`. (This is just a regression test that no tool path is required for pure-text turns.)
- **Commit**: `Test off-topic graceful handling`.

### 12. Multi-turn context regression
- **Test**: seed a `Conversation` with one prior `add_to_cart` exchange. Send `{ sessionId, message: "actually make that three" }`. Stub model (with access to history in `messages`) returns `modify_item` for the same itemId with `newQuantity=3`. Assert cart updates to quantity 3 and the response includes `toolsUsed: ['modify_item']`.
- **Commit**: `Verify multi-turn context with modify_item`.

### 13. Live integration test (gated)
- **Test** (`live.test.ts`, skipped unless `RUN_LIVE=1`): hit the real Anthropic API with a real seeded menu. Send "I'd like the spicy chicken sandwich and a lemonade." Assert two items end up in the cart. This is a flakiness-tolerant smoke test, not a contract assertion — model wording will vary.
- **Commit**: `Add live agent integration test (RUN_LIVE flag)`.

### 14. Prompt caching
- **Test**: inspect the Anthropic request payload (via the stubbed client's recorded calls); assert the system block carries `cache_control: { type: 'ephemeral' }`.
- **Implement**: `loop.ts` wraps the system block in the cache_control marker when calling the API.
- **Commit**: `Enable prompt caching on the system block`.

---

## Verification

1. `npm test -- agent` — all suites green.
2. Live smoke (requires `ANTHROPIC_API_KEY` and a seeded DB):
   ```
   curl -X POST http://localhost:3000/api/chat \
     -H 'Content-Type: application/json' \
     -d '{"sessionId":"smoke-1","message":"recommend something spicy and add it"}'
   curl http://localhost:3000/api/cart?sessionId=smoke-1
   curl -X POST http://localhost:3000/api/chat \
     -d '{"sessionId":"smoke-1","message":"actually make that two"}'
   ```
   Expect the cart to evolve correctly across turns.
3. Check Anthropic dashboard: prompt cache hit rate should climb above 0 after the second request per session.

---

## Open questions

- **Tool execution concurrency**: when the model emits multiple `tool_use` blocks in one turn (e.g. add two different items), run them sequentially or in parallel? Sequential is safer for cart mutations (avoids racey writes to the in-memory `Map`). Default: sequential.
- **Cost ceiling**: should we hard-cap per-session token spend? Likely yes for a demo, via a per-`sessionId` counter that returns a polite "session limit reached" message past the threshold. Defer until after a live test reveals real costs.
- **Conversation link on login**: as flagged in `backend.md` open questions — if a user starts anonymous and then logs in, set `Conversation.userId = req.user.id` on the next authenticated chat call. Trivial change; document in the route handler.
