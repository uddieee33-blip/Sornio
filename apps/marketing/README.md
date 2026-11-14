# Sornio public product website

A separate static marketing surface; it never loads the native business database or renders the POS. Serve this directory with any static host, or run `node scripts/build-marketing.mjs` from the repository root to create `apps/marketing/dist`.

Public installers are disabled by default. Only configure `release-manifest.json` after mandatory native financial, security, Windows installer and lifecycle gates pass. A Windows entry requires status `verified`, version, SHA-256 and an actual official GitHub release `.exe` URL. A valid manifest is an editorial release decision, not a replacement for verification evidence. Do not point it at workflow artifacts or development installers.

Pricing is unannounced; contact links use the existing project issue tracker. No invented customer statistics, testimonials, addresses or payment details. The private hosted review uses a separate source mirror of this directory.
