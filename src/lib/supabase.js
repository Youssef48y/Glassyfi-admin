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

/**
 * Triggers a data-only FCM silent sync ping so live Android apps refresh within ~1 second.
 */
export async function triggerSilentSync({ topic = 'all_users', fcmToken = null } = {}) {
  try {
    const body = fcmToken
      ? { silent_sync: true, fcm_token: fcmToken }
      : { silent_sync: true, topic };

    const { data, error } = await supabase.functions.invoke('send-push', { body });
    if (error || !data?.ok) {
      return { ok: false, error: error?.message || data?.error || 'silent_sync_failed' };
    }
    return { ok: true, messageId: data.messageId };
  } catch (err) {
    return { ok: false, error: err?.message || 'silent_sync_exception' };
  }
}
