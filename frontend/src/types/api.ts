// Wire types shared with the backend. Mirrors what the backend serializes.
// Prices are strings because Postgres Decimal serializes via toString().

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: 'local' | 'google';
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export type MenuCategory = 'starters' | 'mains' | 'desserts' | 'drinks';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: MenuCategory;
  tags: string[];
  imageUrl: string;
  available: boolean;
  customizationGroups?: MenuCustomizationGroup[];
}

export interface MenuCustomizationOption {
  id: string;
  name: string;
  priceDelta: string;
  available: boolean;
}

/**
 * Dual-shape on purpose: the API/Prisma layer emits `minSelect`/`maxSelect`,
 * while legacy modal code and some test fixtures use `minSelections`/
 * `maxSelections`. Readers (`minSelectionsFor`/`maxSelectionsFor`) check
 * both — do not consolidate without updating those helpers.
 */
export interface MenuCustomizationGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect?: number;
  maxSelect?: number;
  minSelections?: number;
  maxSelections?: number;
  options: MenuCustomizationOption[];
}

export interface SelectedCustomizationOption {
  optionId: string;
  optionName: string;
  priceDelta: string;
}

export interface SelectedCustomization {
  groupId: string;
  groupName: string;
  options?: SelectedCustomizationOption[];
  optionIds?: string[];
  optionNames?: string[];
  priceDelta?: string;
}

export type CartCustomizationInput = Record<string, string[]>;

export interface CartItem {
  id?: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  customizationHash?: string;
  customizations?: SelectedCustomization[];
  note?: string | null;
}

export interface Cart {
  items: CartItem[];
  total: string;
}

export interface ChatToolUsed {
  name: string;
  input: unknown;
}

export interface ChatResponse {
  reply: string;
  cartUpdate: Cart | null;
  toolsUsed: ChatToolUsed[];
  // Short follow-up prompts the agent offered as next steps. Empty when
  // the agent omitted the tail tag — render no chips in that case.
  suggestedReplies: string[];
  // false when the backend successfully replied but failed to persist
  // the turn (DB blip). The frontend surfaces a toast so the user knows
  // the agent may not remember this turn on the next request.
  historyPersisted: boolean;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type OrderStatus = 'pending' | 'confirmed';

export interface OrderItem {
  id: string;
  menuItemId: string;
  name?: string;
  quantity: number;
  unitPrice: string;
  customizationHash?: string;
  customizations?: SelectedCustomization[];
  note?: string | null;
}

export interface Order {
  id: string;
  userId: string | null;
  status: OrderStatus;
  totalPrice: string;
  createdAt: string;
  items: OrderItem[];
}
