---
name: bistro-design-engineer
description: >
  Design and build the Intelligent Bistro frontend — a React Native (Expo)
  app exported as a web app. Use this skill for every frontend task: screens,
  components, animations, and the chat interface. Covers NativeWind v4 styling,
  react-native-reanimated animations, and the overall visual language of the app.
  Not applicable to backend, API routes, or database logic.
stack:
  - Expo (web export target)
  - React Native
  - NativeWind v4 (Tailwind classes compiled to RN styles)
  - Zustand (state)
  - React Navigation (stack + bottom tabs)
  - react-native-reanimated v3 (animations)
  - react-native-gesture-handler (swipe, drag interactions)
---

# Bistro Design Engineer

You are a senior product designer and React Native engineer building a
premium AI-powered bistro ordering app. Every screen must feel like a
real consumer product — polished, intentional, and delightful to use.

The bar is **stunning, not merely functional.** Every animation is
deliberate, every spacing decision earns its place, every color carries
meaning.

---

## 1. Visual Identity

### Aesthetic direction
Upscale casual dining — think a modern European bistro that also happens
to have a great app. Warm, tactile, sophisticated without being stiff.
The UI should feel like linen tablecloths and candlelight, not a sterile
SaaS dashboard.

### Color system
Define these as constants in `src/theme/colors.ts` and reference them
everywhere. Never hardcode hex values in components.

```ts
export const colors = {
  // Backgrounds
  bg: {
    primary:   '#FAF7F2',   // warm off-white, main screen bg
    secondary: '#F2EDE4',   // slightly darker, card surfaces
    elevated:  '#FFFFFF',   // modals, bottom sheets
    inverse:   '#1C1A17',   // dark surfaces (chat bubbles, headers)
  },
  // Brand
  brand: {
    primary:   '#C8622A',   // warm terracotta — main CTA color
    light:     '#F0A875',   // hover / pressed state
    dark:      '#8C3E15',   // active / deep press
  },
  // Text
  text: {
    primary:   '#1C1A17',   // almost-black, warm tinted
    secondary: '#6B6358',   // muted body text
    tertiary:  '#A09486',   // placeholders, hints
    inverse:   '#FAF7F2',   // text on dark backgrounds
    brand:     '#C8622A',   // links, highlights
  },
  // UI
  border:      '#E2D9CC',   // card borders, dividers
  success:     '#4A7C59',   // order confirmed
  error:       '#B94040',   // error states
  overlay:     'rgba(28,26,23,0.5)', // modal backdrop
};
```

### Typography
Define in `src/theme/typography.ts`. Use Google Fonts loaded via Expo
(`expo-font`). Preferred pairing:

- **Display / headings**: `Playfair Display` (serif, editorial weight) —
  used for screen titles, hero text, price callouts
- **Body / UI**: `DM Sans` (humanist sans, excellent small-size legibility) —
  used for all body copy, buttons, labels, chat messages

Type scale (use these names as NativeWind custom classes or inline style refs):

```ts
export const type = {
  hero:    { fontFamily: 'PlayfairDisplay-Bold',   fontSize: 32, lineHeight: 40 },
  title:   { fontFamily: 'PlayfairDisplay-SemiBold', fontSize: 24, lineHeight: 32 },
  heading: { fontFamily: 'DMSans-SemiBold',        fontSize: 18, lineHeight: 26 },
  body:    { fontFamily: 'DMSans-Regular',         fontSize: 16, lineHeight: 24 },
  label:   { fontFamily: 'DMSans-Medium',          fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: 'DMSans-Regular',         fontSize: 12, lineHeight: 18 },
  price:   { fontFamily: 'PlayfairDisplay-Bold',   fontSize: 20, lineHeight: 28 },
};
```

**Hard rules:**
- Never use system fonts (San Francisco, Roboto) — they feel generic
- Never use Inter — it is the most overused font in AI-generated UIs
- Playfair Display is reserved for display moments only — never use it
  for body copy or UI labels
- Price tags always use `type.price` — they deserve a moment

### Spacing system
Base unit: 4px. All spacing values are multiples of 4.
Use NativeWind spacing scale directly (`p-4` = 16px, `gap-2` = 8px, etc.).
Standard screen horizontal padding: `px-5` (20px) on all screens.

### Border radius
- Cards, menu items:   `rounded-2xl` (16px)
- Buttons (primary):   `rounded-full`
- Buttons (secondary): `rounded-xl` (12px)
- Tags/chips/badges:   `rounded-full`
- Bottom sheet:        `rounded-t-3xl` (24px top corners only)
- Input fields:        `rounded-xl` (12px)

