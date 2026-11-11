import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { filterInventory, formatQuantity, vocabularyFor } from '@sornio/mobile-contracts';
import { space, touch } from '@sornio/mobile-design';
import { Body, DemoBanner, EmptyState, Hairline, Muted, Row, SearchField } from '../components/primitives';
import { StockCount } from '../components/StockCount';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';
import { useTheme } from '../theme/ThemeProvider';

export function InventoryScreen() {
  const { snapshot } = useCompanion();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const terms = vocabularyFor(snapshot?.portalId ?? 'general');
  const rows = useMemo(
    () => filterInventory(snapshot?.inventory ?? [], query, lowOnly),
    [snapshot, query, lowOnly],
  );
  if (snapshot?.portalId === 'gym') {
    return (
      <View style={styles.block}>
        <EmptyState title={terms.stock} detail={copy.gymNoStock} />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      {snapshot?.mode === 'demo' ? <DemoBanner text={copy.demoBanner} /> : null}
      <View style={styles.block}>
        <SearchField value={query} onChange={setQuery} placeholder={copy.searchStock} />
        <Pressable
          onPress={() => setLowOnly((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ selected: lowOnly }}
          style={[styles.chip, { borderColor: palette.line, backgroundColor: lowOnly ? palette.brand : palette.lift }]}
        >
          <Text style={{ color: lowOnly ? palette.brandInk : palette.ink }}>{copy.lowStock}</Text>
        </Pressable>
      </View>
      {rows.length === 0 ? (
        <View style={styles.block}>
          <EmptyState title={terms.stock} detail={copy.emptyStock} />
        </View>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.block}>
            <Row
              title={row.name}
              detail={`${copy.sku} ${row.sku} · ${copy.updated} ${row.updatedAtIso}`}
              meta={formatQuantity(row.quantityMilli)}
            />
            {row.lowStock ? <Body>Low stock</Body> : <Muted>{copy.available}</Muted>}
            <StockCount productId={row.sourceProductId} observedMilli={row.quantityMilli} snapshotAt={row.updatedAtIso}/>
            <Hairline />
          </View>
        ))
      )}
    </ScrollView>
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
