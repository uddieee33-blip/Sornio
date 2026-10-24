import { redirect } from 'next/navigation';
import { SessionCard } from '@/components/security/session-card';
import { BrandWordmark } from '@/components/ui/BrandLogo';
import { getSessionUser } from '@/lib/security/guard';

/** Password recovery must work before an owner has created a business. */
export default async function PasswordResetPage() {
  // Revalidate with the provider; a query parameter or a local demo cookie
  // cannot establish that an email recovery link was redeemed.
  if (!(await getSessionUser())) redirect('/auth?error=link');

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <BrandWordmark />
      <h1 className="mt-6 font-display text-2xl font-bold text-stone-900">Set a new password</h1>
      <SessionCard recovery />
    </main>
  );
}
