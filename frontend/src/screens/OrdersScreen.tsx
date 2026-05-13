// Past orders. On mount we fetch `/api/orders` (newest-first from the
// backend) in parallel with `/api/menu`, then thread menu item names
// into each order row — the orders endpoint only returns ids + prices.
// Tap a row to expand and see the full item breakdown.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

import { ScreenContainer } from '@/components/ScreenContainer';
import { getApiClient } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { shadows } from '@/theme/shadows';
import { type } from '@/theme/typography';
import type { MenuItem, Order } from '@/types/api';

interface OrdersResponse {
  orders: Order[];
}

interface MenuResponse {
  items: MenuItem[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface OrderCardProps {
  order: Order;
  index: number;
  nameById: Map<string, string>;
}

function OrderCard({ order, index, nameById }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false);

  const enterY = useSharedValue(16);
  const enterOpacity = useSharedValue(0);
  useEffect(() => {
    enterY.value = withDelay(index * 60, withSpring(0, springs.snappy));
    enterOpacity.value = withDelay(
      index * 60,
      withSpring(1, { ...springs.snappy, damping: 25 }),
    );
  }, [index, enterY, enterOpacity]);
  const enterStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: enterY.value }],
    opacity: enterOpacity.value,
  }));

  const firstTwo = order.items.slice(0, 2);
  const moreCount = Math.max(0, order.items.length - 2);
  const summary = firstTwo
    .map((it) => `${it.quantity} × ${nameById.get(it.menuItemId) ?? 'Item'}`)
    .join(', ');

  return (
    <Animated.View
      style={[
        enterStyle,
        shadows.card,
        {
          backgroundColor: colors.bg.elevated,
          borderRadius: 16,
          marginHorizontal: 20,
          marginBottom: 12,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((v) => !v)}
        testID={`order-card-${order.id}`}
        style={{ padding: 16 }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={[type.label, { color: colors.text.secondary }]}>
            {formatDate(order.createdAt)}
          </Text>
          <View
            style={{
              backgroundColor:
                order.status === 'confirmed' ? '#E4F0DC' : colors.bg.secondary,
              paddingHorizontal: 10,
              paddingVertical: 2,
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                fontFamily: 'DMSans-Medium',
                fontSize: 11,
                color:
                  order.status === 'confirmed'
                    ? colors.success
                    : colors.text.secondary,
              }}
            >
              {order.status}
            </Text>
          </View>
        </View>

        <Text
          numberOfLines={expanded ? undefined : 2}
          style={[type.body, { color: colors.text.primary, marginTop: 8 }]}
        >
          {summary}
          {!expanded && moreCount > 0 ? ` and ${moreCount} more` : ''}
        </Text>

        {expanded ? (
          <View style={{ marginTop: 10, gap: 6 }} testID={`order-detail-${order.id}`}>
            {order.items.map((it) => (
              <View
                key={it.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={[type.caption, { color: colors.text.primary, flex: 1 }]}>
                  {it.quantity} × {nameById.get(it.menuItemId) ?? 'Item'}
                </Text>
                <Text style={[type.caption, { color: colors.text.secondary }]}>
                  {formatMoney(Number(it.unitPrice) * it.quantity)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <Text style={[type.label, { color: colors.text.secondary }]}>Total</Text>
          <Text style={[type.price, { color: colors.brand.primary }]}>
            {formatMoney(order.totalPrice)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const client = getApiClient();
      const [ordersRes, menuRes] = await Promise.all([
        client.get<OrdersResponse>('/api/orders'),
        client.get<MenuResponse>('/api/menu'),
      ]);
      setOrders(ordersRes.data.orders);
      setMenu(menuRes.data.items);
    } catch (err) {
      const e = err as { response?: { status?: number } };
      if (e.response?.status === 401) {
        setError('Sign in to see your past orders.');
      } else {
        setError('We could not load your orders right now.');
      }
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const nameById = useMemo(
    () => new Map(menu.map((m) => [m.id, m.name])),
    [menu],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <Text style={[type.title, { color: colors.text.primary }]}>Past Orders</Text>
        <Text style={[type.caption, { color: colors.text.secondary, marginTop: 2 }]}>
          A receipt of every meal you've ordered with us.
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      ) : error ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 8,
          }}
          testID="orders-error"
        >
          <Ionicons name="alert-circle-outline" size={32} color={colors.text.tertiary} />
          <Text style={[type.body, { color: colors.text.secondary, textAlign: 'center' }]}>
            {error}
          </Text>
        </View>
      ) : orders.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 8,
          }}
          testID="orders-empty"
        >
          <Ionicons
            name="restaurant-outline"
            size={36}
            color={colors.text.tertiary}
          />
          <Text style={[type.heading, { color: colors.text.primary }]}>
            No orders yet
          </Text>
          <Text style={[type.caption, { color: colors.text.secondary, textAlign: 'center' }]}>
            Start a chat with the AI host to place your first one.
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item, index }) => (
            <OrderCard order={item} index={index} nameById={nameById} />
          )}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          testID="orders-list"
        />
      )}
    </ScreenContainer>
  );
}
