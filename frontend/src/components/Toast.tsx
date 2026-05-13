// Floating pill near the top of the screen. Slides + fades in when
// `useToastStore.show()` is called, auto-hides after a short duration.
// Tap to dismiss early.
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

import { useToastStore, type ToastTone } from '@/stores/useToastStore';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { shadows } from '@/theme/shadows';

const AUTO_HIDE_MS = 3200;

function styleFor(tone: ToastTone) {
  switch (tone) {
    case 'success':
      return { bg: colors.success, fg: colors.text.inverse, icon: 'checkmark-circle' as const };
    case 'error':
      return { bg: colors.error, fg: colors.text.inverse, icon: 'alert-circle' as const };
    default:
      return { bg: colors.bg.inverse, fg: colors.text.inverse, icon: 'information-circle' as const };
  }
}

export function Toast() {
  const visible = useToastStore((s) => s.visible);
  const message = useToastStore((s) => s.message);
  const tone = useToastStore((s) => s.tone);
  const shownAt = useToastStore((s) => s.shownAt);
  const hide = useToastStore((s) => s.hide);

  const reduced = useReducedMotion();
  const translateY = useSharedValue(reduced ? 0 : -40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      if (reduced) {
        translateY.value = 0;
        opacity.value = 1;
      } else {
        translateY.value = withSpring(0, springs.snappy);
        opacity.value = withTiming(1, { duration: 180 });
      }
      const t = setTimeout(hide, AUTO_HIDE_MS);
      return () => clearTimeout(t);
    }
    if (reduced) {
      opacity.value = 0;
    } else {
      opacity.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(-40, { duration: 180 });
    }
    return undefined;
  }, [visible, shownAt, reduced, hide, translateY, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;
  const { bg, fg, icon } = styleFor(tone);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        animStyle,
        {
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 100,
        },
      ]}
    >
      <Pressable onPress={hide} testID="toast" hitSlop={8}>
        <View
          style={[
            shadows.elevated,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: bg,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              maxWidth: 380,
            },
          ]}
        >
          <Ionicons name={icon} size={16} color={fg} />
          <Text
            style={{
              fontFamily: 'DMSans-Medium',
              fontSize: 13,
              color: fg,
            }}
          >
            {message}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
