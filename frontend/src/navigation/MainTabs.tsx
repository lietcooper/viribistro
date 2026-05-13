// Bottom-tab navigator for the authenticated app. ChatScreen is the
// initial route because the chat experience is the headline.
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';

import { ChatScreen } from '@/screens/ChatScreen';
import { MenuScreen } from '@/screens/MenuScreen';
import { OrdersScreen } from '@/screens/OrdersScreen';
import { CartBadge } from '@/components/CartBadge';
import { colors } from '@/theme/colors';

export type MainTabsParamList = {
  Menu: undefined;
  Chat: undefined;
  Orders: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Chat"
      screenOptions={({ route }) => ({
        headerShown: false,
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
          if (route.name === 'Orders') {
            return (
              <View>
                <Ionicons name={name} size={size} color={color} />
                <CartBadge />
              </View>
            );
          }
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Menu" component={MenuScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
    </Tab.Navigator>
  );
}
