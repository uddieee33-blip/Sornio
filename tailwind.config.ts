import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#F7F6EF',
        panel: '#FFFEFA',
        brand: {
          50: '#f1f6ed',
          100: '#e2edd9',
          200: '#c3dfb8',
          300: '#4e7650',
          400: '#397445',
          500: '#28623b',
          600: '#1f5032',
          700: '#173f28',
          800: '#11321f',
          900: '#0b2518',
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Inter Variable"', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.92) inset, 0 8px 24px -16px rgba(75,62,34,0.22)',
        'card-hover': '0 1px 0 0 rgba(255,255,255,0.96) inset, 0 16px 40px -16px rgba(40,98,59,0.18)',
        glow: '0 10px 26px -12px rgba(40,98,59,0.32)',
        'glow-sm': '0 5px 14px -7px rgba(40,98,59,0.28)',
        // Soft, warm depth for floating surfaces (palette, toasts, popovers).
        float: '0 24px 64px -24px rgba(67,55,28,0.2), 0 2px 8px -2px rgba(67,55,28,0.12)',
        'inner-top': 'inset 0 1px 0 0 rgba(255,255,255,0.92)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #1c5835 0%, #2b7045 58%, #875711 100%)',
        'page-glow':
          'radial-gradient(1000px 600px at 82% -10%, rgba(198,155,75,0.12), transparent 62%), radial-gradient(900px 520px at 0% 110%, rgba(49,111,65,0.09), transparent 62%)',
        // Sweeps left→right; paired with background-size for shimmer skeletons.
        shimmer:
          'linear-gradient(90deg, rgba(61,76,49,0.035) 0%, rgba(61,76,49,0.085) 50%, rgba(61,76,49,0.035) 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        // 1.6s sweep: visible enough to read as "working", slow enough not to nag.
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
