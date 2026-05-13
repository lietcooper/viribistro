# ViriBistro - The Intelligent Bistro — Full Project Brief

## Project overview

Build a full-stack AI-powered restaurant ordering app. The frontend is a React Native (Expo) app exported as a web app and deployed to Vercel. The backend is a Node.js/Express API deployed to Railway with a PostgreSQL database. The core experience is a conversational AI agent that manages a shopping cart through natural language.

---

## Deployment targets

- **Frontend**: Expo web export → Vercel
- **Backend**: Node.js + PostgreSQL → Railway
- **Demo**: Recruiter opens a single Vercel URL in their browser, no installs required

---

## Development rules
- **Test-driven development**: Write comprehensive tests before implementing any function. Do not proceed to the next task if existing tests are failing.
- **Version control**: Run `git add` and `git commit` after completing each logical unit of work (e.g. a screen, a route, a component, or a passing test suite). Write descriptive commit messages in the imperative mood (e.g. "Add cart drawer animation" not "added animation stuff").
- **No silent failures**: Never use empty `catch` blocks. All errors must be logged or surfaced to the user with a meaningful message.
- **Environment variables**: Never hardcode API keys, URLs, or secrets. All environment-specific values go in `.env` files and are accessed via `process.env` (backend) or `EXPO_PUBLIC_` prefix (frontend).

## Repository structure

```
bistro/
├── frontend/          # Expo app
└── backend/           # Node.js API
```

---

## Backend (Node.js / Express)

### Tech stack
- Node.js + Express
- PostgreSQL with Prisma ORM
- Passport.js for Google OAuth 2.0
- JWT (short-lived access token 15min + httpOnly refresh token cookie 7 days)
- Zod for request validation
- Claude API (claude-sonnet-4-20250514) or OpenAI GPT-4o for the AI agent

### Database schema (Prisma)

```
User
  id, email, name, avatarUrl, provider (google | local)
  createdAt

MenuItem
  id, name, description, price, category, tags[], imageUrl, available

Order
  id, userId, status (pending | confirmed), totalPrice, createdAt
  items → OrderItem[]

OrderItem
  id, orderId, menuItemId, quantity, unitPrice

Conversation
  id, userId, sessionId, createdAt
  messages → Message[]

Message
  id, conversationId, role (user | assistant | tool), content, createdAt
```

### API routes

```
POST   /auth/google              OAuth initiation
GET    /auth/google/callback     OAuth callback
POST   /auth/refresh             Refresh access token
POST   /auth/logout              Clear refresh token cookie
POST   /auth/register            Email/password signup
POST   /auth/login               Email/password login

GET    /api/menu                 All menu items (public)
GET    /api/menu/:id             Single item

GET    /api/cart                 Get current session cart (in-memory or Redis)
POST   /api/cart/reset           Clear cart

POST   /api/chat                 Main AI agent endpoint
GET    /api/chat/history/:sessionId   Conversation history

POST   /api/orders               Confirm and save order
GET    /api/orders               User order history
```

### AI agentic layer — this is the most important part

The `/api/chat` endpoint runs a tool-calling loop, not a simple prompt-to-text call. Implement it as follows:

**Tool definitions** — define these as LLM-callable tools:

```js
add_to_cart(itemId, quantity)
remove_from_cart(itemId)
modify_item(itemId, newQuantity)
get_cart()
get_menu(category?)       // optional filter by category
clarify(question)         // agent asks user a question instead of acting
```

**Request handler logic**:
1. Receive `{ sessionId, userId, message }` from frontend
2. Load conversation history for this session from DB
3. Append new user message
4. Build messages array: `[systemPrompt, ...history]`
5. System prompt injects live menu snapshot + current cart state
6. Call LLM with tool definitions
7. If model returns a tool call → execute it → append tool result → call LLM again (loop until text response)
8. Append final assistant message to DB
9. Return `{ reply, cartUpdate, toolsUsed }` to frontend

**Ambiguity handling**: if user says "add a burger" and multiple burgers exist, the agent must call `clarify()` and return the question to the user rather than guessing.

**Session memory**: store full message history in the `Conversation` / `Message` tables. Prepend system prompt fresh on every request (do not store system prompt in DB).

**Cart state**: keep cart in memory (a `Map` keyed by sessionId) for speed. Persist to DB only on order confirmation.

---

## Frontend (Expo / React Native → web)

### Tech stack
- Expo (configured for web export)
- NativeWind v4 for styling (Tailwind classes in React Native)
- Zustand for global state (cart, auth, session)
- React Navigation (stack + tab navigator)
- Axios for API calls

### Screens and navigation structure

```
Stack Navigator
├── Auth Stack
│   ├── LoginScreen
│   └── SignupScreen
└── Main Tab Navigator
    ├── MenuScreen        (tab 1)
    ├── ChatScreen        (tab 2)  ← default landing
    └── OrdersScreen      (tab 3)
        └── CartDrawer    (bottom sheet, accessible from all tabs)
```

