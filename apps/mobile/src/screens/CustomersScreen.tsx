import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { filterCustomers, formatInr, vocabularyFor, type CustomerSummary } from '@sornio/mobile-contracts';
import { layout, space } from '@sornio/mobile-design';
import { Body, DemoBanner, EmptyState, Hairline, Muted, Row, SearchField, Title } from '../components/primitives';
import { ids } from '../testing/identifiers';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';

/** Memoised list row so a selection or keystroke does not rebuild every line. */
const CustomerRow = memo(function CustomerRow({
  row,
  onSelect,
}: {
  row: CustomerSummary;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.block}>
      <Row
        title={row.name}
        detail={row.phone ?? 'No phone on file'}
        meta={formatInr(row.outstandingPaise)}
        onPress={() => onSelect(row.id)}
        // The detail panel is chosen by selection, so the test needs a stable
        // handle per row. The customer name is already the spoken label.
        testID={ids.customerRow(row.id)}
      />
      <Hairline />
    </View>
  );
});

export function CustomersScreen() {
  const { snapshot } = useCompanion();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const terms = vocabularyFor(snapshot?.portalId ?? 'general');
  const rows = useMemo(() => filterCustomers(snapshot?.customers ?? [], query), [snapshot, query]);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const statement = selected ? snapshot?.statements[selected.id] ?? [] : [];
  const wide = width >= layout.tabletMin;
  const open = useCallback((id: string) => setSelectedId(id), []);
  const renderItem = useCallback(
    ({ item }: { item: CustomerSummary }) => <CustomerRow row={item} onSelect={open} />,
    [open],
  );
  return (
    <View style={wide ? styles.split : styles.stack}>
      <FlatList
        testID={ids.list}
        style={styles.pane}
        contentContainerStyle={styles.pad}
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row: CustomerSummary) => row.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={9}
        ListHeaderComponent={
          <>
            {snapshot?.mode === 'demo' ? <DemoBanner text={copy.demoBanner} /> : null}
            <View style={styles.block}>
              <SearchField value={query} onChange={setQuery} placeholder={copy.searchPeople} />
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.block}>
            <EmptyState title={terms.customers} detail={copy.emptyPeople} />
          </View>
        }
      />
      {selected ? (
        <ScrollView testID={ids.detail} style={styles.pane} contentContainerStyle={styles.pad}>
          <View style={styles.block}>
            <Title>{selected.name}</Title>
            <Muted>{selected.phone ?? 'No phone on file'}</Muted>
            <Body>{`Outstanding ${formatInr(selected.outstandingPaise)}`}</Body>
            {selected.creditLimitPaise ? <Muted>{`Limit ${formatInr(selected.creditLimitPaise)}`}</Muted> : null}
          </View>
          <View style={styles.block}>
            <Title>{copy.statement}</Title>
            {statement.length === 0 ? (
              <Muted>{copy.noStatement}</Muted>
            ) : (
              statement.map((line) => (
                <Row
                  key={line.id}
                  title={line.narrative}
                  detail={`${line.direction} · ${line.occurredAtIso}`}
                  meta={formatInr(line.amountPaise)}
                />
              ))
            )}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  stack: { flex: 1 },
  pane: { flex: 1 },
  pad: { paddingBottom: space[48] },
  block: { paddingHorizontal: space[20], paddingTop: space[16], gap: space[8] },
});
