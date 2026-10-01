import { SalesForm } from '@/components/sales/sales-form';

export default function SalesPage() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-3xl font-bold text-slate-900">Sales</h1>
      <p className="mt-2 text-slate-600">Record sales with multiple line items, payment methods, and traceable transaction references.</p>
      <div className="mt-8 max-w-5xl">
        <SalesForm />
      </div>
    </div>
  );
}