### Screen requirements

**ChatScreen** (highest priority)
- Full-screen chat interface, messages scroll from bottom
- Typing indicator (3-dot animation) while AI is processing
- Messages render as bubbles: user right-aligned, assistant left-aligned
- Assistant messages can contain a "cart updated" confirmation card inline
- Suggested prompt chips at the start of a session: "What's on the menu?", "Recommend something spicy", "Add the chef's special", "What's in my cart?"
- Input bar fixed at bottom with send button
- Gracefully handles clarification questions from the agent

**MenuScreen**
- Grid or list of menu items with image, name, price, tags (spicy, vegan, gluten-free, etc.)
- Filter bar: All | Starters | Mains | Desserts | Drinks
- Search bar filtering by name or tag
- Each item has an "Add to cart" button with an animated +1 feedback
- Tapping an item opens a detail modal with description and quantity selector

**CartDrawer** (bottom sheet, global)
- Slides up from bottom on cart icon tap
- Lists all cart items with quantity controls (+ / −) and remove button
- Running total at bottom
- "Checkout" button that confirms order via `POST /api/orders`
- Animated badge on cart icon showing item count (bounces on update)

**OrdersScreen**
- List of past confirmed orders with date, items, total
- Tapping an order expands it to show item breakdown

**LoginScreen / SignupScreen**
- Email + password fields
- "Sign in with Google" button
- Clean, minimal design — bistro/restaurant aesthetic

### UI and animation requirements (critical)

- Cart badge bounces when item count changes (spring animation)
- Cart drawer slides up with spring physics, not a linear ease
- Menu item "Add" button gives a scale-pop feedback on press
- Chat messages fade + slide in from bottom when they appear
- Typing indicator uses a looping dot-pulse animation
- Order confirmation triggers a full-screen success animation (checkmark or confetti)
- All transitions use `react-native-reanimated` or Expo's built-in `Animated` API

### State management (Zustand stores)

```js
useAuthStore    // user, token, login(), logout()
useCartStore    // items[], addItem(), removeItem(), modifyItem(), clearCart()
useChatStore    // messages[], sessionId, sendMessage(), isTyping
```

---

## Menu data

Seed the database with at least 24 items across these categories. Make them feel like a real upscale bistro:

**Starters (6 items)**: e.g. Burrata with heirloom tomatoes, French onion soup, Charcuterie board, Tuna tartare, Truffle arancini, Shrimp cocktail

**Mains (8 items)**: e.g. Spicy chicken sandwich, Wagyu beef burger, Pan-seared salmon, Mushroom risotto, Ribeye steak (12oz), Lobster linguine, Duck confit, Grilled halloumi (vegan)

**Desserts (4 items)**: e.g. Crème brûlée, Chocolate lava cake, Tiramisu, Seasonal sorbet

**Drinks (6 items)**: e.g. Sparkling water (still/sparkling), Fresh lemonade, House red wine, House white wine, Craft beer, Espresso martini

Each item needs: name, description (1–2 sentences), price, category, tags (from: vegan, vegetarian, spicy, gluten-free, signature), imageUrl (use Unsplash URLs or placeholder image service)

---

## Auth requirements

- Email/password signup and login (bcrypt for password hashing)
- Google OAuth 2.0 via Passport.js ("Sign in with Google" button)
- JWT access token (15 min expiry) stored in memory on frontend
- Refresh token (7 days) stored in httpOnly cookie
- Protected routes on backend require valid access token
- Frontend Axios interceptor auto-refreshes token on 401

---

## Environment variables

**Backend `.env`**:
```
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=
ANTHROPIC_API_KEY=       # or OPENAI_API_KEY
PORT=3000
FRONTEND_URL=
```

**Frontend `.env`**:
```
EXPO_PUBLIC_API_URL=
```

---

## Quality bar

- The app must feel polished and production-ready visually
- All animations must feel physical — use spring physics not linear easing
- The AI agent must handle multi-turn context correctly (e.g. "actually make that three" works)
- The agent must ask for clarification when a request is ambiguous
- The agent must gracefully handle off-topic messages ("I don't have a table booking system, but I can help you order food")
- Mobile-first layout even on web export — max width ~480px centered on desktop
- Error states handled gracefully on all screens (network errors, auth errors, empty states)

---

## Implementation order (recommended)

1. Backend: Prisma schema + DB setup
2. Backend: Auth routes (email/password first, OAuth second)
3. Backend: Menu seed data + GET /api/menu
4. Backend: AI agent `/api/chat` with tool-calling loop
5. Frontend: Expo project setup + NativeWind + navigation scaffold
6. Frontend: Auth screens + Zustand auth store
7. Frontend: MenuScreen
8. Frontend: ChatScreen + chat store
9. Frontend: CartDrawer + cart store
10. Frontend: OrdersScreen
11. Integration testing end-to-end
12. Deploy backend to Railway, frontend to Vercel