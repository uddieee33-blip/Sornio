# Sornio visual identity — implementation guide

Sornio is the customer-facing name of the former DukaanOS project. Keep legacy program identifiers (database keys, environment names, persisted WebView2 profile paths, package namespaces and deployed URLs) unchanged until a separate, tested migration is available.

## Design principles

- Calm, businesslike and approachable: neutral charcoal, silver/slate, restrained dimensionality only in the icon.
- The approved mark is a soft curved S, not an angular growth-chart ribbon.
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

The new default is **Monsoon**, a neutral blue-grey light theme. Midnight remains the system-dark default. Existing ten paints and the density, typography, motion and privacy settings stay available. Owner selections survive reload; do not replace them merely to force the default.

## Rules for extending the app

1. Reuse `BrandIcon` and `BrandWordmark` rather than copy-pasting logo SVG into pages.
2. Reuse `AppearanceMenu`; it already appears in the top bar, desktop sidebar, mobile drawer, sign-in and onboarding.
3. Use `text-stone-900`, `bg-panel`, `border-stone-200`, `text-portal` and other configured semantic utilities so every paint works without a second stylesheet.
4. Prefer a subtle active-item background and hairline. Avoid unnecessary shadows and transformations.
5. Preserve existing role/plan/module navigation guards when redesigning menus.
6. Update `locales/en.json` and all 22 `public/locales/*.json` catalogue files whenever changing extracted UI copy; a localized brand name is still Sornio.
7. Never rename a security secret, persisted key or executable identity merely to change text on the screen.

## Release checks

Run `npm run lint`, `npm run typecheck`, `npm run typecheck:native`, `npm run verify:theme`, `npm run verify:pwa`, `npm run verify:i18n` and build. Check the login screen, completed owner onboarding, sidebar, mobile drawer, app launcher, bills and settings in both light and dark modes. Validate role permissions, plan locks, keyboard focus and the distinction between connectivity and true offline functionality.

**Note:** The Windows WebView2 app currently embeds the hosted service. A fully offline-native Windows runtime, local database and LAN sync are separate engineering work, not something a theme change can provide.
