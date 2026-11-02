import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { filterActivity, formatInr, type ActivityFilter } from '@sornio/mobile-contracts';
import { space, touch } from '@sornio/mobile-design';
import { DemoBanner, EmptyState, Hairline, Row, SearchField } from '../components/primitives';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';
import { useTheme } from '../theme/ThemeProvider';

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'payment', label: 'Payments' },
  { id: 'repayment', label: 'Repayments' },
  { id: 'expense', label: 'Expenses' },
];

export function ActivityScreen() {
  const { snapshot } = useCompanion();
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ActivityFilter>('all');
  const rows = useMemo(
    () => filterActivity(snapshot?.activity ?? [], query, kind),
    [snapshot, query, kind],
  );
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      {snapshot?.mode === 'demo' ? <DemoBanner text={copy.demoBanner} /> : null}
      <View style={styles.block}>
        <SearchField value={query} onChange={setQuery} placeholder={copy.searchActivity} />
        <View style={styles.filters}>
          {FILTERS.map((filter) => {
            const active = filter.id === kind;
            return (
              <Pressable
                key={filter.id}
                onPress={() => setKind(filter.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  { borderColor: palette.line, backgroundColor: active ? palette.brand : palette.lift },
                ]}
              >
                <Text style={{ color: active ? palette.brandInk : palette.ink }}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {rows.length === 0 ? (
        <View style={styles.block}>
          <EmptyState title="Nothing to show" detail={copy.emptyActivity} />
        </View>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.block}>
            <Row
              title={row.counterparty}
              detail={`${row.kind} · ${row.status} · ${row.narrative}`}
              meta={formatInr(row.amountPaise)}
              accessibilityLabel={`${row.kind} ${row.counterparty} ${row.narrative}`}
            />
            <Hairline />
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: space[48] },
  block: { paddingHorizontal: space[20], paddingTop: space[16] },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8], marginTop: space[12] },
  chip: {
    minHeight: touch - 8,
    paddingHorizontal: space[12],
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
});
