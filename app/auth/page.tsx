import Link from 'next/link';

export default function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">DukaanOS</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Business access</h1>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="owner@dukaanos.com" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <input type="password" className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900" placeholder="••••••••" />
          </div>
          <button className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">Sign in</button>
        </div>

        <div className="mt-5 flex items-center justify-between text-sm text-slate-600">
          <Link href="/business" className="font-medium text-slate-900">Create business</Link>
          <Link href="/" className="font-medium text-slate-900">View overview</Link>
        </div>
      </div>
    </div>
  );
}
