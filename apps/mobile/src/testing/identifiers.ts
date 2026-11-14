/**
 * Stable handles for native UI automation.
 *
 * These strings are a contract with `apps/mobile/ios-tests/`. Changing one is a
 * breaking change for the XCUITest suites, so they are named for *structure*
 * (`nav.settings`, `tablet.rail`) rather than for a label, an icon or a copy
 * string that a redesign is free to change.
 *
 * Rules followed here:
 *  - one identifier per control the tests genuinely drive, not one per view;
 *  - no business data in an identifier (no customer id, no amount, no phone);
 *  - `testID` is additive: it sets `accessibilityIdentifier` for XCTest and does
 *    not change the `accessibilityLabel` VoiceOver speaks, so the screen-reader
 *    experience is untouched.
 */
export const ids = {
  /** Set only once the React tree has mounted and the start screen is drawn. */
  ready: 'app.ready',
  chooser: 'app.mode-chooser',
  demoEnter: 'app.demo.enter',

  nav: (screen: string) => `nav.${screen}`,
  rail: 'tablet.rail',
  tabBar: 'phone.tabbar',
  /** Present on a screen while it is the visible destination. */
  screen: (screen: string) => `screen.${screen}`,

  list: 'tablet.list',
  detail: 'tablet.detail',
  customerRow: (id: string) => `people.row.${id}`,

  restaurantOpen: 'restaurant.open',
  restaurantKitchen: 'restaurant.kitchen',
  restaurantScreen: 'screen.restaurant',

  /**
   * Which state the app settled into. Rendered as a small off-screen marker so a
   * failing native test can report where the app actually was — phase only, no
   * business data.
   */
  phase: (phase: string) => `app.phase.${phase}`,

  signOut: 'session.signout',
  signedOut: 'session.signed-out',
  reopenDemo: 'session.reopen-demo',
} as const;

/** Fast lookup for "is this identifier a live screen marker". */
export function isScreenId(value: string): boolean {
  return value.startsWith('screen.') || value.startsWith('nav.');
}
