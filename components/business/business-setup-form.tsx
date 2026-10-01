export function BusinessSetupForm() {
  return (
    <form className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Business Name</label>
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none ring-0 focus:border-slate-900" placeholder="e.g. Saffron Studio" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Business Type</label>
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="Retail, services, manufacturing" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Currency</label>
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue="INR" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Time Zone</label>
          <input className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" defaultValue="Asia/Kolkata" />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Business Description</label>
        <textarea className="min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="Describe the business and its core operations." />
      </div>

      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        Initial financial state remains zero until the owner records actual sales, expenses, payments, stock movements, and other business activity.
      </div>

      <div className="flex justify-end">
        <button type="button" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">Create business</button>
      </div>
    </form>
  );
}
