// Bottom-tab navigator for the authenticated app. ChatScreen is the
// initial route because the chat experience is the headline.
//
// The cart icon lives in the tab bar (Orders tab carries the cart badge);
// the actual cart UI is a global bottom sheet mounted alongside the
// navigator so it can open over any screen. Same for the post-checkout
// success overlay — mounted once at the navigator level.
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  createBottomTabNavigator,
  type BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { Modal, Pressable, View } from 'react-native';

import { CartBadge } from '@/components/CartBadge';
import { CartDrawer } from '@/components/CartDrawer';
import { ChatScreen } from '@/screens/ChatScreen';
import { MenuScreen } from '@/screens/MenuScreen';
import { OrderSuccessScreen } from '@/screens/OrderSuccessScreen';
import { OrdersScreen } from '@/screens/OrdersScreen';
import { useCartUiStore } from '@/stores/useCartUiStore';
import { colors } from '@/theme/colors';

export type MainTabsParamList = {
  Menu: undefined;
  Chat: undefined;
  Orders: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

type Nav = BottomTabNavigationProp<MainTabsParamList>;

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

export function MainTabs() {
  const successOpen = useCartUiStore((s) => s.successOpen);
  const dismissSuccess = useCartUiStore((s) => s.dismissSuccess);
  const showSuccess = useCartUiStore((s) => s.showSuccess);

  // When the cart drawer fires onOrderPlaced we flip on the overlay and
  // arrange for the bottom navigator to land on the Orders tab when it
  // auto-dismisses.
  const navRef = useRef<Nav | null>(null);

  const handleDismiss = () => {
    dismissSuccess();
    navRef.current?.navigate('Orders');
  };

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
            <View style={{ paddingRight: 16 }}>
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
        <Tab.Screen
          name="Menu"
          component={MenuScreen}
          options={{ title: 'Menu' }}
          listeners={({ navigation }) => ({
            focus: () => {
              navRef.current = navigation as unknown as Nav;
            },
          })}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{ title: 'Bistro' }}
          listeners={({ navigation }) => ({
            focus: () => {
              navRef.current = navigation as unknown as Nav;
            },
          })}
        />
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{ title: 'Orders' }}
          listeners={({ navigation }) => ({
            focus: () => {
              navRef.current = navigation as unknown as Nav;
            },
          })}
        />
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

