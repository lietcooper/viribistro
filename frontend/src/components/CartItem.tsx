// A single row in the cart drawer. Quantity stepper on the right, swipe
// left to reveal a destructive delete action. The visible × button is
// always available so the gesture isn't required — that one is what
// jest exercises in the cart drawer test.
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { useCartStore } from '@/stores/useCartStore';
import { colors } from '@/theme/colors';
import { formatMoney } from '@/lib/format';
import type { CartItem as CartItemType } from '@/types/api';

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const swipeRef = useRef<Swipeable | null>(null);
  const modifyItem = useCartStore((s) => s.modifyItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const handleRemove = () => {
    swipeRef.current?.close();
    removeItem(item.menuItemId);
  };

  const renderRightActions = () => (
    <Pressable
      onPress={handleRemove}
      testID={`cart-row-swipe-delete-${item.menuItemId}`}
      style={{
        backgroundColor: colors.error,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        marginVertical: 4,
        borderRadius: 12,
      }}
    >
      <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          backgroundColor: colors.bg.elevated,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: 'DMSans-SemiBold',
              fontSize: 16,
              color: colors.text.primary,
            }}
          >
            {item.name}
          </Text>
          <Text
            style={{
              fontFamily: 'DMSans-Medium',
              fontSize: 13,
              color: colors.text.secondary,
              marginTop: 2,
            }}
          >
            {formatMoney(item.unitPrice)} each
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            testID={`cart-row-decrement-${item.menuItemId}`}
            onPress={() => modifyItem(item.menuItemId, item.quantity - 1)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              backgroundColor: colors.bg.secondary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="remove" size={16} color={colors.text.primary} />
          </Pressable>
          <Text
            style={{
              fontFamily: 'DMSans-SemiBold',
              fontSize: 16,
              color: colors.text.primary,
              minWidth: 18,
              textAlign: 'center',
            }}
            testID={`cart-row-qty-${item.menuItemId}`}
          >
            {item.quantity}
          </Text>
          <Pressable
            testID={`cart-row-increment-${item.menuItemId}`}
            onPress={() => modifyItem(item.menuItemId, item.quantity + 1)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              backgroundColor: colors.brand.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="add" size={16} color={colors.text.inverse} />
          </Pressable>
          <Pressable
            testID={`cart-row-remove-${item.menuItemId}`}
            onPress={handleRemove}
            hitSlop={8}
            style={{ marginLeft: 4 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.text.tertiary} />
          </Pressable>
        </View>
      </View>
    </Swipeable>
  );
}
