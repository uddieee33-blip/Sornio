import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1">
        <MobileNav />
        <main>{children}</main>
      </div>
    </div>
  );
}
