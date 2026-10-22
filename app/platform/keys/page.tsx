import { notFound } from 'next/navigation';
import { platformOperator } from '@/lib/plans/platform-server';
import { PlatformKeyConsole } from '@/components/billing/platform-key-console';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Activation keys · Platform', robots: { index: false, follow: false } };
export default async function PlatformKeysPage() {
  if (!await platformOperator()) notFound();
  return <PlatformKeyConsole />;
}
