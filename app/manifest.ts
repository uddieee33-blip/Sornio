import type { MetadataRoute } from 'next';
import manifestJson from '@/lib/pwa/manifest.json';

/**
 * The installable-app manifest, served from `/manifest.webmanifest`.
 *
 * A shop counter is a phone with a charger cable, not a bookmarks bar. This
 * file is what lets an owner add DukaanOS to the home screen and open it
 * like the till software it is: standalone, splash-painted, straight into
 * the cockpit.
 *
 * Three decisions are recorded here because each one looks wrong in
 * isolation:
 *
 *   • The copy lives in `lib/pwa/manifest.json`, and this route only reads
 *     it — the same single-source rule as `lib/security/policy.json`. A
 *     manifest redefined here would drift from the file `verify:pwa` checks.
 *   • `start_url` is `/home`, not `/`. The landing page never forwards a
 *     signed-in owner into the console, so an installed icon that opened `/`
 *     would show marketing on every tap. `/home` opens the cockpit, or
 *     sign-in with the deep link preserved when the session lapsed.
 *   • The copy is English and sits outside the i18n catalogue on purpose.
 *     The manifest is browser chrome — the install prompt, the launcher
 *     label, the splash screen — and the browser fetches exactly one file.
 *     Per-locale manifests would need 23 routes and a negotiation the spec
 *     does not define; the voice matches the layout title instead.
 *
 * The whole-object cast below is honest about what it cannot prove: JSON
 * imports widen every enum to `string`, so TypeScript cannot tell
 * `standalone` from a typo. `npm run verify:pwa` proves the shape instead —
 * sizes, purposes, colours against the default paint — and fails the build
 * when this file and that script disagree.
 */
export default function manifest(): MetadataRoute.Manifest {
  return manifestJson as MetadataRoute.Manifest;
}
