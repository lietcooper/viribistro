// Brand splash shown while fonts load and the initial /auth/refresh
// roundtrip is in flight. A simple wordmark on the warm background —
// no spinners, since the wait is usually short.
import { Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { type } from '@/theme/typography';

export function Splash() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg.primary,
      }}
      testID="splash"
    >
      <Text style={[type.hero, { color: colors.brand.primary }]}>Bistro</Text>
      <Text
        style={[type.caption, { color: colors.text.secondary, marginTop: 8 }]}
      >
        Setting the table…
      </Text>
    </View>
  );
}
