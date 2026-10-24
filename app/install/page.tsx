import type { Metadata } from 'next';
import { InstallScreen } from '@/components/pwa/install-screen';

export const metadata: Metadata = { title: 'Install app', robots: { index: false, follow: false } };

export default function InstallPage() {
  return <InstallScreen />;
}