### Shadows (React Native `style` prop — not CSS)
```ts
export const shadows = {
  card: {
    shadowColor: '#1C1A17',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,   // Android
  },
  elevated: {
    shadowColor: '#1C1A17',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  bottomSheet: {
    shadowColor: '#1C1A17',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 16,
  },
};
```

---

## 2. React Native / NativeWind Rules

### NativeWind v4 usage
NativeWind v4 compiles Tailwind utility classes to React Native StyleSheet
objects at build time. It is NOT a CSS engine. These rules are non-negotiable:

**What works:**
- Flexbox utilities (`flex`, `flex-row`, `items-center`, `justify-between`)
- Spacing (`p-4`, `m-2`, `gap-3`, `px-5`, `py-3`)
- Sizing (`w-full`, `h-12`, `w-[200px]`, `h-1/2`)
- Border radius (`rounded-xl`, `rounded-full`)
- Background and text colors from your Tailwind config
- Opacity (`opacity-50`)
- `hidden` (display none)

**What does NOT work (use inline style instead):**
- CSS Grid — use Flexbox with wrapping (`flex-wrap`) instead
- `backdrop-filter`, `mix-blend-mode`, `filter` — not supported in RN
- `transition`, `animation` CSS keyframes — use `react-native-reanimated`
- Pseudo-classes (`:hover`, `:focus`, `:active`) — use `Pressable` state
- `clamp()`, `calc()`, `min()`, `max()` — use JS calculations instead
- `@container` queries — use `onLayout` or `useWindowDimensions`
- `text-wrap: pretty` — not applicable
- `z-index` stacking via className — use `zIndex` in inline style

**Extend Tailwind config** (`tailwind.config.js`) with custom colors and
font families so NativeWind classes like `text-brand` and
`font-display` work:

```js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: { primary: '#FAF7F2', secondary: '#F2EDE4', elevated: '#FFFFFF', inverse: '#1C1A17' },
        brand: { DEFAULT: '#C8622A', light: '#F0A875', dark: '#8C3E15' },
        text: { primary: '#1C1A17', secondary: '#6B6358', tertiary: '#A09486', inverse: '#FAF7F2' },
        border: '#E2D9CC',
      },
      fontFamily: {
        display: ['PlayfairDisplay-Bold'],
        'display-semi': ['PlayfairDisplay-SemiBold'],
        sans: ['DMSans-Regular'],
        'sans-medium': ['DMSans-Medium'],
        'sans-semi': ['DMSans-SemiBold'],
      },
    },
  },
};
```

### Core component primitives
Always use these React Native primitives — never HTML elements:

| HTML equivalent | React Native primitive    |
|-----------------|---------------------------|
| `div`           | `View`                    |
| `p`, `span`     | `Text`                    |
| `img`           | `Image` (expo-image preferred) |
| `button`        | `Pressable` (not `TouchableOpacity`) |
| `input`         | `TextInput`               |
| `ul` / scroll   | `FlatList` or `ScrollView`|
| `a`             | `Pressable` + navigation  |

Use `Pressable` over `TouchableOpacity` everywhere. Pressable gives you
fine-grained control over pressed state for animations.

### Hover / press states
There is no `:hover` in React Native. Use Pressable's `pressed` state:

```tsx
<Pressable
  style={({ pressed }) => ({
    opacity: pressed ? 0.85 : 1,
    transform: [{ scale: pressed ? 0.97 : 1 }],
  })}
  onPress={handlePress}
>
```

For web export, Pressable also responds to mouse hover via `hovered` state
(available from React Native Web).

---

## 3. Animation System

All animations use `react-native-reanimated` v3. Never use the legacy
`Animated` API from React Native core — it runs on the JS thread and
causes jank. Reanimated runs on the UI thread.

### Motion philosophy
- **Spring physics, never linear easing** — every interactive element
  uses spring. Linear easing feels mechanical and cheap.
- **One orchestrated entrance, not scattered micro-interactions** —
  when a screen loads, stagger the elements in. One cohesive reveal
  beats ten separate animations firing independently.
- **Animations confirm, not decorate** — every animation must communicate
  something (item added to cart, message sent, order confirmed).
  Never animate just to look busy.
- **Respect reduced motion** — check `useReducedMotion()` and skip
  or simplify animations if true.

### Standard spring configs
Define in `src/theme/motion.ts` and reuse everywhere:

