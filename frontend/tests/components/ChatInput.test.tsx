import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatInput } from '@/components/ChatInput';

const mockSpeechState = {
  supported: true,
  isListening: false,
  transcript: '',
  interimTranscript: '',
  error: null as string | null,
  startListening: jest.fn(),
  stopListening: jest.fn(),
  resetTranscript: jest.fn(),
};

jest.mock('@/hooks/useSpeechToText', () => ({
  useSpeechToText: () => mockSpeechState,
}));

beforeEach(() => {
  mockSpeechState.supported = true;
  mockSpeechState.isListening = false;
  mockSpeechState.transcript = '';
  mockSpeechState.interimTranscript = '';
  mockSpeechState.error = null;
  mockSpeechState.startListening.mockClear();
  mockSpeechState.stopListening.mockClear();
  mockSpeechState.resetTranscript.mockClear();
});

describe('ChatInput', () => {
  it('sends typed text and clears the field', () => {
    const onSend = jest.fn();
    render(<ChatInput onSend={onSend} />);

    fireEvent.changeText(screen.getByTestId('chat-input'), 'Add the salmon');
    fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledWith('Add the salmon');
    expect(screen.getByTestId('chat-input').props.value).toBe('');
  });

  it('renders a mic button when speech recognition is supported', () => {
    render(<ChatInput onSend={jest.fn()} />);
    expect(screen.getByTestId('chat-mic')).toBeTruthy();
    expect(screen.getByLabelText('Start voice input')).toBeTruthy();
  });

  it('does not render the mic button when speech recognition is unsupported', () => {
    mockSpeechState.supported = false;
    render(<ChatInput onSend={jest.fn()} />);
    expect(screen.queryByTestId('chat-mic')).toBeNull();
  });

  it('starts and stops listening from the mic button', () => {
    const { rerender } = render(<ChatInput onSend={jest.fn()} />);

    fireEvent.press(screen.getByTestId('chat-mic'));
    expect(mockSpeechState.startListening).toHaveBeenCalledTimes(1);

    mockSpeechState.isListening = true;
    rerender(<ChatInput onSend={jest.fn()} />);

    fireEvent.press(screen.getByTestId('chat-mic'));
    expect(mockSpeechState.stopListening).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Stop voice input')).toBeTruthy();
  });

  it('fills the input with the final transcript', () => {
    const { rerender } = render(<ChatInput onSend={jest.fn()} />);

    mockSpeechState.transcript = 'Add a burger';
    rerender(<ChatInput onSend={jest.fn()} />);

    expect(screen.getByTestId('chat-input').props.value).toBe('Add a burger');
  });

  it('shows interim transcript while listening', () => {
    mockSpeechState.isListening = true;
    mockSpeechState.interimTranscript = 'Add a';

    render(<ChatInput onSend={jest.fn()} />);

    expect(screen.getByText('Add a')).toBeTruthy();
  });

  it('sends dictated text and stops listening', () => {
    mockSpeechState.isListening = true;
    mockSpeechState.transcript = 'Add the risotto';
    const onSend = jest.fn();

    render(<ChatInput onSend={onSend} />);
    fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledWith('Add the risotto');
    expect(mockSpeechState.stopListening).toHaveBeenCalledTimes(1);
  });

  it('disables mic actions when the input is disabled', () => {
    render(<ChatInput onSend={jest.fn()} disabled />);

    fireEvent.press(screen.getByTestId('chat-mic'));

    expect(mockSpeechState.startListening).not.toHaveBeenCalled();
  });
});
