// One bubble in the chat thread. User bubbles are right-aligned and
// brand-colored; assistant bubbles sit on the left in a soft surface.
// Each bubble fades + slides in on mount via reanimated; reduced-motion
// users get an instant entrance.
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CartUpdateCard } from '@/components/CartUpdateCard';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { type } from '@/theme/typography';
import type { ChatMessage } from '@/stores/useChatStore';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const reducedMotion = useReducedMotion();

  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const translateY = useSharedValue(reducedMotion ? 0 : 14);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withTiming(1, { duration: 220 });
    translateY.value = withSpring(0, springs.snappy);
  }, [opacity, translateY, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 4,
        },
      ]}
      testID={`chat-bubble-${message.role}`}
    >
      {!isUser ? (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            backgroundColor: colors.brand.primary,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 8,
            marginBottom: 4,
          }}
        >
          <Ionicons name="restaurant" size={14} color={colors.text.inverse} />
        </View>
      ) : null}

      <View style={{ maxWidth: '75%' }}>
        <View
          style={{
            backgroundColor: isUser ? colors.brand.primary : colors.bg.secondary,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 16,
            borderBottomRightRadius: isUser ? 4 : 16,
            borderBottomLeftRadius: isUser ? 16 : 4,
          }}
        >
          <Text
            style={[type.body, { color: isUser ? colors.text.inverse : colors.text.primary }]}
          >
            {message.content}
          </Text>
        </View>

        {!isUser ? <AssistantSpeakButton content={message.content} /> : null}

        {message.cartUpdate ? (
          <View style={{ marginTop: 8 }}>
            <CartUpdateCard cart={message.cartUpdate} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function AssistantSpeakButton({ content }: { content: string }) {
  const { supported, isSpeaking, speak, stop } = useTextToSpeech();

  if (!supported) return null;

  const handlePress = () => {
    if (isSpeaking) {
      stop();
      return;
    }

    if (content.trim()) {
      speak(content);
    }
  };

  return (
    <Pressable
      accessibilityLabel={isSpeaking ? 'Stop reading message' : 'Read message aloud'}
      accessibilityRole="button"
      hitSlop={8}
      onPress={handlePress}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
        opacity: pressed ? 0.72 : 1,
      })}
      testID="chat-bubble-speak-button"
    >
      <Ionicons
        name={isSpeaking ? 'volume-high' : 'volume-medium-outline'}
        size={17}
        color={isSpeaking ? colors.brand.primary : colors.text.secondary}
      />
    </Pressable>
  );
}
