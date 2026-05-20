import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToastStore } from '@/stores/useToastStore';
import type {
  BrowserSpeechSynthesisWindow,
  SpeechSynthesisLike,
  SpeechSynthesisUtteranceConstructor,
  SpeechSynthesisUtteranceLike,
  UseTextToSpeechReturn,
} from '@/types/speech';

const unsupportedMessage = 'Text-to-speech is not supported in this browser.';
const synthesisErrorMessage = 'Unable to read this message aloud.';

type SpeechApi = {
  synthesis: SpeechSynthesisLike;
  Utterance: SpeechSynthesisUtteranceConstructor;
};

function getSpeechApi(): SpeechApi | null {
  if (typeof window === 'undefined') return null;

  const speechWindow = window as unknown as BrowserSpeechSynthesisWindow;
  if (!speechWindow.speechSynthesis || !speechWindow.SpeechSynthesisUtterance) return null;

  return {
    synthesis: speechWindow.speechSynthesis,
    Utterance: speechWindow.SpeechSynthesisUtterance,
  };
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const api = useMemo(() => getSpeechApi(), []);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtteranceLike | null>(null);

  const stop = useCallback(() => {
    if (!api) {
      setIsSpeaking(false);
      return;
    }

    try {
      api.synthesis.cancel();
      setIsSpeaking(false);
    } catch (err) {
      console.warn('[speech] failed to stop synthesis:', err);
      setError(synthesisErrorMessage);
      useToastStore.getState().show(synthesisErrorMessage, 'error');
    }
  }, [api]);

  const speak = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (!api) {
        setError(unsupportedMessage);
        setIsSpeaking(false);
        return;
      }

      try {
        api.synthesis.cancel();

        const utterance = new api.Utterance(trimmed);
        utterance.lang = 'en-US';
        utterance.rate = 0.95;
        utterance.pitch = 1;

        utterance.onstart = () => {
          setError(null);
          setIsSpeaking(true);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
        };

        utterance.onerror = (event) => {
          console.error('[speech] synthesis error:', event);
          setError(synthesisErrorMessage);
          setIsSpeaking(false);
          useToastStore.getState().show(synthesisErrorMessage, 'error');
        };

        utteranceRef.current = utterance;
        setError(null);
        api.synthesis.speak(utterance);
      } catch (err) {
        console.error('[speech] failed to start synthesis:', err);
        setError(synthesisErrorMessage);
        setIsSpeaking(false);
        useToastStore.getState().show(synthesisErrorMessage, 'error');
      }
    },
    [api],
  );

  useEffect(() => {
    return () => {
      if (utteranceRef.current) {
        utteranceRef.current.onstart = null;
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
      }

      if (!api) return;

      try {
        api.synthesis.cancel();
      } catch (err) {
        console.warn('[speech] cleanup cancel failed:', err);
      }
    };
  }, [api]);

  return {
    supported: Boolean(api),
    isSpeaking,
    error,
    speak,
    stop,
  };
}
