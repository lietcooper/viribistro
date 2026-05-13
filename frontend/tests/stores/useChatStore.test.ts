import { act } from '@testing-library/react-native';

import { useCartStore } from '@/stores/useCartStore';
import { useChatStore } from '@/stores/useChatStore';

const mockClient = { post: jest.fn(), delete: jest.fn() };

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

beforeEach(() => {
  mockClient.post.mockReset();
  mockClient.delete.mockReset();
  useChatStore.setState({
    sessionId: 'test-session',
    messages: [],
    isTyping: false,
    error: null,
  });
  useCartStore.setState({ items: [], total: '0' });
});

describe('useChatStore', () => {
  it('appends a user message, flips isTyping, posts to /api/chat, then appends the reply', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: {
        reply: 'Sure, adding one Spicy Chicken Sandwich.',
        cartUpdate: null,
        toolsUsed: [],
      },
    });

    await act(async () => {
      await useChatStore.getState().sendMessage('add a spicy chicken sandwich');
    });

    const state = useChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]).toMatchObject({
      role: 'user',
      content: 'add a spicy chicken sandwich',
    });
    expect(state.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Sure, adding one Spicy Chicken Sandwich.',
    });
    expect(state.isTyping).toBe(false);
    expect(mockClient.post).toHaveBeenCalledWith('/api/chat', {
      sessionId: 'test-session',
      message: 'add a spicy chicken sandwich',
    });
  });

  it('records the agent suggestedReplies on the assistant turn', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: {
        reply: 'Try the burger.',
        cartUpdate: null,
        toolsUsed: [],
        suggestedReplies: ['Add it to my cart', 'Show me drinks'],
      },
    });

    await act(async () => {
      await useChatStore.getState().sendMessage('what should I get?');
    });

    const last = useChatStore.getState().messages.at(-1);
    expect(last?.suggestedReplies).toEqual([
      'Add it to my cart',
      'Show me drinks',
    ]);
  });

  it('defaults suggestedReplies to an empty array when the server omits it', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: { reply: 'hi', cartUpdate: null, toolsUsed: [] },
    });
    await act(async () => {
      await useChatStore.getState().sendMessage('hi');
    });
    const last = useChatStore.getState().messages.at(-1);
    expect(last?.suggestedReplies).toEqual([]);
  });

  it('reconciles cart state from cartUpdate when present', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: {
        reply: 'Added to your cart.',
        cartUpdate: {
          items: [
            { menuItemId: 'mi_burger', name: 'Wagyu Burger', quantity: 2, unitPrice: '24.00' },
          ],
          total: '48.00',
        },
        toolsUsed: [{ name: 'add_to_cart', input: {} }],
      },
    });

    await act(async () => {
      await useChatStore.getState().sendMessage('add two wagyu burgers');
    });

    expect(useCartStore.getState().items).toEqual([
      { menuItemId: 'mi_burger', name: 'Wagyu Burger', quantity: 2, unitPrice: '24.00' },
    ]);
    expect(useCartStore.getState().total).toBe('48.00');

    const last = useChatStore.getState().messages.at(-1);
    expect(last?.cartUpdate).toEqual({
      items: [
        { menuItemId: 'mi_burger', name: 'Wagyu Burger', quantity: 2, unitPrice: '24.00' },
      ],
      total: '48.00',
    });
  });

  it('appends a graceful fallback message when the request fails', async () => {
    mockClient.post.mockRejectedValueOnce(new Error('network'));

    await act(async () => {
      await useChatStore.getState().sendMessage('hi');
    });

    const messages = useChatStore.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.content).toMatch(/couldn't reach the bistro/i);
    expect(useChatStore.getState().isTyping).toBe(false);
    expect(useChatStore.getState().error).toBeTruthy();
  });

  it('no-ops on empty messages and while already typing', async () => {
    await act(async () => {
      await useChatStore.getState().sendMessage('   ');
    });
    expect(useChatStore.getState().messages).toEqual([]);
    expect(mockClient.post).not.toHaveBeenCalled();

    useChatStore.setState({ isTyping: true });
    await act(async () => {
      await useChatStore.getState().sendMessage('hi');
    });
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it('resetSession clears the conversation', () => {
    useChatStore.setState({
      messages: [
        { id: 'a', role: 'user', content: 'x', createdAt: 1 },
      ],
      isTyping: true,
      error: 'boom',
    });
    useChatStore.getState().resetSession();
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.isTyping).toBe(false);
    expect(s.error).toBeNull();
  });

  it('clearHistory wipes local thread and DELETEs server-side history', async () => {
    useChatStore.setState({
      sessionId: 'clear-sess',
      messages: [
        { id: 'a', role: 'user', content: 'one', createdAt: 1 },
        { id: 'b', role: 'assistant', content: 'reply', createdAt: 2 },
      ],
    });
    mockClient.delete.mockResolvedValueOnce({ data: { deleted: 2 } });

    await act(async () => {
      await useChatStore.getState().clearHistory();
    });

    expect(useChatStore.getState().messages).toEqual([]);
    expect(mockClient.delete).toHaveBeenCalledWith(
      '/api/chat/history/clear-sess',
    );
  });

  it('clearHistory still resets locally when the network call fails', async () => {
    useChatStore.setState({
      messages: [{ id: 'a', role: 'user', content: 'x', createdAt: 1 }],
    });
    mockClient.delete.mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      await useChatStore.getState().clearHistory();
    });

    expect(useChatStore.getState().messages).toEqual([]);
  });
});
