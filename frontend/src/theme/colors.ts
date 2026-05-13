// The single source of truth for every color in the app. NativeWind picks
// these up via tailwind.config.js, so tokens like `bg-bg-primary` and
// `text-brand` resolve to the same hex values used directly here for
// shadows, animated style props, and other places NativeWind can't reach.
export const colors = {
  bg: {
    primary: '#FAF7F2',
    secondary: '#F2EDE4',
    elevated: '#FFFFFF',
    inverse: '#1C1A17',
  },
  brand: {
    primary: '#C8622A',
    light: '#F0A875',
    dark: '#8C3E15',
  },
  text: {
    primary: '#1C1A17',
    secondary: '#6B6358',
    tertiary: '#A09486',
    inverse: '#FAF7F2',
    brand: '#C8622A',
  },
  border: '#E2D9CC',
  success: '#4A7C59',
  error: '#B94040',
  overlay: 'rgba(28,26,23,0.5)',
} as const;
