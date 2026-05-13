// Horizontal pill bar shown only when the conversation is empty. Tapping
// a chip is the same as typing it and tapping send — the chip scales
// briefly on press so the action feels confirmed before the round-trip.
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';

// Per the project brief: the four canonical suggested prompts when the
// conversation is empty. Keep this list aligned with CLAUDE.md.
const DEFAULT_PROMPTS = [
  "What's on the menu?",
  'Recommend something spicy',
  "Add the chef's special",
  "What's in my cart?",
];

interface SuggestedPromptChipsProps {
  onSelect: (prompt: string) => void;
  // Optional override. ChatScreen passes the agent's per-turn follow-up
  // suggestions; the auth-empty surface omits it and falls back to the
  // brief's canonical four.
  prompts?: string[];
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.94, springs.snappy),
      withSpring(1.0, springs.bounce),
    );
    onPress();
  };

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        onPress={handlePress}
        testID={`prompt-chip-${label}`}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <Text
          style={{
            fontFamily: 'DMSans-Medium',
            fontSize: 13,
            color: colors.text.secondary,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function SuggestedPromptChips({
  onSelect,
  prompts,
}: SuggestedPromptChipsProps) {
  const list = prompts ?? DEFAULT_PROMPTS;
  return (
    <View style={{ paddingVertical: 4 }} testID="prompt-chips">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      >
        {list.map((p) => (
          <Chip key={p} label={p} onPress={() => onSelect(p)} />
        ))}
      </ScrollView>
    </View>
  );
}