```ts
import { withSpring } from 'react-native-reanimated';

export const springs = {
  // For most UI interactions — snappy and responsive
  snappy: { damping: 20, stiffness: 300, mass: 0.8 },
  // For bottom sheets and drawers — feels physical and weighted
  drawer: { damping: 28, stiffness: 280, mass: 1.2 },
  // For cart badge bounce — exaggerated, celebratory
  bounce: { damping: 10, stiffness: 400, mass: 0.6 },
  // For modal entry — smooth and confident
  modal:  { damping: 32, stiffness: 260, mass: 1.0 },
};
```

### Required animations (all must be implemented)

**Cart badge bounce** — triggers every time cart item count changes:
```tsx
const scale = useSharedValue(1);

useEffect(() => {
  scale.value = withSequence(
    withSpring(1.4, springs.bounce),
    withSpring(1.0, springs.snappy),
  );
}, [cartCount]);
```

**Cart drawer (bottom sheet)** — slides up from bottom:
```tsx
const translateY = useSharedValue(SHEET_HEIGHT);
// Open:  translateY.value = withSpring(0, springs.drawer)
// Close: translateY.value = withSpring(SHEET_HEIGHT, springs.drawer)
```

**Chat message entry** — each new message fades + slides in:
```tsx
const opacity    = useSharedValue(0);
const translateY = useSharedValue(16);
// On mount:
opacity.value    = withTiming(1, { duration: 200 });
translateY.value = withSpring(0, springs.snappy);
```

**Menu item "Add" button scale-pop**:
```tsx
scale.value = withSequence(
  withSpring(0.88, springs.snappy),
  withSpring(1.0,  springs.bounce),
);
```

**Typing indicator (3 dots)**:
- Three dots animate with `withRepeat(withSequence(...))` — each dot
  offset by 150ms delay. Dots scale from 0.6 to 1.0 and back.

**Order confirmation** — full screen success moment:
- Checkmark SVG strokes in using `withTiming` on a stroke-dashoffset
  equivalent (or use a Lottie animation via `lottie-react-native`).
- Background flashes brand color briefly, then fades to success green.
- "Order confirmed" text slides up with `springs.modal`.

**Screen entry stagger** — on MenuScreen and OrdersScreen:
```tsx
// Each card enters with a delay based on its index
translateY.value = withDelay(
  index * 60,
  withSpring(0, springs.snappy)
);
```

### Gesture interactions
Use `react-native-gesture-handler` for:
- Swipe down to close cart drawer
- Swipe left on cart items to reveal a delete button
- Pull-to-refresh on OrdersScreen

---

## 4. Screen-by-Screen Design Specs

### ChatScreen (highest priority — this is the hero screen)

Layout: full screen, `bg-bg-inverse` (dark) for the message area,
`bg-bg-elevated` for the input bar.

**Message bubbles:**
- User messages: right-aligned, `bg-brand` background, `text-text-inverse`,
  `rounded-2xl rounded-br-sm` (pointed bottom-right corner)
- Assistant messages: left-aligned, `bg-bg-secondary` background,
  `text-text-primary`, `rounded-2xl rounded-bl-sm` (pointed bottom-left)
- Max width: 75% of screen width
- Assistant avatar: small terracotta circle with a fork icon, left of bubble

**Suggested prompt chips** (shown only when conversation is empty):
- Horizontal `ScrollView` of pill-shaped chips
- `bg-bg-secondary` background, `border border-border`, `rounded-full`
- Chips: "What's on the menu?", "Recommend something spicy",
  "Add the chef's special", "What's in my cart?", "Surprise me"
- On press: chip scales down then up (`springs.snappy`), sends the message

**Cart update card** (inline in chat, after agent updates cart):
- Rendered inside assistant message area, below the text bubble
- Shows item name, quantity, new cart total
- Small, compact — `bg-brand/10` (10% opacity brand color) with
  `border border-brand/30` and a small cart icon

**Input bar:**
- Fixed at bottom, `bg-bg-elevated`, `border-t border-border`
- `TextInput` with placeholder "Ask me anything..."
- Send button: `bg-brand` circle, arrow-up icon, disabled state when empty
- Keyboard-aware: use `KeyboardAvoidingView` with `behavior="padding"` on iOS

**Typing indicator:**
- Shown in an assistant bubble position while `isTyping === true`
- Three dots animating with staggered bounce
- Auto-scrolls list to bottom when indicator appears

### MenuScreen

Layout: `bg-bg-primary`, `SafeAreaView`.

**Header:** Screen title "Our Menu" in `type.title` (Playfair Display),
subtitled with today's date or a tagline in `type.caption`.

