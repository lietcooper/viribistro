# AGENTS.md

This file provides guidance to coding agents (Codex, Cursor, and others) when working in this repository. It mirrors `CLAUDE.md` — keep the two in sync.

## Repository layout

This is a two-package monorepo with no root `package.json`. Always `cd` into either `backend/` or `frontend/` before running scripts — there is no top-level orchestrator. Local Postgres runs from the root via `docker compose up -d postgres` (port 5433, two DBs: `bistro_dev` and `bistro_test` — see `backend/prisma/init-test-db.sql`).

```
backend/   Node 20 + Express + Prisma + Anthropic SDK     → Railway
frontend/  Expo SDK 52 (RN web export) + NativeWind v4    → Vercel
docs/plans/  design docs (ai-agent, backend, database, frontend, deployment)
```

## Commands

### Backend (`cd backend`)
- `npm run dev` — tsx watch on `src/server.ts` (port 3000)
- `npm run build` / `npm start` — emit `dist/` then `node dist/server.js`
- `npm run db:migrate` — `prisma migrate dev` (local dev DB)
- `npm run db:migrate:deploy` — non-interactive deploy (CI / Railway)
- `npm run db:seed` — `tsx prisma/seed.ts` (24+ menu items, customization groups)
- `npm run db:reset` — drop + recreate + reseed (destructive)
- `npm run db:studio` — Prisma Studio UI
- `npm test` — vitest run (single-fork; setup at `tests/helpers/setup.ts` resets the test DB between files)
- `npm run test:watch` — vitest watch
- Run one file: `npx vitest run tests/agent/loop.test.ts`
- Run one test: `npx vitest run -t "stops on refusal"`
- `npm run lint` — eslint flat config
- `npm run lint:schema` — `prisma validate`
- `npm run format` / `npm run format:check` — prettier (shares root `.prettierignore`)

