// Order confirmation screen. The animation sequence reads:
//   1. green ring scales in with a bounce spring
//   2. checkmark path strokes in via dashoffset
//   3. a small confetti burst radiates outward
//   4. the title + caption slide / fade in below
//
// Reduced-motion users get the same end state without the animation —
// the ring, checkmark, and text are all drawn at their final positions.
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { ScreenContainer } from '@/components/ScreenContainer';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { type } from '@/theme/typography';

interface OrderSuccessScreenProps {
  onDismiss?: () => void;
  autoDismissMs?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 112;
const CHECK_PATH = 'M30 58 L48 76 L82 36';
// Approximate path length — slightly over-provisioned so the dash math
// is forgiving across rasterizers.
const CHECK_PATH_LENGTH = 90;

// Radial positions for the confetti burst.
const CONFETTI = [
  { angle: -80, color: colors.brand.primary },
  { angle: -30, color: colors.brand.light },
  { angle: 20, color: colors.success },
  { angle: 80, color: colors.brand.primary },
  { angle: 140, color: colors.brand.light },
  { angle: -130, color: colors.success },
];

function ConfettiDot({
  angle,
  color,
  start,
  reduced,
}: {
  angle: number;
  color: string;
  start: number;
  reduced: boolean;
}) {
  const progress = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      start,
      withSpring(1, { damping: 14, stiffness: 180, mass: 0.7 }),
    );
  }, [progress, reduced, start]);

  const rad = (angle * Math.PI) / 180;
  const distance = 70;

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        { translateX: Math.cos(rad) * distance * p },
        { translateY: Math.sin(rad) * distance * p },
        { scale: 0.4 + p * 0.6 },
      ],
      opacity: reduced ? 0 : Math.max(0, 1 - p),
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 999,
          backgroundColor: color,
        },
      ]}
    />
  );
}

export function OrderSuccessScreen({
  onDismiss,
  autoDismissMs = 2400,
}: OrderSuccessScreenProps = {}) {
  const reduced = useReducedMotion();

  const ringScale = useSharedValue(reduced ? 1 : 0.6);
  const ringOpacity = useSharedValue(reduced ? 1 : 0);
  const checkDashOffset = useSharedValue(reduced ? 0 : CHECK_PATH_LENGTH);
  const titleY = useSharedValue(reduced ? 0 : 20);
  const titleOpacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) {
      ringOpacity.value = withTiming(1, { duration: 220 });
      ringScale.value = withSpring(1, springs.bounce);
      checkDashOffset.value = withDelay(220, withTiming(0, { duration: 360 }));
      titleY.value = withDelay(360, withSpring(0, springs.modal));
      titleOpacity.value = withDelay(360, withTiming(1, { duration: 280 }));
    }

    if (autoDismissMs > 0 && onDismiss) {
      const t = setTimeout(onDismiss, autoDismissMs);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [
    autoDismissMs,
    onDismiss,
    reduced,
    checkDashOffset,
    ringOpacity,
    ringScale,
    titleOpacity,
    titleY,
  ]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));
  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: checkDashOffset.value,
  }));

  return (
    <ScreenContainer background={colors.bg.primary}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View
          style={{
            width: RING_SIZE * 2,
            height: RING_SIZE * 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {CONFETTI.map((dot, i) => (
            <ConfettiDot
              key={i}
              angle={dot.angle}
              color={dot.color}
              start={420 + i * 40}
              reduced={reduced}
            />
          ))}

          <Animated.View
            style={[
              ringStyle,
              {
                width: RING_SIZE,
                height: RING_SIZE,
                borderRadius: 999,
                backgroundColor: colors.success,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
            testID="order-success-ring"
          >
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 112 112">
              <AnimatedCircle
                cx={56}
                cy={56}
                r={54}
                stroke={colors.text.inverse}
                strokeOpacity={0.18}
                strokeWidth={2}
                fill="none"
              />
              <AnimatedPath
                d={CHECK_PATH}
                stroke={colors.text.inverse}
                strokeWidth={9}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={CHECK_PATH_LENGTH}
                animatedProps={checkProps}
              />
            </Svg>
          </Animated.View>
        </View>

        <Animated.View style={[titleStyle, { marginTop: 24, alignItems: 'center' }]}>
          <Text style={[type.title, { color: colors.text.primary }]}>Order confirmed</Text>
          <Text
            style={[
              type.caption,
              { color: colors.text.secondary, marginTop: 6, textAlign: 'center' },
            ]}
          >
            We'll have it ready in just a moment.
          </Text>
        </Animated.View>
      </View>
    </ScreenContainer>
  );
}
