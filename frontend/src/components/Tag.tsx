// Small dietary / signature pill rendered on menu cards and detail
// modal. The visual variant is implied by the tag string.
import { Text, View } from 'react-native';

import { colors } from '@/theme/colors';

interface TagProps {
  label: string;
}

function colorsFor(label: string): { bg: string; fg: string } {
  switch (label) {
    case 'spicy':
      return { bg: '#FEE7DA', fg: colors.brand.dark };
    case 'vegan':
    case 'vegetarian':
      return { bg: '#E4F0DC', fg: colors.success };
    case 'signature':
      return { bg: '#FBEBC8', fg: '#8B6A1A' };
    case 'gluten-free':
      return { bg: '#E8E1FA', fg: '#4F3A8A' };
    default:
      return { bg: colors.bg.secondary, fg: colors.text.secondary };
  }
}

export function Tag({ label }: TagProps) {
  const { bg, fg } = colorsFor(label);
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontFamily: 'DMSans-Medium',
          fontSize: 11,
          lineHeight: 16,
          color: fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
