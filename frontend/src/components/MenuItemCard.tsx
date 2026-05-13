// A single menu card in the grid. Tapping the body opens the detail
// modal; tapping the round + button does an inline add (scale-pop
// animation, then `useCartStore.addItem`).
import { useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { Tag } from '@/components/Tag';
import { useCartStore } from '@/stores/useCartStore';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { shadows } from '@/theme/shadows';
import { type } from '@/theme/typography';
import { formatMoney } from '@/lib/format';
import type { MenuItem } from '@/types/api';

interface MenuItemCardProps {
  item: MenuItem;
  index: number;
  onPress: () => void;
}

const BLUR_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="%23E2D9CC"/></svg>';

export function MenuItemCard({ item, index, onPress }: MenuItemCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const reduced = useReducedMotion();

  // Card entrance — staggered slide + fade. Gate to the first render
  // only via a ref: `index` is in the dependency array of any version
  // that listed it, so filter/search reorders would otherwise re-play
  // the stagger on every category switch. Honor reduce-motion: skip
  // the spring entirely and start at rest.
  const enterY = useSharedValue(reduced ? 0 : 16);
  const enterOpacity = useSharedValue(reduced ? 1 : 0);
  const hasAnimated = useRef(false);
  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    if (reduced) {
      enterY.value = 0;
      enterOpacity.value = 1;
      return;
    }
    enterY.value = withDelay(index * 60, withSpring(0, springs.snappy));
    enterOpacity.value = withDelay(
      index * 60,
      withSpring(1, { ...springs.snappy, damping: 25 }),
    );
    // We intentionally do not depend on `index` (would re-trigger on
    // filter/search reorders) or `reduced` (only meaningful at mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const enterStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: enterY.value }],
    opacity: enterOpacity.value,
  }));

  // Add button scale-pop on press. Skip the bounce under reduce-motion.
  const addScale = useSharedValue(1);
  const addStyle = useAnimatedStyle(() => ({ transform: [{ scale: addScale.value }] }));

  const handleAdd = () => {
    if (!reduced) {
      addScale.value = withSequence(
        withSpring(0.88, springs.snappy),
        withSpring(1.0, springs.bounce),
      );
    }
    addItem({ menuItemId: item.id, name: item.name, unitPrice: item.price }, 1);
  };

  return (
    <Animated.View
      style={[
        enterStyle,
        shadows.card,
        {
          backgroundColor: colors.bg.elevated,
          borderRadius: 16,
          overflow: 'hidden',
          flex: 1,
        },
      ]}
    >
      <Pressable onPress={onPress} testID={`menu-card-${item.id}`}>
        <Image
          source={{ uri: item.imageUrl }}
          placeholder={{ uri: BLUR_PLACEHOLDER }}
          style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.bg.secondary }}
          contentFit="cover"
          transition={200}
        />
        <View style={{ padding: 12, gap: 6 }}>
          <Text numberOfLines={1} style={[type.heading, { color: colors.text.primary }]}>
            {item.name}
          </Text>
          <Text
            numberOfLines={2}
            style={[type.caption, { color: colors.text.secondary, minHeight: 36 }]}
          >
            {item.description}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={[type.price, { color: colors.brand.primary }]}>
              {formatMoney(item.price)}
            </Text>
            <Animated.View style={addStyle}>
              <Pressable
                accessibilityRole="button"
                onPress={handleAdd}
                testID={`menu-add-${item.id}`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  backgroundColor: colors.brand.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="add" size={22} color={colors.text.inverse} />
              </Pressable>
            </Animated.View>
          </View>
          {item.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {item.tags.slice(0, 3).map((t) => (
                <Tag key={t} label={t} />
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
