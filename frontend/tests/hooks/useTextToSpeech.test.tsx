import { act, renderHook } from '@testing-library/react-native';

import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useToastStore } from '@/stores/useToastStore';
import type {
  SpeechSynthesisErrorEventLike,
  SpeechSynthesisLike,
  SpeechSynthesisUtteranceLike,
} from '@/types/speech';

type MockUtterance = SpeechSynthesisUtteranceLike & {
  emitStart: () => void;
  emitEnd: () => void;
  emitError: (error?: string) => void;
};

const originalSpeechSynthesis = window.speechSynthesis;
const originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
let utterances: MockUtterance[] = [];
let synthesis: SpeechSynthesisLike;

function createMockUtterance(text: string): MockUtterance {
  const utterance: MockUtterance = {
    text,
    lang: '',
    rate: 1,
    pitch: 1,
    onstart: null,
    onend: null,
    onerror: null,
    emitStart() {
      utterance.onstart?.(new Event('start'));
    },
    emitEnd() {
      utterance.onend?.(new Event('end'));
    },
    emitError(error = 'synthesis-failed') {
      utterance.onerror?.({
        type: 'error',
        error,
        message: `${error} message`,
      } as SpeechSynthesisErrorEventLike);
    },
  };

  utterances.push(utterance);
  return utterance;
}

function installSpeechSynthesis() {
  synthesis = {
    speak: jest.fn(),
    cancel: jest.fn(),
  };
  const MockUtteranceCtor = jest.fn(createMockUtterance);

  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: synthesis,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: MockUtteranceCtor,
  });

  return MockUtteranceCtor;
}

function removeSpeechSynthesis() {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

beforeEach(() => {
  utterances = [];
  removeSpeechSynthesis();
  useToastStore.setState({ visible: false, message: '', tone: 'info', shownAt: 0 });
});

afterEach(() => {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: originalSpeechSynthesis,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: originalSpeechSynthesisUtterance,
  });
  jest.restoreAllMocks();
});

describe('useTextToSpeech', () => {
  it('reports unsupported when speech synthesis is missing', () => {
    const { result } = renderHook(() => useTextToSpeech());

    expect(result.current.supported).toBe(false);
    expect(result.current.isSpeaking).toBe(false);

    act(() => result.current.speak('Hello'));

    expect(result.current.error).toBe('Text-to-speech is not supported in this browser.');
  });

  it('speaks non-blank text with utterance defaults', () => {
    const MockUtteranceCtor = installSpeechSynthesis();
    const { result } = renderHook(() => useTextToSpeech());

    act(() => result.current.speak('Welcome to ViriBistro.'));

    expect(result.current.supported).toBe(true);
    expect(MockUtteranceCtor).toHaveBeenCalledWith('Welcome to ViriBistro.');
    expect(synthesis.speak).toHaveBeenCalledWith(utterances[0]);
    expect(utterances[0]).toMatchObject({
      lang: 'en-US',
      rate: 0.95,
      pitch: 1,
    });
  });

  it('does not speak blank text', () => {
    installSpeechSynthesis();
    const { result } = renderHook(() => useTextToSpeech());

    act(() => result.current.speak('   '));

    expect(synthesis.speak).not.toHaveBeenCalled();
    expect(synthesis.cancel).not.toHaveBeenCalled();
  });

  it('cancels current speech before speaking new text', () => {
    installSpeechSynthesis();
    const { result } = renderHook(() => useTextToSpeech());

    act(() => result.current.speak('First reply.'));
    act(() => result.current.speak('Second reply.'));

    expect(synthesis.cancel).toHaveBeenCalledTimes(2);
    expect(synthesis.speak).toHaveBeenCalledTimes(2);
  });

  it('stops speech on demand', () => {
    installSpeechSynthesis();
    const { result } = renderHook(() => useTextToSpeech());

    act(() => result.current.stop());

    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
    expect(result.current.isSpeaking).toBe(false);
  });

  it('tracks speaking state from utterance start and end', () => {
    installSpeechSynthesis();
    const { result } = renderHook(() => useTextToSpeech());

    act(() => result.current.speak('Read this reply.'));
    act(() => utterances[0].emitStart());

    expect(result.current.isSpeaking).toBe(true);

    act(() => utterances[0].emitEnd());

    expect(result.current.isSpeaking).toBe(false);
  });

  it('maps utterance errors to state and toast', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    installSpeechSynthesis();
    const { result } = renderHook(() => useTextToSpeech());

    act(() => {
      result.current.speak('Read this reply.');
      utterances[0].emitStart();
      utterances[0].emitError('audio-busy');
    });

    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.error).toBe('Unable to read this message aloud.');
    expect(useToastStore.getState()).toMatchObject({
      visible: true,
      message: 'Unable to read this message aloud.',
      tone: 'error',
    });
  });

  it('cancels speech on unmount', () => {
    installSpeechSynthesis();
    const { unmount } = renderHook(() => useTextToSpeech());

    unmount();

    expect(synthesis.cancel).toHaveBeenCalledTimes(1);
  });
});
