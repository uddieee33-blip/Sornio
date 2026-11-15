/**
 * A deterministic purchasing hub for the demonstration workspace.
 *
 * The demonstration mode has no shop, so it has no real hub. Rather than let the
 * purchasing screens render invented *live* data — the one thing this phase must
 * never do — the demo path runs the same `purchasingClient` against this seed.
 *
 * It is built from the very same reference hub the protocol tests execute, so
 * the demo cannot drift into behaviour the real contract forbids: a refused
 * action is refused here too, and an offline queue behaves the same way.
 *
 * Everything here is marked synthetic by `DemoBanner` in the UI. No demo figure
 * is ever written to a shop, and demo records live only in memory.
 */
import { MemorySecureStore } from '@sornio/mobile-contracts';
import { purchasingClient } from './client';
import {
  purchasingWireFor,
  referencePurchasingHub,
  type ReferencePurchasingHub,
} from '../../__runtime__/lan/reference-purchasing-hub';

export const DEMO_HUB_ID = 'demo-hub-purchasing';
export const DEMO_BUSINESS_ID = 'demo-business-purchasing';
export const DEMO_DEVICE_ID = 'demo-device-purchasing';
export const DEMO_PASSWORD = 'demo-only';

export type DemoPurchasing = {
  hub: ReferencePurchasingHub;
  client: () => ReturnType<typeof purchasingClient>;
  /** Drop the next requests to demonstrate the offline path. */
  goOffline: () => void;
  comeOnline: () => void;
};

/**
 * Builds the demo hub, its sample shop and a client over a memory-only store.
 *
 * The store is `MemorySecureStore` on purpose: a demonstration must never leave
 * encrypted purchasing records on a real device. Live data uses
 * `createSecureStore(true)`, which fails closed instead.
 */
export function demoPurchasing(): DemoPurchasing {
  const hub = referencePurchasingHub({ hubId: DEMO_HUB_ID, businessId: DEMO_BUSINESS_ID });

  hub.addEmployee('owner', DEMO_PASSWORD, 'Demonstration owner', 'owner');
  hub.addEmployee('assistant', DEMO_PASSWORD, 'Demonstration assistant', 'assistant_manager');

  hub.addProduct('demo-rice', 'Sona masoori rice', 'RICE-SONA', 'kg');
  hub.addProduct('demo-oil', 'Sunflower oil', 'OIL-1L', 'litre');
  hub.addProduct('demo-sugar', 'Sugar', 'SUGAR', 'kg');
  hub.addProduct('demo-tea', 'Assam tea', 'TEA-ASSAM', 'kg');

  hub.addSupplier({ id: 'demo-krishna', name: 'Krishna Traders', phone: '98000 00001' });
  hub.addSupplier({ id: 'demo-gupta', name: 'Gupta Oils', phone: '98000 00002' });
  hub.addSupplier({ id: 'demo-sharma', name: 'Sharma Provisions', phone: '98000 00003' });

  hub.pair(DEMO_DEVICE_ID, 'd'.repeat(64), 'owner');

  const store = new MemorySecureStore();
  const session = hub.signIn(DEMO_DEVICE_ID, 'd'.repeat(64), 'owner', DEMO_PASSWORD);

  return {
    hub,
    client: () =>
      purchasingClient({
        secure: store,
        identity: {
          origin: 'https://demo.sornio.invalid:8443',
          hubId: DEMO_HUB_ID,
          businessId: DEMO_BUSINESS_ID,
          deviceId: DEMO_DEVICE_ID,
          certificateSha256: 'd'.repeat(64),
        },
        session: () => session,
        wire: purchasingWireFor(hub),
      }),
    goOffline: () => hub.dropNextRequests(99),
    comeOnline: () => hub.dropNextRequests(0),
  };
}
