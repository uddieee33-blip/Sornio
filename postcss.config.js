/**
 * Tailwind 4 is a PostCSS plugin in its own package (`@tailwindcss/postcss`),
 * and it vendors its own vendor-prefixing — so `autoprefixer` is no longer in
 * the pipeline rather than merely redundant.
 *
 * The JavaScript config is still the one source of truth for colour ramps,
 * motion tokens and easing: `app/globals.css` loads it with `@config`, and
 * `scripts/verify-motion.mjs` reads it back as text.
 */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
