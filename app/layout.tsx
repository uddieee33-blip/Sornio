import type { Metadata } from 'next';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { DukaanStoreProvider } from '@/lib/store';
import './globals.css';

export const metadata: Metadata = {
  title: 'DukaanOS — Owner Console',
  description: 'Billing, inventory, memberships, and AI insights for small Indian businesses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ink text-zinc-200 antialiased">
        <DukaanStoreProvider>
          <div className="relative min-h-screen">
            {/* Ambient page glow behind everything */}
            <div className="pointer-events-none fixed inset-0 bg-page-glow" aria-hidden />
            <div className="relative flex min-h-screen flex-col md:flex-row">
              <Sidebar />
              <div className="flex-1">
                <MobileNav />
                <main>{children}</main>
              </div>
            </div>
          </div>
        </DukaanStoreProvider>
      </body>
    </html>
  );
}
