import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getServerBusinessData() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { data, error } = await supabase.from('businesses').select('*').limit(5);

  if (error) {
    console.error('Supabase fetch error:', error.message);
  }

  return data ?? [];
}
