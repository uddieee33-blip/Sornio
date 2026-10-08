import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { DeviceLockCard } from '@/components/security/device-lock-card';
import { TrustCenter } from '@/components/security/trust-center';
import { SecurityScore } from '@/components/security/security-score';
import { SessionCard } from '@/components/security/session-card';

export const metadata: Metadata = {
  title: 'Trust Centre — DukaanOS',
  description: 'Encryption, access control, audit integrity, and where your data lives.',
};

/**
 * `?reset=1` is where a recovery link lands — the callback redeems the code and
 * forwards here, because a password reset that ends in "you are signed in with the
 * old password" has not reset anything. The card below reads the flag and puts the
 * new-password fields in front of the owner with the reason attached.
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.reset) ? (params.reset[0] ?? '') : (params.reset ?? '');
  const recovery = raw === '1';

  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        eyebrow="Security & privacy"
        title="Trust Centre"
        subtitle="Exactly how your business data is protected — shown live, not promised. Everything on this page is read from the running app."
      />
      {/* The lock comes first because it is the control an owner can act on in
          the next ten seconds. Everything under it is evidence. */}
      <DeviceLockCard />
      {/* Identity, next to the other secret: which session this device holds, and
          the only place a password can be changed. */}
      <SessionCard recovery={recovery} />
      {/* The score answers "am I safe right now?" in one number and names the
          gaps. The Trust Centre below it explains the machinery — which only
          matters to an owner once they know whether it is switched on. */}
      <div className="mb-6">
        <SecurityScore />
      </div>
      <TrustCenter />
    </div>
  );
}
