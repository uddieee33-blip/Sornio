export default function BusinessPage() {
  const templates = [
    { id: 'gym', name: 'Gym & Fitness', features: ['Memberships', 'Renewals', 'Attendance', 'Reminders'] },
    { id: 'cafe', name: 'Cafe & Restaurant', features: ['Menu', 'Billing', 'Receipts', 'Orders'] },
    { id: 'grocery', name: 'Grocery Store', features: ['Inventory', 'Barcode', 'Stock', 'Bills'] },
    { id: 'salon', name: 'Salon & Spa', features: ['Services', 'Appointments', 'Members', 'Reminders'] },
    { id: 'electronics', name: 'Electronics', features: ['Catalog', 'Warranty', 'Models', 'Invoices'] },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500"> business setup </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Build your business profile</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            DukaanOS adapts to your business type with the right modules, billing logic, customer flow, and receipt system.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Business name</span>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" placeholder="Cult Fitness" />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Business type</span>
                <select className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900">
                  <option>Gym & Fitness</option>
                  <option>Cafe & Restaurant</option>
                  <option>Grocery Store</option>
                  <option>Salon & Spa</option>
                  <option>Electronics</option>
                </select>
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Currency</span>
                <input defaultValue="INR" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" />
              </label>

              <label className="text-sm text-slate-700">
                <span className="mb-2 block font-medium">Time zone</span>
                <input defaultValue="Asia/Kolkata" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" />
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-sm font-medium text-slate-800">UPI / payment setup</p>
              <div className="grid gap-4 md:grid-cols-2">
                <input className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-slate-900" placeholder="Business UPI ID" />
                <input className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-slate-900" placeholder="Bank name / IFSC" />
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm text-slate-700">
                <span className="mb-2 block font-medium">Business description</span>
                <textarea className="min-h-[120px] w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900" placeholder="Describe your business, customers, and service model." />
              </label>
            </div>

            <div className="mt-6 flex justify-end">
              <button className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white">Create business</button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Recommended modules</h2>
              <div className="mt-4 grid gap-3">
                {templates.map((template) => (
                  <div key={template.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="font-medium text-slate-800">{template.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {template.features.map((feature) => (
                        <span key={feature} className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-200">{feature}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Every business starts with zero financial history and can add real data as soon as operation begins.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

