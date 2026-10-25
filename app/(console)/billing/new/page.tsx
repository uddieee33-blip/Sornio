'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { InvoiceComposer } from '@/components/billing/invoice-composer';

export default function NewBillPage() {
  const router = useRouter();
  return <div className="mx-auto max-w-7xl p-4 sm:p-6 md:p-8">
    <Link href="/billing" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-stone-600"><ArrowLeft size={16} aria-hidden="true" />Bills & receipts</Link>
    <PageHeader eyebrow="Sales" title="New bill" subtitle="Add the customer and items, check the total, then save. Collect payment after the money arrives." />
    <InvoiceComposer onCreated={invoiceId => router.push(`/billing?invoice=${encodeURIComponent(invoiceId)}`)} />
  </div>;
}
