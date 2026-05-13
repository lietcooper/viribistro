// Horizontal pill bar above the menu grid. Tapping a chip narrows the
// list by category; the "All" chip is selected by default.
import { Pressable, ScrollView, Text } from 'react-native';

import { colors } from '@/theme/colors';
import type { MenuCategory } from '@/types/api';

export type FilterValue = 'all' | MenuCategory;

interface FilterChip {
  value: FilterValue;
  label: string;
}

const CHIPS: FilterChip[] = [
  { value: 'all', label: 'All' },
  { value: 'starters', label: 'Starters' },
  { value: 'mains', label: 'Mains' },
  { value: 'desserts', label: 'Desserts' },
  { value: 'drinks', label: 'Drinks' },
];

interface MenuFilterBarProps {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

export function MenuFilterBar({ value, onChange }: MenuFilterBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4 }}
    >
      {CHIPS.map((chip) => {
        const active = chip.value === value;
        return (
          <Pressable
            key={chip.value}
            testID={`filter-${chip.value}`}
            onPress={() => onChange(chip.value)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? colors.brand.primary : colors.border,
              backgroundColor: active ? colors.brand.primary : colors.bg.secondary,
            }}
          >
            <Text
              style={{
                fontFamily: 'DMSans-Medium',
                fontSize: 14,
                lineHeight: 20,
                color: active ? colors.text.inverse : colors.text.secondary,
              }}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
