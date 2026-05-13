# Frontend Plan — Expo + NativeWind app

## Context

The frontend is a React Native (Expo) app exported as a web app and deployed to Vercel. The whole demo runs in a recruiter's browser — no installs. The headline experience is the AI chat screen (the default tab) where the user can order food in natural language; the cart drawer and menu screens complement it.

`CLAUDE.md` is explicit about quality bar: spring-physics animations, mobile-first layout (max 480px on web), graceful error states, polished bistro aesthetic.

This plan depends on the backend (`backend.md`) and AI agent (`ai-agent.md`) being available — at minimum, dev stubs of `/api/menu`, `/auth/*`, `/api/chat`, and `/api/orders`.

---

## Tech stack & key decisions

- **Expo** (latest stable, web-export configured via `app.json` `web` block + `npx expo export --platform web`).
- **NativeWind v4** for Tailwind-style classes that compile to RN styles. NativeWind v4 is API-compatible with web Tailwind, so styles look right in both targets.
- **React Navigation** — stack navigator for auth, tab navigator for the authenticated app. Default tab = ChatScreen.
- **Zustand** for global state. Three stores: `useAuthStore`, `useCartStore`, `useChatStore`.
- **Axios** instance with `withCredentials: true` (browser sends the refresh cookie automatically) and a 401-refresh interceptor with a single-flight lock.
- **react-native-reanimated v3** for all animations — spring physics on every transition (per `CLAUDE.md` lines 184–190).
- **Jest** + **@testing-library/react-native** for unit/component tests. Snapshot tests for stable visual elements; behavior tests for stores and interactions.
- **Storybook for React Native (web)** as an optional addition for the design-engineer skill workflow — defer unless time allows.
- **Bistro design tokens** in `tailwind.config.js`: warm cream/charcoal palette, serif display font for headlines, sans body, generous spacing rhythm. Defined once so screens stay visually cohesive.

### Auth strategy on the frontend

- Access token in `useAuthStore` (memory only — never localStorage, since a leaked token survives until expiry).
- Refresh cookie handled entirely by the browser via `withCredentials: true`.
- On app boot, call `POST /auth/refresh`. If it succeeds, we have an access token and the user is logged in. If it 401s, render the auth stack.
- On any 401 response from a protected route, the axios interceptor (a) acquires the single-flight refresh lock, (b) calls `/auth/refresh`, (c) replays the original request once. If refresh itself 401s, clear the auth store and route to the login screen.

### Mobile-first on web

- Root view wraps everything in a `<View className="max-w-[480px] mx-auto w-full h-full">` so the app feels like a mobile app even on desktop.
- Use `Platform.OS === 'web'` only for two cases: (a) the max-width wrapper, (b) input focus quirks. Otherwise share components across native and web.

---

## File/folder layout

```
frontend/
├── app.json
├── tailwind.config.js
├── babel.config.js
├── tsconfig.json
├── App.tsx                          # root: providers + navigation
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── AuthStack.tsx
│   │   └── MainTabs.tsx
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── SignupScreen.tsx
│   │   ├── MenuScreen.tsx
│   │   ├── ChatScreen.tsx
│   │   ├── OrdersScreen.tsx
│   │   └── OrderSuccessScreen.tsx   # full-screen confirmation overlay
│   ├── components/
│   │   ├── CartDrawer.tsx
│   │   ├── CartBadge.tsx            # bouncing badge on cart icon
│   │   ├── MenuItemCard.tsx
│   │   ├── MenuFilterBar.tsx
│   │   ├── ChatBubble.tsx
│   │   ├── ChatInput.tsx
│   │   ├── SuggestedPromptChips.tsx
│   │   ├── TypingIndicator.tsx
│   │   ├── CartUpdateCard.tsx       # inline confirmation in chat
│   │   ├── PrimaryButton.tsx
│   │   └── ScreenContainer.tsx      # max-width wrapper
│   ├── stores/
│   │   ├── useAuthStore.ts
│   │   ├── useCartStore.ts
│   │   └── useChatStore.ts
│   ├── lib/
│   │   ├── api.ts                   # axios instance + 401-refresh interceptor
│   │   ├── env.ts                   # EXPO_PUBLIC_API_URL helper
│   │   └── format.ts                # money formatter
│   ├── hooks/
│   │   ├── useCartTotal.ts
│   │   └── useBootstrapAuth.ts
│   └── types/
│       └── api.ts                   # request/response types shared with backend
└── tests/
    ├── stores/
    ├── components/
    ├── screens/
    └── lib/
```

