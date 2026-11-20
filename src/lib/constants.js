export const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'الكل', shortLabel: 'الكل' },
  { value: 'lab', label: 'المختبر والمطورين', shortLabel: 'مختبر' },
  { value: 'dev', label: 'المطورين فقط', shortLabel: 'مطورين' },
];

export const POPUP_AUDIENCE_OPTIONS = [
  { value: 'all', label: 'الكل (جميع المستخدمين)' },
  { value: 'free', label: 'المجاني فقط' },
  { value: 'pro', label: 'مشتركو Pro' },
  { value: 'lab', label: 'أعضاء المختبر (Lab)' },
  { value: 'dev', label: 'المطورين (Dev)' },
  { value: 'specific', label: 'مستخدمين محددين (اختيار يدوي)' },
];

export const PUSH_TOPIC_OPTIONS = [
  { value: 'all_users', label: 'الكل (جميع المستخدمين)' },
  { value: 'pro_users', label: 'مشتركو Pro فقط' },
  { value: 'free_users', label: 'المستخدمون المجانيون فقط' },
  { value: 'lab_users', label: 'أعضاء المختبر (Lab)' },
  { value: 'dev_users', label: 'هواتف المطورين (Dev)' },
];

export const DEEP_LINK_PRESETS = [
  { value: '', label: 'بدون توجيه (فتح الرئيسية)' },
  { value: 'glassyfi://walls', label: 'قسم الخلفيات — glassyfi://walls' },
  { value: 'glassyfi://widgets', label: 'قسم الويدجيت — glassyfi://widgets' },
  { value: 'glassyfi://depth', label: 'استوديو العمق — glassyfi://depth' },
  { value: 'glassyfi://settings', label: 'الإعدادات — glassyfi://settings' },
  { value: 'glassyfi://pro', label: 'شاشة الاشتراك Pro — glassyfi://pro' },
  { value: 'glassyfi://lab', label: 'مختبر Glassyfi — glassyfi://lab' },
  { value: '__custom__', label: 'رابط مخصص (خلفية محددة أو رابط خارجي)' },
];

export const WIDGET_CATEGORY_META = {
  all: { label: 'الكل', order: 0 },
  analog: { label: 'الساعات التناظرية', order: 1 },
  digital_glass: { label: 'الساعات الزجاجية والرقمية', order: 2 },
  dates: { label: 'التواريخ والخط العربي', order: 3 },
  weather: { label: 'ويدجيت الطقس', order: 4 },
};

export const DEPTH_GROUP_META = {
  clocks: { label: 'ساعات استوديو العمق', order: 1 },
  tools: { label: 'أدوات وميزات استوديو العمق', order: 2 },
};

export const ROLE_META = {
  normal: { label: 'عادي', badgeClass: 'badge-neutral' },
  lab: { label: 'عضو مختبر', badgeClass: 'badge-emerald' },
  dev: { label: 'مطوّر', badgeClass: 'badge-white' },
};

export const MAX_SHOWS_OPTIONS = [
  { value: 1, label: 'مرة واحدة فقط (1)' },
  { value: 2, label: 'مرتان (2)' },
  { value: 3, label: '3 مرات' },
  { value: 5, label: '5 مرات' },
  { value: 0, label: 'كل مرة عند فتح التطبيق (0)' },
];

export const SCREEN_LABELS_AR = {
  home: 'الرئيسية',
  walls: 'الخلفيات',
  wallpapers: 'الخلفيات',
  widgets: 'الويدجيت',
  depth: 'استوديو العمق',
  depth_studio: 'استوديو العمق',
  editor: 'محرر العمق',
  settings: 'الإعدادات',
  pro: 'شاشة Pro',
  lab: 'مختبر Glassyfi',
  favorites: 'المفضلة',
  search: 'البحث',
};

export function getAudienceBadge(audience) {
  if (audience === 'specific') return { label: 'مستخدمين محددين', className: 'badge-white' };
  if (audience === 'dev') return { label: 'مطورين فقط', className: 'badge-sky' };
  if (audience === 'lab') return { label: 'المختبر والمطورين', className: 'badge-emerald' };
  if (audience === 'pro') return { label: 'Pro فقط', className: 'badge-amber' };
  if (audience === 'free') return { label: 'المجاني فقط', className: 'badge-neutral' };
  return { label: 'الكل', className: 'badge-neutral' };
}

export function getTopicLabelAr(topic) {
  if (topic === 'pro_users') return 'Pro فقط';
  if (topic === 'free_users') return 'المجاني فقط';
  if (topic === 'lab_users') return 'المختبر';
  if (topic === 'dev_users') return 'المطورين';
  if (topic === 'direct_device') return 'إشعار مباشر لهاتف';
  return 'الكل';
}

export function getScreenLabelAr(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return SCREEN_LABELS_AR[key] || raw || 'غير معروف';
}