### Frontend (`cd frontend`)
- `npm run web` — Expo dev server (port 8081)
- `npm run build:web` / `npm run export:web` — `expo export --platform web` into `dist/`
- `npm test` — jest (preset `jest-expo`, with the long RN/Expo `transformIgnorePatterns` allowlist in `package.json`)
- Run one file: `npx jest tests/stores/useChatStore.test.ts`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run format`
- `npm run e2e` — Playwright; spins up its own backend (port 3100, `bistro_e2e` DB, `E2E_FAKE_AI=1`) and frontend (port 8090) via `playwright.config.ts`. Requires `docker compose up -d postgres` first.

### CI
`.github/workflows/ci.yml` runs three jobs on every push/PR: **Backend** (lint, schema validate, format, build, vitest), **Frontend** (lint, format, typecheck, jest, web build), and **E2E** (Playwright, needs both prior jobs). The backend job stands up the Postgres container itself.

## Big-picture architecture

### The agent loop is the heart of the system
`POST /api/chat` is **not** a simple LLM call — it's a tool-calling loop, and the surrounding code makes load-bearing assumptions you'll break if you treat it as a chat completion.

The loop lives in `backend/src/services/agent/loop.ts` (`runAgentLoop`). Read this file before changing anything in `backend/src/services/agent/`. Key invariants:

- **History is replayed verbatim.** `Message.content` is `Json` so we persist Anthropic's `MessageParam.content` (including `tool_use` and `tool_result` blocks) as-is. `persistence.ts` reads them back 1:1 — never transform them. A `tool_result` must immediately follow its matching `tool_use` on replay, or Anthropic rejects the request.
- **Sequence column is the tiebreaker.** Multiple `Message` rows in one turn share a millisecond `createdAt`. `Message.sequence` is the monotonic per-conversation counter that makes replay order deterministic. Sorted by `[createdAt asc, sequence asc]`.
- **Every `tool_use` needs a matching `tool_result` — including `clarify`.** When the model calls `clarify`, we still synthesize a `tool_result` block before short-circuiting the loop, otherwise the next turn's history is malformed. See the `clarifyQuestion` branch in `loop.ts`.
- **System prompt is split into a static cached block + a volatile cart block.** `systemPrompt.ts` exports `buildStaticSystemPrompt(menu)` (cache_control: ephemeral) and `renderCartBlock(cart)` (no cache). Don't merge them — cart mutations would bust the prefix cache.
- **`MAX_LOOP_ITERATIONS = 6`** with a graceful fallback reply. `stop_reason === 'refusal'` also returns a graceful reply, not an error.
- **Tools are dispatched via Zod-validated input** in `tools.ts`. Anthropic does NOT enforce `input_schema` server-side — `dispatchTool` re-parses with Zod before touching `services/cart.ts`. A schema failure is returned to the model as a recoverable `is_error: true` tool_result so it can retry; an `AppError` from the cart service is similarly fed back in-loop.
- **`<SUGGEST>[...]</SUGGEST>`** is a tail the model appends on text turns; `extractSuggestions` parses it into `suggestedReplies` and strips it from the user-visible text.
- **Inject the Anthropic client.** `runAgentLoop` takes an `AnthropicLike` so tests pass a fake. `e2eFakeAnthropic.ts` is the deterministic stub used when `E2E_FAKE_AI=1` is set.

### Cart is persistent, not in-memory
`backend/src/services/cart.ts` is the single source of truth. REST routes (`/api/cart`) and agent tools (`add_to_cart`, `remove_from_cart`, `modify_item`, `clear_cart`, `get_item_customizations`) call the same functions — never duplicate logic in routes.

- A cart is keyed by `userId` when authenticated, else by `sessionId` (`CartOwner`). On login mid-session, the frontend's session is reused; `appendTurn` upserts conversations by `sessionId` and links them to the new `userId`.
- **Lines stack by `customizationHash`** (sha256 over `{customizations, note}`, or literal `"base"` when neither). Different notes ⇒ separate lines (the kitchen needs each note distinct). `cart.addItem` upserts on `(cartId, menuItemId, customizationHash)`.
- **`modify_item` will not create a new line.** It throws `MODIFY_REQUIRES_EXISTING_LINE` if no matching line exists — the agent must call `add_to_cart` to go through the customization-validation path.
- **`remove_from_cart` / `modify_item` accept either `cartItemId` (preferred) or `itemId`.** When given `itemId` and multiple lines share that menu item, `resolveSingleLine` throws `AMBIGUOUS_CART_ITEM` (409). Prefer `cartItemId`.
- **`Decimal` is stringified at the boundary** via `normalizePrice()` to two-decimal strings — never expose Prisma `Decimal` to JSON callers.

### Auth model
- Email/password (bcrypt) + Passport.js Google OAuth 2.0. JWT access (15 min) lives in memory in `useAuthStore`; refresh (7 days) is an httpOnly cookie set by the backend.
- Frontend axios (`frontend/src/lib/api.ts`) has a **single-flight** refresh interceptor: concurrent 401s share one `/auth/refresh` call, replay once, then bail.
- Chat is **anonymous by design**. `optionalUserId(req)` opportunistically verifies a bearer token but never errors when missing. `requireAuth` middleware is only on routes that truly need it (notably `GET /api/orders`).
- Google OAuth is opt-in: `env.ts` `superRefine` requires `GOOGLE_CALLBACK_URL` whenever `GOOGLE_CLIENT_ID` is set — no localhost fallback to avoid silently shipping broken prod callbacks.

### Frontend state
Five Zustand stores in `frontend/src/stores/`:
- `useAuthStore` — user, token, status
- `useCartStore` — items, total, mutators that call REST
- `useChatStore` — messages, sessionId, isTyping, suggestedReplies
- `useCartUiStore` — drawer open/closed, badge bounce trigger
- `useToastStore` — toast queue

The chat tab is the default landing (see `MainTabs.tsx`). `CartDrawer` is a global bottom sheet shared by all tabs. Animations use `react-native-reanimated` 3 with spring physics — don't introduce linear easing for cart/chat/menu transitions.

## Environment

Backend env is validated by Zod (`src/lib/env.ts`) at boot — boot fails loudly on missing/invalid vars. Notable points:
- `ANTHROPIC_MODEL` defaults to `claude-sonnet-4-6` (the `claude-sonnet-4-20250514` mentioned in `docs/plans/` is deprecated; do not "fix" the default to match the old doc).
- `E2E_FAKE_AI=1` mounts `/__e2e/reset` and swaps in the fake Anthropic client.
- `JWT_SECRET` and `JWT_REFRESH_SECRET` must each be ≥ 32 chars.
- Test envs are wired in `.github/workflows/ci.yml` and `playwright.config.ts` — copy from there if you need to mirror them locally.

Frontend uses the `EXPO_PUBLIC_API_URL` prefix (Expo only exposes env vars with that prefix to the bundle).

## Conventions worth following

- **TDD is the project's stated norm** — write tests before implementing, and don't move on with failing tests. `backend/tests/agent/fakeAnthropic.ts` is the canonical pattern for hermetic agent tests.
- **No silent failures.** Never write an empty `catch`. Cart/agent errors flow through `AppError` (`backend/src/lib/AppError.ts`) and `middleware/errorHandler.ts`.
- **Per-route Zod validators** live in `backend/src/schemas/` and are applied via `validate({ body, params, query })`.
- **Imperative-mood commit messages.** Commit per logical unit (a route, a screen, a passing test file).
- **Don't add Redis or in-memory cart caches.** The brief once described an in-memory `Map`; the production code is Prisma-backed and routes/tools share that store. Adding a second store will desync REST and chat.

## Things that have bitten us (read before "fixing")

- `Message.sequence` exists *because* `createdAt` collisions are real — don't drop it.
- `clarify` short-circuits but still appends a `tool_result` — don't simplify away the synthetic result block.
- `modify_item` deliberately refuses to create new lines (forces the agent through `add_to_cart`'s customization validation).
- The two-block system prompt split is for Anthropic prompt caching — keep them separate.
- The Google OAuth callback URL has no default; that's intentional.
