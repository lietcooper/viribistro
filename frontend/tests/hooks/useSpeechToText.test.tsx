import { act, renderHook } from '@testing-library/react-native';

import { useSpeechToText } from '@/hooks/useSpeechToText';
import type { SpeechRecognitionErrorCode, SpeechRecognitionLike } from '@/types/speech';

type MockRecognition = SpeechRecognitionLike & {
  emitStart: () => void;
  emitEnd: () => void;
  emitError: (error: SpeechRecognitionErrorCode) => void;
  emitResult: (
    results: Array<{ transcript: string; isFinal: boolean }>,
    resultIndex?: number,
  ) => void;
};

const originalSpeechRecognition = window.SpeechRecognition;
const originalWebkitSpeechRecognition = window.webkitSpeechRecognition;
let instances: MockRecognition[] = [];

function createMockRecognition(): MockRecognition {
  const recognition: MockRecognition = {
    continuous: true,
    interimResults: false,
    lang: '',
    onstart: null,
    onresult: null,
    onerror: null,
    onend: null,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    emitStart() {
      recognition.onstart?.(new Event('start'));
    },
    emitEnd() {
      recognition.onend?.(new Event('end'));
    },
    emitError(error) {
      recognition.onerror?.({
        type: 'error',
        error,
        message: `${error} error`,
      });
    },
    emitResult(resultItems, resultIndex = 0) {
      const results = resultItems.map((item) => [
        { transcript: item.transcript, confidence: 0.9 },
      ]) as unknown as SpeechRecognitionResultList;

      resultItems.forEach((item, index) => {
        Object.defineProperty(results[index], 'isFinal', { value: item.isFinal });
      });

      recognition.onresult?.({
        type: 'result',
        resultIndex,
        results,
      });
    },
  };

  instances.push(recognition);
  return recognition;
}

function installRecognition(
  name: 'SpeechRecognition' | 'webkitSpeechRecognition' = 'SpeechRecognition',
) {
  const MockCtor = jest.fn(createMockRecognition);

  Object.defineProperty(window, name, {
    configurable: true,
    writable: true,
    value: MockCtor,
  });

  return MockCtor;
}

function removeRecognition() {
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

beforeEach(() => {
  instances = [];
  removeRecognition();
});

afterEach(() => {
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    writable: true,
    value: originalSpeechRecognition,
  });
  Object.defineProperty(window, 'webkitSpeechRecognition', {
    configurable: true,
    writable: true,
    value: originalWebkitSpeechRecognition,
  });
  jest.restoreAllMocks();
});

describe('useSpeechToText', () => {
  it('reports unsupported when the Web Speech API is missing', () => {
    const { result } = renderHook(() => useSpeechToText());

    expect(result.current.supported).toBe(false);
    expect(result.current.isListening).toBe(false);

    act(() => result.current.startListening());

    expect(result.current.error).toBe('Speech recognition is not supported in this browser.');
  });

  it('detects prefixed browser support and configures recognition defaults', () => {
    const MockCtor = installRecognition('webkitSpeechRecognition');

    const { result } = renderHook(() => useSpeechToText());

    expect(result.current.supported).toBe(true);
    expect(MockCtor).toHaveBeenCalledTimes(1);
    expect(instances[0]).toMatchObject({
      continuous: false,
      interimResults: true,
      lang: 'en-US',
    });
  });

  it('starts and stops listening', () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    const recognition = instances[0];

    act(() => result.current.startListening());
    act(() => recognition.emitStart());

    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(true);

    act(() => result.current.stopListening());
    act(() => recognition.emitEnd());

    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });

  it('captures interim and final transcript results', () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    const recognition = instances[0];

    act(() => {
      recognition.emitResult([{ transcript: 'add bur', isFinal: false }]);
    });

    expect(result.current.interimTranscript).toBe('add bur');
    expect(result.current.transcript).toBe('');

    act(() => {
      recognition.emitResult([{ transcript: 'add burger', isFinal: true }]);
    });

    expect(result.current.interimTranscript).toBe('');
    expect(result.current.transcript).toBe('add burger');
  });

  it('appends later final results from resultIndex', () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    const recognition = instances[0];

    act(() => {
      recognition.emitResult([{ transcript: 'add burger', isFinal: true }]);
      recognition.emitResult(
        [
          { transcript: 'add burger', isFinal: true },
          { transcript: 'and fries', isFinal: true },
        ],
        1,
      );
    });

    expect(result.current.transcript).toBe('add burger and fries');
  });

  it('resets final transcript, interim transcript, and error', () => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    const recognition = instances[0];

    act(() => {
      recognition.emitResult([{ transcript: 'hello', isFinal: true }]);
      recognition.emitError('no-speech');
    });

    expect(result.current.transcript).toBe('hello');
    expect(result.current.error).toBe('No speech was detected.');

    act(() => result.current.resetTranscript());

    expect(result.current.transcript).toBe('');
    expect(result.current.interimTranscript).toBe('');
    expect(result.current.error).toBeNull();
  });

  it.each([
    ['not-allowed', 'Microphone permission was denied.'],
    ['service-not-allowed', 'Microphone permission was denied.'],
    ['no-speech', 'No speech was detected.'],
  ] as const)('surfaces %s recognition errors', (errorCode, message) => {
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    const recognition = instances[0];

    act(() => {
      recognition.emitStart();
      recognition.emitError(errorCode);
    });

    expect(result.current.error).toBe(message);
    expect(result.current.isListening).toBe(false);
  });

  it('logs unexpected start failures instead of failing silently', () => {
    const error = new Error('microphone busy');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    installRecognition();
    const { result } = renderHook(() => useSpeechToText());
    instances[0].start = jest.fn(() => {
      throw error;
    });

    act(() => result.current.startListening());

    expect(errorSpy).toHaveBeenCalledWith('[speech] failed to start recognition:', error);
    expect(result.current.error).toBe('Unable to start speech recognition.');
  });

  it('stops recognition and removes handlers on unmount', () => {
    installRecognition();
    const { unmount } = renderHook(() => useSpeechToText());
    const recognition = instances[0];

    unmount();

    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(recognition.onstart).toBeNull();
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
  });
});
