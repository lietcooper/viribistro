// The root navigator gates Auth vs Main based on useAuthStore.token. The
// individual stacks are defined in AuthStack.tsx and MainTabs.tsx and
// wired in once those are in place.
import { NavigationContainer } from '@react-navigation/native';

import { useAuthStore } from '@/stores/useAuthStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';

export function RootNavigator() {
  const token = useAuthStore((s) => s.token);
  return (
    <NavigationContainer>
      {token ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
