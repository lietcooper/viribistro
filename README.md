# ViriBistro — The Intelligent Bistro

A full-stack, AI-first restaurant ordering app. Instead of clicking through menus, you simply **talk to the bistro** — a conversational agent reads the live menu, builds your cart in real time, asks clarifying questions when you're vague, and hands off cleanly to a polished mobile-style UI for browsing, editing, and checkout.

> Live demo: **<https://viribistro.vercel.app>**
>
> Open the URL on phone or desktop — no install required. The chat tab is the default landing.

---

## Why this project

Most restaurant apps are catalog browsers with a search bar bolted on. ViriBistro flips that: the **AI agent is the primary surface**, and the menu/cart screens are there to confirm and refine what the conversation has already produced. The whole thing is built around two qualities:

- **A smooth, native-feeling UI.** Spring-physics animations on every interaction — the cart badge bounces on update, the cart drawer slides up like a bottom sheet, chat bubbles fade and slide in from the bottom, menu cards scale-pop on press, and the order-success screen plays a full-screen confirmation animation. Everything is built with `react-native-reanimated` and NativeWind v4 so the same component tree feels right on iOS, Android, and web. Mobile-first layout, capped at ~480px wide and centered on desktop so the experience never feels like a stretched-out website.

- **An agent that actually does things, not just answers questions.** `/api/chat` runs a true tool-calling loop on Claude Sonnet 4. The model can call `add_to_cart`, `remove_from_cart`, `modify_item`, `get_cart`, `get_menu`, or `clarify` — and the loop runs until the model returns plain text. The system prompt is rebuilt on every request with a live menu snapshot and the current cart state, so the agent never hallucinates an item that isn't on tonight's menu, and never lies about what's in your cart.

---

## What you can ask it to do

The agent is intentionally action-first. Try things like:

- *"What's good for someone who likes spicy food?"* — it filters the menu by tag and pitches a couple of dishes.
- *"Add a burger and a glass of red wine."* — if there are multiple burgers, it calls `clarify()` and asks which one instead of guessing.
- *"Actually make that three burgers, and drop the wine."* — multi-turn context: it remembers the previous turn and edits the cart in place.
- *"What's in my cart and what's the total?"* — calls `get_cart` and reads back the running total.
- *"Recommend a starter and a dessert under $30 total."* — composes a small order across categories.
- *"Start over."* — wipes the conversation cleanly with one tap (the chat header has a "new chat" control).
- *"Can I book a table for Friday?"* — gracefully declines off-topic requests and redirects back to ordering.

When you're happy, you can either keep chatting or jump to the Cart tab, tweak quantities with +/− controls, and tap **Checkout** to confirm the order — a full-screen success animation plays and the order shows up under the Orders tab.

---

## Code structure