---

## TDD task list

### 1. Scaffold + smoke test
- **Test**: `App` renders without crashing under jest + RN testing library.
- **Implement**:
  - `npx create-expo-app frontend -t default` (TypeScript template).
  - Install NativeWind v4 per its setup guide; verify `<Text className="text-red-500">` renders red in `npx expo start --web`.
  - `App.tsx` mounts a `NavigationContainer` wrapping `RootNavigator`.
- **Commit**: `Scaffold Expo app with NativeWind`.

### 2. Design tokens + screen container
- **Test**: snapshot the `PrimaryButton` and `ScreenContainer` rendered with theme classes.
- **Implement**:
  - `tailwind.config.js` extends colors (`bistro-cream`, `bistro-charcoal`, `bistro-paprika`, etc.), fontFamily (`serif`, `sans`), and spacing scale.
  - `ScreenContainer.tsx` enforces the 480px max-width on web.
- **Commit**: `Define bistro design tokens and screen container`.

### 3. Axios instance + 401-refresh interceptor
- **Test** (`lib/api.test.ts`):
  - On 401, the interceptor calls `/auth/refresh`, stores the new token, and replays the original request once.
  - Concurrent 401s share a single in-flight refresh (single-flight lock).
  - If `/auth/refresh` itself returns 401, the auth store is cleared and the original request rejects.
- **Implement**: `lib/api.ts` with axios + interceptor logic.
- **Commit**: `Add axios instance with 401-refresh interceptor`.

### 4. useAuthStore
- **Test**:
  - `login(email, password)` calls API, sets `user` + `token`.
  - `logout()` calls API and clears state.
  - `bootstrap()` calls `/auth/refresh`; on success sets state, on failure clears.
- **Implement**: `stores/useAuthStore.ts` with Zustand. No persistence layer (token in memory only).
- **Commit**: `Add auth store`.

### 5. Login and signup screens
- **Test**:
  - LoginScreen submits valid credentials → `useAuthStore.login()` called once → navigation moves to main tabs.
  - Invalid credentials display an inline error message (not a crash).
  - Google button navigates the browser to `/auth/google` (test by mocking `Linking.openURL` or `window.location.assign`).
  - SignupScreen mirrors login but POSTs to `/auth/register`.
- **Implement**: `LoginScreen.tsx`, `SignupScreen.tsx`. Bistro aesthetic — large serif title, generous padding, primary button.
- **Commit**: `Add login and signup screens`.

### 6. Navigation scaffold
- **Test**: when `useAuthStore.token` is null, render `AuthStack`; when set, render `MainTabs` with ChatScreen as the initial tab.
- **Implement**: `RootNavigator`, `AuthStack`, `MainTabs`.
- **Commit**: `Wire root navigation and tabs`.

### 7. useCartStore
- **Test**:
  - `addItem`, `removeItem`, `modifyItem`, `clearCart` mutate state correctly.
  - `useCartTotal()` selector returns the running total (sum of `quantity × unitPrice`).
  - State syncs in the right direction: optimistic update first, then reconcile from server response on chat-driven changes.
- **Implement**: `stores/useCartStore.ts` + `hooks/useCartTotal.ts`.
- **Commit**: `Add cart store and total selector`.

### 8. MenuScreen
- **Test**:
  - Renders all items fetched from `/api/menu`.
  - Filter bar (All/Starters/Mains/Desserts/Drinks) narrows the list.
  - Search input filters by name and tag.
  - Tapping an item opens the detail modal; tapping "Add" inside the modal calls `useCartStore.addItem` and the modal closes.
  - The "Add" button's scale-pop animation is triggered (verify via reanimated test utilities or by spying on the shared value).
- **Implement**: `MenuScreen.tsx`, `MenuItemCard.tsx`, `MenuFilterBar.tsx`, the detail modal.
- **Commit**: `Add menu screen with filter, search, and detail modal`.

### 9. CartDrawer + CartBadge
- **Test**:
  - `CartBadge` shows the cart count; mounting with count=0 hides; incrementing triggers the spring-bounce animation (spy the reanimated shared value).
  - `CartDrawer` opens on cart icon tap, slides in with a spring curve (assert `withSpring` is used, not `withTiming`).
  - Quantity controls call `modifyItem`; remove button calls `removeItem`.
  - Checkout button POSTs to `/api/orders`, on success clears the cart and navigates to OrderSuccessScreen.
