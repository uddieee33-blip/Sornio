import type { Metadata } from 'next';
import { DukaanStoreProvider } from '@/lib/store';
import './globals.css';

export const metadata: Metadata = {
  title: 'DukaanOS — Run your entire business from one console',
  description: 'Billing, inventory, memberships, UPI QR collections, and AI insights for small Indian businesses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-ink text-zinc-200 antialiased">
        <DukaanStoreProvider>
          <div className="relative min-h-screen">
            {/* Ambient page glow behind everything */}
            <div className="pointer-events-none fixed inset-0 bg-page-glow" aria-hidden />
            <div className="relative">{children}</div>
          </div>
        </DukaanStoreProvider>
      </body>
    </html>
  );
}
