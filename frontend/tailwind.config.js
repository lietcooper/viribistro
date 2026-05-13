/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#FAF7F2',
          secondary: '#F2EDE4',
          elevated: '#FFFFFF',
          inverse: '#1C1A17',
        },
        brand: {
          DEFAULT: '#C8622A',
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
      },
      fontFamily: {
        display: ['PlayfairDisplay-Bold'],
        'display-semi': ['PlayfairDisplay-SemiBold'],
        sans: ['DMSans-Regular'],
        'sans-medium': ['DMSans-Medium'],
        'sans-semi': ['DMSans-SemiBold'],
      },
    },
  },
  plugins: [],
};
