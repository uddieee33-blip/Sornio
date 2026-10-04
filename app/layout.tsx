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
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <DukaanStoreProvider>
          <div className="min-h-screen">
            <div className="flex min-h-screen flex-col md:flex-row">
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
