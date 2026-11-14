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
import { Body, Muted, Title } from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';
import { vocabularyFor } from '@sornio/mobile-contracts';
import { ids } from '../testing/identifiers';

const LABELS: Record<ScreenId, string> = {
  home: copy.home,
  activity: copy.activity,
  inventory: copy.inventory,
  customers: copy.customers,
  settings: copy.settings,
};

export function AppNavigation({ onLeaveDemo }: { onLeaveDemo?: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const wide = width >= layout.railMin && !largeText;
  const { screen, screens, setScreen, snapshot, error, booting, signedOut, startDemo } = useCompanion();
  const { palette } = useTheme();
  const terms = vocabularyFor(snapshot?.portalId ?? 'general');
  const labels: Record<ScreenId, string> = {
    ...LABELS,
    inventory: terms.stock,
    customers: terms.customers,
  };
  // `copy` is the single source of tab wording; vocabulary overrides it so the
  // spoken label always matches the visible one for this portal.
  const body = () => {
    if (booting) {
      return (
        <View style={styles.placeholder}>
          <Title>Opening Sornio</Title>
          <Muted>Restoring this device’s authorised session.</Muted>
        </View>
      );
    }
    if (signedOut && !snapshot) {
      return (
        <View style={styles.placeholder} testID={ids.signedOut}>
          <Title>Signed out</Title>
          <Muted>This device no longer holds a Sornio session. Signing out cleared the session keys kept for this account.</Muted>
          <Body>Open the demonstration again to review the companion, or connect to a shop to work with live records.</Body>
          <View style={styles.actions}>
            {startDemo ? (
              <Pressable
                accessibilityRole="button"
                testID={ids.reopenDemo}
                onPress={() => void startDemo()}
                style={[styles.primary, { backgroundColor: palette.brand }]}
              >
                <Text style={[styles.primaryLabel, { color: palette.brandInk }]}>Reopen the demonstration</Text>
              </Pressable>
            ) : null}
            {onLeaveDemo ? (
              <Pressable
                accessibilityRole="button"
                onPress={onLeaveDemo}
                style={[styles.secondary, { borderColor: palette.line }]}
              >
                <Text style={{ color: palette.ink }}>Connect to a shop</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    }
    if (error && !snapshot) {
      return <ErrorState title="Cannot open Sornio" detail={error} />;
    }
    return (
      <View style={{ flex: 1 }} testID={ids.screen(screen)}>
        {renderScreen(screen, screens)}
      </View>
    );
  };
  if (wide) {
    return (
      <View style={styles.row}>
        <Rail screens={screens} current={screen} onChange={setScreen} labels={labels} onLeaveDemo={onLeaveDemo} />
        <View style={styles.stage}>{body()}</View>
      </View>
    );
  }
  return (
    <View style={styles.column}>
      <View style={styles.stage}>{body()}</View>
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
      testID={ids.tabBar}
      style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, space[8]), backgroundColor: palette.nav, borderTopColor: palette.line }]}
    >
      {screens.map((id) => {
        const active = id === current;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            testID={ids.nav(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labels[id]}
            style={styles.tab}
          >
            <Text
              allowFontScaling
              style={{ color: active ? palette.navActive : palette.muted, fontWeight: active ? '700' : '500' }}
            >
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
  onLeaveDemo,
}: {
  screens: ScreenId[];
  current: ScreenId;
  onChange: (screen: ScreenId) => void;
  labels: Record<ScreenId, string>;
  onLeaveDemo?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="menu"
      testID={ids.rail}
      style={[
        styles.rail,
        { paddingTop: insets.top + space[24], backgroundColor: palette.nav, borderRightColor: palette.line },
      ]}
    >
      <Text allowFontScaling style={[styles.brand, { color: palette.ink }]}>{copy.appName}</Text>
      {screens.map((id) => {
        const active = id === current;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            testID={ids.nav(id)}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: active }}
            style={[styles.railItem, active ? { borderLeftColor: palette.navActive } : { borderLeftColor: 'transparent' }]}
          >
            <Text allowFontScaling style={{ color: active ? palette.navActive : palette.muted, fontWeight: active ? '700' : '500' }}>
              {labels[id]}
            </Text>
          </Pressable>
        );
      })}
      {onLeaveDemo ? (
        <Pressable
          accessibilityRole="button"
          onPress={onLeaveDemo}
          style={[styles.railItem, { borderLeftColor: 'transparent', marginTop: 'auto' }]}
        >
          <Text allowFontScaling style={{ color: palette.muted }}>Connect to a shop</Text>
        </Pressable>
      ) : null}
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
  placeholder: { padding: space[24], gap: space[12] },
  actions: { gap: space[12], marginTop: space[8] },
  primary: { minHeight: touch, borderRadius: 4, alignItems: 'center' as const, justifyContent: 'center' as const },
  primaryLabel: { fontWeight: '600' as const },
  secondary: {
    minHeight: touch,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
