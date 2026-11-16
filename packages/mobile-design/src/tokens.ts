/**
 * Sornio companion tokens.
 * Dawn / Dusk follow the existing monsoon / graphite RGB fills without copying
 * another company's product chrome.
 */

export const space = {
  0: 0,
  2: 2,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
  64: 64,
} as const;

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '600' as const, letterSpacing: 0.2 },
  metric: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, letterSpacing: 0.15 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const, letterSpacing: 0.1 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const, letterSpacing: 0 },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, letterSpacing: 0.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const, letterSpacing: 0.4 },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 1.2 },
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
} as const;

export const touch = 44;

export type Appearance = 'dawn' | 'dusk';

export type Palette = {
  id: Appearance;
  page: string;
  ink: string;
  muted: string;
  line: string;
  lift: string;
  brand: string;
  brandInk: string;
  warning: string;
  warningInk: string;
  danger: string;
  positive: string;
  demo: string;
  demoInk: string;
  nav: string;
  navActive: string;
};

export const dawn: Palette = {
  id: 'dawn',
  page: '#F8F6EF',
  ink: '#1F2535',
  muted: '#5C6478',
  line: '#E4DFD4',
  lift: '#FFFEFA',
  brand: '#3343C2',
  brandInk: '#FFFFFF',
  warning: '#B45309',
  warningInk: '#F8F6EF',
  danger: '#9F1239',
  positive: '#0F766E',
  demo: '#F5E6C8',
  demoInk: '#7C4A03',
  nav: '#FFFEFA',
  navActive: '#3343C2',
};

export const dusk: Palette = {
  id: 'dusk',
  page: '#0E152B',
  ink: '#E8EBF7',
  muted: '#9AA3C2',
  line: '#2A3654',
  lift: '#162039',
  brand: '#3E4FCD',
  brandInk: '#FFFFFF',
  warning: '#FBBF24',
  warningInk: '#0E152B',
  danger: '#FDA4AF',
  positive: '#5EEAD4',
  demo: '#3B2A12',
  demoInk: '#F5E6C8',
  nav: '#162039',
  navActive: '#9EB0FF',
};

export const palettes = { dawn, dusk } as const;

export function paletteFor(appearance: Appearance): Palette {
  return palettes[appearance];
}

export const motion = {
  standardMs: 180,
  reducedMs: 0,
} as const;

export const layout = {
  phoneMax: 719,
  /** Any width at or above this is treated as a tablet surface. */
  tabletMin: 720,
  /**
   * Width at which the rail plus a readable workspace fits side by side.
   * Below this the app still uses the tablet frame but stacks the workspace
   * into one column, so a 744pt iPad mini in portrait is not left with a
   * 232pt rail beside a 492pt column of clipped controls.
   */
  railMin: 820,
  railWidth: 232,
  contentMax: 720,
  gutterPhone: 20,
  gutterTablet: 32,
} as const;
