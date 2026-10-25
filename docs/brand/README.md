# Approved Sornio artwork

The source of truth is `sornio-approved-reference.jpeg`, supplied by the owner
on 24 October 2026. It shows a folded ribbon with silver, muted blue-gray, and
dark overlapping faces. The conventional curved letter S introduced in PR #97
was not the approved mark.

`node scripts/build-brand-assets.mjs` selects the app tile and ribbon from that
reference, then packages the same artwork for the shared wordmark, favicon,
192/512/maskable PWA icons, Apple icon, and Windows ICO. The ribbon clip removes
the surrounding dark tile so it can sit on light and dark theme surfaces.
It does not replace the ribbon with an independently designed SVG glyph.

The delivered SVG files embed raster artwork. This reference is a JPEG mockup,
not an original vector master; the selected ribbon is approximately 127 by 205
source pixels. These assets preserve its appearance at app UI sizes. They are
not resolution-independent vector masters for large print. Keep the supplied
reference and this distinction when making future changes.

The wordmark lettering remains live theme-aware text and inherits the existing
foreground tokens. The existing Monsoon and Graphite IDs now provide Sornio Dawn and Sornio Dusk,
so saved choices continue to resolve. System matching and the quick mode toggle
use that same pair. Density, motion, text size and privacy preferences remain
available, together with the other eight palettes.

Visible names, translations, passkey display names and Windows output filenames
use Sornio. Storage keys, backup product identifiers, credential relying-party
IDs, namespaces and established deployment URLs retain compatibility values.
New landing phrases use English fallbacks pending native translation review.

The generator uses `sharp`, already installed by the locked Next.js dependency.
All output files are committed, so production does not run this generator.
