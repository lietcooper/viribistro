import { render, screen } from '@testing-library/react-native';

import { ChatBubble } from '@/components/ChatBubble';
import type { ChatMessage } from '@/stores/useChatStore';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg_1',
    role: 'assistant',
    content: 'Welcome to the bistro.',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('ChatBubble', () => {
  it('renders user messages right-aligned with the user testID', () => {
    render(<ChatBubble message={makeMessage({ role: 'user', content: 'I want a burger' })} />);
    expect(screen.getByTestId('chat-bubble-user')).toBeTruthy();
    expect(screen.getByText('I want a burger')).toBeTruthy();
  });

  it('renders assistant messages left-aligned with the assistant testID', () => {
    render(<ChatBubble message={makeMessage({ role: 'assistant' })} />);
    expect(screen.getByTestId('chat-bubble-assistant')).toBeTruthy();
    expect(screen.getByText('Welcome to the bistro.')).toBeTruthy();
  });

  it('renders an inline cart-update card when the message carries a cartUpdate', () => {
    render(
      <ChatBubble
        message={makeMessage({
          cartUpdate: {
            items: [
              {
                menuItemId: 'mi_burger',
                name: 'Wagyu Burger',
                quantity: 1,
                unitPrice: '24.00',
              },
            ],
            total: '24.00',
          },
        })}
      />,
    );
    expect(screen.getByTestId('cart-update-card')).toBeTruthy();
    expect(screen.getByText(/Cart updated/)).toBeTruthy();
  });

  it('omits the cart-update card when there is no cartUpdate', () => {
    render(<ChatBubble message={makeMessage()} />);
    expect(screen.queryByTestId('cart-update-card')).toBeNull();
  });
});
