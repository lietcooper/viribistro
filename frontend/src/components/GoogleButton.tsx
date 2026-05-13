// "Continue with Google" pill. Mirrors PrimaryButton's press animation,
// but is rendered as a light-surface secondary CTA.
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';

interface GoogleButtonProps {
  onPress: () => void;
  loading?: boolean;
  testID?: string;
}

export function GoogleButton({ onPress, loading, testID }: GoogleButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    if (loading) return;
    scale.value = withSequence(
      withSpring(0.94, springs.snappy),
      withSpring(1.0, springs.bounce),
    );
    onPress();
  };

  return (
    <Animated.View style={[animStyle, { width: '100%' }]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        onPress={handlePress}
        disabled={loading}
        className={`flex-row items-center justify-center px-6 py-4 rounded-full bg-bg-elevated border border-border ${
          loading ? 'opacity-60' : ''
        }`}
      >
        {loading ? (
          <ActivityIndicator color={colors.text.primary} />
        ) : (
          <>
            <View style={{ marginRight: 12 }}>
              <AntDesign name="google" size={18} color={colors.text.primary} />
            </View>
            <Text
              style={{
                fontFamily: 'DMSans-Medium',
                fontSize: 14,
                lineHeight: 20,
                color: colors.text.primary,
              }}
            >
              Continue with Google
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}