```
bistro/
├── backend/                       Node.js + Express API (Railway)
│   ├── prisma/
│   │   ├── schema.prisma          User, MenuItem, Cart, Order, Conversation, Message
│   │   ├── migrations/            Versioned SQL migrations
│   │   └── seed.ts                24+ bistro menu items across 4 categories
│   ├── src/
│   │   ├── app.ts                 Express app wiring (helmet, cors, routes, errors)
│   │   ├── server.ts              HTTP bootstrap
│   │   ├── routes/                auth · menu · cart · chat · orders · e2e
│   │   ├── services/
│   │   │   ├── agent/             ← AI agent core
│   │   │   │   ├── loop.ts        Tool-calling loop runner
│   │   │   │   ├── tools.ts       Tool schemas + dispatcher (Zod-validated)
│   │   │   │   ├── systemPrompt.ts  Live menu + cart snapshot injection
│   │   │   │   ├── persistence.ts Conversation/Message replay + appendTurn
│   │   │   │   └── anthropic.ts   SDK client factory
│   │   │   ├── auth.ts            JWT + bcrypt + refresh-token logic
│   │   │   ├── cart.ts            Session cart store (single source of truth)
│   │   │   └── orders.ts          Cart → Order conversion
│   │   ├── schemas/               Zod request validators per route
│   │   ├── middleware/            requireAuth · validate · rateLimit · errorHandler
│   │   └── lib/                   prisma · env · logger · AppError
│   └── tests/                     Vitest + Supertest integration tests
│
├── frontend/                      Expo (React Native → Web) app (Vercel)
│   ├── App.tsx                    Root provider + font loader + navigator
│   ├── src/
│   │   ├── navigation/
│   │   │   ├── RootNavigator.tsx  Auth stack ↔ Main tabs switcher
│   │   │   ├── AuthStack.tsx      Login · Signup
│   │   │   └── MainTabs.tsx       Menu · Chat (default) · Orders + global CartDrawer
│   │   ├── screens/               ChatScreen · MenuScreen · OrdersScreen ·
│   │   │                           LoginScreen · SignupScreen · OrderSuccessScreen
│   │   ├── components/            ChatBubble · TypingIndicator · ChatInput ·
│   │   │                           MenuItemCard · MenuItemModal · MenuFilterBar ·
│   │   │                           CartDrawer · CartBadge · CartItem · CartUpdateCard ·
│   │   │                           SuggestedPromptChips · PrimaryButton · FormInput ·
│   │   │                           Toast · Splash · Tag · GoogleButton
│   │   ├── stores/                Zustand: useAuthStore · useCartStore ·
│   │   │                           useChatStore · useCartUiStore · useToastStore
│   │   ├── hooks/                 useBootstrapAuth · useCartTotal
│   │   ├── lib/                   api (Axios + 401 refresh interceptor) · session ·
│   │   │                           oauth · env · format
│   │   └── theme/                 Color tokens + Tailwind config bridge
│   ├── e2e/                       Playwright end-to-end tests
│   └── tests/                     Jest + React Native Testing Library unit tests
│
├── docs/plans/                    Design docs: ai-agent · backend · database ·
│                                   frontend · deployment
├── docker-compose.yml             Local Postgres for development
└── .github/workflows/ci.yml       Lint · typecheck · test on every push
```

---

## Tech stack

### Backend (`backend/`)

| Concern | Choice |
|---|---|
| Runtime | Node.js 20 + Express 4 (TypeScript) |
| Database | PostgreSQL 16 + Prisma 5 ORM |
| AI | Anthropic Claude (`claude-sonnet-4`) via `@anthropic-ai/sdk` with native tool-use |
| Auth | Passport.js Google OAuth 2.0 + email/password (bcrypt) + JWT access (15 min) + httpOnly refresh cookie (7 days) |
| Validation | Zod schemas at every route boundary |
| Security | Helmet, CORS allowlist, express-rate-limit on `/api/chat` and auth routes |
| Logging | Pino + pino-http (structured JSON) |
| Testing | Vitest + Supertest, with a fake Anthropic client for hermetic agent tests |
| Deployment | Railway (Docker), Postgres on Railway |

### Frontend (`frontend/`)

| Concern | Choice |
|---|---|
| Framework | Expo SDK 52 (React Native 0.76) exported to **web** via `expo export --platform web` |
| Styling | NativeWind v4 (Tailwind classes in React Native) + Playfair Display / DM Sans Google fonts |
| Animations | `react-native-reanimated` 3 — spring physics on cart badge, drawer, chat bubbles, button presses, success screen |
| State | Zustand (cart, auth, chat, cart-UI, toasts) |
| Navigation | React Navigation v7 (native-stack + bottom-tabs) |
| HTTP | Axios with an interceptor that silently refreshes the access token on 401 |
| Testing | Jest + React Native Testing Library (unit), Playwright (e2e on the web export) |
| Deployment | Vercel (static export of `dist/`) |

---

## What's done

