// The root navigator gates Auth vs Main based on useAuthStore.token.
// On mount it calls /auth/refresh once via useBootstrapAuth — if the
// browser still holds a valid refresh cookie the user lands directly
// in MainTabs; otherwise they see the auth stack.
import { NavigationContainer } from '@react-navigation/native';

import { Splash } from '@/components/Splash';
import { useBootstrapAuth } from '@/hooks/useBootstrapAuth';
import { useAuthStore } from '@/stores/useAuthStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';

export function RootNavigator() {
  const { ready } = useBootstrapAuth();
  const token = useAuthStore((s) => s.token);

  if (!ready) return <Splash />;

  return (
    <NavigationContainer>
      {token ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
