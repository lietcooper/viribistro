import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorCode,
  SpeechRecognitionLike,
  UseSpeechToTextReturn,
} from '@/types/speech';

const unsupportedMessage = 'Speech recognition is not supported in this browser.';

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function getErrorMessage(error: SpeechRecognitionErrorCode): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission was denied.';
    case 'no-speech':
      return 'No speech was detected.';
    case 'audio-capture':
      return 'No microphone was found.';
    case 'network':
      return 'Speech recognition network error.';
    case 'aborted':
      return 'Speech recognition was stopped.';
    case 'language-not-supported':
      return 'Speech recognition language is not supported.';
    default:
      return 'Speech recognition failed.';
  }
}

function joinTranscript(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(' ');
}

export function useSpeechToText(): UseSpeechToTextReturn {
  const Recognition = useMemo(() => getRecognitionConstructor(), []);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalPartsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!Recognition) return undefined;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      const newFinalParts: string[] = [];
      const interimParts: string[] = [];

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';

        if (result.isFinal) {
          newFinalParts.push(text);
        } else {
          interimParts.push(text);
        }
      }

      if (newFinalParts.length > 0) {
        finalPartsRef.current = [...finalPartsRef.current, ...newFinalParts];
        setTranscript(joinTranscript(finalPartsRef.current));
      }
      setInterimTranscript(joinTranscript(interimParts));
    };

    recognition.onerror = (event) => {
      setError(getErrorMessage(event.error));
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch (err) {
        console.warn('[speech] cleanup stop failed:', err);
      }
      recognitionRef.current = null;
    };
  }, [Recognition]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError(unsupportedMessage);
      return;
    }

    try {
      setError(null);
      recognitionRef.current.start();
    } catch (err) {
      console.error('[speech] failed to start recognition:', err);
      setError('Unable to start speech recognition.');
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.warn('[speech] failed to stop recognition:', err);
      setError('Unable to stop speech recognition.');
    }
  }, []);

  const resetTranscript = useCallback(() => {
    finalPartsRef.current = [];
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  return {
    supported: Boolean(Recognition),
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
