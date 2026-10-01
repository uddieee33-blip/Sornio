import { BusinessSetupForm } from '@/components/business/business-setup-form';

export default function BusinessPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-900">Business Setup</h1>
        <p className="mt-2 text-slate-600">Create your business profile. Financial state starts at zero until actual business activity is recorded.</p>
        <div className="mt-8">
          <BusinessSetupForm />
        </div>
      </div>
    </div>
  );
}
