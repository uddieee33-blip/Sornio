/**
 * Shared helpers for headless runtime acceptance.
 *
 * These drive the real screens the way a person does — pressing labelled
 * buttons, typing into labelled fields — rather than reaching into component
 * internals. A query that cannot find a control is a genuine usability defect
 * (an unreachable or unlabelled control), so tests are allowed to fail on it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

export type DeviceProfile = {
  name: string;
  width: number;
  height: number;
  fontScale?: number;
  /** Platform id passed to the mocked native Dimensions module. */
  platform: 'ios' | 'android';
};

/** Logical points as reported by an iPhone/iPad simulator, portrait unless named. */
export const DEVICES: Record<string, DeviceProfile> = {
  'iPhone SE (3rd generation) portrait': { name: 'iPhone SE 3', width: 375, height: 667, platform: 'ios' },
  'iPhone 16 portrait': { name: 'iPhone 16', width: 393, height: 852, platform: 'ios' },
  'iPhone 16 Pro Max landscape': { name: 'iPhone 16 Pro Max', width: 956, height: 440, platform: 'ios' },
  'iPhone 16 with accessibility text': { name: 'iPhone 16 · AX3', width: 393, height: 852, fontScale: 2.0, platform: 'ios' },
  'iPad mini (A17) portrait': { name: 'iPad mini', width: 744, height: 1133, platform: 'ios' },
  'iPad 10th generation portrait': { name: 'iPad 10', width: 820, height: 1180, platform: 'ios' },
  'iPad Pro 11 landscape': { name: 'iPad Pro 11', width: 1194, height: 834, platform: 'ios' },
  'iPad Pro 13 landscape (Stage Manager)': { name: 'iPad Pro 13', width: 1366, height: 1024, platform: 'ios' },
  'Android mid-range portrait': { name: 'Pixel 7', width: 412, height: 915, platform: 'android' },
};

/**
 * Applies a device profile to the mocked native Dimensions module. Every layout
 * decision in the companion reads `useWindowDimensions()`, so this is the single
 * lever that reproduces a device's layout branch.
 */
export function useDevice(profile: DeviceProfile | undefined) {
  if (!profile) throw new Error('Unknown device profile.');
  const { Dimensions, PixelRatio, Platform } = require('react-native');
  const scale = profile.fontScale ?? 1;
  Dimensions.set({
    window: { width: profile.width, height: profile.height, scale: 2, fontScale: scale },
    screen: { width: profile.width, height: profile.height, scale: 2, fontScale: scale },
  });
  PixelRatio.getFontScale = () => scale;
  Platform.OS = profile.platform;
}

type Tree = { children?: unknown } | string | null | undefined | unknown[];

/** Device profiles are declared with an index signature, so reads are optional. */
export function device(name: string): DeviceProfile {
  const profile = DEVICES[name];
  if (!profile) throw new Error(`Unknown device profile: ${name}`);
  return profile;
}

/** Every rendered string in document order. */
export function visibleText(view: { toJSON(): unknown }): string[] {
  const out: string[] = [];
  const walk = (node: Tree) => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child as Tree));
      return;
    }
    if (node && typeof node === 'object') {
      if ('children' in node) walk((node as { children?: unknown }).children as Tree);
    }
  };
  walk(view.toJSON() as Tree);
  return out;
}

export async function pressLabel(label: string | RegExp) {
  const target = await screen.findByRole('button', { name: label });
  await act(async () => {
    fireEvent.press(target);
  });
  return target;
}

/** Presses a tab within a phone tab bar. */
export async function pressTab(label: string | RegExp) {
  const target = await screen.findByRole('tab', { name: label });
  await act(async () => {
    fireEvent.press(target);
  });
  return target;
}

/** Presses an item in the tablet sidebar rail (role `menuitem`). */
export async function pressRailItem(label: string | RegExp) {
  const target = await screen.findByRole('menuitem', { name: label });
  await act(async () => {
    fireEvent.press(target);
  });
  return target;
}

/** Presses whichever navigation control the current frame uses. */
export async function pressNav(label: string | RegExp) {
  const rail = screen.queryAllByRole('menuitem', { name: label });
  if (rail.length > 0) return pressRailItem(label);
  return pressTab(label);
}

export async function typeInto(label: string | RegExp, text: string) {
  const field = await screen.findByLabelText(label);
  await act(async () => {
    fireEvent.changeText(field, text);
  });
  return field;
}

/** Mounts a component and lets the asynchronous bootstrap settle. */
export async function mount(element: React.ReactElement) {
  const view = await render(element);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

export { act, fireEvent, render, screen, waitFor };
