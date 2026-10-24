/**
 * ESLint flat config.
 *
 * Next.js 16 removed the built-in `next lint` command, so linting now runs
 * through the ESLint CLI directly. The rule set is unchanged from the previous
 * `.eslintrc.json`, which extended `next/core-web-vitals` and `next/typescript`
 * — `eslint-config-next` ships those same presets as flat-config arrays, so we
 * spread them here in the same order to preserve identical rule precedence.
 *
 * `eslint-config-next` is CommonJS and exports a plain array, so a default
 * import yields that array under Node's ESM interop.
 */

import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/** Build output and dependencies are generated, never authored. */
const ignores = {
  ignores: ['.next/**', '.cache/**', 'out/**', 'build/**', 'dist/**', 'coverage/**', 'node_modules/**', 'next-env.d.ts'],
};

const config = [
  ignores,
  ...coreWebVitals,
  ...typescript,
  {
    // The preset scopes its rules by glob; make sure our source extensions are
    // actually linted when ESLint is invoked as `eslint .`.
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
  },
  {
    // Next.js loads `next.config.js` as CommonJS, and `postcss.config.js` /
    // `tailwind.config.ts` are consumed by CommonJS tooling, so `require()` is
    // the correct form there rather than a style violation.
    files: ['next.config.js', 'postcss.config.js', '*.config.{js,cjs,mjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];

export default config;
