import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';

export const metadata: Metadata = {
  title: 'DukaanOS',
  description: 'Small Business. Big Business Thinking.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <div className="min-h-screen">
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
