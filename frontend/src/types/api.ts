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
}

export interface CartItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
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
  quantity: number;
  unitPrice: string;
}

export interface Order {
  id: string;
  userId?: string;
  status: OrderStatus;
  totalPrice: string;
  createdAt: string;
  items: OrderItem[];
}
