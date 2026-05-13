// A tiny numeric pill that rides on the corner of the cart icon. Bounces
// (spring 1.4 → 1.0) every time the cart item count changes, and hides
// itself entirely when the count is zero.
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { useCartTotal } from '@/stores/useCartStore';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';

export function CartBadge() {
  const { itemCount } = useCartTotal();
  const previous = useRef(itemCount);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (itemCount === previous.current) return;
    previous.current = itemCount;
    if (itemCount === 0) return;
    scale.value = withSequence(
      withSpring(1.4, springs.bounce),
      withSpring(1.0, springs.snappy),
    );
  }, [itemCount, scale]);

  // Call every hook before any early return — moving useAnimatedStyle
  // below the `itemCount === 0` branch is a Rules of Hooks violation
  // that crashes the render tree the first time the cart goes 0→1.
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (itemCount === 0) {
    return <View testID="cart-badge-hidden" />;
  }

  return (
    <Animated.View
      testID="cart-badge"
      style={[
        style,
        {
          position: 'absolute',
          top: -6,
          right: -10,
          minWidth: 18,
          height: 18,
          borderRadius: 999,
          backgroundColor: colors.brand.primary,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
        },
      ]}
    >
      <Text
        style={{
          color: colors.text.inverse,
          fontFamily: 'DMSans-Medium',
          fontSize: 11,
          lineHeight: 14,
        }}
      >
        {itemCount}
      </Text>
    </Animated.View>
  );
}
