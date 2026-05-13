// App entry. Mounts SafeAreaProvider + GestureHandlerRootView (required for
// react-native-gesture-handler interactions like swipe-to-delete) + the
// root navigator. Fonts are loaded here via expo-font/useFonts; we render
// a minimal splash until they're ready so type never flashes a fallback.
import './global.css';

import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';

import { RootNavigator } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

export default function App() {
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
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
