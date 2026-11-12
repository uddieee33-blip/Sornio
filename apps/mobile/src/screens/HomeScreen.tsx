import { RestaurantScreen } from './RestaurantScreen';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { formatInr, vocabularyFor } from '@sornio/mobile-contracts';
import { space } from '@sornio/mobile-design';
import { Body, DemoBanner, Eyebrow, Hairline, Metric, Muted, Row, Title } from '../components/primitives';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';
import { useTheme } from '../theme/ThemeProvider';

export function HomeScreen() {
  const { snapshot, sync, session } = useCompanion();
  const { palette } = useTheme();
  const { width } = useWindowDimensions();
  if(snapshot?.portalId==='cafe')return <RestaurantScreen/>;
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
  return (
    <ScrollView contentContainerStyle={styles.pad}>
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
      <View style={styles.block}>
        <Eyebrow>{copy.lastSynced}</Eyebrow>
        <Body>{sync.message}</Body>
        <Muted>{`${sync.connectivity === 'offline' ? copy.offline : copy.online} · ${sync.freshnessLabel}`}</Muted>
      </View>
      <Hairline />
      <View style={styles.block}>
        <Eyebrow>{copy.recent}</Eyebrow>
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
  alert: { marginHorizontal: space[20], marginTop: space[12], padding: space[16], borderWidth: StyleSheet.hairlineWidth },
});
