# Deployment Plan — Railway + Vercel

## Context

The demo is a single URL a recruiter opens in a browser. The backend (Node + Postgres) lives on Railway; the frontend (Expo web export) lives on Vercel. Google OAuth must work in production, which means callback URLs and cross-site cookies need to be configured precisely.

This plan assumes the four other module plans are complete and the app runs end-to-end locally. Deployment is the last step before sharing the demo.

---

## Tech stack & key decisions

### Backend on Railway

- **Service**: Node 20 web service.
- **Database**: Railway Postgres plugin. `DATABASE_URL` injected automatically into the service.
- **Build**: `npm ci && npm run build && npx prisma generate`.
- **Release** (runs before each deploy): `npx prisma migrate deploy` (NOT `migrate dev`; deploy applies committed migrations without prompting).
- **Start**: `node dist/server.js`.
- **Healthcheck**: `GET /healthz` (already implemented in `backend.md` step 1).
- **Environment variables** (set in Railway dashboard, never committed):
  - `DATABASE_URL` — auto-injected.
  - `JWT_SECRET`, `JWT_REFRESH_SECRET` — generate with `openssl rand -hex 32`.
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from Google Cloud Console.
  - `GOOGLE_CALLBACK_URL` — `https://<railway-domain>/auth/google/callback`.
  - `ANTHROPIC_API_KEY` — from Anthropic console. **Never** expose to the frontend.
  - `PORT` — Railway injects automatically, but our `env.ts` reads it.
  - `FRONTEND_URL` — `https://<vercel-domain>`.
  - `NODE_ENV=production`.
- **Logs**: Railway aggregates pino JSON logs automatically.

### Frontend on Vercel

- **Build command**: `npx expo export --platform web`.
- **Output directory**: `dist/`.
- **Install command**: `npm ci`.
- **Framework preset**: "Other" (Expo's static export isn't a first-party preset; "Other" works fine with the build command above).
- **Environment variables**:
  - `EXPO_PUBLIC_API_URL` — `https://<railway-domain>` (no trailing slash).
- **Vercel project setting**: Set "Root Directory" to `frontend/`.

### Cross-site cookie configuration

Because frontend and backend live on different domains (Vercel and Railway), the refresh cookie must use `sameSite='none'; secure` in production. The Express cookie config (from `backend.md`) already branches on `NODE_ENV==='production'`. Without this, the browser refuses to send the cookie to the API.

### CORS

The backend's CORS middleware allows exactly `FRONTEND_URL` and sets `Access-Control-Allow-Credentials: true`. Wildcard origins are not compatible with credentialed requests, so this must be the exact Vercel URL (including https).

### Google OAuth callback URLs

Register two callback URLs in the Google Cloud Console OAuth client:

1. `http://localhost:3000/auth/google/callback` — for local development.
2. `https://<railway-domain>/auth/google/callback` — for production.

Authorized JavaScript origins:

1. `http://localhost:8081` — Expo web dev.
2. `https://<vercel-domain>` — production frontend.

---

## File/folder layout

```
backend/
├── railway.json                 # optional; build/start can be set in Railway dashboard instead
├── .env.example                 # committed; lists every var with placeholder values
└── package.json                 # scripts: build, start, migrate:deploy

frontend/
├── vercel.json                  # optional; root-directory config can be set in Vercel dashboard
├── .env.example                 # committed; lists EXPO_PUBLIC_API_URL
└── package.json                 # scripts: build:web (`expo export --platform web`)

README.md                        # quickstart with the live URL and demo script
```

---

## TDD task list

Deployment isn't unit-testable, but each step has a verification gate that must pass before continuing.

### 1. Commit `.env.example` files
- **Verify**: `backend/.env.example` lists every variable from `CLAUDE.md` lines 232–242 with placeholder values. `frontend/.env.example` lists `EXPO_PUBLIC_API_URL=http://localhost:3000`.
- **Implement**: write both files, commit.
- **Commit**: `Add env example files for backend and frontend`.

### 2. Backend package scripts
- **Verify**: `npm run build` produces `dist/`, `npm run start` boots from `dist/`, `npm run migrate:deploy` runs `prisma migrate deploy`.
- **Implement**: add scripts to `backend/package.json`.
- **Commit**: `Add backend build, start, and migrate scripts`.

