import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { TrustCenter } from '@/components/security/trust-center';

export const metadata: Metadata = {
  title: 'Trust Centre — DukaanOS',
  description: 'Encryption, access control, audit integrity, and where your data lives.',
};

export default function SecurityPage() {
  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        eyebrow="Security & privacy"
        title="Trust Centre"
        subtitle="Exactly how your business data is protected — shown live, not promised. Everything on this page is read from the running app."
      />
      <TrustCenter />
    </div>
  );
}
