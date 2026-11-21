import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  FolderKanban,
  Upload,
  Crown,
  Sparkles,
  Star,
  Eye,
  EyeOff,
  Trash2,
  Sun,
  Moon,
  Layers,
  Image as ImageIcon,
  Download,
  Search,
  X,
  Loader2,
  Check,
  Link2,
  HardDrive,
  RotateCcw,
} from 'lucide-react';
import { supabase, triggerSilentSync, WALLPAPERS_BUCKET } from '../lib/supabase';
import {
  validateImageFile,
  getExtensionFromFile,
  formatFileSize,
  generateThumbnailBlob,
  extractStoragePath,
  deriveBadgeType,
  generateUniqueId,
} from '../lib/imageUtils';
import { slugifyCategory } from '../lib/formatters';
import { AUDIENCE_OPTIONS, getAudienceBadge } from '../lib/constants';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';

const WALLPAPER_TYPES = [
  { value: 'depth', label: 'عمق Depth', icon: Layers },
  { value: 'dual_day_night', label: 'نهار وليل Dual', icon: Sun },
  { value: 'standard', label: 'عادية Standard', icon: ImageIcon },
];

const INITIAL_FORM = {
  title_ar: '',
  title_en: '',
  category_slug: 'depth',
  wallpaper_type: 'depth',
  target_audience: 'all',
  sort_order: 0,
  is_new: true,
  is_exclusive: false,
  is_pro: false,
  is_active: true,
  supports_auto_day_night: true,
};

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export function WallpapersTab({
  wallpapers,
  categories,
  loading,
  onRefresh,
  notify,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  // Filters: primary pills ('all' | 'builtin' | 'cloud' | 'hidden' | 'pro')
  const [primaryFilter, setPrimaryFilter] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAudience, setSelectedAudience] = useState('all_filter');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload form state
  const [form, setForm] = useState(INITIAL_FORM);
  const [dayFile, setDayFile] = useState(null);
  const [dayPreview, setDayPreview] = useState('');
  const [nightFile, setNightFile] = useState(null);
  const [nightPreview, setNightPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState('');

  // Card states
  const [busyCardIds, setBusyCardIds] = useState({});
  const [nightPreviewMap, setNightPreviewMap] = useState({});
  const [copiedId, setCopiedId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Category modal state
  const [catNameAr, setCatNameAr] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catSortOrder, setCatSortOrder] = useState(10);
  const [catSaving, setCatSaving] = useState(false);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);

  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.slug === form.category_slug)) {
      setForm((prev) => ({ ...prev, category_slug: categories[0].slug }));
    }
  }, [categories, form.category_slug]);

  useEffect(() => {
    return () => {
      if (dayPreview) URL.revokeObjectURL(dayPreview);
      if (nightPreview) URL.revokeObjectURL(nightPreview);
    };
  }, [dayPreview, nightPreview]);

  const categoryNameMap = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.slug] = c.name_ar;
    });
    return map;
  }, [categories]);

  const counts = useMemo(() => {
    let builtin = 0;
    let cloud = 0;
    let hidden = 0;
    let pro = 0;
    wallpapers.forEach((w) => {
      if (w.is_builtin) builtin += 1;
      else cloud += 1;
      if (!w.is_active) hidden += 1;
      if (w.is_pro) pro += 1;
    });
    return { all: wallpapers.length, builtin, cloud, hidden, pro };
  }, [wallpapers]);

  const filteredWallpapers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return wallpapers.filter((item) => {
      if (primaryFilter === 'builtin' && !item.is_builtin) return false;
      if (primaryFilter === 'cloud' && item.is_builtin) return false;
      if (primaryFilter === 'hidden' && item.is_active) return false;
      if (primaryFilter === 'pro' && !item.is_pro) return false;

      if (selectedCategory !== 'all' && item.category_slug !== selectedCategory) {
        return false;
      }
      if (selectedAudience !== 'all_filter' && (item.target_audience || 'all') !== selectedAudience) {
        return false;
      }
      if (q) {
        const matchAr = (item.title_ar || '').toLowerCase().includes(q);
        const matchEn = (item.title_en || '').toLowerCase().includes(q);
        const matchKey = (item.builtin_asset_key || '').toLowerCase().includes(q);
        if (!matchAr && !matchEn && !matchKey) return false;
      }
      return true;
    });
  }, [wallpapers, primaryFilter, selectedCategory, selectedAudience, searchQuery]);

  async function copyDeepLink(wp) {
    const keyOrId = wp.is_builtin && wp.builtin_asset_key ? wp.builtin_asset_key : wp.id;
    const link = `glassyfi://wallpaper/${keyOrId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(wp.id);
      notify(`تم نسخ رابط العمق المباشر: ${link}`, 'info');
      setTimeout(() => {
        setCopiedId((prev) => (prev === wp.id ? '' : prev));
      }, 1800);
    } catch {
      notify('تعذر النسخ التلقائي', 'error');
    }
  }

  function handleSelectDayFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationErr = validateImageFile(file);
    if (validationErr) {
      notify(validationErr, 'error');
      e.target.value = '';
      return;
    }
    if (dayPreview) URL.revokeObjectURL(dayPreview);
    setDayFile(file);
    setDayPreview(URL.createObjectURL(file));
  }

  function handleSelectNightFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const validationErr = validateImageFile(file);
    if (validationErr) {
      notify(validationErr, 'error');
      e.target.value = '';
      return;
    }
    if (nightPreview) URL.revokeObjectURL(nightPreview);
    setNightFile(file);
    setNightPreview(URL.createObjectURL(file));
  }

  function resetUploadForm() {
    if (dayPreview) URL.revokeObjectURL(dayPreview);
    if (nightPreview) URL.revokeObjectURL(nightPreview);
    setDayFile(null);
    setDayPreview('');
    setNightFile(null);
    setNightPreview('');
    setForm({
      ...INITIAL_FORM,
      category_slug: categories[0]?.slug || 'depth',
    });
  }

  async function uploadToBucket(path, fileOrBlob, contentType) {
    const { error } = await supabase.storage
      .from(WALLPAPERS_BUCKET)
      .upload(path, fileOrBlob, {
        contentType,
        cacheControl: '31536000',
        upsert: false,
      });

    if (error) {
      throw new Error(error.message || 'فشل رفع الملف إلى التخزين السحابي');
    }

    const { data } = supabase.storage.from(WALLPAPERS_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleCreateWallpaper(e) {
    e.preventDefault();
    const titleAr = form.title_ar.trim();
    if (!titleAr) {
      notify('يرجى إدخال عنوان الخلفية بالعربية', 'error');
      return;
    }
    if (!dayFile) {
      notify('يرجى اختيار الصورة الأصلية للخلفية', 'error');
      return;
    }
    if (form.wallpaper_type === 'dual_day_night' && !nightFile) {
      notify('يرجى اختيار صورة الليل لخلفية النهار والليل', 'error');
      return;
    }

    const uploadedPaths = [];
    setUploading(true);
    try {
      const uid = generateUniqueId();

      setUploadStage('جاري توليد الصورة المصغّرة (WebP)...');
      const thumb = await generateThumbnailBlob(dayFile, 480, 0.78);
      const thumbPath = `thumbs/${uid}.${thumb.ext}`;
      const thumbnailUrl = await uploadToBucket(thumbPath, thumb.blob, thumb.contentType);
      uploadedPaths.push(thumbPath);

      setUploadStage('جاري رفع الصورة الأصلية بدون ضغط...');
      const dayExt = getExtensionFromFile(dayFile);
      const dayPath = `originals/${uid}.${dayExt}`;
      const imageUrl = await uploadToBucket(dayPath, dayFile, dayFile.type);
      uploadedPaths.push(dayPath);

      let nightImageUrl = null;
      if (form.wallpaper_type === 'dual_day_night' && nightFile) {
        setUploadStage('جاري رفع صورة الليل الأصلية...');
        const nightExt = getExtensionFromFile(nightFile);
        const nightPath = `originals/${uid}_night.${nightExt}`;
        nightImageUrl = await uploadToBucket(nightPath, nightFile, nightFile.type);
        uploadedPaths.push(nightPath);
      }

      setUploadStage('جاري الحفظ وتحديث التطبيقات...');
      const badgeType = deriveBadgeType(form);
      const { error: insertError } = await supabase.from('wallpapers').insert({
        title_ar: titleAr,
        title_en: form.title_en.trim() || null,
        category_slug: form.category_slug || null,
        wallpaper_type: form.wallpaper_type,
        target_audience: form.target_audience,
        image_url: imageUrl,
        night_image_url: nightImageUrl,
        thumbnail_url: thumbnailUrl,
        badge_type: badgeType,
        is_new: form.is_new,
        is_exclusive: form.is_exclusive,
        is_pro: form.is_pro,
        is_active: form.is_active,
        supports_auto_day_night:
          form.wallpaper_type === 'dual_day_night'
            ? Boolean(form.supports_auto_day_night)
            : false,
        is_builtin: false,
        sort_order: Number(form.sort_order) || 0,
      });

      if (insertError) throw insertError;

      triggerSilentSync({ topic: 'all_users' });
      notify('تم رفع الخلفية الأصلية ومزامنة التطبيقات فورياً', 'success');
      resetUploadForm();
      setShowAddForm(false);
      await onRefresh();
    } catch (err) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(WALLPAPERS_BUCKET).remove(uploadedPaths);
      }
      notify(`خطأ أثناء الرفع: ${err.message || 'تعذر حفظ الخلفية'}`, 'error');
    } finally {
      setUploading(false);
      setUploadStage('');
    }
  }

  async function handleToggleFlag(wallpaper, field) {
    setBusyCardIds((prev) => ({ ...prev, [wallpaper.id]: true }));
    try {
      const nextValue = !wallpaper[field];
      const nextState = {
        is_new: wallpaper.is_new,
        is_exclusive: wallpaper.is_exclusive,
        is_pro: wallpaper.is_pro,
        is_active: wallpaper.is_active,
        [field]: nextValue,
      };
      const payload =
        field === 'supports_auto_day_night'
          ? { supports_auto_day_night: nextValue }
          : {
              [field]: nextValue,
              badge_type: deriveBadgeType(nextState),
            };

      const { error } = await supabase
        .from('wallpapers')
        .update(payload)
        .eq('id', wallpaper.id);

      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`فشل التحديث: ${err.message}`, 'error');
    } finally {
      setBusyCardIds((prev) => ({ ...prev, [wallpaper.id]: false }));
    }
  }

  async function handleChangeAudience(wallpaper, audience) {
    if ((wallpaper.target_audience || 'all') === audience) return;
    setBusyCardIds((prev) => ({ ...prev, [wallpaper.id]: true }));
    try {
      const { error } = await supabase
        .from('wallpapers')
        .update({ target_audience: audience })
        .eq('id', wallpaper.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify('تم تحديث جمهور الخلفية وإرسال المزامنة الفورية', 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل تحديث الجمهور: ${err.message}`, 'error');
    } finally {
      setBusyCardIds((prev) => ({ ...prev, [wallpaper.id]: false }));
    }
  }

  async function confirmDeleteOrHideWallpaper() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.is_builtin) {
        // Built-in wallpaper: cleanly hide (is_active = false) so it vanishes from the app immediately and can be restored from "مخفية"
        const { error } = await supabase
          .from('wallpapers')
          .update({ is_active: false })
          .eq('id', deleteTarget.id);
        if (error) throw error;

        triggerSilentSync({ topic: 'all_users' });
        notify(`تم إخفاء الخلفية المدمجة "${deleteTarget.title_ar}" من التطبيق فوراً (يمكنك استعادتها من فلتر المخفية)`, 'info');
      } else {
        const { error } = await supabase
          .from('wallpapers')
          .delete()
          .eq('id', deleteTarget.id);
        if (error) throw error;

        const paths = [
          extractStoragePath(deleteTarget.image_url),
          extractStoragePath(deleteTarget.night_image_url),
          extractStoragePath(deleteTarget.thumbnail_url),
        ].filter(Boolean);

        if (paths.length > 0) {
          await supabase.storage.from(WALLPAPERS_BUCKET).remove(paths);
        }

        triggerSilentSync({ topic: 'all_users' });
        notify('تم حذف الخلفية السحابية وملفاتها بنجاح', 'success');
      }

      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل التنفيذ: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    const nameAr = catNameAr.trim();
    const nameEn = catNameEn.trim();
    const slug = slugifyCategory(catSlug || nameEn);

    if (!nameAr || !nameEn || !slug) {
      notify('يرجى إدخال الاسم بالعربية والإنجليزية والـ Slug', 'error');
      return;
    }

    setCatSaving(true);
    try {
      const { error } = await supabase.from('categories').insert({
        slug,
        name_ar: nameAr,
        name_en: nameEn,
        sort_order: Number(catSortOrder) || 0,
        is_active: true,
      });
      if (error) throw error;

      triggerSilentSync({ topic: 'all_users' });
      notify('تمت إضافة القسم بنجاح', 'success');
      setCatNameAr('');
      setCatNameEn('');
      setCatSlug('');
      setCatSortOrder((categories.length + 1) * 10);
      await onRefresh();
    } catch (err) {
      notify(`تعذر إضافة القسم: ${err.message}`, 'error');
    } finally {
      setCatSaving(false);
    }
  }

  async function handleToggleCategoryActive(cat) {
    const { error } = await supabase
      .from('categories')
      .update({ is_active: !cat.is_active })
      .eq('id', cat.id);
    if (error) {
      notify(`فشل تحديث القسم: ${error.message}`, 'error');
      return;
    }
    triggerSilentSync({ topic: 'all_users' });
    await onRefresh();
  }

  async function confirmDeleteCategory() {
    if (!deleteCategoryTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', deleteCategoryTarget.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify('تم حذف القسم بنجاح', 'success');
      setDeleteCategoryTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`تعذر حذف القسم: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  }

  function typeLabel(type) {
    if (type === 'dual_day_night') return 'نهار وليل';
    if (type === 'standard') return 'عادية';
    return 'عمق Depth';
  }

  const PRIMARY_PILLS = [
    { id: 'all', label: 'الكل', count: counts.all },
    { id: 'builtin', label: 'مدمجة', count: counts.builtin },
    { id: 'cloud', label: 'سحابية', count: counts.cloud },
    { id: 'hidden', label: 'مخفية', count: counts.hidden },
    { id: 'pro', label: 'Pro', count: counts.pro },
  ];

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الخلفيات</h1>
          <p>تحكم كامل بـ {counts.builtin} خلفية مدمجة (أوفلاين) والخلفيات السحابية الأصلية مع مزامنة فورية</p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCategoriesModal(true)}
          >
            <FolderKanban size={16} />
            الأقسام ({categories.length})
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            {showAddForm ? <X size={16} /> : <Plus size={16} />}
            {showAddForm ? 'إغلاق النموذج' : 'إضافة خلفية جديدة'}
          </button>
        </div>
      </div>

      {/* Add Wallpaper Expandable Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateWallpaper}
          className="glass-panel section-card"
          style={{ marginBottom: 20 }}
        >
          <h2 className="section-heading">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Upload size={18} />
              رفع خلفية سحابية جديدة (Lossless Original)
            </span>
            <span className="badge badge-white">حتى 25MB • WebP Thumb تلقائي</span>
          </h2>

          <div className="form-grid cols-2" style={{ marginBottom: 15 }}>
            <div className="field">
              <label className="field-label" htmlFor="wp-title-ar">
                العنوان بالعربية *
              </label>
              <input
                id="wp-title-ar"
                className="input"
                placeholder="مثال: جبال الألب الضبابية"
                value={form.title_ar}
                onChange={(e) => setForm((p) => ({ ...p, title_ar: e.target.value }))}
                required
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="wp-title-en">
                العنوان بالإنجليزية <span className="field-hint">(اختياري)</span>
              </label>
              <input
                id="wp-title-en"
                className="input ltr"
                placeholder="Misty Alpine Peaks"
                value={form.title_en}
                onChange={(e) => setForm((p) => ({ ...p, title_en: e.target.value }))}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="wp-category">
                القسم
              </label>
              <select
                id="wp-category"
                className="select"
                value={form.category_slug}
                onChange={(e) => setForm((p) => ({ ...p, category_slug: e.target.value }))}
              >
                {categories.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name_ar} ({cat.name_en})
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="wp-sort">
                ترتيب العرض <span className="field-hint">(الأصغر أولاً)</span>
              </label>
              <input
                id="wp-sort"
                type="number"
                className="input mono"
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-grid cols-2" style={{ marginBottom: 15 }}>
            <div className="field">
              <span className="field-label">نوع الخلفية</span>
              <div className="segmented">
                {WALLPAPER_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      className={`segmented-btn${form.wallpaper_type === t.value ? ' active' : ''}`}
                      onClick={() => setForm((p) => ({ ...p, wallpaper_type: t.value }))}
                    >
                      <Icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <span className="field-label">الجمهور المستهدف (معاينة قبل الإطلاق)</span>
              <div className="segmented">
                {AUDIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`segmented-btn${form.target_audience === opt.value ? ' active' : ''}`}
                    onClick={() => setForm((p) => ({ ...p, target_audience: opt.value }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            className={`form-grid ${form.wallpaper_type === 'dual_day_night' ? 'cols-2' : ''}`}
            style={{ marginBottom: 15 }}
          >
            <div className="field">
              <span className="field-label">
                {form.wallpaper_type === 'dual_day_night'
                  ? 'صورة النهار الأصلية *'
                  : 'الصورة الأصلية (بدون ضغط) *'}
                {dayFile && (
                  <span className="badge badge-emerald">{formatFileSize(dayFile.size)}</span>
                )}
              </span>
              <label className={`dropzone${dayFile ? ' has-file' : ''}`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleSelectDayFile}
                />
                {dayPreview ? (
                  <>
                    <img src={dayPreview} alt="معاينة الصورة" className="dropzone-preview" />
                    <span className="field-hint">{dayFile?.name} — اضغط للتغيير</span>
                  </>
                ) : (
                  <>
                    <Upload size={25} />
                    <strong>اختر الصورة أو اسحبها هنا</strong>
                    <span className="field-hint">JPG / PNG / WebP • ترفع بجودتها الأصلية 100%</span>
                  </>
                )}
              </label>
            </div>

            {form.wallpaper_type === 'dual_day_night' && (
              <div className="field">
                <span className="field-label">
                  صورة الليل الأصلية *
                  {nightFile && (
                    <span className="badge badge-white">{formatFileSize(nightFile.size)}</span>
                  )}
                </span>
                <label className={`dropzone${nightFile ? ' has-file' : ''}`}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleSelectNightFile}
                  />
                  {nightPreview ? (
                    <>
                      <img
                        src={nightPreview}
                        alt="معاينة صورة الليل"
                        className="dropzone-preview"
                      />
                      <span className="field-hint">{nightFile?.name} — اضغط للتغيير</span>
                    </>
                  ) : (
                    <>
                      <Moon size={25} />
                      <strong>اختر صورة الليل</strong>
                      <span className="field-hint">تُعرض تلقائياً في الوضع الليلي</span>
                    </>
                  )}
                </label>
              </div>
            )}
          </div>

          <div className="form-grid cols-2" style={{ marginBottom: 16 }}>
            <div className="switch-row">
              <div className="switch-meta">
                <span className="switch-title">
                  <Sparkles size={15} /> جديد (New)
                </span>
                <span className="switch-desc">إظهار شارة "جديد" على البطاقة</span>
              </div>
              <ToggleSwitch
                checked={form.is_new}
                onChange={(v) => setForm((p) => ({ ...p, is_new: v }))}
                tone="white"
                ariaLabel="جديد"
              />
            </div>

            <div className="switch-row">
              <div className="switch-meta">
                <span className="switch-title">
                  <Star size={15} color="var(--emerald)" /> حصرية (Exclusive)
                </span>
                <span className="switch-desc">تمييزها كخلفية حصرية للتطبيق</span>
              </div>
              <ToggleSwitch
                checked={form.is_exclusive}
                onChange={(v) => setForm((p) => ({ ...p, is_exclusive: v }))}
                tone="emerald"
                ariaLabel="حصرية"
              />
            </div>

            <div className="switch-row">
              <div className="switch-meta">
                <span className="switch-title">
                  <Crown size={15} color="var(--amber)" /> Pro (تاج ذهبي)
                </span>
                <span className="switch-desc">متاحة لمشتركي باقة Pro فقط</span>
              </div>
              <ToggleSwitch
                checked={form.is_pro}
                onChange={(v) => setForm((p) => ({ ...p, is_pro: v }))}
                tone="amber"
                ariaLabel="Pro"
              />
            </div>

            <div className="switch-row">
              <div className="switch-meta">
                <span className="switch-title">
                  <Eye size={15} /> ظاهرة في التطبيق
                </span>
                <span className="switch-desc">إخفاء أو إظهار الخلفية للمستخدمين</span>
              </div>
              <ToggleSwitch
                checked={form.is_active}
                onChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
                tone="emerald"
                ariaLabel="ظاهرة"
              />
            </div>

            {form.wallpaper_type === 'dual_day_night' && (
              <div className="switch-row" style={{ gridColumn: '1 / -1' }}>
                <div className="switch-meta">
                  <span className="switch-title">
                    <Sun size={15} color="var(--amber)" />
                    <Moon size={14} color="var(--sky)" />
                    يدعم التبديل التلقائي ليل/نهار
                  </span>
                  <span className="switch-desc">
                    يتيح للتطبيق تبديل الخلفية تلقائياً بين نسخة النهار والليل حسب الوقت أو وضع الهاتف
                  </span>
                </div>
                <ToggleSwitch
                  checked={Boolean(form.supports_auto_day_night)}
                  onChange={(v) => setForm((p) => ({ ...p, supports_auto_day_night: v }))}
                  tone="sky"
                  ariaLabel="يدعم التبديل التلقائي ليل/نهار"
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={uploading}
              onClick={() => {
                resetUploadForm();
                setShowAddForm(false);
              }}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  {uploadStage || 'جاري الرفع...'}
                </>
              ) : (
                <>
                  <Check size={16} />
                  رفع وحفظ الخلفية
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Pills: الكل / مدمجة / سحابية / مخفية / Pro */}
      <div className="glass-panel section-card" style={{ padding: 14 }}>
        <div className="form-grid cols-2" style={{ marginBottom: 12, alignItems: 'center' }}>
          <div className="input-with-icon">
            <span className="input-icon-right">
              <Search size={16} />
            </span>
            <input
              type="search"
              className="input"
              placeholder="ابحث باسم الخلفية أو مفتاح الأصل (مثل ios_liquid_chrome)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-strip" style={{ marginBottom: 0 }}>
            {PRIMARY_PILLS.map((pill) => (
              <button
                key={pill.id}
                type="button"
                className={`chip${primaryFilter === pill.id ? ' active' : ''}`}
                onClick={() => setPrimaryFilter(pill.id)}
              >
                {pill.label}
                <span className="chip-count">({pill.count})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="filter-strip" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className={`chip${selectedCategory === 'all' ? ' active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            جميع الأقسام
          </button>
          {categories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              className={`chip${selectedCategory === cat.slug ? ' active' : ''}`}
              onClick={() => setSelectedCategory(cat.slug)}
            >
              {cat.name_ar}
              {!cat.is_active && <span style={{ opacity: 0.6 }}>(مخفي)</span>}
            </button>
          ))}
        </div>

        <div className="filter-strip" style={{ marginBottom: 0 }}>
          <span className="field-hint" style={{ marginLeft: 4 }}>الجمهور:</span>
          {[
            { id: 'all_filter', label: 'الكل' },
            { id: 'all', label: 'عام (الكل)' },
            { id: 'lab', label: 'المختبر والمطورين' },
            { id: 'dev', label: 'المطورين فقط' },
          ].map((aud) => (
            <button
              key={aud.id}
              type="button"
              className={`chip${selectedAudience === aud.id ? ' active' : ''}`}
              onClick={() => setSelectedAudience(aud.id)}
            >
              {aud.label}
            </button>
          ))}
        </div>
      </div>

      {/* Wallpapers Grid */}
      {loading && wallpapers.length === 0 ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" />
          <span>جاري تحميل الخلفيات...</span>
        </div>
      ) : filteredWallpapers.length === 0 ? (
        <div className="glass-panel empty-state">
          <div className="empty-icon">
            <ImageIcon size={24} />
          </div>
          <strong>لا توجد خلفيات مطابقة لهذا الفلتر</strong>
        </div>
      ) : (
        <div className="wallpapers-grid">
          {filteredWallpapers.map((wp) => {
            const isDual = wp.wallpaper_type === 'dual_day_night' && wp.night_image_url;
            const showingNight = Boolean(nightPreviewMap[wp.id]);
            const candidateSrc =
              isDual && showingNight
                ? wp.night_image_url
                : wp.thumbnail_url || wp.image_url;
            const hasHttpImage = isHttpUrl(candidateSrc);
            const isBusy = Boolean(busyCardIds[wp.id]);
            const aud = wp.target_audience || 'all';
            const audBadge = getAudienceBadge(aud);

            return (
              <article key={wp.id} className="glass-panel wallpaper-card">
                <div className="wallpaper-media">
                  {hasHttpImage ? (
                    <img src={candidateSrc} alt={wp.title_ar} loading="lazy" />
                  ) : (
                    <div className="builtin-media-art">
                      <div className="builtin-media-icon">
                        {wp.wallpaper_type === 'dual_day_night' ? (
                          <Sun size={26} />
                        ) : (
                          <Layers size={26} />
                        )}
                      </div>
                      <strong style={{ fontSize: '0.96rem' }}>{wp.title_ar}</strong>
                      <span className="badge badge-sky">
                        <HardDrive size={11} /> مدمجة (أوفلاين)
                      </span>
                      {wp.builtin_asset_key && (
                        <span className="widget-key-pill">{wp.builtin_asset_key}</span>
                      )}
                    </div>
                  )}

                  <div className="wallpaper-overlay-top">
                    <div className="wallpaper-overlay-badges">
                      <span className="wallpaper-media-pill">{typeLabel(wp.wallpaper_type)}</span>
                      {wp.is_builtin && (
                        <span className="badge badge-sky">
                          <HardDrive size={11} /> مدمجة
                        </span>
                      )}
                      {aud !== 'all' && (
                        <span className={`badge ${audBadge.className}`}>
                          {audBadge.label}
                        </span>
                      )}
                      {wp.is_pro && (
                        <span
                          className="wallpaper-media-pill"
                          style={{ color: 'var(--amber)', borderColor: 'var(--amber-border)' }}
                        >
                          <Crown size={12} /> Pro
                        </span>
                      )}
                    </div>

                    {isDual && hasHttpImage && (
                      <button
                        type="button"
                        className="dual-switch-btn"
                        onClick={() =>
                          setNightPreviewMap((prev) => ({
                            ...prev,
                            [wp.id]: !prev[wp.id],
                          }))
                        }
                      >
                        {showingNight ? <Sun size={13} /> : <Moon size={13} />}
                        {showingNight ? 'نهار' : 'ليل'}
                      </button>
                    )}
                  </div>

                  {!wp.is_active && (
                    <div className="wallpaper-hidden-veil">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <EyeOff size={16} /> مخفية عن التطبيق
                      </span>
                    </div>
                  )}
                </div>

                <div className="wallpaper-body">
                  <div className="wallpaper-meta">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="wallpaper-title">{wp.title_ar}</h3>
                      <p className="wallpaper-sub">
                        {categoryNameMap[wp.category_slug] || wp.category_slug || 'بدون قسم'}
                        {wp.title_en ? ` • ${wp.title_en}` : ''}
                      </p>
                    </div>

                    {wp.is_builtin && !wp.is_active ? (
                      <button
                        type="button"
                        className="btn btn-emerald btn-sm"
                        disabled={isBusy}
                        onClick={() => handleToggleFlag(wp, 'is_active')}
                        title="استعادة الخلفية وإظهارها مجدداً"
                      >
                        <RotateCcw size={13} /> استعادة
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-danger btn-icon"
                        style={{ width: 32, height: 32, flexShrink: 0 }}
                        disabled={isBusy}
                        onClick={() => setDeleteTarget(wp)}
                        aria-label={wp.is_builtin ? `إخفاء ${wp.title_ar}` : `حذف ${wp.title_ar}`}
                        title={
                          wp.is_builtin
                            ? 'إخفاء / إزالة من التطبيق (قابل للاستعادة من فلتر المخفية)'
                            : 'حذف الخلفية نهائياً'
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Quick toggles */}
                  <div className="wallpaper-toggles">
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_new ? ' active-white' : ''}`}
                      onClick={() => handleToggleFlag(wp, 'is_new')}
                    >
                      <Sparkles size={12} /> جديد
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_exclusive ? ' active-emerald' : ''}`}
                      onClick={() => handleToggleFlag(wp, 'is_exclusive')}
                    >
                      <Star size={12} /> حصرية
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_pro ? ' active-amber' : ''}`}
                      onClick={() => handleToggleFlag(wp, 'is_pro')}
                    >
                      <Crown size={12} /> Pro
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_active ? ' active-emerald' : ' active-rose'}`}
                      onClick={() => handleToggleFlag(wp, 'is_active')}
                    >
                      {wp.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
                      {wp.is_active ? 'ظاهرة' : 'مخفية'}
                    </button>
                  </div>

                  {isDual && (
                    <div
                      className="switch-row"
                      style={{ padding: '7px 10px', marginTop: 2 }}
                    >
                      <span
                        className="switch-title"
                        style={{ fontSize: '0.76rem', gap: 5 }}
                      >
                        <Sun size={13} color="var(--amber)" />
                        <Moon size={12} color="var(--sky)" />
                        يدعم التبديل التلقائي ليل/نهار
                      </span>
                      <ToggleSwitch
                        checked={Boolean(wp.supports_auto_day_night)}
                        disabled={isBusy}
                        tone="sky"
                        onChange={() => handleToggleFlag(wp, 'supports_auto_day_night')}
                        ariaLabel={`يدعم التبديل التلقائي ليل/نهار لـ ${wp.title_ar}`}
                      />
                    </div>
                  )}

                  {/* Audience inline selector */}
                  <div className="audience-mini">
                    {AUDIENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={isBusy}
                        className={`audience-mini-btn${aud === opt.value ? ` active-${opt.value}` : ''}`}
                        onClick={() => handleChangeAudience(wp, opt.value)}
                      >
                        {opt.shortLabel}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-block"
                    onClick={() => copyDeepLink(wp)}
                  >
                    {copiedId === wp.id ? (
                      <>
                        <Check size={14} color="var(--emerald)" />
                        تم نسخ رابط العمق المباشر
                      </>
                    ) : (
                      <>
                        <Link2 size={14} />
                        نسخ رابط العمق المباشر
                      </>
                    )}
                  </button>

                  <div className="wallpaper-footer">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Download size={13} />
                      <span className="mono">{wp.downloads_count || 0}</span> تحميل
                    </span>
                    {isHttpUrl(wp.image_url) ? (
                      <a
                        href={wp.image_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        عرض الأصل ↗
                      </a>
                    ) : (
                      <span style={{ color: 'var(--sky)', fontWeight: 600 }}>أصل مدمج أوفلاين</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Manage Categories Modal */}
      {showCategoriesModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowCategoriesModal(false)}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <h2>إدارة أقسام الخلفيات</h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowCategoriesModal(false)}
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleAddCategory}
              className="glass-subcard"
              style={{ padding: 14, marginBottom: 16 }}
            >
              <div className="form-grid cols-2" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label className="field-label" htmlFor="cat-ar">
                    الاسم بالعربية *
                  </label>
                  <input
                    id="cat-ar"
                    className="input"
                    placeholder="مثال: فضاء"
                    value={catNameAr}
                    onChange={(e) => setCatNameAr(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="cat-en">
                    الاسم بالإنجليزية *
                  </label>
                  <input
                    id="cat-en"
                    className="input ltr"
                    placeholder="Space"
                    value={catNameEn}
                    onChange={(e) => {
                      setCatNameEn(e.target.value);
                      if (!catSlug || catSlug === slugifyCategory(catNameEn)) {
                        setCatSlug(slugifyCategory(e.target.value));
                      }
                    }}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="cat-slug">
                    المعرف (Slug) *
                  </label>
                  <input
                    id="cat-slug"
                    className="input mono"
                    placeholder="space"
                    value={catSlug}
                    onChange={(e) => setCatSlug(e.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="cat-order">
                    الترتيب
                  </label>
                  <input
                    id="cat-order"
                    type="number"
                    className="input mono"
                    value={catSortOrder}
                    onChange={(e) => setCatSortOrder(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={catSaving}
              >
                <Plus size={15} />
                {catSaving ? 'جاري الإضافة...' : 'إضافة القسم'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="glass-subcard"
                  style={{
                    padding: '10px 13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    <strong>{cat.name_ar}</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      ({cat.name_en})
                    </span>
                    <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {cat.slug} • ترتيب: {cat.sort_order}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ToggleSwitch
                      checked={cat.is_active}
                      onChange={() => handleToggleCategoryActive(cat)}
                      tone="emerald"
                      ariaLabel={`تفعيل قسم ${cat.name_ar}`}
                    />
                    <button
                      type="button"
                      className="btn btn-danger btn-icon"
                      style={{ width: 30, height: 30 }}
                      onClick={() => setDeleteCategoryTarget(cat)}
                      aria-label={`حذف قسم ${cat.name_ar}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.is_builtin ? 'إخفاء الخلفية المدمجة' : 'حذف الخلفية السحابية'}
        message={
          deleteTarget?.is_builtin
            ? `سيتم إخفاء الخلفية المدمجة "${deleteTarget?.title_ar || ''}" فوراً من التطبيق عبر المزامنة الفورية، ويمكنك استعادتها في أي وقت من فلتر "مخفية".`
            : `هل أنت متأكد من حذف الخلفية "${deleteTarget?.title_ar || ''}"؟ سيتم حذف الصورة الأصلية والمصغّرة نهائياً.`
        }
        confirmText={deleteTarget?.is_builtin ? 'إخفاء من التطبيق' : 'تأكيد الحذف'}
        busy={deleting}
        onConfirm={confirmDeleteOrHideWallpaper}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteCategoryTarget)}
        title="حذف القسم"
        message={`هل أنت متأكد من حذف القسم "${deleteCategoryTarget?.name_ar || ''}"؟`}
        busy={deleting}
        onConfirm={confirmDeleteCategory}
        onCancel={() => setDeleteCategoryTarget(null)}
      />
    </section>
  );
}
