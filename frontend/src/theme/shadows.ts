// Elevation tokens. Pass these to a View's `style` prop. NativeWind can't
// express shadow* props from Tailwind directly on RN, so we keep them as
// JS objects.
import { type ViewStyle } from 'react-native';

export const shadows: Record<'card' | 'elevated' | 'bottomSheet', ViewStyle> = {
  card: {
    shadowColor: '#1C1A17',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#1C1A17',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  bottomSheet: {
    shadowColor: '#1C1A17',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 16,
  },
};
