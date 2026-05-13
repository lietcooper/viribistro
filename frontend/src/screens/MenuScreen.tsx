// MenuScreen. Fetches all available menu items on mount, then keeps
// them in local state because the menu is small and stable per session.
// Filtering and search both run client-side over that cached list.
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { MenuFilterBar, type FilterValue } from '@/components/MenuFilterBar';
import { MenuItemCard } from '@/components/MenuItemCard';
import { MenuItemModal } from '@/components/MenuItemModal';
import { ScreenContainer } from '@/components/ScreenContainer';
import { getApiClient } from '@/lib/api';
import { colors } from '@/theme/colors';
import { type } from '@/theme/typography';
import type { MenuItem } from '@/types/api';

function matchesFilter(item: MenuItem, filter: FilterValue, query: string): boolean {
  if (filter !== 'all' && item.category !== filter) return false;
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.description.toLowerCase().includes(q)) return true;
  return item.tags.some((t) => t.toLowerCase().includes(q));
}

export function MenuScreen() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getApiClient().get<{ items: MenuItem[] }>('/api/menu');
        if (!cancelled) setItems(res.data.items);
      } catch (err) {
        if (!cancelled) {
          console.error('[MenuScreen] fetch failed:', err);
          setError('Could not load the menu.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => items.filter((i) => matchesFilter(i, filter, query)),
    [items, filter, query],
  );

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
        <Text style={[type.title, { color: colors.text.primary }]}>Our Menu</Text>
        <Text style={[type.caption, { color: colors.text.secondary, marginTop: 2 }]}>
          Honest food, beautifully cooked.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.bg.secondary,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 4,
          }}
        >
          <Ionicons name="search" size={18} color={colors.text.tertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search dishes, ingredients, tags"
            placeholderTextColor={colors.text.tertiary}
            testID="menu-search"
            style={{
              flex: 1,
              marginLeft: 8,
              fontFamily: 'DMSans-Regular',
              fontSize: 15,
              color: colors.text.primary,
              paddingVertical: 8,
            }}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} testID="menu-search-clear">
              <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        <MenuFilterBar value={filter} onChange={setFilter} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={[type.body, { color: colors.error, textAlign: 'center' }]}>
            {error}
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Text style={[type.body, { color: colors.text.secondary, textAlign: 'center' }]}>
            Nothing matches that search yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 32, gap: 12 }}
          renderItem={({ item, index }) => (
            <MenuItemCard item={item} index={index} onPress={() => setSelected(item)} />
          )}
          testID="menu-list"
        />
      )}

      <MenuItemModal item={selected} onClose={() => setSelected(null)} />
    </ScreenContainer>
  );
}
