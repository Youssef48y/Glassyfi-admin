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
} from 'lucide-react';
import { supabase, WALLPAPERS_BUCKET } from '../lib/supabase';
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
  sort_order: 0,
  is_new: true,
  is_exclusive: false,
  is_pro: false,
  is_active: true,
};

export function WallpapersTab({
  wallpapers,
  categories,
  loading,
  onRefresh,
  notify,
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
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

  const filteredWallpapers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return wallpapers.filter((item) => {
      if (selectedCategory !== 'all' && item.category_slug !== selectedCategory) {
        return false;
      }
      if (selectedType !== 'all' && item.wallpaper_type !== selectedType) {
        return false;
      }
      if (q) {
        const matchAr = (item.title_ar || '').toLowerCase().includes(q);
        const matchEn = (item.title_en || '').toLowerCase().includes(q);
        if (!matchAr && !matchEn) return false;
      }
      return true;
    });
  }, [wallpapers, selectedCategory, selectedType, searchQuery]);

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

      // 1. Generate lightweight WebP thumbnail client-side (original stays 100% lossless)
      setUploadStage('جاري توليد الصورة المصغّرة (WebP)...');
      const thumb = await generateThumbnailBlob(dayFile, 480, 0.78);
      const thumbPath = `thumbs/${uid}.${thumb.ext}`;
      const thumbnailUrl = await uploadToBucket(thumbPath, thumb.blob, thumb.contentType);
      uploadedPaths.push(thumbPath);

      // 2. Upload 100% untouched original file
      setUploadStage('جاري رفع الصورة الأصلية بدون ضغط...');
      const dayExt = getExtensionFromFile(dayFile);
      const dayPath = `originals/${uid}.${dayExt}`;
      const imageUrl = await uploadToBucket(dayPath, dayFile, dayFile.type);
      uploadedPaths.push(dayPath);

      // 3. Upload night image if dual_day_night
      let nightImageUrl = null;
      if (form.wallpaper_type === 'dual_day_night' && nightFile) {
        setUploadStage('جاري رفع صورة الليل الأصلية...');
        const nightExt = getExtensionFromFile(nightFile);
        const nightPath = `originals/${uid}_night.${nightExt}`;
        nightImageUrl = await uploadToBucket(nightPath, nightFile, nightFile.type);
        uploadedPaths.push(nightPath);
      }

      // 4. Insert metadata row
      setUploadStage('جاري حفظ بيانات الخلفية...');
      const badgeType = deriveBadgeType(form);
      const { error: insertError } = await supabase.from('wallpapers').insert({
        title_ar: titleAr,
        title_en: form.title_en.trim() || null,
        category_slug: form.category_slug || null,
        wallpaper_type: form.wallpaper_type,
        image_url: imageUrl,
        night_image_url: nightImageUrl,
        thumbnail_url: thumbnailUrl,
        badge_type: badgeType,
        is_new: form.is_new,
        is_exclusive: form.is_exclusive,
        is_pro: form.is_pro,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      });

      if (insertError) throw insertError;

      notify('تم رفع الخلفية الأصلية ونشرها بنجاح', 'success');
      resetUploadForm();
      setShowAddForm(false);
      await onRefresh();
    } catch (err) {
      // Rollback any uploaded files if DB insert failed
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
      const nextState = {
        is_new: wallpaper.is_new,
        is_exclusive: wallpaper.is_exclusive,
        is_pro: wallpaper.is_pro,
        is_active: wallpaper.is_active,
        [field]: !wallpaper[field],
      };
      const payload = {
        [field]: nextState[field],
        badge_type: deriveBadgeType(nextState),
      };

      const { error } = await supabase
        .from('wallpapers')
        .update(payload)
        .eq('id', wallpaper.id);

      if (error) throw error;
      await onRefresh();
    } catch (err) {
      notify(`فشل التحديث: ${err.message}`, 'error');
    } finally {
      setBusyCardIds((prev) => ({ ...prev, [wallpaper.id]: false }));
    }
  }

  async function confirmDeleteWallpaper() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('wallpapers')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;

      // Clean up associated storage files
      const paths = [
        extractStoragePath(deleteTarget.image_url),
        extractStoragePath(deleteTarget.night_image_url),
        extractStoragePath(deleteTarget.thumbnail_url),
      ].filter(Boolean);

      if (paths.length > 0) {
        await supabase.storage.from(WALLPAPERS_BUCKET).remove(paths);
      }

      notify('تم حذف الخلفية وملفاتها بنجاح', 'success');
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل حذف الخلفية: ${err.message}`, 'error');
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

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الخلفيات</h1>
          <p>رفع خلفيات أصلية بجودة كاملة مع توليد مصغّرات سريعة تلقائياً</p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCategoriesModal(true)}
          >
            <FolderKanban size={17} />
            إدارة الأقسام ({categories.length})
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            {showAddForm ? <X size={17} /> : <Plus size={17} />}
            {showAddForm ? 'إغلاق النموذج' : 'إضافة خلفية جديدة'}
          </button>
        </div>
      </div>

      {/* Add Wallpaper Expandable Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateWallpaper}
          className="glass-panel section-card"
          style={{ marginBottom: 22 }}
        >
          <h2 className="section-heading">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Upload size={18} color="var(--accent)" />
              رفع خلفية جديدة (Lossless Original)
            </span>
            <span className="badge badge-sky">حتى 25MB • WebP Thumb تلقائي</span>
          </h2>

          <div className="form-grid cols-2" style={{ marginBottom: 16 }}>
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

          {/* Wallpaper Type Segmented Control */}
          <div className="field" style={{ marginBottom: 16 }}>
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
                    <Icon size={15} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* File Dropzones */}
          <div
            className={`form-grid ${form.wallpaper_type === 'dual_day_night' ? 'cols-2' : ''}`}
            style={{ marginBottom: 16 }}
          >
            <div className="field">
              <span className="field-label">
                {form.wallpaper_type === 'dual_day_night'
                  ? 'صورة النهار الأصلية *'
                  : 'الصورة الأصلية (بدون ضغط) *'}
                {dayFile && (
                  <span className="badge badge-emerald">
                    {formatFileSize(dayFile.size)}
                  </span>
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
                    <Upload size={26} color="var(--accent)" />
                    <strong>اختر الصورة أو اسحبها هنا</strong>
                    <span className="field-hint">
                      JPG / PNG / WebP • ترفع بجودتها الأصلية 100%
                    </span>
                  </>
                )}
              </label>
            </div>

            {form.wallpaper_type === 'dual_day_night' && (
              <div className="field">
                <span className="field-label">
                  صورة الليل الأصلية *
                  {nightFile && (
                    <span className="badge badge-sky">
                      {formatFileSize(nightFile.size)}
                    </span>
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
                      <Moon size={26} color="var(--accent)" />
                      <strong>اختر صورة الليل</strong>
                      <span className="field-hint">تُعرض تلقائياً في الوضع الليلي</span>
                    </>
                  )}
                </label>
              </div>
            )}
          </div>

          {/* Badge & Visibility Switches */}
          <div className="form-grid cols-2" style={{ marginBottom: 18 }}>
            <div className="switch-row">
              <div className="switch-meta">
                <span className="switch-title">
                  <Sparkles size={15} color="var(--accent)" /> جديد (New)
                </span>
                <span className="switch-desc">إظهار شارة "جديد" على البطاقة</span>
              </div>
              <ToggleSwitch
                checked={form.is_new}
                onChange={(v) => setForm((p) => ({ ...p, is_new: v }))}
                tone="sky"
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
                  <Crown size={15} color="var(--gold)" /> Pro (تاج ذهبي)
                </span>
                <span className="switch-desc">متاحة لمشتركي باقة Pro فقط</span>
              </div>
              <ToggleSwitch
                checked={form.is_pro}
                onChange={(v) => setForm((p) => ({ ...p, is_pro: v }))}
                tone="gold"
                ariaLabel="Pro"
              />
            </div>

            <div className="switch-row">
              <div className="switch-meta">
                <span className="switch-title">
                  <Eye size={15} color="var(--text-primary)" /> ظاهرة في التطبيق
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
                  <Loader2 size={17} className="spinner" />
                  {uploadStage || 'جاري الرفع...'}
                </>
              ) : (
                <>
                  <Check size={17} />
                  رفع وحفظ الخلفية
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Search & Filter Bar */}
      <div className="glass-panel section-card" style={{ padding: 14 }}>
        <div className="form-grid cols-2" style={{ marginBottom: 12 }}>
          <div className="input-with-icon">
            <span className="input-icon-right">
              <Search size={16} />
            </span>
            <input
              type="search"
              className="input"
              placeholder="ابحث باسم الخلفية..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="segmented" style={{ justifySelf: 'start' }}>
            <button
              type="button"
              className={`segmented-btn${selectedType === 'all' ? ' active' : ''}`}
              onClick={() => setSelectedType('all')}
            >
              الكل ({wallpapers.length})
            </button>
            <button
              type="button"
              className={`segmented-btn${selectedType === 'depth' ? ' active' : ''}`}
              onClick={() => setSelectedType('depth')}
            >
              عمق
            </button>
            <button
              type="button"
              className={`segmented-btn${selectedType === 'dual_day_night' ? ' active' : ''}`}
              onClick={() => setSelectedType('dual_day_night')}
            >
              نهار وليل
            </button>
            <button
              type="button"
              className={`segmented-btn${selectedType === 'standard' ? ' active' : ''}`}
              onClick={() => setSelectedType('standard')}
            >
              عادية
            </button>
          </div>
        </div>

        <div className="filter-strip" style={{ marginBottom: 0 }}>
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
      </div>

      {/* Wallpapers Grid */}
      {loading && wallpapers.length === 0 ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" color="var(--accent)" />
          <span>جاري تحميل الخلفيات...</span>
        </div>
      ) : filteredWallpapers.length === 0 ? (
        <div className="glass-panel empty-state">
          <div className="empty-icon">
            <ImageIcon size={24} />
          </div>
          <strong>لا توجد خلفيات مطابقة حالياً</strong>
          <span style={{ fontSize: '0.84rem' }}>
            اضغط على "إضافة خلفية جديدة" لرفع أول خلفية بجودة أصلية.
          </span>
        </div>
      ) : (
        <div className="wallpapers-grid">
          {filteredWallpapers.map((wp) => {
            const isDual = wp.wallpaper_type === 'dual_day_night' && wp.night_image_url;
            const showingNight = Boolean(nightPreviewMap[wp.id]);
            const previewSrc =
              isDual && showingNight
                ? wp.night_image_url
                : wp.thumbnail_url || wp.image_url;
            const isBusy = Boolean(busyCardIds[wp.id]);

            return (
              <article key={wp.id} className="glass-panel wallpaper-card">
                <div className="wallpaper-media">
                  <img src={previewSrc} alt={wp.title_ar} loading="lazy" />

                  <div className="wallpaper-overlay-top">
                    <div className="wallpaper-overlay-badges">
                      <span className="wallpaper-media-pill">{typeLabel(wp.wallpaper_type)}</span>
                      {wp.is_pro && (
                        <span
                          className="wallpaper-media-pill"
                          style={{ color: 'var(--gold)', borderColor: 'var(--gold-border)' }}
                        >
                          <Crown size={12} /> Pro
                        </span>
                      )}
                    </div>

                    {isDual && (
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
                        <EyeOff size={16} /> مخفية عن المستخدمين
                      </span>
                    </div>
                  )}
                </div>

                <div className="wallpaper-body">
                  <div className="wallpaper-meta">
                    <div>
                      <h3 className="wallpaper-title">{wp.title_ar}</h3>
                      <p className="wallpaper-sub">
                        {categoryNameMap[wp.category_slug] || wp.category_slug || 'بدون قسم'}
                        {wp.title_en ? ` • ${wp.title_en}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-danger btn-icon"
                      style={{ width: 34, height: 34, flexShrink: 0 }}
                      onClick={() => setDeleteTarget(wp)}
                      aria-label={`حذف ${wp.title_ar}`}
                      title="حذف الخلفية"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Quick toggles */}
                  <div className="wallpaper-toggles">
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_new ? ' active-sky' : ''}`}
                      onClick={() => handleToggleFlag(wp, 'is_new')}
                    >
                      <Sparkles size={13} /> جديد
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_exclusive ? ' active-emerald' : ''}`}
                      onClick={() => handleToggleFlag(wp, 'is_exclusive')}
                    >
                      <Star size={13} /> حصرية
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_pro ? ' active-gold' : ''}`}
                      onClick={() => handleToggleFlag(wp, 'is_pro')}
                    >
                      <Crown size={13} /> Pro
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      className={`quick-toggle-pill${wp.is_active ? ' active-emerald' : ' active-danger'}`}
                      onClick={() => handleToggleFlag(wp, 'is_active')}
                    >
                      {wp.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
                      {wp.is_active ? 'ظاهرة' : 'مخفية'}
                    </button>
                  </div>

                  <div className="wallpaper-footer">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Download size={13} />
                      <span className="mono">{wp.downloads_count || 0}</span> تحميل
                    </span>
                    <a
                      href={wp.image_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      عرض الأصل ↗
                    </a>
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
              style={{ padding: 14, marginBottom: 18 }}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="glass-subcard"
                  style={{
                    padding: '11px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    <strong>{cat.name_ar}</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      ({cat.name_en})
                    </span>
                    <div className="mono" style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
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
                      style={{ width: 32, height: 32 }}
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

      {/* Delete Wallpaper Confirm */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="حذف الخلفية"
        message={`هل أنت متأكد من حذف الخلفية "${deleteTarget?.title_ar || ''}"؟ سيتم حذف الصورة الأصلية والمصغّرة من التخزين السحابي نهائياً.`}
        busy={deleting}
        onConfirm={confirmDeleteWallpaper}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Delete Category Confirm */}
      <ConfirmDialog
        open={Boolean(deleteCategoryTarget)}
        title="حذف القسم"
        message={`هل أنت متأكد من حذف القسم "${deleteCategoryTarget?.name_ar || ''}"؟ ستبقى الخلفيات المرتبطة به بدون قسم.`}
        busy={deleting}
        onConfirm={confirmDeleteCategory}
        onCancel={() => setDeleteCategoryTarget(null)}
      />
    </section>
  );
}
