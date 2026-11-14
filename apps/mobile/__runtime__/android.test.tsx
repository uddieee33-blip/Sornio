/**
 * Android regression acceptance.
 *
 * The companion shares one React Native tree across iOS, iPadOS and Android, so
 * every Phase 20 change to layout, session or list rendering can regress the
 * Android build. This suite repeats the behavioural assertions on an Android
 * device profile to prove the shared code still branches correctly there.
 *
 * It does not replace an Android emulator run or a debug APK install; the
 * `android` CI job still compiles the APK. See the Phase 20 review for the
 * distinction between compiled, executed headlessly and installed.
 */
import App from '../App';
import { device, mount, pressLabel, pressTab, screen, useDevice, visibleText, waitFor } from './harness';

async function enterDemo() {
  await mount(<App />);
  await pressLabel('Other Sornio modes');
  await pressLabel('Explore the companion demonstration');
  await waitFor(() => expect(screen.queryAllByRole('tab').length).toBe(5), { timeout: 4000 });
}

describe('Android · shared-code regression', () => {
  beforeEach(() => useDevice(device('Android mid-range portrait')));

  it('launches and reaches the shop connection chooser', async () => {
    const view = await mount(<App />);
    expect(visibleText(view)).toContain('Connect to your shop');
    view.unmount();
  });

  it('restores the demonstration session and shows the dashboard', async () => {
    await enterDemo();
    const text = visibleText(screen);
    expect(text).toContain('Sornio Demo Shop counter');
    expect(text).toContain('DEMO — these figures are not a live business record.');
  });

  it('keeps the phone tab bar rather than a tablet rail', async () => {
    await enterDemo();
    expect(screen.queryAllByRole('tab').length).toBe(5);
    expect(screen.queryAllByRole('menuitem').length).toBe(0);
  });

  it('navigates every tab using the same accessible names', async () => {
    await enterDemo();
    for (const tab of ['Activity', 'Inventory', 'Khata', 'More', 'Home']) {
      await pressTab(tab);
      expect(screen.getByRole('tab', { name: tab }).props.accessibilityState.selected).toBe(true);
    }
  });

  it('signs out without reopening a demonstration identity', async () => {
    await enterDemo();
    await pressTab('More');
    const { Alert } = require('react-native');
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((...args: unknown[]) => {
      const buttons = args[2] as { style?: string; onPress?: () => void }[] | undefined;
      buttons?.find((button) => button.style !== 'cancel')?.onPress?.();
    });
    await pressLabel('Sign out');
    spy.mockRestore();
    await waitFor(() => expect(visibleText(screen)).toContain('Signed out'));
    expect(visibleText(screen)).not.toContain('Sornio Demo Shop counter');
  });

  it('renders a virtualised Activity list without unmounting the tab bar', async () => {
    await enterDemo();
    await pressTab('Activity');
    expect(screen.queryAllByRole('tab').length).toBe(5);
    expect(visibleText(screen)).toContain('All');
  });
});
