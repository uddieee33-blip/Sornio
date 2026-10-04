import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        panel: '#ffffff',
        muted: '#64748b',
        accent: '#0f766e',
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#ef4444',
        soft: '#f8fafc',
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px -8px rgba(15, 23, 42, 0.10)',
        'card-hover': '0 2px 4px rgba(15, 23, 42, 0.06), 0 16px 40px -12px rgba(79, 70, 229, 0.22)',
        glow: '0 0 0 1px rgba(99, 102, 241, 0.12), 0 8px 30px -6px rgba(99, 102, 241, 0.35)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #db2777 100%)',
        'brand-soft': 'linear-gradient(135deg, #eef2ff 0%, #faf5ff 60%, #fdf2f8 100%)',
        'sidebar-gradient': 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)',
        'mesh-light':
          'radial-gradient(at 20% 0%, rgba(99,102,241,0.10) 0px, transparent 50%), radial-gradient(at 80% 10%, rgba(219,39,119,0.08) 0px, transparent 50%), radial-gradient(at 50% 100%, rgba(14,165,233,0.08) 0px, transparent 50%)',
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
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
