import type { Metadata } from 'next';
import { InstallScreen } from '@/components/pwa/install-screen';

export const metadata: Metadata = { title: 'Install app', robots: { index: false, follow: false } };

export default function InstallPage() {
  let windowsDownloadUrl: string | null = null;
  try {
    const url = new URL(process.env.SORNIO_WINDOWS_DOWNLOAD_URL ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname.toLowerCase().endsWith('.exe')) windowsDownloadUrl = url.href;
  } catch { /* A missing release stays unavailable until a real installer is published. */ }
  return <InstallScreen windowsDownloadUrl={windowsDownloadUrl} />;
}

