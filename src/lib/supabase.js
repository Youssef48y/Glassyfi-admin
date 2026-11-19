import { createClient } from '@supabase/supabase-js';

// Public client configuration ONLY (publishable key protected by Supabase RLS & Auth)
export const SUPABASE_URL = 'https://dqxsyknngkiyfnaeornd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_jnlFQKqoCxDe0oOFUrrZfg_TZNfgrIY';

export const WALLPAPERS_BUCKET = 'wallpapers';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/**
 * Verifies whether the currently authenticated user is listed in public.admin_users.
 */
export async function verifyAdminAccess(userId) {
  if (!userId) return { isAdmin: false, record: null };
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id, email')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { isAdmin: false, record: null, error };
  }
  return { isAdmin: true, record: data };
}
