import Link from 'next/link';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <div className="min-h-screen">
          <div className="flex min-h-screen flex-col md:flex-row">
            <Sidebar />
            <div className="flex-1">
              <MobileNav />
              <main>{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
