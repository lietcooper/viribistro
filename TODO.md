# Frontend-Only Speech-To-Text TODO

## Goal

Add browser-based speech-to-text to the Chat input using the Web Speech API. The dictated text should fill the input, and the user must tap Send manually.

## Decisions

- Use frontend-only Web Speech API first.
- Support web demo target first.
- Do not auto-send dictated text.
- Hide or disable voice input when speech recognition is unsupported.
- Disable voice input while the AI is typing.
- Use existing bistro visual system and Reanimated for listening feedback.

## 1. Type Definitions

- [x] Add `frontend/src/types/speech.ts`.
- [x] Define minimal browser speech types:
  - [x] `SpeechRecognition`
  - [x] `SpeechRecognitionConstructor`
  - [x] `SpeechRecognitionEvent`
  - [x] `SpeechRecognitionErrorEvent`
- [x] Add a typed helper shape for `window.SpeechRecognition` and `window.webkitSpeechRecognition`.

## 2. Speech Hook Tests

- [x] Add `frontend/tests/hooks/useSpeechToText.test.tsx`.
- [x] Mock a supported browser speech recognition implementation.
- [x] Test unsupported browser state.
- [x] Test `startListening()` starts recognition.
- [x] Test `stopListening()` stops recognition.
- [x] Test `onresult` stores interim transcript.
- [x] Test `onresult` stores final transcript.
- [x] Test `resetTranscript()` clears transcript state.
- [x] Test permission-denied error maps to a useful message.
- [x] Test cleanup stops recognition on unmount.

## 3. Speech Hook Implementation

- [x] Add `frontend/src/hooks/useSpeechToText.ts`.
- [x] Detect `window.SpeechRecognition || window.webkitSpeechRecognition`.
- [x] Expose:
  - [x] `supported`
  - [x] `isListening`
  - [x] `transcript`
  - [x] `interimTranscript`
  - [x] `error`
  - [x] `startListening`
  - [x] `stopListening`
  - [x] `resetTranscript`
- [x] Configure recognition:
  - [x] `continuous = false`
  - [x] `interimResults = true`
  - [x] `lang = 'en-US'`
- [x] Handle `onstart`.
- [x] Handle `onresult`.
- [x] Handle `onerror`.
- [x] Handle `onend`.
- [x] Remove event handlers and stop recognition on unmount.
- [x] Log unexpected errors with context.

## 4. Chat Input Tests

- [x] Update `frontend/tests/components/ChatInput.test.tsx`.
- [x] Test mic button renders when speech recognition is supported.
- [x] Test mic button is hidden or disabled when unsupported.
- [x] Test pressing mic starts listening.
- [x] Test pressing mic again stops listening.
- [x] Test listening state changes accessibility label.
- [x] Test final transcript fills the text input.
- [x] Test interim transcript is visible while listening.
- [x] Test Send uses dictated text.
- [x] Test mic is disabled when Chat input is disabled.

## 5. Chat Input Implementation

- [x] Modify `frontend/src/components/ChatInput.tsx`.
- [x] Add mic icon button beside Send.
- [x] Use `Ionicons` mic icon.
- [x] Wire mic button to `useSpeechToText`.
- [x] On final transcript, populate the input text.
- [x] Show interim transcript without sending it automatically.
- [x] Stop listening after Send.
- [x] Stop listening when component unmounts.
- [x] Add accessibility labels:
  - [x] `Start voice input`
  - [x] `Stop voice input`
- [x] Add `testID` values for tests.

## 6. Listening Animation

- [x] Add Reanimated pulse/ring around mic while listening.
- [x] Use `colors.brand.primary` for active listening.
- [x] Use `colors.text.tertiary` for idle state.
- [x] Use `colors.error` for speech errors if shown inline.
- [x] Respect reduced motion if available.

## 7. Error Handling

- [x] Surface permission-denied errors through `useToastStore`.
- [x] Surface no-speech errors with a concise message.
- [x] Surface unsupported browser state gracefully.
- [x] Do not leave the mic in listening state after an error.
- [x] Avoid silent failures.

