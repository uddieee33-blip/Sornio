import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Real Supabase credentials only — placeholder values must never trigger network calls. */
const supabaseConfigured =
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project') &&
  supabaseKey.length >= 20 &&
  !supabaseKey.includes('your-anon-key') &&
  !supabaseKey.includes('your-publishable-key');

export async function middleware(request: NextRequest) {
  // Local-first / demo mode: no Supabase project is connected, so there is
  // no session to refresh. Skip entirely — navigation stays instant and can
  // never be blocked by a dead auth call.
  if (!supabaseConfigured) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request: { headers: request.headers } });
  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set({ name, value, ...options });
            response.cookies.set({ name, value, ...options });
          });
        },
      },
    });

    // Refresh the session cookie; failures must never block a page load.
    await supabase.auth.getUser();
  } catch {
    // Auth refresh is best-effort — the page must always load.
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
