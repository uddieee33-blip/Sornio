import { RestaurantScreen } from './RestaurantScreen';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { space, touch } from '@sornio/mobile-design';
import { ActionButton, Body, DemoBanner, Eyebrow, Hairline, Muted } from '../components/primitives';
import { copy } from '../i18n/en';
import { useCompanion } from '../app/CompanionContext';
import { useTheme, type ThemePreference } from '../theme/ThemeProvider';

const APPEARANCES: { id: ThemePreference; label: string }[] = [
  { id: 'system', label: copy.system },
  { id: 'dawn', label: copy.dawn },
  { id: 'dusk', label: copy.dusk },
];

export function SettingsScreen() {
  const { session, snapshot, sync, refresh, signOut, wipe } = useCompanion();
  const { palette, preference, setPreference } = useTheme();
  const [restaurant,setRestaurant]=useState(false);
  const [busy, setBusy] = useState(false);
  if(restaurant)return <RestaurantScreen onBack={()=>setRestaurant(false)}/>;
  return (
    <ScrollView contentContainerStyle={styles.pad}>
      {snapshot?.mode === 'demo' ? <DemoBanner text={copy.demoBanner} /> : null}
      <Section title="Restaurant drafts"><ActionButton label="Open restaurant workspace" onPress={()=>setRestaurant(true)}/></Section>
      <Section title={copy.account}>
        <Body>{session?.displayName ?? '—'}</Body>
        <Muted>{session?.userId ?? ''}</Muted>
      </Section>
      <Section title={copy.business}>
        <Body>{snapshot?.businessName ?? '—'}</Body>
        <Muted>{`${snapshot?.portalId ?? ''} · ${copy.role} ${snapshot?.role ?? ''}`}</Muted>
      </Section>
      <Section title={copy.appearance}>
        <View style={styles.row}>
          {APPEARANCES.map((item) => {
            const active = preference === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setPreference(item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.chip,
                  { borderColor: palette.line, backgroundColor: active ? palette.brand : palette.lift },
                ]}
              >
                <Text style={{ color: active ? palette.brandInk : palette.ink }}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>
      <Section title={copy.sync}>
        <Body>{sync.message}</Body>
        <Muted>{`${sync.freshnessLabel} · cursor ${sync.cursor ?? 'none'}`}</Muted>
        <ActionButton
          label={copy.refresh}
          onPress={() => {
            setBusy(true);
            refresh().finally(() => setBusy(false));
          }}
          disabled={busy}
        />
        <Muted>{copy.liveDisabled}</Muted>
      </Section>
      <Section title={copy.device}>
        <Body>{session?.device.displayName ?? '—'}</Body>
        <Muted>{`${session?.device.platform ?? 'unknown'} · ${session?.device.enrollmentStatus ?? 'unregistered'}`}</Muted>
      </Section>
      <Section title="Local cache">
        <Muted>Business snapshots stay in memory. Stock-count drafts are saved separately in device secure storage; remove each saved count from its stock item. This cache action clears the session snapshot.</Muted>
        <ActionButton
          label={copy.wipeCache}
          onPress={() =>
            Alert.alert(copy.wipeCache, copy.wipeConfirm, [
              { text: copy.cancel, style: 'cancel' },
              { text: copy.wipeCache, onPress: () => wipe() },
            ])
          }
        />
      </Section>
      <Section title={copy.signOut}>
        <ActionButton
          label={copy.signOut}
          danger
          onPress={() =>
            Alert.alert(copy.signOut, copy.signOutConfirm, [
              { text: copy.cancel, style: 'cancel' },
              { text: copy.signOut, style: 'destructive', onPress: () => signOut() },
            ])
          }
        />
      </Section>
      <View style={styles.block}>
        <Muted>{copy.version}</Muted>
        <Muted>Application id com.sornio.companion</Muted>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <Eyebrow>{title}</Eyebrow>
      {children}
      <Hairline />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingBottom: space[48] },
  block: { paddingHorizontal: space[20], paddingTop: space[16], gap: space[8] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  chip: {
    minHeight: touch - 8,
    paddingHorizontal: space[12],
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
  },
});
