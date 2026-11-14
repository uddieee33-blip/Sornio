/**
 * iPad runtime acceptance.
 *
 * The requirement is that iPadOS is not a stretched phone. These tests assert
 * the layout *branch* the app chooses at each simulator width, which is the
 * decision the app actually makes at runtime — not a screenshot of it.
 *
 * Not proven here: real split-view/Stage Manager resizing, UIKit
 * `UISplitViewController` behaviour, pointer hover and hardware keyboard
 * focus. Those need a simulator and are reported as BLOCKED in the Phase 20
 * review rather than assumed from these results.
 */
import App from '../App';
import { device, mount, pressLabel, pressNav, pressRailItem, pressTab, screen, useDevice, visibleText, waitFor } from './harness';

async function enterDemo() {
  await mount(<App />);
  await pressLabel('Other Sornio modes');
  await pressLabel('Explore the companion demonstration');
  await waitFor(() => expect(screen.queryAllByRole('tab').length + screen.queryAllByRole('menuitem').length).toBeGreaterThanOrEqual(5), {
    timeout: 4000,
  });
}

describe('iPad · navigation frame', () => {
  it('uses the sidebar rail instead of a tab bar on iPad Pro 11 landscape', async () => {
    useDevice(device('iPad Pro 11 landscape'));
    await enterDemo();
    expect(screen.queryAllByRole('menuitem').length).toBe(5);
    expect(screen.queryAllByRole('tab').length).toBe(0);
  });

  it('uses the rail on iPad Pro 13 in a Stage Manager window', async () => {
    useDevice(device('iPad Pro 13 landscape (Stage Manager)'));
    await enterDemo();
    expect(screen.queryAllByRole('menuitem').length).toBe(5);
  });

  it('uses the rail on a 820pt iPad 10th generation in portrait', async () => {
    useDevice(device('iPad 10th generation portrait'));
    await enterDemo();
    expect(screen.queryAllByRole('menuitem').length).toBe(5);
  });

  it('stacks the frame rather than clipping on a 744pt iPad mini in portrait', async () => {
    // 744pt is above `tabletMin` (720) but below `railMin` (820). Before Phase 20
    // this width took the rail branch while every workspace inside it required
    // 820pt, so the rail consumed 232pt to show single-column content.
    useDevice(device('iPad mini (A17) portrait'));
    await enterDemo();
    expect(screen.queryAllByRole('tab').length).toBe(5);
    expect(screen.queryAllByRole('menuitem').length).toBe(0);
  });

  it('drops the rail for accessibility text sizes so figures are not clipped', async () => {
    useDevice({ ...device('iPad Pro 11 landscape'), fontScale: 2.0 });
    await enterDemo();
    expect(screen.queryAllByRole('tab').length).toBe(5);
    expect(screen.queryAllByRole('menuitem').length).toBe(0);
  });

  it('keeps the rail sticky across every section', async () => {
    useDevice(device('iPad Pro 11 landscape'));
    await enterDemo();
    for (const item of ['Activity', 'Inventory', 'Khata', 'More']) {
      await pressRailItem(item);
      expect(screen.getByRole('menuitem', { name: item }).props.accessibilityState.selected).toBe(true);
      expect(screen.queryAllByRole('menuitem').length).toBe(5);
    }
  });

  it('offers a way back to the shop connection from the rail', async () => {
    useDevice(device('iPad Pro 11 landscape'));
    await enterDemo();
    await pressLabel('Connect to a shop');
    const text = visibleText(screen);
    expect(text.join(' ')).toContain('Small business, big numbers.');
    // The chooser must still be reachable from here.
    await pressLabel('Sign in as an employee or manager');
    expect(visibleText(screen)).toContain('Connect to your shop');
  });
});

describe('iPad · list-detail behaviour', () => {
  it('renders both the customer list and a selected statement at once', async () => {
    useDevice(device('iPad Pro 11 landscape'));
    await enterDemo();
    await pressRailItem('Khata');
    const text = visibleText(screen);
    // The People screen selects the first row, so list + detail coexist.
    expect(text).toContain('Harpreet Kaur');
    expect(text.join(' ')).toContain('Statement');
  });

  it('still reaches the same detail from the phone layout', async () => {
    useDevice(device('iPhone 16 portrait'));
    await enterDemo();
    await pressNav('Khata');
    await pressLabel('Harpreet Kaur');
    await waitFor(() => expect(visibleText(screen).join(' ')).toContain('Statement'));
  });
});

describe('iPad · window resizing', () => {
  it('switches frame when the window crosses the rail breakpoint', async () => {
    useDevice(device('iPad Pro 11 landscape'));
    await enterDemo();
    expect(screen.queryAllByRole('menuitem').length).toBe(5);

    // Simulate the user dragging the Stage Manager window narrower than 820pt.
    useDevice({ ...device('iPad mini (A17) portrait'), width: 700, height: 1133 });
    await waitFor(() => expect(screen.queryAllByRole('tab').length).toBe(5), { timeout: 4000 });
    expect(screen.queryAllByRole('menuitem').length).toBe(0);

    // And back out again.
    useDevice(device('iPad Pro 11 landscape'));
    await waitFor(() => expect(screen.queryAllByRole('menuitem').length).toBe(5), { timeout: 4000 });
  });
});
