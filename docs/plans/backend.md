# Backend Plan — Express server, auth, REST routes

## Context

The backend is a Node.js + Express API that serves the Expo web frontend. It handles authentication (email/password + Google OAuth 2.0), exposes the menu/cart/order REST surface, and hosts the AI agent (covered separately in `ai-agent.md`).

The DB layer is built first (see `database.md`); this plan assumes the Prisma client and seeded data already exist.

---

## Tech stack & key decisions

- **Node.js 20+** with **Express 4** and **TypeScript**.
- **Zod** for request validation; every route body/query/param is validated before reaching the handler.
- **bcrypt** (cost 12) for password hashing.
- **jsonwebtoken** for JWT signing/verification.
- **Passport.js** with `passport-google-oauth20` for Google OAuth.
- **cookie-parser** for httpOnly refresh-token cookie.
- **cors** middleware: in dev allow `http://localhost:8081` (Expo web default); in prod allow only `FRONTEND_URL`.
- **Vitest** + **supertest** for tests. Per-test transactional DB reset via a `beforeEach` truncate of the relevant tables — keeps test order independent without slowing tests down.
- **pino** for structured logging. Every error middleware path logs (`CLAUDE.md` line 20: no silent failures).

### Token model

- Access token: 15-minute expiry, signed with `JWT_SECRET`, returned in JSON body of `/auth/login`. Frontend stores in memory only.
- Refresh token: 7-day expiry, signed with `JWT_REFRESH_SECRET`, set as `httpOnly`, `secure` (prod only), `sameSite='none'` in prod (cross-site Vercel↔Railway), `sameSite='lax'` in dev. The `none + secure` combination is required by modern browsers for cross-site cookies — document this in `deployment.md` too.
- `/auth/refresh` reads the cookie, issues a new access token, and rotates the refresh token (write the new one back into the cookie).
- `/auth/logout` clears the cookie with the same options it was set with.

### Cart state

- In-memory `Map<sessionId, Cart>` lives in `src/services/cart.ts` as a module-level singleton. Cart entries are `{ items: { menuItemId, quantity, unitPrice, name }[], total: Decimal }`.
- `GET /api/cart` reads the map; `POST /api/cart/reset` clears it. Auth NOT required (matches anonymous-chat decision from `database.md`).
- The same cart service is used by the AI agent's tool dispatcher, so chat-driven additions and REST-driven additions converge on a single source of truth.
- On `POST /api/orders`, the in-memory cart is read, the `Order` + `OrderItem` rows are written in a transaction, the cart is cleared, and the persisted order is returned.

### Error handling

- A single global error middleware at the end of the middleware stack. It distinguishes:
  - `ZodError` → 400 with field-level messages.
  - `AppError` (custom class with `status`, `code`, `message`) → its status + safe message.
  - Anything else → log full stack with pino at `error` level, return generic 500 `{ error: "Internal server error" }`.
- No `try {} catch {}` empty blocks anywhere in handlers; use `express-async-errors` (or wrap each handler in an `asyncHandler`) so async errors reach the middleware.

---

## File/folder layout

```
backend/
├── src/
│   ├── server.ts               # express() + middleware + routes + listen
│   ├── app.ts                  # exported app for tests (no listen)
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── menu.ts
│   │   ├── cart.ts
│   │   ├── orders.ts
│   │   └── chat.ts             # implemented in ai-agent.md
│   ├── middleware/
│   │   ├── requireAuth.ts
│   │   ├── validate.ts         # Zod wrapper
│   │   └── errorHandler.ts
│   ├── services/
│   │   ├── auth.ts             # password hashing, JWT signing
│   │   ├── cart.ts             # Map<sessionId, Cart>
│   │   └── orders.ts
│   ├── lib/
│   │   ├── prisma.ts           # (already exists from database.md)
│   │   ├── logger.ts           # pino instance
│   │   └── env.ts              # validated env (Zod)
│   └── schemas/                # Zod request/response schemas
│       ├── auth.ts
│       ├── menu.ts
│       ├── cart.ts
│       └── orders.ts
└── tests/
    ├── auth.test.ts
    ├── menu.test.ts
    ├── cart.test.ts
    ├── orders.test.ts
    └── helpers/
        ├── testApp.ts          # builds app with test config
        └── resetDb.ts
```

---

## TDD task list

### 1. Environment + bootstrap
- **Test**: `GET /healthz` returns 200 `{ ok: true }`.
- **Implement**:
  - `src/lib/env.ts` validates `process.env` with Zod at startup; throws if any required var is missing. This eliminates a class of "works on my machine" bugs.
  - `src/app.ts` exporting an Express app with `cors`, `cookie-parser`, `express.json()`, request logging.
  - `src/server.ts` calling `app.listen(env.PORT)`.
  - `tests/helpers/testApp.ts` returning the app with a clean DB.
- **Commit**: `Add Express bootstrap with env validation and health route`.

### 2. Validation middleware
- **Test**: passing a bad body to a sample route returns 400 with field-level error messages.
- **Implement**: `middleware/validate.ts` accepting a Zod schema and validating `req.body` / `req.query` / `req.params`.
- **Commit**: `Add Zod request validation middleware`.

### 3. Password hashing service
- **Test**: hash a password, verify it returns true for the correct password and false for the wrong one. Hash strength ≥ cost 12.
- **Implement**: `services/auth.ts` with `hashPassword(plain)` and `verifyPassword(plain, hash)` wrapping bcrypt.
- **Commit**: `Add bcrypt password hashing service`.

