import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSessionUser() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
    {
      cookies: {
        getAll() {
          return cookies().getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookies().set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  return data.user;
}
