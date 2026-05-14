// Bottom-tab navigator for the authenticated app. ChatScreen is the
// initial route because the chat experience is the headline.
//
// The cart icon lives in the tab bar (Orders tab carries the cart badge);
// the actual cart UI is a global bottom sheet mounted alongside the
// navigator so it can open over any screen. Same for the post-checkout
// success overlay — mounted once at the navigator level.
import { useCallback, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Alert, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartBadge } from '@/components/CartBadge';
import { CartDrawer } from '@/components/CartDrawer';
import { ChatScreen } from '@/screens/ChatScreen';
import { MenuScreen } from '@/screens/MenuScreen';
import { OrderSuccessScreen } from '@/screens/OrderSuccessScreen';
import { OrdersScreen } from '@/screens/OrdersScreen';
import { useAuthStore } from '@/stores/useAuthStore';
import { useCartStore } from '@/stores/useCartStore';
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
  const hydrateCart = useCartStore((s) => s.hydrateCart);

  const handlePress = () => {
    openDrawer();
    void hydrateCart();
  };

  return (
    <Pressable
      onPress={handlePress}
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
  const hydrateCart = useCartStore((s) => s.hydrateCart);
  // Mobile Safari's URL bar overlays the bottom of the viewport; without
  // adding the safe-area inset the tab icons + labels sit behind it.
  // On platforms / browsers that don't expose insets this comes back as 0,
  // which is fine — the layout already has 8px of intentional padding.
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void hydrateCart();
  }, [hydrateCart]);

  // Memoized so it keeps a stable reference across MainTabs re-renders.
  // OrderSuccessScreen depends on `onDismiss` in its auto-dismiss
  // useEffect, and would otherwise reset its 2400ms timer every render.
  const handleDismiss = useCallback(() => {
    dismissSuccess();
    if (navRef.isReady()) {
      navRef.navigate('Orders');
    } else {
      // The success modal fires its own auto-dismiss timer; if the
      // navigation container somehow isn't ready by then, we don't want
      // to crash — but silently dropping the navigation would leave the
      // user stranded on the previous tab with no indication why. Log
      // so operators can spot a real race (CLAUDE.md: no silent failures).
      console.warn(
        '[MainTabs] navRef not ready when dismissing OrderSuccess — staying on current tab',
      );
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
              <LogoutHeaderButton />
              <CartTabButton />
            </View>
          ),
          tabBarActiveTintColor: colors.brand.primary,
          tabBarInactiveTintColor: colors.text.tertiary,
          tabBarStyle: {
            backgroundColor: colors.bg.elevated,
            borderTopColor: colors.border,
            height: 64 + insets.bottom,
            paddingBottom: 8 + insets.bottom,
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
