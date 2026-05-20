import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatBubble } from '@/components/ChatBubble';
import type { ChatMessage } from '@/stores/useChatStore';

const mockTtsState = {
  supported: true,
  isSpeaking: false,
  error: null as string | null,
  speak: jest.fn(),
  stop: jest.fn(),
};

jest.mock('@/hooks/useTextToSpeech', () => ({
  useTextToSpeech: () => mockTtsState,
}));

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
  beforeEach(() => {
    mockTtsState.supported = true;
    mockTtsState.isSpeaking = false;
    mockTtsState.error = null;
    mockTtsState.speak.mockClear();
    mockTtsState.stop.mockClear();
  });

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

  it('renders a speaker button for supported assistant messages', () => {
    render(<ChatBubble message={makeMessage({ role: 'assistant' })} />);

    expect(screen.getByTestId('chat-bubble-speak-button')).toBeTruthy();
    expect(screen.getByLabelText('Read message aloud')).toBeTruthy();
  });

  it('does not render a speaker button for user messages', () => {
    render(<ChatBubble message={makeMessage({ role: 'user' })} />);

    expect(screen.queryByTestId('chat-bubble-speak-button')).toBeNull();
  });

  it('hides the speaker button when text-to-speech is unsupported', () => {
    mockTtsState.supported = false;

    render(<ChatBubble message={makeMessage({ role: 'assistant' })} />);

    expect(screen.queryByTestId('chat-bubble-speak-button')).toBeNull();
  });

  it('speaks assistant message content when pressed', () => {
    render(<ChatBubble message={makeMessage({ content: 'The risotto is excellent.' })} />);

    fireEvent.press(screen.getByTestId('chat-bubble-speak-button'));

    expect(mockTtsState.speak).toHaveBeenCalledWith('The risotto is excellent.');
    expect(mockTtsState.stop).not.toHaveBeenCalled();
  });

  it('stops speech when the active speaker button is pressed', () => {
    mockTtsState.isSpeaking = true;

    render(<ChatBubble message={makeMessage()} />);

    fireEvent.press(screen.getByTestId('chat-bubble-speak-button'));

    expect(mockTtsState.stop).toHaveBeenCalledTimes(1);
    expect(mockTtsState.speak).not.toHaveBeenCalled();
  });

  it('changes the speaker accessibility label while speaking', () => {
    mockTtsState.isSpeaking = true;

    render(<ChatBubble message={makeMessage()} />);

    expect(screen.getByLabelText('Stop reading message')).toBeTruthy();
  });

  it('does not speak empty assistant messages', () => {
    render(<ChatBubble message={makeMessage({ content: '   ' })} />);

    fireEvent.press(screen.getByTestId('chat-bubble-speak-button'));

    expect(mockTtsState.speak).not.toHaveBeenCalled();
    expect(mockTtsState.stop).not.toHaveBeenCalled();
  });
});
