import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { filterCustomers, formatInr, vocabularyFor } from '@sornio/mobile-contracts';
import { layout, space } from '@sornio/mobile-design';
import { Body, DemoBanner, EmptyState, Hairline, Muted, Row, SearchField, Title } from '../components/primitives';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';

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
  return (
    <View style={wide ? styles.split : styles.stack}>
      <ScrollView style={styles.pane} contentContainerStyle={styles.pad}>
        {snapshot?.mode === 'demo' ? <DemoBanner text={copy.demoBanner} /> : null}
        <View style={styles.block}>
          <SearchField value={query} onChange={setQuery} placeholder={copy.searchPeople} />
        </View>
        {rows.length === 0 ? (
          <View style={styles.block}>
            <EmptyState title={terms.customers} detail={copy.emptyPeople} />
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.block}>
              <Row
                title={row.name}
                detail={row.phone ?? 'No phone on file'}
                meta={formatInr(row.outstandingPaise)}
                onPress={() => setSelectedId(row.id)}
              />
              <Hairline />
            </View>
          ))
        )}
      </ScrollView>
      {selected ? (
        <ScrollView style={styles.pane} contentContainerStyle={styles.pad}>
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
