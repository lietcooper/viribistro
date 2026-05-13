// Bottom-tab navigator for the authenticated app. ChatScreen is the
// initial route because the chat experience is the headline.
//
// The cart icon lives in the tab bar (Orders tab carries the cart badge);
// the actual cart UI is a global bottom sheet mounted alongside the
// navigator so it can open over any screen. Same for the post-checkout
// success overlay — mounted once at the navigator level.
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Alert, Modal, Platform, Pressable, View } from 'react-native';

import { CartBadge } from '@/components/CartBadge';
import { CartDrawer } from '@/components/CartDrawer';
import { ChatScreen } from '@/screens/ChatScreen';
import { MenuScreen } from '@/screens/MenuScreen';
import { OrderSuccessScreen } from '@/screens/OrderSuccessScreen';
import { OrdersScreen } from '@/screens/OrdersScreen';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCartUiStore } from '@/stores/useCartUiStore';
import { colors } from '@/theme/colors';

export type MainTabsParamList = {
  Menu: undefined;
  Chat: undefined;
  Orders: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

interface MainTabsProps {
  // Provided by RootNavigator so the post-checkout success modal can
  // route the user to the Orders tab when it auto-dismisses, without
  // each tab having to thread its own `navigation` prop through a ref.
  navRef: NavigationContainerRefWithCurrent<MainTabsParamList>;
}

function CartTabButton() {
  const openDrawer = useCartUiStore((s) => s.openDrawer);
  return (
    <Pressable
      onPress={openDrawer}
      accessibilityRole="button"
      accessibilityLabel="Open cart"
      testID="open-cart"
      hitSlop={8}
      style={{
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View>
        <Ionicons name="bag-handle-outline" size={22} color={colors.text.tertiary} />
        <CartBadge />
      </View>
    </Pressable>
  );
}

function LogoutHeaderButton() {
  const logout = useAuthStore((s) => s.logout);

  const performLogout = () => {
    // Fire and forget — the auth store clears local state even if the
    // network call fails, and logs the error itself. Avoid awaiting so
    // the UI feels instant.
    void logout();
  };

  const onPress = () => {
    // react-native's Alert isn't supported on web; fall back to a
    // native browser confirm so the affordance still works there.
    if (Platform.OS === 'web') {
      const ok =
        typeof globalThis !== 'undefined' &&
        typeof (globalThis as { confirm?: (m: string) => boolean }).confirm === 'function'
          ? (globalThis as { confirm: (m: string) => boolean }).confirm(
              'Sign out of ViriBistro?',
            )
          : true;
      if (ok) performLogout();
      return;
    }
    Alert.alert('Sign out', 'Sign out of ViriBistro?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: performLogout },
    ]);
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      testID="logout-button"
      hitSlop={8}
      style={({ pressed }) => ({
        width: 28,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="log-out-outline" size={22} color={colors.text.tertiary} />
    </Pressable>
  );
}

export function MainTabs({ navRef }: MainTabsProps) {
  const successOpen = useCartUiStore((s) => s.successOpen);
  const dismissSuccess = useCartUiStore((s) => s.dismissSuccess);
  const showSuccess = useCartUiStore((s) => s.showSuccess);

  // Memoized so it keeps a stable reference across MainTabs re-renders.
  // OrderSuccessScreen depends on `onDismiss` in its auto-dismiss
  // useEffect, and would otherwise reset its 2400ms timer every render.
  const handleDismiss = useCallback(() => {
    dismissSuccess();
    if (navRef.isReady()) {
      navRef.navigate('Orders');
    }
  }, [dismissSuccess, navRef]);

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName="Chat"
        screenOptions={({ route }) => ({
          headerShown: true,
          headerStyle: { backgroundColor: colors.bg.primary },
          headerTitleStyle: {
            fontFamily: 'PlayfairDisplay-SemiBold',
            color: colors.text.primary,
          },
          headerShadowVisible: false,
          headerRight: () => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingRight: 16,
              }}
            >
              {/* Logout lives on the Orders tab — the natural "account"
                  surface. Other tabs keep just the cart for a cleaner
                  header. */}
              {route.name === 'Orders' ? <LogoutHeaderButton /> : null}
              <CartTabButton />
            </View>
          ),
          tabBarActiveTintColor: colors.brand.primary,
          tabBarInactiveTintColor: colors.text.tertiary,
          tabBarStyle: {
            backgroundColor: colors.bg.elevated,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontFamily: 'DMSans-Medium', fontSize: 12 },
          tabBarIcon: ({ color, size }) => {
            const name =
              route.name === 'Menu'
                ? 'restaurant-outline'
                : route.name === 'Chat'
                  ? 'chatbubble-ellipses-outline'
                  : 'receipt-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Menu" component={MenuScreen} options={{ title: 'Menu' }} />
        <Tab.Screen name="Chat" component={ChatScreen} options={{ title: 'Bistro' }} />
        <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders' }} />
      </Tab.Navigator>

      <CartDrawer onOrderPlaced={showSuccess} />

      <Modal
        visible={successOpen}
        transparent={false}
        animationType="fade"
        onRequestClose={handleDismiss}
      >
        <OrderSuccessScreen onDismiss={handleDismiss} />
      </Modal>
    </View>
  );
}
