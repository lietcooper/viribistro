// Chat store. Keeps a flat list of bubbles, the typing flag, and the
// sessionId used by the backend to scope cart + history.
//
// Cart reconciliation: when the agent runs a tool that mutates the cart,
// the backend returns the new full cart snapshot in `cartUpdate`. We pass
// it to `useCartStore.reconcile()` — the server is authoritative.
//
// Error handling: if the network call fails, we drop a synthetic
// assistant bubble explaining the problem instead of swallowing the
// failure. The user always gets a reply, never a silent dead-end.
import { create } from 'zustand';

import { getApiClient } from '@/lib/api';
import { getSessionId } from '@/lib/session';
import { useCartStore } from '@/stores/useCartStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Cart, ChatResponse } from '@/types/api';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  // Populated on assistant turns where the agent updated the cart.
  // Triggers an inline cart-update card below the bubble.
  cartUpdate?: Cart | null;
  createdAt: number;
}

export interface ChatState {
  sessionId: string;
  messages: ChatMessage[];
  isTyping: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  resetSession: () => void;
}

const FALLBACK_REPLY =
  "Sorry, I couldn't reach the bistro right now — try again in a moment?";

function makeMessageId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: getSessionId(),
  messages: [],
  isTyping: false,
  error: null,

  async sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (get().isTyping) return;

    const userMsg: ChatMessage = {
      id: makeMessageId(),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    };
    set((s) => ({
      messages: [...s.messages, userMsg],
      isTyping: true,
      error: null,
    }));

    try {
      // The backend links the conversation to the signed-in user by
      // reading the Authorization: Bearer header, which the axios
      // request interceptor in lib/api.ts attaches automatically from
      // useAuthStore. No userId in the body — the backend's
      // ChatBodySchema only accepts { sessionId, message }.
      const res = await getApiClient().post<ChatResponse>('/api/chat', {
        sessionId: get().sessionId,
        message: trimmed,
      });

      if (res.data.cartUpdate) {
        useCartStore.getState().reconcile(res.data.cartUpdate);
      }

      const assistantMsg: ChatMessage = {
        id: makeMessageId(),
        role: 'assistant',
        content: res.data.reply,
        cartUpdate: res.data.cartUpdate,
        createdAt: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isTyping: false,
      }));

      // Backend persists each turn to Postgres so the agent has memory
      // across requests. If that DB write failed, the user's reply was
      // still produced but the next message won't see this turn in the
      // history snapshot — surface a quiet warning so they know.
      if (res.data.historyPersisted === false) {
        useToastStore
          .getState()
          .show("Conversation history may be out of sync.", 'info');
      }
    } catch (err) {
      const fallback: ChatMessage = {
        id: makeMessageId(),
        role: 'assistant',
        content: FALLBACK_REPLY,
        createdAt: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, fallback],
        isTyping: false,
        error: err instanceof Error ? err.message : 'chat-failed',
      }));
    }
  },

  resetSession() {
    set({ messages: [], isTyping: false, error: null });
  },
}));
