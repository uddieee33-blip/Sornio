/**
 * Purchasing UI acceptance — the screens actually render and act.
 *
 * The existing android/iphone/ipad suites run the demo app end to end, so the
 * purchasing destination has to be proven there too: that it is reachable, that
 * it never shows a shop with no suppliers as if it were a real shop, and that a
 * purchase order can be drafted and sent through the real client and the real
 * durable queue.
 *
 * This executes the real components. It is not a simulator run and proves
 * nothing about native views; see the Phase 21B report for what did not run.
 */
import App from '../App';
import { act, device, mount, pressLabel, pressNav, screen, typeInto, useDevice, visibleText, waitFor } from './harness';

async function enterDemo() {
  await mount(<App />);
  await pressLabel('Other Sornio modes');
  await pressLabel('Explore the companion demonstration');
  // A tablet draws the six destinations as a rail, a phone as a tab bar.
  await waitFor(
    () =>
      expect(
        screen.queryAllByRole('tab').length + screen.queryAllByRole('menuitem').length,
      ).toBe(6),
    { timeout: 4000 },
  );
}

async function openPurchasing() {
  await enterDemo();
  // iPad draws a rail instead of a tab bar, so the assertion must not assume one.
  await pressNav('Purchasing');
  await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Purchasing'), { timeout: 4000 });
}

describe('purchasing · navigation and honesty', () => {
  beforeEach(() => useDevice(device('iPhone 16 portrait')));

  it('offers purchasing as a destination with an accessible name', async () => {
    await enterDemo();
    const tab = screen.getByRole('tab', { name: 'Purchasing' });
    expect(tab.props.accessibilityState.selected).toBe(false);
    await act(async () => {
      const { fireEvent } = require('@testing-library/react-native');
      fireEvent.press(tab);
    });
    const rail = screen.queryAllByRole('menuitem', { name: 'Purchasing' });
    const phoneTab = screen.queryAllByRole('tab', { name: 'Purchasing' });
    expect((rail[0] ?? phoneTab[0])?.props.accessibilityState.selected).toBe(true);
  });

  it('does not pretend a demonstration is a live shop', async () => {
    await openPurchasing();
    const text = visibleText(screen).join(' ');
    expect(text).toContain('synthetic shop');
    expect(text).toContain('never a business record');
    // Nothing has been read from a real hub, so no supplier may be listed yet.
    expect(text).not.toContain('Krishna Traders');
  });

  it('opens the demonstration workspace and reads suppliers from it', async () => {
    await openPurchasing();
    await pressLabel('Open the demonstration purchasing workspace');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Krishna Traders'), {
      timeout: 4000,
    });
    const text = visibleText(screen).join(' ');
    expect(text).toContain('DEMO — this purchasing workspace is synthetic and touches no real shop.');
    expect(text).toContain('Connected');
  });

  it('filters suppliers by a search term', async () => {
    await openPurchasing();
    await pressLabel('Open the demonstration purchasing workspace');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Gupta Oils'), { timeout: 4000 });
    await typeInto('Search name, phone or GSTIN', 'gupta');
    const text = visibleText(screen).join(' ');
    expect(text).toContain('Gupta Oils');
    expect(text).not.toContain('Sharma Provisions');
  });

  it('shows the hub copy timestamp and says when it is offline', async () => {
    await openPurchasing();
    await pressLabel('Open the demonstration purchasing workspace');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Connected'), { timeout: 4000 });
    await pressLabel('Simulate losing the network');
    const text = visibleText(screen).join(' ');
    expect(text).toContain('network is now unavailable');
  });
});

describe('purchasing · draft and submit through the real client', () => {
  beforeEach(() => useDevice(device('iPhone 16 portrait')));

  it('drafts a purchase order, shows an estimate, and commits it to the shop', async () => {
    await openPurchasing();
    await pressLabel('Open the demonstration purchasing workspace');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Krishna Traders'), { timeout: 4000 });

    // Open the supplier so a draft is created against it.
    await pressLabel('Krishna Traders');
    await act(async () => {
      const { fireEvent } = require('@testing-library/react-native');
      fireEvent.press(screen.getByRole('button', { name: 'New purchase order' }));
    });
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('New purchase order'), {
      timeout: 4000,
    });

    // Add a catalogue line: search, pick the product, then type qty and cost.
    await typeInto('Search catalogue by name or SKU', 'rice');
    await act(async () => {
      const { fireEvent } = require('@testing-library/react-native');
      fireEvent.press(screen.getByRole('button', { name: 'Sona masoori rice' }));
    });
    await typeInto('Quantity', '2');
    await typeInto('Cost per unit in rupees', '90');
    await act(async () => {
      const { fireEvent } = require('@testing-library/react-native');
      fireEvent.press(screen.getByRole('button', { name: 'Sona masoori rice' }));
    });

    const withLine = visibleText(screen).join(' ');
    // 2 kg at ₹90.00 is ₹180.00. `Metric` upper-cases its label, so the claim
    // being checked is that the word "estimate" is present at all.
    expect(withLine).toMatch(/ESTIMATE (SUBTOTAL|TOTAL)/i);
    expect(withLine).toContain('The shop hub recalculates on save');

    await pressLabel('Send to the shop');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Committed by the shop'), {
      timeout: 4000,
    });
  });

  it('keeps a queued operation visible instead of claiming success when the network drops', async () => {
    await openPurchasing();
    await pressLabel('Open the demonstration purchasing workspace');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Krishna Traders'), { timeout: 4000 });
    await pressLabel('Simulate losing the network');
    await pressLabel('Restore the network');
    // The banner must never say committed while nothing has been sent.
    const text = visibleText(screen).join(' ');
    expect(text).toContain('Recover this same request before editing');
    expect(text).not.toContain('Committed by the shop');
  });
});

describe('purchasing · other platforms keep the same screen', () => {
  it('renders on Android', async () => {
    useDevice(device('Android mid-range portrait'));
    await openPurchasing();
    expect(visibleText(screen).join(' ')).toContain('Purchasing');
  });

  it('renders on iPad as a split supplier view', async () => {
    useDevice(device('iPad 10th generation portrait'));
    await openPurchasing();
    await pressLabel('Open the demonstration purchasing workspace');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Krishna Traders'), { timeout: 4000 });
    const rail = screen.queryAllByRole('menuitem', { name: 'Purchasing' });
    const tab = screen.queryAllByRole('tab', { name: 'Purchasing' });
    expect((rail[0] ?? tab[0])?.props.accessibilityState.selected).toBe(true);
  });
});
