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

export function generateRandomPromoCode(prefix = 'GLASSY') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${suffix}`;
}

export function getProStatusInfo(user) {
  if (!user?.is_pro) {
    return { active: false, label: 'مجاني', detail: null };
  }
  if (!user.pro_expires_at) {
    return { active: true, label: 'Pro مدى الحياة', detail: 'اشتراك دائم' };
  }
  const expires = new Date(user.pro_expires_at);
  if (expires.getTime() < Date.now()) {
    return { active: false, label: 'Pro منتهي', detail: `انتهى في ${formatShortDateAr(user.pro_expires_at)}` };
  }
  return {
    active: true,
    label: 'Pro نشط',
    detail: `حتى ${formatShortDateAr(user.pro_expires_at)}`,
  };
}
