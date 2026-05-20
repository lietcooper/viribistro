// Full-screen detail modal. Opens when a menu card is tapped. Includes
// a quantity stepper, the full description, and a primary "Add to cart"
// CTA that closes the modal and merges into the cart store.
import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Tag } from '@/components/Tag';
import { addDecimalPrices, useCartStore } from '@/stores/useCartStore';
import { colors } from '@/theme/colors';
import { type } from '@/theme/typography';
import { formatMoney } from '@/lib/format';
import type { MenuCustomizationGroup, MenuCustomizationOption, MenuItem } from '@/types/api';

interface MenuItemModalProps {
  item: MenuItem | null;
  onClose: () => void;
}

const NOTE_MAX_LENGTH = 200;

export function MenuItemModal({ item, onClose }: MenuItemModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const addItem = useCartStore((s) => s.addItem);
  const { height } = useWindowDimensions();

  // RN's Modal keeps children mounted across open/close cycles, so a
  // one-shot `useState(1)` would leak the previous item's quantity into
  // the next one. Reset whenever the underlying item changes (open,
  // close, or swap from one card to another without closing in between).
  useEffect(() => {
    if (item) {
      setQuantity(1);
      setSelectedByGroup({});
      setNote('');
    }
  }, [item?.id]);

  if (!item) return null;

  const imageHeight = Math.max(180, Math.min(280, Math.round(height * 0.34)));
  const customizationGroups = item.customizationGroups ?? [];

  const optionById = new Map<string, MenuCustomizationOption>();
  for (const group of customizationGroups) {
    for (const option of group.options) optionById.set(option.id, option);
  }

  const selectedDelta = Object.values(selectedByGroup)
    .flat()
    .reduce(
      (sum, optionId) => addDecimalPrices(sum, optionById.get(optionId)?.priceDelta),
      '0.00',
    );
  const adjustedUnitPrice = addDecimalPrices(item.price, selectedDelta);
  const totalPrice = addDecimalPrices(
    ...Array.from({ length: quantity }, () => adjustedUnitPrice),
  );

  const validationError = getValidationError(customizationGroups, selectedByGroup);

  const toggleOption = (group: MenuCustomizationGroup, option: MenuCustomizationOption) => {
    if (!option.available) return;
    setSelectedByGroup((current) => {
      const prev = current[group.id] ?? [];
      const exists = prev.includes(option.id);
      const maxSelections = maxSelectionsFor(group);
      const next =
        maxSelections === 1
          ? exists
            ? []
            : [option.id]
          : exists
            ? prev.filter((id) => id !== option.id)
            : prev.length >= maxSelections
              ? prev
              : [...prev, option.id];
      return { ...current, [group.id]: next };
    });
  };

  const submit = () => {
    if (validationError) return;
    const customizations = customizationGroups
      .map((group) => {
        const selectedIds = selectedByGroup[group.id] ?? [];
        const selectedOptions = group.options.filter((option) =>
          selectedIds.includes(option.id),
        );
        return {
          groupId: group.id,
          groupName: group.name,
          optionIds: selectedOptions.map((option) => option.id),
          optionNames: selectedOptions.map((option) => option.name),
          priceDelta: addDecimalPrices(...selectedOptions.map((option) => option.priceDelta)),
        };
      })
      .filter((customization) => customization.optionIds.length > 0);

    const trimmedNote = note.trim();
    addItem(
      {
        menuItemId: item.id,
        name: item.name,
        unitPrice: adjustedUnitPrice,
        customizations,
        note: trimmedNote.length > 0 ? trimmedNote : undefined,
      },
      quantity,
    );
    setQuantity(1);
    setSelectedByGroup({});
    setNote('');
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

            {customizationGroups.map((group) => {
              const selectedIds = selectedByGroup[group.id] ?? [];
              const maxSelections = maxSelectionsFor(group);
              return (
                <View key={group.id} style={{ marginTop: 6, gap: 8 }}>
                  <View>
                    <Text style={[type.label, { color: colors.text.primary }]}>
                      {group.name}
                      {group.required ? ' *' : ''}
                    </Text>
                    <Text style={[type.caption, { color: colors.text.secondary }]}>
                      {selectionHint(group)}
                    </Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {group.options.map((option) => {
                      const selected = selectedIds.includes(option.id);
                      const disabled =
                        !option.available ||
                        (!selected &&
                          selectedIds.length >= maxSelections &&
                          maxSelections > 1);
                      const priceDelta = Number(option.priceDelta);
                      const priceLabel =
                        priceDelta === 0
                          ? ''
                          : `${priceDelta > 0 ? '+' : '-'}${formatMoney(Math.abs(priceDelta))}`;
                      return (
                        <Pressable
                          key={option.id}
                          testID={`customization-option-${group.id}-${option.id}`}
                          accessibilityRole={maxSelections === 1 ? 'radio' : 'checkbox'}
                          accessibilityState={{ checked: selected, disabled }}
                          disabled={disabled}
                          onPress={() => toggleOption(group, option)}
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: selected ? colors.brand.primary : colors.border,
                            backgroundColor: selected
                              ? colors.brand.alpha10
                              : colors.bg.secondary,
                            opacity: disabled ? 0.45 : pressed ? 0.78 : 1,
                          })}
                        >
                          <View
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                          >
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: maxSelections === 1 ? 999 : 5,
                                borderWidth: 1,
                                borderColor: selected
                                  ? colors.brand.primary
                                  : colors.text.tertiary,
                                backgroundColor: selected
                                  ? colors.brand.primary
                                  : colors.bg.elevated,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {selected ? (
                                <Ionicons
                                  name="checkmark"
                                  size={13}
                                  color={colors.text.inverse}
                                />
                              ) : null}
                            </View>
                            <Text style={[type.label, { color: colors.text.primary }]}>
                              {option.name}
                            </Text>
                          </View>
                          {priceLabel ? (
                            <Text style={[type.caption, { color: colors.text.secondary }]}>
                              {priceLabel}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <View style={{ marginTop: 6, gap: 8 }}>
              <View>
                <Text style={[type.label, { color: colors.text.primary }]}>
                  Special instructions
                </Text>
                <Text style={[type.caption, { color: colors.text.secondary }]}>
                  Optional — anything the kitchen should know
                </Text>
              </View>
              <TextInput
                testID="menu-item-modal-note"
                value={note}
                onChangeText={(next) =>
                  setNote(
                    next.length > NOTE_MAX_LENGTH ? next.slice(0, NOTE_MAX_LENGTH) : next,
                  )
                }
                placeholder="e.g. allergic to peanuts, extra crispy"
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={3}
                maxLength={NOTE_MAX_LENGTH}
                autoCorrect={false}
                style={[
                  type.body,
                  {
                    color: colors.text.primary,
                    backgroundColor: colors.bg.secondary,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 72,
                    textAlignVertical: 'top',
                  },
                ]}
              />
              <Text
                style={[type.caption, { color: colors.text.tertiary, alignSelf: 'flex-end' }]}
              >
                {note.length}/{NOTE_MAX_LENGTH}
              </Text>
            </View>

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
          {validationError ? (
            <Text
              testID="menu-item-modal-validation"
              style={[type.caption, { color: colors.error, marginBottom: 8 }]}
            >
              {validationError}
            </Text>
          ) : null}
          <PrimaryButton
            label={`Add ${quantity} to cart · ${formatMoney(totalPrice)}`}
            onPress={submit}
            disabled={Boolean(validationError)}
            fullWidth
            testID="menu-item-modal-add"
          />
        </View>
      </View>
    </View>
  );
}

function selectionHint(group: MenuCustomizationGroup): string {
  const min = minSelectionsFor(group);
  const max = maxSelectionsFor(group);
  if (max <= 1) return group.required ? 'Choose one' : 'Choose up to one';
  if (min > 0) return `Choose ${min}-${max}`;
  return `Choose up to ${max}`;
}

function getValidationError(
  groups: MenuCustomizationGroup[],
  selectedByGroup: Record<string, string[]>,
): string | null {
  for (const group of groups) {
    const selectedCount = selectedByGroup[group.id]?.length ?? 0;
    const min = minSelectionsFor(group);
    if (selectedCount < min) return `Please choose ${group.name.toLowerCase()}.`;
  }
  return null;
}

function minSelectionsFor(group: MenuCustomizationGroup): number {
  const min = group.minSelections ?? group.minSelect ?? 0;
  return group.required ? Math.max(1, min) : min;
}

function maxSelectionsFor(group: MenuCustomizationGroup): number {
  return Math.max(1, group.maxSelections ?? group.maxSelect ?? 1);
}
