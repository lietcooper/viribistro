// Global bottom-sheet cart drawer. Mounted at the App root so it can
// open above any screen. Spring-animated translateY; reduced-motion mode
// swaps to an instant toggle.
//
// Checkout flow:
//   - POST /api/orders { sessionId }
//   - On success: clear the cart, close the drawer, ask the navigator
//     to show the success screen via the `onOrderPlaced` callback.
//   - On failure: surface an inline error row + a toast so the user
//     never sees a silent dead-end.
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CartItem } from '@/components/CartItem';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getApiClient } from '@/lib/api';
import { getSessionId } from '@/lib/session';
import { formatMoney } from '@/lib/format';
import { useCartStore, useCartTotal } from '@/stores/useCartStore';
import { useCartUiStore } from '@/stores/useCartUiStore';
import { useToastStore } from '@/stores/useToastStore';
import { colors } from '@/theme/colors';
import { springs } from '@/theme/motion';
import { shadows } from '@/theme/shadows';
import { type } from '@/theme/typography';

interface CartDrawerProps {
  onOrderPlaced?: () => void;
}

export function CartDrawer({ onOrderPlaced }: CartDrawerProps = {}) {
  const { height: windowH } = useWindowDimensions();
  const sheetHeight = Math.min(560, Math.max(360, windowH * 0.7));

  const open = useCartUiStore((s) => s.open);
  const closeDrawer = useCartUiStore((s) => s.closeDrawer);
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const { total, itemCount } = useCartTotal();
  const reducedMotion = useReducedMotion();

  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const translateY = useSharedValue(sheetHeight);
  const overlayOpacity = useSharedValue(0);

  useEffect(() => {
    // Clear stale checkout errors whenever the drawer opens — a fresh
    // session shouldn't start with last attempt's failure on screen.
    if (open) setCheckoutError(null);
  }, [open]);

  useEffect(() => {
    if (reducedMotion) {
      translateY.value = open ? 0 : sheetHeight;
      overlayOpacity.value = open ? 1 : 0;
    } else if (open) {
      translateY.value = withSpring(0, springs.drawer);
      overlayOpacity.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = withSpring(sheetHeight, springs.drawer);
      overlayOpacity.value = withTiming(0, { duration: 180 });
    }
  }, [open, reducedMotion, sheetHeight, translateY, overlayOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  const handleCheckout = async () => {
    if (checkoutLoading) return;
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      await getApiClient().post('/api/orders', { sessionId: getSessionId() });
      clearCart();
      closeDrawer();
      onOrderPlaced?.();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message =
        status === 401
          ? 'Please sign in again to place this order.'
          : "We couldn't place your order — please try again.";
      setCheckoutError(message);
      useToastStore.getState().show(message, 'error');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        testID="cart-overlay"
        style={[
          overlayStyle,
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 40,
          },
        ]}
      >
        <Pressable
          onPress={closeDrawer}
          accessibilityLabel="Close cart"
          style={{
            flex: 1,
            backgroundColor: colors.overlay,
          }}
        />
      </Animated.View>

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        testID="cart-drawer"
        style={[
          sheetStyle,
          shadows.bottomSheet,
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: sheetHeight,
            backgroundColor: colors.bg.elevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            zIndex: 50,
          },
        ]}
      >
        <View
          style={{
            alignItems: 'center',
            paddingTop: 10,
            paddingBottom: 4,
          }}
        >
          <View
            style={{
              width: 44,
              height: 4,
              borderRadius: 999,
              backgroundColor: colors.border,
            }}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
          }}
        >
          <Text style={[type.title, { color: colors.text.primary }]}>Your Cart</Text>
          <Text
            style={{
              fontFamily: 'DMSans-Medium',
              fontSize: 14,
              color: colors.text.secondary,
            }}
          >
            {itemCount === 1 ? '1 item' : `${itemCount} items`}
          </Text>
        </View>

        {items.length === 0 ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            testID="cart-empty"
          >
            <Ionicons name="restaurant-outline" size={40} color={colors.text.tertiary} />
            <Text
              style={[type.heading, { color: colors.text.primary, marginTop: 12 }]}
            >
              Your cart is empty
            </Text>
            <Text
              style={[
                type.caption,
                { color: colors.text.secondary, textAlign: 'center', marginTop: 6 },
              ]}
            >
              Ask the AI host or browse the menu to start an order.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}
            testID="cart-list"
          >
            {items.map((it) => (
              <CartItem key={it.menuItemId} item={it} />
            ))}
          </ScrollView>
        )}

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 24,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            gap: 12,
          }}
        >
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={[type.label, { color: colors.text.secondary }]}>Total</Text>
            <Text style={[type.price, { color: colors.text.primary }]}>{formatMoney(total)}</Text>
          </View>
          {checkoutError ? (
            <View
              testID="cart-checkout-error"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: colors.bg.secondary,
              }}
            >
              <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
              <Text
                style={[
                  type.caption,
                  { color: colors.error, flex: 1 },
                ]}
              >
                {checkoutError}
              </Text>
            </View>
          ) : null}
          <PrimaryButton
            label="Place order"
            onPress={handleCheckout}
            loading={checkoutLoading}
            disabled={items.length === 0 || checkoutLoading}
            fullWidth
            testID="cart-checkout"
          />
        </View>
      </Animated.View>
    </>
  );
}

export type { CartDrawerProps };
