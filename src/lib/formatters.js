export function formatDateAr(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatShortDateAr(isoString) {
  if (!isoString) return 'مدى الحياة';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatRelativeTimeAr(isoString) {
  if (!isoString) return 'غير معروف';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return formatShortDateAr(isoString);
}

export function slugifyCategory(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateRandomPromoCode(prefix = 'VITRIFY') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${suffix}`;
}

export function formatDurationAr({ duration_minutes = 0, duration_days = 0 }) {
  const mins = Number(duration_minutes) || 0;
  const days = Number(duration_days) || 0;

  if (mins <= 0 && days <= 0) return 'مدى الحياة';
  if (mins > 0) {
    if (mins % 1440 === 0) return `${mins / 1440} يوم`;
    if (mins % 60 === 0) return `${mins / 60} ساعة`;
    return `${mins} دقيقة`;
  }
  return `${days} يوم`;
}

export function computeDurationSpec(amount, unit) {
  if (unit === 'lifetime') {
    return {
      totalMinutes: 0,
      daysCompat: 0,
      labelAr: 'مدى الحياة',
      buildExpiryIso: () => null,
    };
  }

  const n = Math.max(1, Math.floor(Number(amount) || 1));
  if (unit === 'minutes') {
    return {
      totalMinutes: n,
      daysCompat: 0,
      labelAr: `${n} دقيقة`,
      buildExpiryIso: (baseDate = new Date()) =>
        new Date(baseDate.getTime() + n * 60 * 1000).toISOString(),
    };
  }
  if (unit === 'hours') {
    return {
      totalMinutes: n * 60,
      daysCompat: 0,
      labelAr: `${n} ساعة`,
      buildExpiryIso: (baseDate = new Date()) =>
        new Date(baseDate.getTime() + n * 60 * 60 * 1000).toISOString(),
    };
  }
  // days
  return {
    totalMinutes: n * 1440,
    daysCompat: n,
    labelAr: `${n} يوم`,
    buildExpiryIso: (baseDate = new Date()) =>
      new Date(baseDate.getTime() + n * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function getProStatusInfo(user) {
  if (!user?.is_pro) {
    return { active: false, label: 'مجاني', detail: null };
  }
  if (!user.pro_expires_at) {
    return { active: true, label: 'Pro مدى الحياة', detail: 'اشتراك دائم' };
  }
  const expires = new Date(user.pro_expires_at);
  const diffMs = expires.getTime() - Date.now();
  if (diffMs <= 0) {
    return {
      active: false,
      label: 'Pro منتهي',
      detail: `انتهى في ${formatDateAr(user.pro_expires_at)}`,
    };
  }

  const minsLeft = Math.ceil(diffMs / 60000);
  if (minsLeft < 60) {
    return {
      active: true,
      label: 'Pro نشط',
      detail: `متبقي ${minsLeft} دقيقة (${formatDateAr(user.pro_expires_at)})`,
    };
  }
  const hoursLeft = Math.floor(minsLeft / 60);
  if (hoursLeft < 48) {
    return {
      active: true,
      label: 'Pro نشط',
      detail: `متبقي ${hoursLeft} ساعة (${formatDateAr(user.pro_expires_at)})`,
    };
  }
  return {
    active: true,
    label: 'Pro نشط',
    detail: `حتى ${formatDateAr(user.pro_expires_at)}`,
  };
}

export const ONLINE_WINDOW_MS = 45_000;

export function isUserOnline(user, nowMs = Date.now()) {
  if (!user?.is_online || !user?.last_seen_at) return false;
  const seenMs = new Date(user.last_seen_at).getTime();
  if (Number.isNaN(seenMs)) return false;
  return nowMs - seenMs <= ONLINE_WINDOW_MS;
}

export function formatAndroidVersion(raw) {
  const clean = String(raw || '').trim();
  if (!clean) return null;
  if (/^android/i.test(clean)) return clean;
  return `Android ${clean}`;
}

export function computeExpirySpec(amount, unit) {
  if (unit === 'never') {
    return {
      durationMs: 0,
      labelAr: 'بدون انتهاء (دائم)',
      buildExpiresAtIso: () => null,
    };
  }

  const n = Math.max(1, Math.floor(Number(amount) || 1));
  if (unit === 'seconds') {
    const durationMs = n * 1000;
    return {
      durationMs,
      labelAr: n === 1 ? 'ثانية واحدة' : `${n} ثانية`,
      buildExpiresAtIso: (nowMs = Date.now()) =>
        new Date(nowMs + durationMs).toISOString(),
    };
  }
  if (unit === 'minutes') {
    const durationMs = n * 60 * 1000;
    return {
      durationMs,
      labelAr: n === 1 ? 'دقيقة واحدة' : `${n} دقيقة`,
      buildExpiresAtIso: (nowMs = Date.now()) =>
        new Date(nowMs + durationMs).toISOString(),
    };
  }
  if (unit === 'hours') {
    const durationMs = n * 60 * 60 * 1000;
    return {
      durationMs,
      labelAr: n === 1 ? 'ساعة واحدة' : `${n} ساعة`,
      buildExpiresAtIso: (nowMs = Date.now()) =>
        new Date(nowMs + durationMs).toISOString(),
    };
  }
  // days
  const durationMs = n * 24 * 60 * 60 * 1000;
  return {
    durationMs,
    labelAr: n === 1 ? 'يوم واحد' : `${n} يوم`,
    buildExpiresAtIso: (nowMs = Date.now()) =>
      new Date(nowMs + durationMs).toISOString(),
  };
}

export function getPopupExpiryInfo(expiresAt, nowMs = Date.now()) {
  if (!expiresAt) {
    return {
      hasExpiry: false,
      expired: false,
      label: 'دائمة',
      className: 'badge-neutral',
    };
  }

  const expMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expMs)) {
    return {
      hasExpiry: false,
      expired: false,
      label: 'دائمة',
      className: 'badge-neutral',
    };
  }

  const diffMs = expMs - nowMs;
  if (diffMs <= 0) {
    return {
      hasExpiry: true,
      expired: true,
      label: 'منتهية',
      className: 'badge-rose',
    };
  }

  const secs = Math.ceil(diffMs / 1000);
  if (secs < 60) {
    return {
      hasExpiry: true,
      expired: false,
      label: `تنتهي خلال ${secs} ثانية`,
      className: 'badge-amber',
    };
  }

  const mins = Math.ceil(secs / 60);
  if (mins < 60) {
    return {
      hasExpiry: true,
      expired: false,
      label: `تنتهي خلال ${mins} دقيقة`,
      className: 'badge-amber',
    };
  }

  const hours = Math.ceil(mins / 60);
  if (hours < 48) {
    return {
      hasExpiry: true,
      expired: false,
      label: `تنتهي خلال ${hours} ساعة`,
      className: 'badge-amber',
    };
  }

  const days = Math.ceil(hours / 24);
  return {
    hasExpiry: true,
    expired: false,
    label: `تنتهي خلال ${days} يوم`,
    className: 'badge-amber',
  };
}

