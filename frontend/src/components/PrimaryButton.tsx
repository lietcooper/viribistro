// The primary CTA. Handles the scale-pop press animation, loading state,
// and disabled state. Every button in the app reuses this — no flat,
// unweighted buttons anywhere.
import { ActivityIndicator, Pressable, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';

type Variant = 'primary' | 'secondary' | 'ghost';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand',
  secondary: 'bg-bg-secondary border border-border',
  ghost: 'bg-transparent',
};

const labelClasses: Record<Variant, string> = {
  primary: 'text-text-inverse',
  secondary: 'text-text-primary',
  ghost: 'text-brand',
};

export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  fullWidth,
  testID,
}: PrimaryButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.94, springs.snappy),
      withSpring(1.0, springs.bounce),
    );
    onPress();
  };

  return (
    <Animated.View style={[animStyle, fullWidth ? { width: '100%' } : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading }}
        testID={testID}
        className={`items-center justify-center px-6 py-4 rounded-full ${variantClasses[variant]} ${
          disabled ? 'opacity-40' : ''
        }`}
        onPress={handlePress}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? colors.text.inverse : colors.brand.primary}
          />
        ) : (
          <Text
            className={`${labelClasses[variant]}`}
            style={{ fontFamily: 'DMSans-SemiBold', fontSize: 16, lineHeight: 24 }}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
