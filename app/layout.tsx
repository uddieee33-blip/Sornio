import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { currentIdentity, renderable } from '@/lib/auth/identity';
import { DukaanStoreProvider } from '@/lib/store';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/lib/ui/toast';
import { AppearanceProvider } from '@/lib/theme/appearance-provider';
import {
  APPEARANCE_COOKIE,
  appearanceAttributes,
  decodeAppearance,
  DEFAULT_PAINT,
  SYSTEM_PAINT,
  themeColorFor,
} from '@/lib/theme/palettes';
import './globals.css';
import './sornio-landing.css';
import './sornio-auth.css';
import './sornio-console.css';
import { InstallProvider } from '@/components/pwa/install-provider';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: 'Sornio — Business management made simpler',
    template: '%s',
  },
  description:
    'Billing, inventory, memberships, UPI QR collections, and AI insights for small Indian businesses. Local-first, encrypted on your device.',
  applicationName: 'Sornio',
  icons: { icon: '/brand/sornio-app-icon.svg?v=ribbon-1', apple: '/brand/apple-touch-icon.png',
  },
  formatDetection: { telephone: false, address: false, email: false },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Sornio — Business management made simpler',
    description:
      'Billing, inventory, memberships, UPI QR collections, and AI insights for small Indian businesses.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  /**
   * The default paint's page colour. When the owner has chosen another one the
   * client rewrites this meta tag on mount — but the *static* value still has
   * to be a real colour from a real paint, because it is what a phone shows in
   * the split second before any script runs.
   */
  themeColor: themeColorFor(DEFAULT_PAINT),
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Never block zoom — pinch-to-zoom is an accessibility feature, not a bug.
  maximumScale: 5,
};

/**
 * Root layout.
 *
 * The appearance cookie is read **here**, on the server, and its attributes go
 * straight onto `<html>`. That is the whole anti-flash mechanism: there is no
 * inline script racing the first paint, no `useEffect` applying a class after
 * hydration, and therefore no frame in which a Midnight console is briefly
 * white. It also means the console is painted correctly with JavaScript
 * disabled entirely.
 *
 * The one case the server genuinely cannot resolve is `system`, because
 * `prefers-color-scheme` lives in the browser. For that single case the
 * `data-theme` attribute is deliberately *omitted* and the `@media` fallback
 * in `themes.css` paints the first frame; `AppearanceProvider` then pins the
 * attribute in a layout effect, before the browser's second paint.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const appearance = decodeAppearance(cookieStore.get(APPEARANCE_COOKIE)?.value);

  // `null` tells the helper "this side has no device preference" — so for
  // `system` it returns no `data-theme` rather than guessing light.
  const attributes = appearanceAttributes(appearance, null);
  const lang = 'en';

  return (
    <html
      lang={lang}
      // A concrete paint is always on the element when one was chosen, which is
      // also what makes `color-scheme` correct for native form controls and the
      // scrollbar before any of our CSS loads.
      {...attributes}
      suppressHydrationWarning={appearance.theme === SYSTEM_PAINT}
    >
      <body className="bg-ink text-stone-800 antialiased">
        {/* Keyboard users land here first and can jump straight to the content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>

        <AppearanceProvider initial={appearance}>
          <DukaanStoreProvider initialIdentity={renderable(await currentIdentity())}>
            <I18nProvider>
              <ToastProvider>
                <div className="relative min-h-screen">
                  <InstallProvider><div className="relative">{children}</div></InstallProvider>
                </div>
              </ToastProvider>
            </I18nProvider>
          </DukaanStoreProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
