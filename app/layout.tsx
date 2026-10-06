import type { Metadata, Viewport } from 'next';
import { DukaanStoreProvider } from '@/lib/store';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/lib/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: 'DukaanOS — Run your entire business from one console',
    template: '%s',
  },
  description:
    'Billing, inventory, memberships, UPI QR collections, and AI insights for small Indian businesses. Local-first, encrypted on your device.',
  applicationName: 'DukaanOS',
  icons: { icon: '/brand/dukaanos-app-icon.svg' },
  formatDetection: { telephone: false, address: false, email: false },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'DukaanOS — Run your entire business from one console',
    description:
      'Billing, inventory, memberships, UPI QR collections, and AI insights for small Indian businesses.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  // Matches `--warm-page` in globals.css so the mobile browser chrome blends
  // into the warm palette instead of framing it in the old navy.
  themeColor: '#f7f6ef',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Never block zoom — pinch-to-zoom is an accessibility feature, not a bug.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="warm">
      <body className="bg-ink text-stone-800 antialiased">
        {/* Keyboard users land here first and can jump straight to the content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>

        <DukaanStoreProvider>
          <I18nProvider>
            <ToastProvider>
              <div className="relative min-h-screen">
                {/* Ambient page glow behind everything */}
                <div className="pointer-events-none fixed inset-0 bg-page-glow" aria-hidden />
                <div className="relative">{children}</div>
              </div>
            </ToastProvider>
          </I18nProvider>
        </DukaanStoreProvider>
      </body>
    </html>
  );
}