## 8. Verification

- [x] Run `cd frontend && npm test -- useSpeechToText`.
- [x] Run `cd frontend && npm test -- ChatInput`.
- [x] Run `cd frontend && npm run typecheck`.
- [x] Run `cd frontend && npm run lint`.
- [ ] Start web app with `cd frontend && npm run web`.
- [ ] Manually test in Chrome:
  - [ ] Click mic.
  - [ ] Allow microphone permission.
  - [ ] Say “Add a burger”.
  - [ ] Confirm text appears in input.
  - [ ] Tap Send manually.
  - [ ] Confirm AI flow still works.
- [ ] Manually test unsupported fallback by removing mocked speech API in browser dev tools or test harness.

## 9. Commit

- [ ] Commit tests and implementation after verification passes.
- [ ] Use imperative commit message, for example:
  - [ ] `Add browser speech input to chat`

---

# Item Customization TODO

## Goal

Add menu item customization so guests can choose options like toppings, sauces, sides, spice level, size, or preparation when adding items to the cart. Customized versions of the same item should remain separate cart lines and preserve their details through checkout and order history.

## Decisions

- Store customization definitions in the database.
- Validate all selected customizations on the backend.
- Persist selected customizations on cart and order line items.
- Price cart items from base menu price plus selected option price deltas.
- Keep AI clarification text-based first; structured chat option buttons can come later.
- Treat different customization combinations as different cart lines.

## 1. Database

- [ ] Add `CustomizationGroup` model.
- [ ] Add `CustomizationOption` model.
- [ ] Link customization groups to `MenuItem`.
- [ ] Add `customizations Json` to `CartItem`.
- [ ] Add `customizations Json` to `OrderItem`.
- [ ] Add `customizationHash` to `CartItem`.
- [ ] Replace cart item uniqueness with `cartId + menuItemId + customizationHash`.
- [ ] Update Prisma migration.
- [ ] Update seed data with customization groups for selected items:
  - [ ] Chicken sandwich: sauce, toppings, spice level.
  - [ ] Burger: cheese, toppings, doneness.
  - [ ] Salmon: side, sauce.
  - [ ] Drinks: size, ice level.
- [ ] Add database tests for customization groups/options.
- [ ] Add database tests for same item with different customizations.
- [ ] Add database tests for order items preserving customizations.

## 2. Backend

- [ ] Update menu API responses to include customization groups and options.
- [ ] Update cart request schemas to accept selected customizations.
- [ ] Update cart response types to include selected customizations and adjusted prices.
- [ ] Add customization validation:
  - [ ] Selected group belongs to the menu item.
  - [ ] Selected option belongs to the group.
  - [ ] Required groups are satisfied.
  - [ ] Min and max selections are respected.
  - [ ] Unavailable options are rejected.
- [ ] Update cart service to compute adjusted unit price.
- [ ] Update cart service to compute stable `customizationHash`.
- [ ] Add same item and same customizations to the existing line.
- [ ] Add same item and different customizations as a separate line.
- [ ] Modify cart quantities by `cartItemId`.
- [ ] Remove cart lines by `cartItemId`.
- [ ] Update order service to copy customizations from cart items.
- [ ] Update order service to preserve adjusted unit prices.
- [ ] Extend `add_to_cart` tool with `customizations`.
- [ ] Update `modify_item` and `remove_from_cart` tool behavior for customized cart lines.
- [ ] Add `get_item_customizations(itemId)` tool if the agent needs a focused lookup.
- [ ] Update agent system prompt with customization rules.
- [ ] Backend tests:
  - [ ] Customization validation.
  - [ ] Adjusted pricing.
  - [ ] Duplicate customized cart lines.
  - [ ] Order preservation.
  - [ ] Agent clarifies when required options are missing.
  - [ ] Agent adds directly when customizations are specified.

## 3. Frontend

