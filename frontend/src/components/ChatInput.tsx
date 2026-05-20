// The fixed-bottom input bar for the chat screen. The send button
// disables itself when the field is empty or while the agent is typing.
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useToastStore } from '@/stores/useToastStore';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { type } from '@/theme/typography';

interface ChatInputProps {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [text, setText] = useState('');
  const {
    supported: speechSupported,
    isListening,
    transcript,
    interimTranscript,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechToText();
  const showToast = useToastStore((s) => s.show);
  const reducedMotion = useReducedMotion();
  const micScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  const canSend = !disabled && text.trim().length > 0;
  const canUseMic = !disabled && speechSupported;

  useEffect(() => {
    if (transcript.trim().length > 0) {
      setText(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (speechError) {
      showToast(speechError, 'error');
    }
  }, [showToast, speechError]);

  useEffect(() => {
    if (disabled && isListening) {
      stopListening();
    }
  }, [disabled, isListening, stopListening]);

  useEffect(
    () => () => {
      stopListening();
    },
    [stopListening],
  );

  useEffect(() => {
    if (reducedMotion) {
      micScale.value = 1;
      ringOpacity.value = isListening ? 1 : 0;
      return;
    }

    if (isListening) {
      micScale.value = withRepeat(withTiming(1.08, { duration: 650 }), -1, true);
      ringOpacity.value = withRepeat(withTiming(0.28, { duration: 650 }), -1, true);
      return;
    }

    micScale.value = withSpring(1, springs.snappy);
    ringOpacity.value = withTiming(0, { duration: 160 });
  }, [isListening, micScale, reducedMotion, ringOpacity]);

  const micAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
  }));

  const submit = () => {
    if (!canSend) return;
    stopListening();
    resetTranscript();
    onSend(text);
    setText('');
  };

  const toggleSpeech = () => {
    if (!canUseMic) return;
    if (isListening) {
      stopListening();
      return;
    }
    resetTranscript();
    startListening();
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 14,
        backgroundColor: colors.bg.elevated,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg.secondary,
          borderRadius: 24,
          paddingHorizontal: 16,
          paddingVertical: 4,
        }}
      >
        <TextInput
          testID="chat-input"
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          editable={!disabled}
          placeholder="Ask me anything…"
          placeholderTextColor={colors.text.tertiary}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline
          style={{
            fontFamily: 'DMSans-Regular',
            fontSize: 16,
            color: colors.text.primary,
            paddingVertical: 8,
            maxHeight: 96,
          }}
        />
        {isListening && interimTranscript.trim().length > 0 ? (
          <Text
            testID="chat-interim-transcript"
            style={[
              type.caption,
              {
                color: colors.text.tertiary,
                paddingBottom: 6,
              },
            ]}
          >
            {interimTranscript}
          </Text>
        ) : null}
      </View>
      {speechSupported ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isListening ? 'Stop voice input' : 'Start voice input'}
          testID="chat-mic"
          onPress={toggleSpeech}
          disabled={!canUseMic}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isListening ? colors.bg.elevated : colors.bg.secondary,
            borderWidth: isListening ? 1 : 0,
            borderColor: colors.brand.primary,
            opacity: canUseMic ? 1 : 0.5,
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              ringAnimatedStyle,
              {
                position: 'absolute',
                width: 40,
                height: 40,
                borderRadius: 999,
                backgroundColor: colors.brand.primary,
              },
            ]}
          />
          <Animated.View style={micAnimatedStyle}>
            <Ionicons
              name={isListening ? 'mic' : 'mic-outline'}
              size={20}
              color={isListening ? colors.brand.primary : colors.text.tertiary}
            />
          </Animated.View>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        testID="chat-send"
        onPress={submit}
        disabled={!canSend}
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: canSend ? colors.brand.primary : colors.bg.secondary,
          opacity: canSend ? 1 : 0.6,
        }}
      >
        <Ionicons
          name="arrow-up"
          size={20}
          color={canSend ? colors.text.inverse : colors.text.tertiary}
        />
      </Pressable>
    </View>
  );
}
