// Order confirmation screen. Polished in task 13 with the checkmark
// stroke draw and confetti — for now we render a clean success state
// that auto-dismisses back to the Orders tab.
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ScreenContainer } from '@/components/ScreenContainer';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { type } from '@/theme/typography';

interface OrderSuccessScreenProps {
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export function OrderSuccessScreen({
  onDismiss,
  autoDismissMs = 2000,
}: OrderSuccessScreenProps = {}) {
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const titleY = useSharedValue(20);
  const titleOpacity = useSharedValue(0);

  useEffect(() => {
    ringOpacity.value = withTiming(1, { duration: 220 });
    ringScale.value = withSpring(1, springs.bounce);
    titleY.value = withDelay(120, withSpring(0, springs.modal));
    titleOpacity.value = withDelay(120, withTiming(1, { duration: 240 }));

    if (autoDismissMs > 0 && onDismiss) {
      const t = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [autoDismissMs, onDismiss, ringOpacity, ringScale, titleOpacity, titleY]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  return (
    <ScreenContainer background={colors.bg.primary}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Animated.View
          style={[
            ringStyle,
            {
              width: 96,
              height: 96,
              borderRadius: 999,
              backgroundColor: colors.success,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <Ionicons name="checkmark" size={56} color={colors.text.inverse} />
        </Animated.View>

        <Animated.View style={[titleStyle, { marginTop: 24, alignItems: 'center' }]}>
          <Text style={[type.title, { color: colors.text.primary }]}>Order confirmed</Text>
          <Text
            style={[
              type.caption,
              { color: colors.text.secondary, marginTop: 6, textAlign: 'center' },
            ]}
          >
            We'll have it ready in just a moment.
          </Text>
        </Animated.View>
      </View>
    </ScreenContainer>
  );
}
