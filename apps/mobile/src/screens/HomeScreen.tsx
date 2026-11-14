import { useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { formatInr, vocabularyFor } from '@sornio/mobile-contracts';
import { layout, space } from '@sornio/mobile-design';
import { ActionButton, Body, DemoBanner, Eyebrow, Hairline, Metric, Muted, Row, Title } from '../components/primitives';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';
import { useTheme } from '../theme/ThemeProvider';
import { RestaurantScreen } from './RestaurantScreen';
import { LanRestaurantScreen } from './LanRestaurantScreen';

type Workspace = 'none' | 'draft' | 'hub';

export function HomeScreen() {
  const { snapshot, sync, session } = useCompanion();
  const { palette } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const [workspace, setWorkspace] = useState<Workspace>('none');

  /* The restaurant workspaces are pushed above Home rather than replacing the
     Home tab. Previously a cafe account lost the dashboard, the tab bar and all
     navigation the moment Home rendered, because Home returned the workspace
     directly. Every workspace now has an explicit way back. */
  if (workspace === 'draft') {
    return <RestaurantScreen onBack={() => setWorkspace('none')} />;
  }
  if (workspace === 'hub') {
    return <LanRestaurantScreen onBack={() => setWorkspace('none')} backLabel="Back to Home" />;
  }
  if (!snapshot || !session) {
    return (
      <View style={styles.pad}>
        <Title>Loading Sornio</Title>
        <Muted>Preparing the demonstration copy.</Muted>
      </View>
    );
  }
  const terms = vocabularyFor(snapshot.portalId);
  const compact = width < 720;
  /* Tablet layout caps the reading measure instead of stretching a metric row
     across a 1366pt iPad Pro canvas. */
  const measure = width >= layout.tabletMin ? { maxWidth: 980, alignSelf: 'center' as const, width: '100%' as const } : undefined;
  const showRestaurant = snapshot.portalId === 'cafe';
  return (
    <ScrollView contentContainerStyle={[styles.pad, measure]} keyboardShouldPersistTaps="handled">
      {snapshot.mode === 'demo' ? <DemoBanner text={copy.demoBanner} /> : null}
      <View style={styles.block}>
        <Eyebrow>{terms.desk}</Eyebrow>
        <Title>{snapshot.businessName}</Title>
        <Muted>{`${session.displayName} · ${snapshot.role}`}</Muted>
      </View>
      <View style={[styles.metrics, compact ? styles.wrap : styles.row]}>
        <Metric
          label={copy.todaySales}
          value={formatInr(snapshot.overview.todaySales.totalPaise)}
          hint={`${formatInr(snapshot.overview.todaySales.cashPaise)} cash · ${formatInr(snapshot.overview.todaySales.creditPaise)} credit`}
        />
        <Metric label={copy.todayCollections} value={formatInr(snapshot.overview.todayCollectionsPaise)} />
        <Metric label={copy.outstanding} value={formatInr(snapshot.overview.outstandingCreditPaise)} />
        <Metric label={copy.lowStock} value={`${snapshot.overview.lowStockCount}`} hint={terms.stock} />
      </View>
      <Hairline />
      {showRestaurant ? (
        <>
          <View style={styles.block}>
            <Eyebrow>Restaurant service</Eyebrow>
            <Body>Tables, additions and the kitchen queue are worked on the shop’s own hub. Nothing sent from this phone settles a bill.</Body>
            <View style={styles.stack}>
              <ActionButton label="Connect to the shop hub" onPress={() => setWorkspace('hub')} />
              <ActionButton label="Open local draft workspace" onPress={() => setWorkspace('draft')} />
            </View>
            <Muted>Local drafts stay on this device until an approved hub accepts them. Payments, stock deduction and table release remain desktop-only.</Muted>
          </View>
          <Hairline />
        </>
      ) : null}
      <View style={styles.block}>
        <Eyebrow>{copy.lastSynced}</Eyebrow>
        <Body>{sync.message}</Body>
        <Muted>{`${sync.connectivity === 'offline' ? copy.offline : copy.online} · ${sync.freshnessLabel}`}</Muted>
      </View>
      <Hairline />
      <View style={styles.block}>
        <Eyebrow>{copy.recent}</Eyebrow>
        {snapshot.activity.length === 0 ? <Muted>{copy.emptyActivity}</Muted> : null}
        {snapshot.activity.slice(0, 5).map((row) => (
          <View key={row.id}>
            <Row title={row.counterparty} detail={row.narrative} meta={formatInr(row.amountPaise)} />
            <Hairline />
          </View>
        ))}
      </View>
      {snapshot.alerts.map((alert) => (
        <View key={alert.id} style={[styles.alert, { borderColor: palette.line }]}>
          <Eyebrow>{alert.severity === 'warning' ? 'Alert' : 'Note'}</Eyebrow>
          <Body>{alert.title}</Body>
          <Muted>{alert.detail}</Muted>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: space[48] },
  block: { paddingHorizontal: space[20], paddingVertical: space[16], gap: space[8] },
  metrics: { paddingHorizontal: space[20], paddingBottom: space[8] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: space[16] },
  stack: { gap: space[8], marginTop: space[4] },
  alert: { marginHorizontal: space[20], marginTop: space[12], padding: space[16], borderWidth: StyleSheet.hairlineWidth },
});