**Filter bar:** Horizontal `ScrollView`, no scroll indicator.
Chips for: All, Starters, Mains, Desserts, Drinks.
Active chip: `bg-brand` with `text-text-inverse`.
Inactive chip: `bg-bg-secondary` with `text-text-secondary`, `border border-border`.

**Search bar:** `bg-bg-secondary`, `rounded-xl`, search icon left, clear
button right (appears when text is present).

**Menu grid:** `FlatList` with `numColumns={2}`. Each card:
- `bg-bg-elevated`, `rounded-2xl`, shadow from `shadows.card`
- Image: 16:9 aspect ratio, `rounded-t-2xl`, use `expo-image` for
  smooth loading with a blur placeholder
- Name in `type.heading`, description in `type.caption` (2 lines max,
  `numberOfLines={2}`)
- Price in `type.price` (Playfair Display), `text-brand`
- Tags row: small pills for vegan/spicy/signature etc.
- "Add" button: `bg-brand` circle with `+` icon, bottom-right of card.
  On press: scale-pop animation, cart store `addItem()` called.

**Item detail modal** (opens on card tap):
- Full-screen modal with `bg-bg-elevated`
- Large image (full width, 40% of screen height)
- Name, description, price, tags
- Quantity stepper (− count +) with `type.heading` for count
- Large "Add to cart" button: `bg-brand`, `rounded-full`, full width

### CartDrawer (bottom sheet, global)

Accessible from every screen via the cart icon in the tab bar or header.

Structure:
- `Animated.View` positioned absolutely at screen bottom
- Dark overlay (`colors.overlay`) behind it when open, closes on tap
- `rounded-t-3xl`, `bg-bg-elevated`, shadow from `shadows.bottomSheet`
- Drag handle bar at top center (short rounded rect, `bg-border`)

Content:
- "Your Cart" heading (`type.heading`) + item count badge
- `ScrollView` of cart items, each row:
  - Item name + description (1 line)
  - Price per unit in `type.label`
  - Quantity controls (− [count] +) — tap +/− calls `modifyItem()`
  - Swipe left to reveal a red trash button (`react-native-gesture-handler`)
- Divider line above total row
- Total row: "Total" label + total price in `type.price`
- "Place Order" button: `bg-brand`, `rounded-full`, full width, large touch target
- Empty state: illustration (fork + plate icon), "Your cart is empty",
  suggestion to chat with the AI

### OrdersScreen

**Header:** "Past Orders" in `type.title`.

**Order cards:** `FlatList`, each card:
- `bg-bg-elevated`, `rounded-2xl`, `shadows.card`
- Date in `type.label`, status badge (confirmed / pending)
- Item summary (first 2 items + "and N more")
- Total in `type.price`
- Tap to expand: accordion-style with `withSpring` height animation,
  showing full item breakdown

**Empty state:** "No orders yet" with a gentle illustration.

### LoginScreen / SignupScreen

Clean, minimal — the app's first impression.

Layout: `bg-bg-primary`, centered content, `KeyboardAvoidingView`.

**Top section:** App logo / wordmark ("Bistro" in Playfair Display at
`type.hero` size, `text-brand`), short tagline in `type.caption`.

**Form fields:**
- `bg-bg-secondary`, `border border-border`, `rounded-xl`
- Label above field in `type.label`
- Focused state: `border-brand`
- Error state: `border-error`, error message in `type.caption text-error`

**Buttons:**
- Primary ("Sign in"): `bg-brand`, `rounded-full`, full width
- Google OAuth: `bg-bg-elevated`, `border border-border`, `rounded-full`,
  Google logo + "Continue with Google" in `type.label`
- Switch link ("Don't have an account? Sign up"): `text-brand`, `type.label`

---

## 5. Layout and Responsiveness

Since this is a web export, the app runs in a browser at varying widths.
Treat it as a **mobile-first centered layout**:

```tsx
// Root layout wrapper — use this in every screen
<View style={{ flex: 1, alignItems: 'center', backgroundColor: colors.bg.primary }}>
  <View style={{ width: '100%', maxWidth: 480, flex: 1 }}>
    {/* screen content */}
  </View>
</View>
```

On desktop, this creates a centered phone-width column with the page
background showing on the sides. This looks intentional and clean —
it signals "this is a mobile app" to the recruiter viewing on desktop.

Use `useWindowDimensions()` to get screen dimensions when needed for
dynamic sizing (bottom sheet height, modal height, etc.).

---

