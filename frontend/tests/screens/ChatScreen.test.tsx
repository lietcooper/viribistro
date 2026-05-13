import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ChatScreen } from '@/screens/ChatScreen';
import { useChatStore } from '@/stores/useChatStore';
import { useCartStore } from '@/stores/useCartStore';

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

describe('ChatScreen', () => {
  it('renders suggested prompt chips when the conversation is empty', () => {
    render(<ChatScreen />);
    expect(screen.getByTestId('prompt-chips')).toBeTruthy();
    expect(screen.getByTestId("prompt-chip-What's on the menu?")).toBeTruthy();
  });

  it('tapping a chip dispatches sendMessage with that text', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: { reply: 'sure', cartUpdate: null, toolsUsed: [] },
    });

    render(<ChatScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("prompt-chip-What's on the menu?"));
    });

    expect(mockClient.post).toHaveBeenCalledWith('/api/chat', {
      sessionId: 'test-session',
      message: "What's on the menu?",
    });
  });

  it('renders user and assistant bubbles after sending', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: { reply: "Here's the menu.", cartUpdate: null, toolsUsed: [] },
    });

    render(<ChatScreen />);
    fireEvent.changeText(screen.getByTestId('chat-input'), 'hi');
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-send'));
    });

    expect(screen.getAllByTestId('chat-bubble-user')).toHaveLength(1);
    expect(screen.getAllByTestId('chat-bubble-assistant')).toHaveLength(1);
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.getByText("Here's the menu.")).toBeTruthy();
  });

  it('shows the typing indicator while isTyping is true', () => {
    useChatStore.setState({
      messages: [{ id: '1', role: 'user', content: 'hello', createdAt: 1 }],
      isTyping: true,
    });
    render(<ChatScreen />);
    expect(screen.getByTestId('typing-indicator')).toBeTruthy();
  });

  it('renders an inline cart-update card when an assistant message carries one', () => {
    useChatStore.setState({
      messages: [
        {
          id: 'a',
          role: 'assistant',
          content: 'Added.',
          createdAt: 1,
          cartUpdate: {
            items: [
              {
                menuItemId: 'mi_1',
                name: 'Burger',
                quantity: 1,
                unitPrice: '12.00',
              },
            ],
            total: '12.00',
          },
        },
      ],
    });
    render(<ChatScreen />);
    expect(screen.getByTestId('cart-update-card')).toBeTruthy();
  });

  it('does not send empty messages', () => {
    render(<ChatScreen />);
    fireEvent.changeText(screen.getByTestId('chat-input'), '   ');
    fireEvent.press(screen.getByTestId('chat-send'));
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it('renders the agent follow-up chips under the latest assistant turn', () => {
    useChatStore.setState({
      messages: [
        { id: 'u1', role: 'user', content: 'recommend?', createdAt: 1 },
        {
          id: 'a1',
          role: 'assistant',
          content: 'Try the burger.',
          createdAt: 2,
          suggestedReplies: ['Add it to my cart', 'Show me drinks'],
        },
      ],
    });
    render(<ChatScreen />);
    expect(screen.getByTestId('chat-followups')).toBeTruthy();
    expect(screen.getByTestId('prompt-chip-Add it to my cart')).toBeTruthy();
    expect(screen.getByTestId('prompt-chip-Show me drinks')).toBeTruthy();
  });

  it('hides follow-up chips while a reply is in flight', () => {
    useChatStore.setState({
      isTyping: true,
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'something',
          createdAt: 1,
          suggestedReplies: ['One', 'Two'],
        },
      ],
    });
    render(<ChatScreen />);
    expect(screen.queryByTestId('chat-followups')).toBeNull();
  });

  it('tapping a follow-up chip sends it as a user message', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: {
        reply: 'sure',
        cartUpdate: null,
        toolsUsed: [],
        suggestedReplies: [],
      },
    });
    useChatStore.setState({
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: 'try the burger',
          createdAt: 1,
          suggestedReplies: ['Add it to my cart'],
        },
      ],
    });

    render(<ChatScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('prompt-chip-Add it to my cart'));
    });

    expect(mockClient.post).toHaveBeenCalledWith('/api/chat', {
      sessionId: 'test-session',
      message: 'Add it to my cart',
    });
  });

  it('tapping the New chat button confirms then clears the thread via the API', async () => {
    // Default Platform.OS in jest-expo is ios, so the confirm path goes
    // through Alert.alert. Stub it to immediately fire the destructive
    // button so we can assert the wiring without a real prompt.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const ok = (buttons ?? []).find((b) => b.style === 'destructive');
      ok?.onPress?.();
    });
    mockClient.delete.mockResolvedValueOnce({ data: { deleted: 1 } });

    useChatStore.setState({
      messages: [{ id: 'a', role: 'user', content: 'old', createdAt: 1 }],
    });

    render(<ChatScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-new'));
    });

    expect(mockClient.delete).toHaveBeenCalledWith('/api/chat/history/test-session');
    expect(useChatStore.getState().messages).toEqual([]);

    alertSpy.mockRestore();
  });
});
