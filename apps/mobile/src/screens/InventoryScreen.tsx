import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { filterInventory, formatQuantity, vocabularyFor, type InventoryItem } from '@sornio/mobile-contracts';
import { space, touch } from '@sornio/mobile-design';
import { Body, DemoBanner, EmptyState, Hairline, Muted, Row, SearchField } from '../components/primitives';
import { StockCount } from '../components/StockCount';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';
import { useTheme } from '../theme/ThemeProvider';

type StockRow = InventoryItem;

/**
 * A single stock line. Extracted and memoised because each row also mounts a
 * `StockCount` editor (device secure storage); without memoisation, a keystroke
 * in the search field re-rendered every row's editor subtree.
 */
const InventoryRow = memo(function InventoryRow({
  row,
  scope,
}: {
  row: StockRow;
  scope: string;
}) {
  return (
    <View style={styles.block}>
      <Row
        title={row.name}
        detail={`${copy.sku} ${row.sku} · ${copy.updated} ${row.updatedAtIso}`}
        meta={formatQuantity(row.quantityMilli)}
      />
      {row.lowStock ? <Body>Low stock</Body> : <Muted>{copy.available}</Muted>}
      <StockCount
        key={`${scope}:${row.sourceProductId}`}
        productId={row.sourceProductId}
        observedMilli={row.quantityMilli}
        snapshotAt={row.updatedAtIso}
      />
      <Hairline />
    </View>
  );
});

export function InventoryScreen() {
  const { snapshot, session } = useCompanion();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const terms = vocabularyFor(snapshot?.portalId ?? 'general');
  const rows = useMemo(
    () => filterInventory(snapshot?.inventory ?? [], query, lowOnly),
    [snapshot, query, lowOnly],
  );
  const scope = `${session?.mode}:${session?.business.businessId}:${session?.userId}`;

  const renderItem = useCallback(
    ({ item }: { item: StockRow }) => <InventoryRow row={item} scope={scope} />,
    [scope],
  );
  const keyExtractor = useCallback((item: StockRow) => item.id, []);

  if (snapshot?.portalId === 'gym') {
    return (
      <View style={styles.block}>
        <EmptyState title={terms.stock} detail={copy.gymNoStock} />
      </View>
    );
  }
  return (
    <FlatList
      data={rows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={10}
      maxToRenderPerBatch={12}
      windowSize={7}
      ListHeaderComponent={
        <>
          {snapshot?.mode === 'demo' ? <DemoBanner text={copy.demoBanner} /> : null}
          <View style={styles.block}>
            <SearchField value={query} onChange={setQuery} placeholder={copy.searchStock} />
            <Pressable
              onPress={() => setLowOnly((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={copy.lowStock}
              accessibilityState={{ selected: lowOnly }}
              style={[styles.chip, { borderColor: palette.line, backgroundColor: lowOnly ? palette.brand : palette.lift }]}
            >
              <Text allowFontScaling style={{ color: lowOnly ? palette.brandInk : palette.ink }}>
                {copy.lowStock}
              </Text>
            </Pressable>
          </View>
        </>
      }
      ListEmptyComponent={
        <View style={styles.block}>
          <EmptyState title={terms.stock} detail={copy.emptyStock} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: space[48] },
  block: { paddingHorizontal: space[20], paddingTop: space[16], gap: space[8] },
  chip: {
    alignSelf: 'flex-start',
    minHeight: touch - 8,
    paddingHorizontal: space[12],
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
});
