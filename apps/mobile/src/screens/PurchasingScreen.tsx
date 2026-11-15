/**
 * The Purchasing destination of the companion.
 *
 * Two modes reach this screen and they are kept strictly apart:
 *
 *  - **demo**: a synthetic hub in memory (`demoPurchasing`). Every figure is
 *    marked as demonstration data and nothing can reach a shop, because the
 *    demo "hub" only exists inside this process.
 *  - **live**: only reachable with a paired device, a pinned certificate and a
 *    signed-in employee, all of which the LAN connection screen establishes.
 *    This screen never invents a session; without one it says so and offers the
 *    connection flow instead of showing an empty workspace that looks like a
 *    shop with no suppliers.
 */
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { space } from '@sornio/mobile-design';
import { ActionButton, Body, Eyebrow, Muted, Title } from '../components/primitives';
import { useCompanion } from '../app/CompanionContext';
import { createSecureStore } from '../storage/secureStore';
import { PurchasingPanel } from '../purchasing/PurchasingPanel';
import { demoPurchasing } from '../purchasing/demoHub';
import { purchasingClient } from '../purchasing/client';
import { hubWire } from '../lan/transport';
import type { PurchasingSession } from '../purchasing/client';
import { useTheme } from '../theme/ThemeProvider';
import { ids } from '../testing/identifiers';

/**
 * A live session supplied by the LAN pairing flow.
 *
 * `null` is the normal state for a companion that has never connected, and the
 * screen must stay in its "not connected" branch rather than render a workspace.
 */
export type LivePurchasingSession = {
  origin: string;
  hubId: string;
  businessId: string;
  deviceId: string;
  certificateSha256: string;
  session: () => PurchasingSession | null;
};

export function PurchasingScreen({ live }: { live?: LivePurchasingSession }) {
  const { snapshot } = useCompanion();
  const { palette } = useTheme();
  const demoMode = snapshot?.mode === 'demo';
  const [showDemo, setShowDemo] = useState(false);

  // One demo hub per mount: the seeded suppliers must not accumulate every time
  // the tab is reopened.
  const demoRef = useRef<ReturnType<typeof demoPurchasing> | null>(null);
  const demo = useMemo(() => {
    if (!demoMode) return null;
    demoRef.current ??= demoPurchasing();
    return demoRef.current;
  }, [demoMode]);

  const demoClient = useMemo(() => (demo ? demo.client() : null), [demo]);

  if (demoMode) {
    if (!showDemo) {
      return (
        <ScrollView contentContainerStyle={styles.pad} testID={ids.purchaseSuppliers}>
          <Eyebrow>Purchasing</Eyebrow>
          <Title>Suppliers, orders and payables</Title>
          <Body>
            In the demonstration, purchasing runs against a synthetic shop held only in this device’s memory.
          </Body>
          <Muted>
            A live shop is reached through the private HTTPS hub after the owner approves this device. Demonstration
            figures are never a business record and never reach a shop.
          </Muted>
          <View style={styles.actions}>
            <ActionButton
              label="Open the demonstration purchasing workspace"
              onPress={() => setShowDemo(true)}
              testID={ids.purchaseSupplierAdd}
            />
          </View>
          <Muted>
            You can raise orders, receive goods, record payments and take returns. Each one goes through the same
            durable queue the phone uses against a real shop, so you can see what “Awaiting confirmation” looks like
            when the network disappears.
          </Muted>
        </ScrollView>
      );
    }
    if (!demo || !demoClient) return null;
    return (
      <PurchasingPanel
        client={demoClient}
        demo
        onDemoOffline={demo.goOffline}
        onDemoOnline={demo.comeOnline}
      />
    );
  }

  if (!live) {
    return (
      <ScrollView contentContainerStyle={styles.pad} testID={ids.purchaseSuppliers}>
        <Eyebrow>Purchasing</Eyebrow>
        <Title>Connect to your shop</Title>
        <Body>
          Supplier balances, purchase orders and payments live on the shop’s desktop hub. This phone needs an approved
          device and an employee sign-in before it can read them.
        </Body>
        <Muted>
          Connecting requires the same private network and a certificate you have compared with the desktop. Nothing is
          shown until the hub authorises this employee.
        </Muted>
        <View style={[styles.notice, { borderColor: palette.line }]}>
          <Muted>
            Live purchasing is opened from the shop connection screen. This build does not carry supplier data between
            shops, and a stolen phone cannot read it without the encrypted device store and a valid session.
          </Muted>
        </View>
      </ScrollView>
    );
  }

  const client = purchasingClient({
    // Fail closed: if encrypted storage is unavailable this throws instead of
    // keeping a queued payment in memory.
    secure: createSecureStore(true),
    identity: {
      origin: live.origin,
      hubId: live.hubId,
      businessId: live.businessId,
      deviceId: live.deviceId,
      certificateSha256: live.certificateSha256,
    },
    session: live.session,
    // The real transport: OS trust plus the pin the owner confirmed, checked on
    // the same TLS connection before any header or body is sent.
    wire: hubWire(live.origin, live.certificateSha256),
  });

  return <PurchasingPanel client={client} />;
}

const styles = StyleSheet.create({
  pad: { padding: space[20], gap: space[12] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  notice: { padding: space[12], borderWidth: 1 },
});
