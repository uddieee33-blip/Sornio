import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ScreenId } from '@sornio/mobile-contracts';
import { layout, space, touch } from '@sornio/mobile-design';
import { useCompanion } from '../app/CompanionContext';
import { copy } from '../i18n/en';
import { HomeScreen } from '../screens/HomeScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { CustomersScreen } from '../screens/CustomersScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ErrorState, PermissionDenied } from '../components/states';
import { useTheme } from '../theme/ThemeProvider';
import { vocabularyFor } from '@sornio/mobile-contracts';

const LABELS: Record<ScreenId, string> = {
  home: copy.home,
  activity: copy.activity,
  inventory: copy.inventory,
  customers: copy.customers,
  settings: copy.settings,
};

export function AppNavigation() {
  const { width, height } = useWindowDimensions();
  const landscape = width > height && width >= layout.tabletMin;
  const wide = width >= layout.tabletMin;
  const { screen, screens, setScreen, snapshot, error } = useCompanion();
  const terms = vocabularyFor(snapshot?.portalId ?? 'general');
  const labels: Record<ScreenId, string> = {
    ...LABELS,
    inventory: terms.stock,
    customers: terms.customers,
  };
  const body = error && !snapshot ? <ErrorState title="Cannot open Sornio" detail={error} /> : renderScreen(screen, screens);
  if (wide) {
    return (
      <View style={landscape ? styles.row : styles.row}>
        <Rail screens={screens} current={screen} onChange={setScreen} labels={labels} />
        <View style={styles.stage}>{body}</View>
      </View>
    );
  }
  return (
    <View style={styles.column}>
      <View style={styles.stage}>{body}</View>
      <TabBar screens={screens} current={screen} onChange={setScreen} labels={labels} />
    </View>
  );
}

function renderScreen(screen: ScreenId, allowed: ScreenId[]) {
  if (!allowed.includes(screen)) {
    return <PermissionDenied />;
  }
  switch (screen) {
    case 'home':
      return <HomeScreen />;
    case 'activity':
      return <ActivityScreen />;
    case 'inventory':
      return <InventoryScreen />;
    case 'customers':
      return <CustomersScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

function TabBar({
  screens,
  current,
  onChange,
  labels,
}: {
  screens: ScreenId[];
  current: ScreenId;
  onChange: (screen: ScreenId) => void;
  labels: Record<ScreenId, string>;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, space[8]), backgroundColor: palette.nav, borderTopColor: palette.line }]}
    >
      {screens.map((id) => {
        const active = id === current;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labels[id]}
            style={styles.tab}
          >
            <Text style={{ color: active ? palette.navActive : palette.muted, fontWeight: active ? '700' : '500' }}>
              {labels[id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Rail({
  screens,
  current,
  onChange,
  labels,
}: {
  screens: ScreenId[];
  current: ScreenId;
  onChange: (screen: ScreenId) => void;
  labels: Record<ScreenId, string>;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.rail,
        { paddingTop: insets.top + space[24], backgroundColor: palette.nav, borderRightColor: palette.line },
      ]}
    >
      <Text style={[styles.brand, { color: palette.ink }]}>{copy.appName}</Text>
      {screens.map((id) => {
        const active = id === current;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.railItem, active ? { borderLeftColor: palette.navActive } : { borderLeftColor: 'transparent' }]}
          >
            <Text style={{ color: active ? palette.navActive : palette.muted, fontWeight: active ? '700' : '500' }}>
              {labels[id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = {
  row: { flex: 1, flexDirection: 'row' as const },
  column: { flex: 1 },
  stage: { flex: 1 },
  tabs: {
    flexDirection: 'row' as const,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space[8],
  },
  tab: { flex: 1, minHeight: touch, alignItems: 'center' as const, justifyContent: 'center' as const },
  rail: {
    width: layout.railWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[16],
    gap: space[8],
  },
  railItem: { minHeight: touch, justifyContent: 'center' as const, borderLeftWidth: 2, paddingLeft: space[12] },
  brand: { fontSize: 20, fontWeight: '600' as const, marginBottom: space[16] },
};
