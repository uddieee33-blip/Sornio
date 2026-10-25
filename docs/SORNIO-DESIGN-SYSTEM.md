# Sornio visual identity — implementation guide

Sornio is the customer-facing name of the former DukaanOS project. Keep legacy program identifiers (database keys, environment names, persisted WebView2 profile paths, package namespaces and deployed URLs) unchanged until a separate, tested migration is available.

## Design principles

- Approachable and confident: warm ivory, deep blue ink and cobalt, with mint and amber for purposeful accents. Public storytelling can use dimensional product compositions; everyday controls remain focused and legible.
- The approved mark is the folded silver-and-blue-gray ribbon in `docs/brand/sornio-approved-reference.jpeg`. Preserve the supplied artwork; do not substitute a conventional curved letter S.
- Use semantic colour tokens, not hardcoded dark/light colours in individual pages.
- Prioritize clear balances, bills, readable navigation, 44px touch targets and visible keyboard focus over decorative effects.
- No branded glows, animated gradients or large ambient background effects in daily-work screens.

## Single-source visual system

| Need | Source |
| --- | --- |
| App mark | `public/brand/sornio-app-icon.svg` |
| Reusable UI icon/wordmark | `components/ui/BrandLogo.tsx` |
| Mobile/desktop install icons | `public/brand/icon-*.png`, `public/brand/apple-touch-icon.png`, `desktop/windows/Sornio.ico` |
| Palette definitions | `lib/theme/palettes.json` |
| Generated CSS/preview data | `app/themes.css`, `lib/theme/paints.generated.json` |
| Theme persistence and OS matching | `lib/theme/appearance-provider.tsx` |
| Theme controls | `components/theme/appearance-menu.tsx` |
| Global navigation | `components/layout/topbar.tsx`, `sidebar.tsx`, `mobile-nav.tsx` |
| Installation metadata | `lib/pwa/manifest.json`, `app/layout.tsx` |

The default retains the **Monsoon** ID and is named **Sornio Dawn**, using warm ivory and cobalt. **Graphite / Sornio Dusk** supplies deep blue ink and cobalt. The old Sornio Light/Dark treatments are replaced in place so saved appearance choices resolve to the new colours. System matching and the quick light/dark toggle use this same pair. Existing ten paints and the density, typography, motion and privacy settings stay available. Owner selections survive reload; do not replace them merely to force the default.

## Rules for extending the app

1. Reuse `BrandIcon` and `BrandWordmark` rather than copy-pasting logo SVG into pages.
2. Reuse `AppearanceMenu`; it already appears in the top bar, desktop sidebar, mobile drawer, sign-in and onboarding.
3. Use `text-stone-900`, `bg-panel`, `border-stone-200`, `text-portal` and other configured semantic utilities so every paint works without a second stylesheet.
4. Use the shared 24px panel and 14px control geometry. Filled accent navigation identifies the current work area; use semantic foreground tokens and keep depth restrained.
5. Preserve existing role/plan/module navigation guards when redesigning menus.
6. Update `locales/en.json` and all 22 `public/locales/*.json` catalogue files whenever changing extracted UI copy; a localized brand name is still Sornio.
7. Preserve security secrets, persisted keys, WebView2 profile paths and namespaces. Windows output filenames use Sornio; its existing local profile path is retained.

## Release checks

Run `npm run lint`, `npm run typecheck`, `npm run typecheck:native`, `npm run verify:theme`, `npm run verify:pwa`, `npm run verify:i18n` and build. Check the login screen, completed owner onboarding, sidebar, mobile drawer, app launcher, bills and settings in both light and dark modes. Validate role permissions, plan locks, keyboard focus and the distinction between connectivity and true offline functionality.

**Note:** The Windows WebView2 app currently embeds the hosted service. A fully offline-native Windows runtime, local database and LAN sync are separate engineering work, not something a theme change can provide.
