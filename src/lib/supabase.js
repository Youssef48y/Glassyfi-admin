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
 * Extracts a readable error message from supabase.functions.invoke() responses,
 * parsing error.context.json() on non-2xx HTTP statuses instead of showing the generic SDK message.
 */
export async function extractEdgeFunctionError(
  error,
  data,
  fallbackMessage = 'تعذر إتمام الطلب، يرجى المحاولة مجدداً',
) {
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
    if (typeof data.details === 'string' && data.details.trim()) {
      return data.details.trim();
    }
  }

  if (error) {
    const ctx = error.context;
    if (ctx) {
      try {
        const readable = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
        if (typeof readable.json === 'function') {
          const parsed = await readable.json();
          if (parsed && typeof parsed === 'object') {
            if (typeof parsed.error === 'string' && parsed.error.trim()) {
              return parsed.error.trim();
            }
            if (typeof parsed.details === 'string' && parsed.details.trim()) {
              return parsed.details.trim();
            }
            if (typeof parsed.message === 'string' && parsed.message.trim()) {
              return parsed.message.trim();
            }
          }
        }
      } catch {
        try {
          if (typeof ctx.text === 'function') {
            const raw = (await ctx.text())?.trim();
            if (raw && !raw.startsWith('<')) return raw;
          }
        } catch {
          // ignore body read error
        }
      }
    }

    const msg = typeof error.message === 'string' ? error.message.trim() : '';
    if (msg && !/edge function returned a non-2xx status code/i.test(msg)) {
      return msg;
    }
  }

  return fallbackMessage;
}

/**
 * Triggers a data-only FCM silent sync ping so live Android apps refresh within ~1 second.
 */
export async function triggerSilentSync({
  topic = 'all_users',
  fcmToken = null,
  fcmTokens = null,
} = {}) {
  try {
    const cleanTokens = Array.isArray(fcmTokens)
      ? fcmTokens.filter((t) => typeof t === 'string' && t.trim().length > 0)
      : [];
    const body =
      cleanTokens.length > 0
        ? { silent_sync: true, fcm_tokens: cleanTokens }
        : fcmToken
          ? { silent_sync: true, fcm_token: fcmToken }
          : { silent_sync: true, topic };

    const { data, error } = await supabase.functions.invoke('send-push', { body });
    if (error || !data?.ok) {
      const errMsg = await extractEdgeFunctionError(error, data, 'silent_sync_failed');
      return { ok: false, unregistered: Boolean(data?.unregistered), error: errMsg };
    }
    return { ok: true, messageId: data.messageId ?? null, sentCount: data.sentCount ?? 1 };
  } catch (err) {
    return { ok: false, error: err?.message || 'silent_sync_exception' };
  }
}