- **Implement**: `CartDrawer.tsx`, `CartBadge.tsx`, `OrderSuccessScreen.tsx`.
- **Commit**: `Add cart drawer with spring animation`.

### 10. useChatStore
- **Test**:
  - `sendMessage(text)` appends a user message, flips `isTyping=true`, POSTs to `/api/chat`, appends the assistant reply, reconciles `cartUpdate` into `useCartStore` if present, flips `isTyping=false`.
  - On API error, appends a synthetic assistant message ("Sorry, I couldn't reach the bistro right now — try again?") instead of failing silently (per `CLAUDE.md` line 20).
- **Implement**: `stores/useChatStore.ts`.
- **Commit**: `Add chat store with cart reconciliation`.

### 11. ChatScreen
- **Test**:
  - On mount with empty messages, renders the suggested-prompt chips ("What's on the menu?", "Recommend something spicy", "Add the chef's special", "What's in my cart?").
  - Tapping a chip calls `sendMessage` with that text.
  - User messages render right-aligned; assistant messages left-aligned.
  - While `isTyping`, the `TypingIndicator` renders with the dot-pulse loop animation.
  - New messages animate in (fade + slide from bottom — verify entering animation is used).
  - When an assistant message carries a `cartUpdate`, an inline `CartUpdateCard` renders below the bubble.
  - The input bar is fixed at the bottom; sending an empty message is a no-op.
- **Implement**: `ChatScreen.tsx`, `ChatBubble.tsx`, `ChatInput.tsx`, `SuggestedPromptChips.tsx`, `TypingIndicator.tsx`, `CartUpdateCard.tsx`.
- **Commit**: `Add chat screen with bubbles, typing indicator, and inline cart updates`.

### 12. OrdersScreen
- **Test**:
  - Lists past orders from `/api/orders` newest-first.
  - Tapping a row expands the order to show items + total.
  - Empty state renders a friendly message ("No orders yet — start a chat to place your first one.").
- **Implement**: `OrdersScreen.tsx`.
- **Commit**: `Add orders screen`.

### 13. Order success animation
- **Test**: after checkout, OrderSuccessScreen renders a full-screen checkmark (or confetti) animation, then auto-dismisses after ~2s back to the Orders tab.
- **Implement**: animated SVG checkmark stroke draw using reanimated, or a lottie file from a free source if simpler.
- **Commit**: `Add order success animation`.

### 14. Error and empty states everywhere
- **Test**:
  - Network error toast appears on any failed request (axios interceptor surface).
  - Empty cart shows a "Your cart is empty" illustration.
  - Expired session triggers a forced logout + redirect to login.
- **Implement**: `components/Toast.tsx` + empty state components.
- **Commit**: `Add error and empty states across screens`.

### 15. Bootstrap auth on launch
- **Test**: `useBootstrapAuth()` calls `/auth/refresh` once on mount; the navigator gates on the resulting auth state. A loading splash renders during the initial refresh.
- **Implement**: `hooks/useBootstrapAuth.ts` + a splash component.
- **Commit**: `Bootstrap auth on app launch`.

---

## Verification

1. `npm test` in `frontend/` — all suites green.
2. `npx expo start --web` against a running backend. Walk through:
   - Sign up → land on Chat tab.
   - Tap "What's on the menu?" suggested chip → see the AI reply.
   - Type "add the spicy chicken sandwich" → watch cart badge bounce.
   - Type "actually make that three" → confirm quantity updates in the cart drawer.
   - Open cart drawer → checkout → see success animation → land on Orders tab → see the new order.
3. Resize the browser window: the layout should stay centered at 480px max.
4. Open DevTools network tab: only one `/auth/refresh` request fires during concurrent 401s (single-flight check).
5. Lighthouse score on web export ≥ 90 for performance and accessibility.

---

## Open questions

- **Animation testing fidelity**: reanimated v3 doesn't play well with jest by default; we may need to use the `react-native-reanimated/mock` or assert via spying on shared values. Decide once we hit the first animation test.
- **Bistro art direction**: image sources (Unsplash collections vs. a curated set). Defer; the seed data drives this from the backend.
- **Web-only refinements**: should we add a desktop "side panel" layout > 1024px? `CLAUDE.md` says mobile-first centered at 480px — stick to that; revisit only if recruiters explicitly ask for a desktop variant.
