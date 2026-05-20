// Inline confirmation card rendered under an assistant bubble whenever
// the agent updates the cart. Renders the line items the agent touched
// plus the new total, so the user gets a visual receipt right next to
// the chat reply.
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { formatMoney } from '@/lib/format';
import {
  cartLineId,
  lineTotal,
  selectedCustomizationOptionNames,
} from '@/stores/useCartStore';
import { type } from '@/theme/typography';
import type { Cart } from '@/types/api';

interface CartUpdateCardProps {
  cart: Cart;
}

export function CartUpdateCard({ cart }: CartUpdateCardProps) {
  const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <View
      testID="cart-update-card"
      style={{
        backgroundColor: colors.brand.alpha10,
        borderColor: colors.brand.alpha30,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="bag-handle" size={14} color={colors.brand.primary} />
        <Text style={[type.label, { color: colors.brand.primary }]}>
          Cart updated · {itemCount === 1 ? '1 item' : `${itemCount} items`}
        </Text>
      </View>
      {cart.items.slice(0, 3).map((it) => (
        <View key={cartLineId(it)} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={[type.caption, { color: colors.text.primary, flex: 1 }]}
            >
              {it.quantity} × {it.name}
            </Text>
            <Text style={[type.caption, { color: colors.text.secondary }]}>
              {formatMoney(lineTotal(it.unitPrice, it.quantity))}
            </Text>
          </View>
          {it.customizations?.length ? (
            <Text numberOfLines={2} style={[type.caption, { color: colors.text.tertiary }]}>
              {it.customizations
                .map((customization) =>
                  selectedCustomizationOptionNames(customization).join(', '),
                )
                .join(' · ')}
            </Text>
          ) : null}
          {it.note ? (
            <Text
              numberOfLines={2}
              style={[type.caption, { color: colors.text.tertiary, fontStyle: 'italic' }]}
            >
              “{it.note}”
            </Text>
          ) : null}
        </View>
      ))}
      {cart.items.length > 3 ? (
        <Text style={[type.caption, { color: colors.text.tertiary }]}>
          and {cart.items.length - 3} more
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 4,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: colors.brand.alpha20,
        }}
      >
        <Text style={[type.label, { color: colors.text.secondary }]}>Total</Text>
        <Text style={[type.label, { color: colors.text.primary }]}>
          {formatMoney(cart.total)}
        </Text>
      </View>
    </View>
  );
}
