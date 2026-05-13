// The root navigator gates Auth vs Main based on useAuthStore.token.
// On mount it calls /auth/refresh once via useBootstrapAuth — if the
// browser still holds a valid refresh cookie the user lands directly
// in MainTabs; otherwise they see the auth stack.
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';

import { Splash } from '@/components/Splash';
import { useBootstrapAuth } from '@/hooks/useBootstrapAuth';
import { useAuthStore } from '@/stores/useAuthStore';
import { AuthStack } from './AuthStack';
import { MainTabs, type MainTabsParamList } from './MainTabs';

export function RootNavigator() {
  const { ready } = useBootstrapAuth();
  const token = useAuthStore((s) => s.token);
  // Held at the root so the post-checkout success modal — rendered
  // alongside the tab navigator — can navigate to a specific tab on
  // auto-dismiss without each tab listener having to capture its own
  // `navigation` prop.
  const navRef = useNavigationContainerRef<MainTabsParamList>();

  if (!ready) return <Splash />;

  return (
    <NavigationContainer
      ref={navRef}
      // Pin the browser tab title. React Navigation's web integration
      // updates document.title on every route change by default, which
      // would otherwise cycle through "Menu / Bistro / Orders".
      documentTitle={{ formatter: () => 'ViriBistro' }}
    >
      {token ? <MainTabs navRef={navRef} /> : <AuthStack />}
    </NavigationContainer>
  );
}