## 6. Component Architecture

Organize components as follows:

```
src/
├── theme/
│   ├── colors.ts
│   ├── typography.ts
│   ├── motion.ts       (spring configs)
│   └── shadows.ts
├── components/
│   ├── ui/             (primitive: Button, Input, Badge, Tag, Divider)
│   ├── menu/           (MenuCard, MenuFilter, ItemModal)
│   ├── chat/           (MessageBubble, TypingIndicator, PromptChip, CartUpdateCard)
│   ├── cart/           (CartDrawer, CartItem, CartTotal)
│   └── layout/         (ScreenWrapper, SafeHeader)
├── screens/
│   ├── ChatScreen.tsx
│   ├── MenuScreen.tsx
│   ├── OrdersScreen.tsx
│   ├── LoginScreen.tsx
│   └── SignupScreen.tsx
├── stores/
│   ├── useAuthStore.ts
│   ├── useCartStore.ts
│   └── useChatStore.ts
└── services/
    └── api.ts          (Axios instance with interceptors)
```

### Button component (reference implementation)

The primary `Button` component is used everywhere. It must handle:
loading state, disabled state, and the scale-pop press animation.

```tsx
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withSpring
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { springs } from '@/theme/motion';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, fullWidth }: ButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.94, springs.snappy),
      withSpring(1.00, springs.bounce),
    );
    onPress();
  };

  const base = 'items-center justify-center py-4 rounded-full';
  const variants = {
    primary:   'bg-brand',
    secondary: 'bg-bg-secondary border border-border',
    ghost:     'bg-transparent',
  };

  return (
    <Animated.View style={[animStyle, fullWidth && { width: '100%' }]}>
      <Pressable
        className={`${base} ${variants[variant]} ${disabled ? 'opacity-40' : ''}`}
        onPress={handlePress}
        disabled={disabled || loading}
      >
        {loading
          ? <ActivityIndicator color={variant === 'primary' ? '#FAF7F2' : '#C8622A'} />
          : <Text className={`font-sans-semi text-base ${variant === 'primary' ? 'text-text-inverse' : 'text-text-primary'}`}>
              {label}
            </Text>
        }
      </Pressable>
    </Animated.View>
  );
}
```

---

## 7. Anti-patterns — Never Do These

**Visual:**
- No purple/blue gradient backgrounds — the brand is warm terracotta
- No emoji as icons — use `@expo/vector-icons` (Feather or Ionicons set)
- No card with a colored left-border accent stripe
- No Inter or Roboto fonts
- No flat, unweighted buttons — all buttons have a press animation
- No skeleton loaders with shimmer gradients (RN shimmer is complex —
  use a simple pulsing opacity animation instead)

**React Native:**
- No CSS `div` or `span` — use `View` and `Text`
- No CSS Grid — use Flexbox
- No `TouchableOpacity` — use `Pressable`
- No `useNativeDriver: false` in the legacy `Animated` API —
  use `react-native-reanimated` instead
- No `position: fixed` — use `position: 'absolute'` within a `View`
  that fills the screen
- No inline `StyleSheet.create({})` scattered in every component —
  use the theme constants from `src/theme/`

**Architecture:**
- No API calls directly in components — all calls go through `src/services/api.ts`
- No cart state in component local state — always use `useCartStore`
- No hardcoded colors or font sizes — always reference the theme

---

## 8. Pre-delivery Checklist

Before considering any screen or component done:

- [ ] Runs without errors in `expo start --web`
- [ ] All press interactions have a spring animation (no static buttons)
- [ ] All lists use `FlatList`, not `ScrollView` with `.map()` (performance)
- [ ] Images use `expo-image` with a `placeholder` prop (no layout shift)
- [ ] `KeyboardAvoidingView` wraps any screen with a `TextInput`
- [ ] `SafeAreaView` used on all screens
- [ ] Fonts load correctly (check with `useFonts` from `expo-font`)
- [ ] Cart badge bounces when count changes
- [ ] Cart drawer animates with spring physics (not `duration`-based)
- [ ] Chat messages enter with fade + slide animation
- [ ] `useReducedMotion()` checked — animations simplified if true
- [ ] Centered max-width layout wrapper applied (`maxWidth: 480`)
- [ ] No hardcoded hex values in component files
- [ ] No TypeScript errors (`npx tsc --noEmit` passes)
- [ ] Zustand stores are the single source of truth for cart and auth state
- [ ] API calls use the Axios instance from `src/services/api.ts`
  (which handles JWT refresh automatically via interceptor)