### 3. Frontend build script
- **Verify**: `npm run build:web` produces a `dist/` directory containing `index.html` and static assets.
- **Implement**: add `"build:web": "expo export --platform web"` to `frontend/package.json`.
- **Commit**: `Add frontend web export script`.

### 4. Railway service + Postgres
- **Verify**:
  - Create the Railway project.
  - Add a service from this repo, set "Root Directory" to `backend/`.
  - Add a Postgres plugin; confirm `DATABASE_URL` shows up under the service's variables.
  - Set every other backend env var listed above.
  - Set the deploy command to `npm run migrate:deploy && npm run start`.
  - Deploy; wait for the healthcheck to pass.
- **Smoke**: `curl https://<railway-domain>/healthz` returns 200; `curl https://<railway-domain>/api/menu` returns the seeded menu.

### 5. Seed prod DB
- **Verify**: the menu table is populated.
- **Implement**: run `npm run db:seed` once against the prod `DATABASE_URL` (either via a one-off Railway shell or a temporary local connection with the prod URL). Document the exact command in the README so it can be re-run if the schema changes.
- **Smoke**: hit `/api/menu` from a browser; visually confirm 24+ items.

### 6. Google OAuth callback in prod
- **Verify**:
  - In Google Cloud Console, add the prod callback URL and JavaScript origin.
  - Hit `https://<railway-domain>/auth/google` in a browser; complete the consent flow; land back at the callback; verify a `User` row was created with `provider='google'` (check via Railway's Postgres dashboard or `prisma studio` against the prod URL temporarily).

### 7. Vercel project for frontend
- **Verify**:
  - Import the repo into Vercel; set Root Directory to `frontend/`.
  - Set Build Command to `npm run build:web`, Output to `dist/`.
  - Set `EXPO_PUBLIC_API_URL` to the Railway URL.
  - Deploy.
- **Smoke**: open the Vercel URL; the login screen renders without console errors.

### 8. Update backend `FRONTEND_URL` and redeploy
- **Verify**: backend env now contains `FRONTEND_URL=<vercel-url>`. CORS allows the Vercel origin. Redeploy backend.
- **Smoke**: from the Vercel URL, sign up → expect 200, refresh cookie set, `Access-Control-Allow-Credentials` header present.

### 9. End-to-end smoke
- Open the Vercel URL in a fresh browser profile (incognito).
- Sign up with a new email.
- Go to Chat tab, type "I'd like the spicy chicken sandwich and a lemonade."
- Watch the cart badge bounce, open the drawer, click Checkout.
- Land on Orders tab; see the new confirmed order.
- Refresh the page; verify the user stays signed in (refresh cookie still works).
- Sign out; verify the cookie clears and we land on the login screen.

### 10. Google OAuth end-to-end
- From the Vercel URL, click "Sign in with Google" → complete consent → land back in the app, signed in as the Google user.
- Verify the Anthropic chat works under this user.

### 11. README
- **Implement**: a short README with:
  - One-line project description and the live Vercel URL.
  - Demo script (3–5 numbered steps a recruiter can follow in 60 seconds).
  - Local development instructions (clone, install, env files, Postgres, run both services).
  - Tech stack at a glance.
- **Commit**: `Add README with live URL and quickstart`.

---

## Verification

After all steps:

1. Vercel URL loads under 3 seconds (cold) and under 500ms (warm).
2. No mixed-content warnings, no CORS errors, no console errors during the happy path.
3. Sign-up, Google OAuth, AI chat, cart add/modify/remove, checkout, order history all work end-to-end.
4. Browser refresh keeps the user signed in (refresh cookie round-trips successfully).
5. Anthropic dashboard shows requests landing and prompt cache hit rate > 0 after warm-up.
6. Railway healthcheck stays green across a few deploys.

---

## Open questions

- **Custom domain**: do we want `bistro.<your-domain>` instead of `<random>.vercel.app`? Optional; defer until after the demo is otherwise complete.
- **Rate limiting**: should we add per-IP throttling to `/api/chat` to cap Anthropic costs if the URL gets shared widely? Recommended — use `express-rate-limit` with a generous limit (e.g. 30 req/min per IP). Add as a follow-up after the first public demo.
- **Observability**: Railway logs are sufficient for the demo. If usage grows, plug into a structured log sink (e.g., Logtail) — out of scope for v1.
- **Backups**: Railway Postgres has automatic backups; confirm retention is acceptable and note it in the README.
