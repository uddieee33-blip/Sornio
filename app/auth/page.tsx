import Link from 'next/link';

export default function AuthPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">DukaanOS</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">Secure access through Supabase Auth.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
            <input type="email" className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="owner@business.com" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
            <input type="password" className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="••••••••" />
          </div>
          <button className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white">Continue</button>
        </div>

        <div className="mt-5 text-sm text-slate-500">
          New to DukaanOS?{' '}
          <Link href="/business" className="font-medium text-slate-900">Create a business</Link>
        </div>
      </div>
    </div>
  );
}