### 4. JWT utilities
- **Test**: sign an access token, verify it. Verify expired token throws. Verify token with wrong secret throws. Refresh-token utilities behave identically with the refresh secret.
- **Implement**: `services/auth.ts` adds `signAccessToken`, `verifyAccessToken`, `signRefreshToken`, `verifyRefreshToken`.
- **Commit**: `Add JWT signing and verification utilities`.

### 5. Email/password register + login
- **Test**:
  - `POST /auth/register` with valid body creates a `User` (provider='local'), returns user + access token, sets refresh cookie.
  - Duplicate email returns 409.
  - Weak password returns 400.
  - `POST /auth/login` with correct credentials returns access token + refresh cookie.
  - Wrong password returns 401 with a generic message ("Invalid email or password").
- **Implement**: `routes/auth.ts` with register and login handlers.
- **Commit**: `Add email/password registration and login`.

### 6. Token refresh + logout
- **Test**:
  - `POST /auth/refresh` with valid refresh cookie returns new access token and rotates the refresh cookie.
  - Missing/expired cookie returns 401.
  - `POST /auth/logout` clears the cookie (response has `Set-Cookie` with `Max-Age=0`).
- **Implement**: refresh + logout handlers.
- **Commit**: `Add token refresh and logout`.

### 7. requireAuth middleware
- **Test**: a protected sample route returns 401 without `Authorization: Bearer <token>`, 401 with an expired token, and 200 with a valid token (`req.user` populated).
- **Implement**: `middleware/requireAuth.ts`.
- **Commit**: `Add requireAuth middleware`.

### 8. Google OAuth
- **Test**: this is integration-only — write a test that hits `GET /auth/google` and asserts a 302 redirect to `accounts.google.com` with the configured `client_id` and `redirect_uri`. The callback path is covered by a unit test of the verify callback that, given a fake Google profile, upserts a `User` with `provider='google'` and issues tokens.
- **Implement**:
  - Passport strategy in `routes/auth.ts` using `passport-google-oauth20`.
  - `GET /auth/google` initiates; `GET /auth/google/callback` finalizes and redirects to `FRONTEND_URL` with the access token in a fragment (or sets only the refresh cookie and lets the frontend call `/auth/refresh` on load — recommended for security; document the choice in code comments).
- **Commit**: `Add Google OAuth strategy`.

### 9. Public menu routes
- **Test**:
  - `GET /api/menu` returns all available items, sorted by category then name.
  - `GET /api/menu?category=mains` filters by category.
  - `GET /api/menu/:id` returns one item; 404 if missing.
- **Implement**: `routes/menu.ts`.
- **Commit**: `Add public menu routes`.

### 10. Cart service + routes
- **Test**:
  - Cart service unit tests: `addItem`, `removeItem`, `modifyItem`, `getCart`, `clearCart` — each respects the `sessionId` partition (two sessions don't see each other's carts).
  - `GET /api/cart?sessionId=...` returns the session's cart.
  - `POST /api/cart/reset` with `{ sessionId }` empties the cart.
  - Invalid `menuItemId` is rejected with 400 (referential check against the DB).
- **Implement**: `services/cart.ts` and `routes/cart.ts`. The service exports pure functions that take `sessionId` as the first arg so the AI agent's tool dispatcher can call them directly.
- **Commit**: `Add in-memory cart service and routes`.

### 11. Orders routes
- **Test**:
  - `POST /api/orders` (auth required) reads the in-memory cart for the user's session, writes `Order` + `OrderItem[]` in a transaction with `status='confirmed'` and the snapshotted `unitPrice` per item, clears the cart, returns the full order.
  - Empty cart returns 400.
  - `GET /api/orders` (auth required) returns the user's orders newest-first.
- **Implement**: `services/orders.ts` and `routes/orders.ts`.
- **Commit**: `Add order confirmation and history routes`.

### 12. Global error middleware
- **Test**:
  - A handler that throws a `ZodError` produces 400.
  - A handler that throws an `AppError` produces the specified status.
  - A handler that throws `new Error('boom')` produces 500 and logs the stack (assert the pino logger was called via a spy).
- **Implement**: `middleware/errorHandler.ts` mounted last in `app.ts`.
- **Commit**: `Add global error middleware`.

### 13. CORS + cookie config polish
- **Test**: requests from disallowed origins are blocked; allowed origins receive the right `Access-Control-Allow-Credentials` and `Access-Control-Allow-Origin` headers.
- **Implement**: tighten cors config to read `FRONTEND_URL` from env; only set `secure`/`sameSite='none'` when `NODE_ENV==='production'`.
- **Commit**: `Tighten CORS and cookie configuration`.

---

## Verification

1. `npm test` in `backend/` — all suites green.
2. Manual smoke (with `DATABASE_URL` pointing at a seeded dev DB):
   ```
   curl -X POST http://localhost:3000/auth/register -H 'Content-Type: application/json' \
     -d '{"email":"a@b.com","password":"correcthorsebatterystaple","name":"A"}'
   # capture access token + cookie jar
   curl http://localhost:3000/api/menu
   curl -X POST http://localhost:3000/api/cart -d '{"sessionId":"s1","menuItemId":"..."}'
   curl -X POST http://localhost:3000/api/orders -H 'Authorization: Bearer ...'
   ```
3. Verify `pino` logs appear on stderr in JSON format.

---

## Open questions

- **OAuth callback handoff**: setting the refresh cookie and letting the frontend bootstrap via `/auth/refresh` is cleaner than putting the access token in a URL fragment, but it means the user briefly lands on the frontend with no token. Confirm UX in `frontend.md` (loading screen during initial `/auth/refresh`).
- **Anonymous chat → authed checkout**: when the user finally logs in mid-session, do we associate the existing `Conversation` with their `userId`? Recommendation: yes, link on first authenticated chat request. Document in `ai-agent.md`.
