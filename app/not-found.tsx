import Link from 'next/link';
import { Compass, Home } from 'lucide-react';

export const metadata = { title: 'Page not found — DukaanOS' };

/** A wrong turn should never feel like a broken product. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
          <Compass size={22} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold text-stone-900">That page isn’t here</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          The link may be old, or the module may have moved. Your business data is unaffected.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
          >
            <Home size={15} /> Go to the cockpit
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-200"
          >
            View the site
          </Link>
        </div>
      </div>
    </div>
  );
}
