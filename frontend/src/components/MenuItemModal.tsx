// Full-screen detail modal. Opens when a menu card is tapped. Includes
// a quantity stepper, the full description, and a primary "Add to cart"
// CTA that closes the modal and merges into the cart store.
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Tag } from '@/components/Tag';
import { useCartStore } from '@/stores/useCartStore';
import { colors } from '@/theme/colors';
import { type } from '@/theme/typography';
import { formatMoney } from '@/lib/format';
import type { MenuItem } from '@/types/api';

interface MenuItemModalProps {
  item: MenuItem | null;
  onClose: () => void;
}

export function MenuItemModal({ item, onClose }: MenuItemModalProps) {
  const [quantity, setQuantity] = useState(1);
  const addItem = useCartStore((s) => s.addItem);
  const { height } = useWindowDimensions();

  // RN's Modal keeps children mounted across open/close cycles, so a
  // one-shot `useState(1)` would leak the previous item's quantity into
  // the next one. Reset whenever the underlying item changes (open,
  // close, or swap from one card to another without closing in between).
  useEffect(() => {
    if (item) setQuantity(1);
  }, [item?.id]);

  if (!item) return null;

  const imageHeight = Math.max(180, Math.min(280, Math.round(height * 0.34)));

  const submit = () => {
    addItem({ menuItemId: item.id, name: item.name, unitPrice: item.price }, quantity);
    setQuantity(1);
    onClose();
  };

  return (
    <View
      testID="menu-item-modal"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 100,
        elevation: 100,
        alignItems: 'center',
        backgroundColor: colors.bg.primary,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 480,
          flex: 1,
          backgroundColor: colors.bg.elevated,
        }}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          testID="menu-item-modal-close"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            width: 36,
            height: 36,
            borderRadius: 999,
            backgroundColor: colors.bg.elevated,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
        >
          <Ionicons name="close" size={22} color={colors.text.primary} />
        </Pressable>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <Image
            source={{ uri: item.imageUrl }}
            style={{
              width: '100%',
              height: imageHeight,
              backgroundColor: colors.bg.secondary,
            }}
            contentFit="cover"
            transition={200}
          />
          <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 14 }}>
            <Text style={[type.title, { color: colors.text.primary }]}>{item.name}</Text>
            <Text style={[type.price, { color: colors.brand.primary }]}>
              {formatMoney(item.price)}
            </Text>
            <Text style={[type.body, { color: colors.text.secondary }]}>
              {item.description}
            </Text>
            {item.tags.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {item.tags.map((t) => (
                  <Tag key={t} label={t} />
                ))}
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              <Text style={[type.label, { color: colors.text.secondary }]}>Quantity</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Pressable
                  testID="menu-item-modal-decrement"
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    backgroundColor: colors.bg.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="remove" size={20} color={colors.text.primary} />
                </Pressable>
                <Text
                  style={[
                    type.heading,
                    { color: colors.text.primary, minWidth: 24, textAlign: 'center' },
                  ]}
                >
                  {quantity}
                </Text>
                <Pressable
                  testID="menu-item-modal-increment"
                  onPress={() => setQuantity((q) => q + 1)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    backgroundColor: colors.bg.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.text.primary} />
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 24,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.bg.elevated,
          }}
        >
          <PrimaryButton
            label={`Add ${quantity} to cart`}
            onPress={submit}
            fullWidth
            testID="menu-item-modal-add"
          />
        </View>
      </View>
    </View>
  );
}