- [ ] Update API types for customization groups and options.
- [ ] Update API types for selected cart and order customizations.
- [ ] Update menu data usage for customization metadata.
- [ ] Update `MenuItemModal` to render customization groups.
- [ ] Add radio-style controls for single-select groups.
- [ ] Add checkbox-style controls for multi-select groups.
- [ ] Disable unavailable customization options.
- [ ] Show option price deltas.
- [ ] Validate required customization groups before Add to Cart.
- [ ] Show live adjusted price in the modal.
- [ ] Update cart store to send selected customizations.
- [ ] Update cart store to reconcile cart line IDs.
- [ ] Update quantity and remove actions to target cart line IDs.
- [ ] Update `CartDrawer` and `CartItem` to show selected customizations.
- [ ] Support the same menu item appearing as multiple customized cart lines.
- [ ] Update `CartUpdateCard` to show customization details.
- [ ] Update `OrdersScreen` to show selected customizations in expanded order details.
- [ ] Frontend tests:
  - [ ] Modal renders customization groups.
  - [ ] Required choices block Add to Cart.
  - [ ] Selected options update price.
  - [ ] Cart renders customization details.
  - [ ] Duplicate customized item lines render separately.
  - [ ] Order details preserve customization details.

## 4. E2E

- [ ] Open a customizable menu item.
- [ ] Choose sauce and toppings.
- [ ] Add it to the cart.
- [ ] Add the same item with different customizations.
- [ ] Verify two separate cart lines.
- [ ] Checkout.
- [ ] Verify the order keeps customization details.

## 5. Verification

- [ ] Run `cd backend && npm run lint`.
- [ ] Run `cd backend && npm run build`.
- [ ] Run `cd backend && npm run test`.
- [ ] Run `cd frontend && npm run lint`.
- [ ] Run `cd frontend && npm run typecheck`.
- [ ] Run `cd frontend && npm test -- --runInBand`.
- [ ] Run `cd frontend && npm run e2e`.

## 6. Commit

- [ ] Commit each logical unit after tests pass.
- [ ] Use imperative commit messages, for example:
  - [ ] `Add customization schema`
  - [ ] `Validate customized cart items`
  - [ ] `Add item customization controls`

---

# AI Customized Cart Removal Bug TODO

## Goal

Prevent the AI from removing multiple customized cart lines when the user asks to remove one item, for example two chicken sandwiches with different customizations. The agent must use cart line IDs when possible and ask for clarification when a shared `menuItemId` matches multiple customized lines.

## Problem

- Customized versions of the same menu item are separate cart lines.
- Those cart lines share the same `menuItemId`.
- The AI can still call `remove_from_cart` with the shared `menuItemId`.
- If backend removal treats `menuItemId` as "remove all matching lines", both customized sandwiches can be deleted.

## Decisions

- Keep the existing cart architecture.
- Use backend guardrails to prevent destructive ambiguous removal.
- Prefer `cartItemId` for AI remove and modify tools.
- Preserve legacy `menuItemId` behavior only when it matches exactly one cart line.
- Return a recoverable tool error for ambiguous menu-item removal so the model can clarify.
- Do not add structured clarification buttons yet.

## 1. Backend Guardrails

- [ ] Inspect `backend/src/services/cart.ts` removal behavior.
- [ ] Confirm whether `removeItem(owner, menuItemId)` deletes multiple lines.
- [ ] Update `removeItem()` so `menuItemId` removal:
  - [ ] Removes the line when exactly one cart line matches.
  - [ ] Returns `AMBIGUOUS_CART_ITEM` when multiple lines match.
  - [ ] Includes enough context in the error message for the agent to ask a useful clarification.
- [ ] Ensure `cartItemId` removal still removes exactly one line.
- [ ] Keep `menuItemId` fallback for non-customized carts with one matching line.
- [ ] Add or update service tests:
  - [ ] Two customized lines with same `menuItemId` cannot be removed by `menuItemId`.
  - [ ] One matching line can still be removed by `menuItemId`.
  - [ ] A specific `cartItemId` removes only that one customized line.

