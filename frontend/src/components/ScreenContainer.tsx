// Every screen renders inside this wrapper. On native it just fills the
// available space; on web it caps the inner column at 480px and centers it,
// so the app reads as a mobile app on desktop screens.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

interface ScreenContainerProps {
  children: ReactNode;
  /** Override the screen background. Defaults to bg.primary. */
  background?: string;
  /** Skip the safe-area inset (used by full-bleed screens like ChatScreen). */
  edgeToEdge?: boolean;
  testID?: string;
}

export function ScreenContainer({
  children,
  background = colors.bg.primary,
  edgeToEdge = false,
  testID,
}: ScreenContainerProps) {
  const inner = (
    <View
      style={{ width: '100%', maxWidth: 480, flex: 1, backgroundColor: background }}
      testID={testID}
    >
      {children}
    </View>
  );

  if (edgeToEdge) {
    return (
      <View style={{ flex: 1, alignItems: 'center', backgroundColor: background }}>
        {inner}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, alignItems: 'center', backgroundColor: background }}>
      {inner}
    </SafeAreaView>
  );
}
