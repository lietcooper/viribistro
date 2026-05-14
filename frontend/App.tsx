// App entry. Mounts SafeAreaProvider + GestureHandlerRootView (required for
// react-native-gesture-handler interactions like swipe-to-delete) + the
// root navigator. Fonts are loaded here via expo-font/useFonts; we render
// a minimal splash until they're ready so type never flashes a fallback.
import './global.css';

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Platform } from 'react-native';

import { RootNavigator } from '@/navigation/RootNavigator';
import { Toast } from '@/components/Toast';
import { colors } from '@/theme/colors';

// Expo's default web index.html ships a viewport meta WITHOUT
// `viewport-fit=cover`, so iOS Safari leaves `env(safe-area-inset-*)` at
// 0 and lays the page out behind the bottom URL bar. We can't edit the
// HTML template directly without ejecting, so patch the existing meta on
// mount instead. Idempotent — only touches the tag when it's missing the
// fragment. No-op on native (no document).
function ensureViewportFitCover(): void {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const content = meta.getAttribute('content') ?? '';
  const required = ['width=device-width', 'initial-scale=1', 'viewport-fit=cover'];
  const next = [
    ...content
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  ];

  for (const part of required) {
    if (!next.includes(part)) next.push(part);
  }

  meta.setAttribute('content', next.join(', '));
}

export default function App() {
  useEffect(() => {
    ensureViewportFitCover();
  }, []);

  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Bold': require('@expo-google-fonts/playfair-display/PlayfairDisplay_700Bold.ttf'),
    'PlayfairDisplay-SemiBold': require('@expo-google-fonts/playfair-display/PlayfairDisplay_600SemiBold.ttf'),
    'DMSans-Regular': require('@expo-google-fonts/dm-sans/DMSans_400Regular.ttf'),
    'DMSans-Medium': require('@expo-google-fonts/dm-sans/DMSans_500Medium.ttf'),
    'DMSans-SemiBold': require('@expo-google-fonts/dm-sans/DMSans_700Bold.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.bg.primary,
        }}
      >
        <ActivityIndicator color={colors.brand.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator />
        <Toast />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
