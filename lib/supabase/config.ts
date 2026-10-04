/**
 * Detect whether real Supabase credentials are present.
 *
 * The sandbox / demo environment ships placeholder values (see .env.example),
 * so the app must stay fully functional in "local-first" mode. When a real
 * project URL + key are provided, the same code paths sync to Supabase.
 */

const URL_PLACEHOLDERS = ['your-project', 'your_project', 'https://.supabase.co', ''];
const KEY_PLACEHOLDERS = ['your-anon-key', 'your_anon_key', 'your-publishable-key', ''];

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

export function getSupabasePublishableKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl().trim();
  const key = getSupabasePublishableKey().trim();
  const urlValid = url.startsWith('https://') && !URL_PLACEHOLDERS.some((p) => p && url.includes(p));
  const keyValid = key.length >= 20 && !KEY_PLACEHOLDERS.includes(key);
  return urlValid && keyValid;
}

export type SyncMode = 'local' | 'supabase';

/** The persistence mode for the current environment. */
export function currentSyncMode(): SyncMode {
  return isSupabaseConfigured() ? 'supabase' : 'local';
}