- **Backend** — full Prisma schema and migrations; menu seed (24+ items across starters / mains / desserts / drinks with tags like *spicy, vegan, vegetarian, gluten-free, signature*); email/password + Google OAuth 2.0 with JWT refresh flow; full `/api/menu`, `/api/cart`, `/api/orders` REST surface; `/api/chat` agent loop with the six tools, ambiguity handling via `clarify()`, multi-turn persistence in `Conversation` / `Message`, and conversation attachment when an anonymous user signs in mid-session.
- **Frontend** — Expo project configured for web export; all five primary screens (Chat / Menu / Orders / Login / Signup) plus a global bottom-sheet `CartDrawer` and an `OrderSuccessScreen`; Zustand stores for auth, cart, chat, cart UI, and toasts; Axios client with auto-refresh; complete animation pass (cart badge bounce, drawer spring, chat bubble slide-in, typing dots, button scale-pop, order-success celebration); suggested-prompt chips on a fresh chat session; clarify-question rendering inline in the conversation.
- **Quality / infra** — Zod request validation across every route; rate limiting on chat + auth; structured logging; Vitest + Supertest integration coverage; Jest + Playwright on the frontend; GitHub Actions CI; Docker Compose for local Postgres; deployed end-to-end (Vercel + Railway) and live at the demo URL above.

---

## Future work

### 1 · Web today, native app tomorrow

The codebase is already a React Native (Expo) app — the web build is just `expo export --platform web`. Web was chosen as the **demo target** for one reason: recruiters and testers can open a URL and try the product in 5 seconds, with no TestFlight, no APK sideload, no install friction. Once the product is past the demo stage, the same codebase ships to the App Store and Play Store as a real Expo app — no rewrite, just a different build target and a few platform-specific polish passes (haptics, push notifications, safe-area tweaks on real devices).

### 2 · Real e-commerce features

This is a demo of the AI ordering experience, not a complete bistro platform yet. To turn it into something a real restaurant could run, the obvious next layer is the standard e-commerce surface that's currently stubbed or missing:

- **Payments** — Stripe Checkout / Stripe Elements integration, webhook-driven order state machine (`pending → paid → confirmed → fulfilled`), refund flow, and tax/tip handling.
- **User profile & saved addresses** — editable profile screen, multiple delivery addresses with a default selector, phone-number verification.
- **Order lifecycle beyond "confirmed"** — kitchen-side states (received, preparing, ready, out for delivery, delivered), live status on the Orders screen with push notifications.
- **Promotions / loyalty** — promo codes, a points balance, a "reorder last time" shortcut.
- **Restaurant ops** — an admin dashboard for editing the menu, marking items unavailable, viewing live orders, and exporting revenue reports.

### 3 · Smarter AI

The current agent is pure text — it reads the menu and writes back words. Three enhancements that would materially change the experience:

- **Visual replies in chat.** When the agent recommends a dish, render its photo, price, and a one-tap "Add" button inline in the conversation, rather than asking the user to switch to the Menu tab to see what it's talking about. The agent would emit a structured `recommend(itemIds[])` block alongside its text, and the frontend would render it as a horizontal card carousel inside the assistant's bubble.
- **User preferences & allergies.** A short onboarding flow ("any allergies? any cuisines you love or avoid?") that stores structured preferences on the `User` model, and a system-prompt extension that injects them on every turn so the agent never recommends a peanut dish to someone with a peanut allergy, and biases recommendations toward known favorites.
- **A real recommendation system.** Once preferences and order history are tracked, the agent can move from "here's a popular dish" to "based on the four mains you've ordered, you'll probably love the duck confit." Initially a simple collaborative-filtering pass over `Order` history; eventually a learned embedding model that captures taste similarity across users.

---

## Running it locally

```bash
# 1. Postgres
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env              # fill in ANTHROPIC_API_KEY, JWT secrets, Google OAuth creds
npm install
npm run db:migrate
npm run db:seed
npm run dev                       # http://localhost:3000

# 3. Frontend (in a second terminal)
cd frontend
cp .env.example .env              # EXPO_PUBLIC_API_URL=http://localhost:3000
npm install
npm run web                       # http://localhost:8081
```
