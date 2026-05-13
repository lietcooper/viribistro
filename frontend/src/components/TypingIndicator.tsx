// Three-dot pulse rendered while `isTyping === true` in the chat store.
// Each dot is offset in time so the trio reads as a wave, not a flash.
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme/colors';

interface DotProps {
  delay: number;
  reduced: boolean;
}

function Dot({ delay, reduced }: DotProps) {
  const scale = useSharedValue(reduced ? 1 : 0.6);

  useEffect(() => {
    if (reduced) {
      scale.value = 1;
      return;
    }
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.0, { duration: 280, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.6, { duration: 280, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(scale);
  }, [delay, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: 8,
          height: 8,
          borderRadius: 999,
          backgroundColor: colors.text.tertiary,
        },
      ]}
    />
  );
}

export function TypingIndicator() {
  const reduced = useReducedMotion();
  return (
    <View
      testID="typing-indicator"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: colors.bg.secondary,
        borderRadius: 16,
        borderBottomLeftRadius: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Dot delay={0} reduced={reduced} />
      <Dot delay={150} reduced={reduced} />
      <Dot delay={300} reduced={reduced} />
    </View>
  );
}
