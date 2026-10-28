import { defineConfig } from 'vite';

export default defineConfig({
  // The native app is independently installable; never inherit the hosted
  // Next.js application's Tailwind/PostCSS dependency tree.
  resolve: { dedupe: ['react', 'react-dom'] },
  css: { postcss: { plugins: [] } },
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
});