## 2. Cart API

- [ ] Inspect `backend/src/routes/cart.ts` delete route.
- [ ] Ensure frontend cart delete still sends/removes by cart line ID.
- [ ] Add route test for `DELETE /api/cart/:id`:
  - [ ] Ambiguous `menuItemId` returns `409 AMBIGUOUS_CART_ITEM`.
  - [ ] Specific cart line ID removes one line.
- [ ] Ensure error response is meaningful and not swallowed by middleware.

## 3. AI Tool Contract

- [ ] Update `remove_from_cart` tool schema to accept:
  - [ ] `cartItemId` as preferred input.
  - [ ] `itemId` only as a fallback.
- [ ] Update `modify_item` tool schema to accept:
  - [ ] `cartItemId` as preferred input.
  - [ ] `itemId` only as a fallback.
- [ ] Update tool descriptions:
  - [ ] `remove_from_cart` removes an entire cart line.
  - [ ] Use `cartItemId` when the cart has customized lines.
  - [ ] Do not use `remove_from_cart` for "remove one" when quantity is greater than one.
  - [ ] Use `modify_item` for quantity decreases.
- [ ] Update dispatcher logic:
  - [ ] Prefer `cartItemId` over `itemId`.
  - [ ] Return recoverable tool errors for ambiguous fallback usage.

## 4. Agent Prompt

- [ ] Update `backend/src/services/agent/systemPrompt.ts`.
- [ ] Add rules:
  - [ ] Use `cartItemId` from the cart snapshot for remove/modify actions.
  - [ ] If multiple cart lines match a user's item name, call `clarify`.
  - [ ] Mention relevant customizations in the clarification question.
  - [ ] Never remove multiple customized cart lines unless the user clearly asks to remove all.
  - [ ] For "remove one" from a cart line with quantity greater than one, use `modify_item` with decremented quantity.
- [ ] Ensure rendered cart block includes:
  - [ ] `cartItemId`
  - [ ] `menuItemId`
  - [ ] item name
  - [ ] quantity
  - [ ] customization details

## 5. Agent Tests

- [ ] Add dispatcher test:
  - [ ] `remove_from_cart` with ambiguous `itemId` returns recoverable `AMBIGUOUS_CART_ITEM`.
  - [ ] `remove_from_cart` with `cartItemId` removes only that line.
- [ ] Add loop test:
  - [ ] User asks to remove one of multiple customized sandwiches.
  - [ ] Model receives ambiguity error and responds with clarification.
- [ ] Add system prompt test:
  - [ ] Prompt includes the cart-line ID rule.
  - [ ] Cart block displays customization details per line.
- [ ] Add chat route test if needed:
  - [ ] Ambiguous remove does not mutate the cart.

## 6. Frontend Checks

- [ ] Confirm `useCartStore.removeItem()` sends cart line ID for UI removals.
- [ ] Confirm `CartDrawer` keys and quantity controls use cart line IDs.
- [ ] Confirm no frontend code still removes customized items by shared `menuItemId`.
- [ ] Add frontend test only if a gap is found.

## 7. Verification

- [ ] Run `cd backend && npm run lint`.
- [ ] Run `cd backend && npm run build`.
- [ ] Run `cd backend && npm run test`.
- [ ] Run `cd frontend && npm run lint`.
- [ ] Run `cd frontend && npm run typecheck`.
- [ ] Run `cd frontend && npm test -- --runInBand`.
- [ ] Manually test:
  - [ ] Add two chicken sandwiches with different customizations.
  - [ ] Ask AI: "remove one chicken sandwich".
  - [ ] Confirm AI asks which customized sandwich to remove.
  - [ ] Answer with one customization.
  - [ ] Confirm only one cart line is removed.

## 8. Commit

- [ ] Commit after tests pass.
- [ ] Use imperative commit message:
  - [ ] `Clarify ambiguous customized cart removals`
