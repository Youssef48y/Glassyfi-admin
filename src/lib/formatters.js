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
