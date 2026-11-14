/**
 * iPhone runtime acceptance.
 *
 * These execute the real `App.tsx` component tree in Node. That makes them
 * genuine runtime evidence for the JavaScript application: startup, navigation,
 * rendering, session lifecycle and layout branching all run.
 *
 * They are NOT simulator evidence. No native view is rasterised, no UIKit
 * layout is performed and no iOS runtime service is exercised. See
 * docs/reviews/phase20-ios-ipados-product-completion.md for the distinction.
 */
import App from '../App';
import { device, mount, pressLabel, pressTab, screen, useDevice, visibleText, waitFor } from './harness';

import { vocabularyFor } from '@sornio/mobile-contracts';

const terms = vocabularyFor('kirana');

async function enterDemo() {
  await mount(<App />);
  await pressLabel('Other Sornio modes');
  await pressLabel('Explore the companion demonstration');
  await waitFor(() => expect(screen.queryAllByRole('tab').length).toBe(5), { timeout: 4000 });
}

async function confirmSignOut() {
  const { Alert } = require('react-native');
  const spy = jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
    const buttons = args[2] as { style?: string; onPress?: () => void }[] | undefined;
    buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
  });
  await pressLabel('Sign out');
  spy.mockRestore();
}

describe('iPhone · startup and navigation', () => {
  beforeEach(() => useDevice(device('iPhone 16 portrait')));

  it('launches into the shop connection chooser without crashing', async () => {
    const view = await mount(<App />);
    const text = visibleText(view);
    expect(text).toContain('Connect to your shop');
    expect(text).toContain('Draft & submission');
    expect(text).toContain(
      'No shop found yet. Keep the desktop hub enabled on the same Wi-Fi; firewall, guest-network isolation or multicast restrictions can block discovery.',
    );
    view.unmount();
  });

  it('offers a route out of the connection screen', async () => {
    const view = await mount(<App />);
    await pressLabel('Other Sornio modes');
    const text = visibleText(view);
    expect(text).toContain('SORNIO');
    expect(text).toContain('Small business, big numbers.');
    view.unmount();
  });

  it('keeps the phone tab bar on a 375pt iPhone SE', async () => {
    useDevice(device('iPhone SE (3rd generation) portrait'));
    await enterDemo();
    expect(screen.queryAllByRole('tab').length).toBe(5);
    expect(screen.queryAllByRole('menuitem').length).toBe(0);
  });
});

describe('iPhone · demonstration workspace', () => {
  beforeEach(() => useDevice(device('iPhone 16 portrait')));

  it('restores a demonstration session and shows the business dashboard', async () => {
    await enterDemo();
    const text = screen.queryAllByText(/./).length > 0 ? visibleText(screen) : [];
    expect(text).toContain('Sornio Demo Shop counter');
    expect(text).toContain("TODAY'S SALES");
    expect(text).toContain('DEMO — these figures are not a live business record.');
    expect(text).toContain('Aman Singh · owner');
  });

  it('shows tabs rather than the tablet rail on a phone', async () => {
    await enterDemo();
    expect(screen.queryAllByRole('menuitem').length).toBe(0);
  });

  it('navigates to every tab and returns to Home', async () => {
    await enterDemo();
    const tabs = screen.getAllByRole('tab').map((node) => node.props.accessibilityLabel as string);
    // Spoken labels must match the visible wording for this portal's vocabulary.
    expect(tabs).toEqual(['Home', 'Activity', 'Inventory', 'Khata', 'More']);
    for (const tab of ['Activity', terms.stock, terms.customers, 'More']) {
      await pressTab(tab);
      expect(screen.getByRole('tab', { name: tab }).props.accessibilityState.selected).toBe(true);
    }
    await pressTab('Home');
    expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState.selected).toBe(true);
  });

  it('clears the session on sign-out and does not silently reopen a demo identity', async () => {
    await enterDemo();
    await pressTab('More');
    await confirmSignOut();

    await waitFor(() => expect(visibleText(screen)).toContain('Signed out'));
    const text = visibleText(screen);
    // Regression: sign-out used to call bootstrap(), which immediately created a
    // fresh demonstration session, so the owner could never actually leave.
    expect(text).not.toContain('Sornio Demo Shop counter');
    expect(text.join(' ')).toContain('This device no longer holds a Sornio session.');
  });

  it('can deliberately re-enter the demonstration after signing out', async () => {
    await enterDemo();
    await pressTab('More');
    await confirmSignOut();
    await waitFor(() => expect(visibleText(screen)).toContain('Signed out'));

    await pressLabel('Reopen the demonstration');
    await waitFor(() => expect(visibleText(screen)).toContain('Sornio Demo Shop counter'));
  });

  it('never presents the kirana dashboard as a restaurant workspace', async () => {
    await enterDemo();
    expect(visibleText(screen)).not.toContain('Connect to the shop hub');
    expect(screen.queryAllByRole('tab').length).toBe(5);
  });

  it('keeps the tab bar when accessibility text is very large', async () => {
    useDevice(device('iPhone 16 with accessibility text'));
    await enterDemo();
    expect(screen.queryAllByRole('tab').length).toBe(5);
    expect(screen.queryAllByRole('menuitem').length).toBe(0);
  });
});
