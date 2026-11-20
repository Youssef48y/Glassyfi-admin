import { useMemo, useState } from 'react';
import {
  LayoutGrid,
  Layers,
  Code2,
  Crown,
  Eye,
  EyeOff,
  Sparkles,
  Search,
  Loader2,
  Plus,
  Wand2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Pencil,
  Save,
  X,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import {
  AUDIENCE_OPTIONS,
  WIDGET_CATEGORY_META,
  DEPTH_GROUP_META,
  getAudienceBadge,
} from '../lib/constants';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';

const ASPECT_OPTIONS = ['2x2', '4x2', '4x1'];

function buildJsonTemplate(aspectRatio = '2x2') {
  if (aspectRatio === '4x1') {
    return {
      version: 1,
      style: 'frosted_glass',
      background: '#272A30',
      borderColor: 'rgba(255,255,255,0.16)',
      cornerRadius: 22,
      padding: 12,
      align: 'center',
      layout: 'row',
      elements: [
        { type: 'clock', format: 'HH:mm', fontSize: 24, weight: 'bold', color: '#FFFFFF' },
        { type: 'divider', color: 'rgba(255,255,255,0.2)' },
        { type: 'date', format: 'EEE, d MMM', fontSize: 13, color: '#D1D5DB' },
        { type: 'badge', text: '24° ☀', bg: 'rgba(255,255,255,0.12)', color: '#FFFFFF' },
      ],
    };
  }
  if (aspectRatio === '4x2') {
    return {
      version: 1,
      style: 'frosted_glass',
      background: 'linear-gradient(145deg, #2E323B 0%, #1F2229 100%)',
      borderColor: 'rgba(255,255,255,0.16)',
      cornerRadius: 24,
      padding: 16,
      align: 'start',
      layout: 'column',
      elements: [
        { type: 'badge', text: 'GLASSYFI LIVE', bg: 'rgba(255,255,255,0.14)', color: '#FFFFFF' },
        { type: 'clock', format: 'hh:mm a', fontSize: 34, weight: 'bold', color: '#FFFFFF' },
        { type: 'date', format: 'EEEE • d MMMM', fontSize: 13, color: '#A9AFB9' },
        { type: 'text', text: 'يومك سعيد ومليء بالإنجاز ✨', fontSize: 12, color: '#D1D5DB' },
      ],
    };
  }
  return {
    version: 1,
    style: 'frosted_glass',
    background: 'linear-gradient(155deg, #323640 0%, #20232A 100%)',
    borderColor: 'rgba(255,255,255,0.18)',
    cornerRadius: 24,
    padding: 14,
    align: 'center',
    layout: 'column',
    elements: [
      { type: 'badge', text: 'الجمعة', bg: 'rgba(255,255,255,0.14)', color: '#FFFFFF' },
      { type: 'clock', format: 'HH:mm', fontSize: 32, weight: 'bold', color: '#FFFFFF' },
      { type: 'date', format: 'd MMM', fontSize: 12, color: '#A9AFB9' },
    ],
  };
}

const INITIAL_DYN_FORM = {
  id: null,
  widget_key: '',
  title_ar: '',
  title_en: '',
  category: 'custom',
  aspect_ratio: '2x2',
  is_pro: false,
  is_new: true,
  is_visible: true,
  target_audience: 'all',
  sort_order: 0,
  jsonText: JSON.stringify(buildJsonTemplate('2x2'), null, 2),
};

function DynamicWidgetMiniPreview({ layout, aspectRatio = '2x2' }) {
  const safe = layout && typeof layout === 'object' ? layout : null;
  const elements = Array.isArray(safe?.elements) ? safe.elements : [];
  const isRow = safe?.layout === 'row' || aspectRatio === '4x1';

  const alignItems =
    safe?.align === 'start'
      ? 'flex-start'
      : safe?.align === 'end'
        ? 'flex-end'
        : 'center';

  const now = new Date();
  const sampleTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const sampleDate = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(now);

  return (
    <div className="widget-preview-stage">
      <div
        className={`widget-mini-canvas ratio-${aspectRatio}`}
        style={{
          background: safe?.background || '#272A30',
          border: `1px solid ${safe?.borderColor || 'rgba(255,255,255,0.16)'}`,
          borderRadius: Number(safe?.cornerRadius) || 22,
          padding: Math.min(22, Math.max(8, Number(safe?.padding) || 14)),
          flexDirection: isRow ? 'row' : 'column',
          alignItems: isRow ? 'center' : alignItems,
          justifyContent: isRow ? 'space-between' : 'center',
          textAlign: safe?.align === 'start' ? 'right' : safe?.align === 'end' ? 'left' : 'center',
        }}
      >
        {!safe || elements.length === 0 ? (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            معاينة JSON المباشرة
          </span>
        ) : (
          elements.slice(0, 6).map((el, idx) => {
            const type = String(el?.type || 'text').toLowerCase();
            if (type === 'divider') {
              return (
                <div
                  key={idx}
                  style={{
                    width: isRow ? 1 : '70%',
                    height: isRow ? 26 : 1,
                    background: el.color || 'rgba(255,255,255,0.18)',
                    flexShrink: 0,
                  }}
                />
              );
            }
            if (type === 'badge') {
              return (
                <span
                  key={idx}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: '0.66rem',
                    fontWeight: 700,
                    background: el.bg || 'rgba(255,255,255,0.14)',
                    color: el.color || '#FFFFFF',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {el.text || 'شارة'}
                </span>
              );
            }
            if (type === 'clock') {
              return (
                <div
                  key={idx}
                  className="mono"
                  style={{
                    fontSize: Math.min(34, Math.max(15, Number(el.fontSize) || 28)),
                    fontWeight: el.weight === 'normal' ? 500 : 700,
                    color: el.color || '#FFFFFF',
                    lineHeight: 1.05,
                  }}
                >
                  {sampleTime}
                </div>
              );
            }
            if (type === 'date') {
              return (
                <div
                  key={idx}
                  style={{
                    fontSize: Math.min(15, Math.max(10, Number(el.fontSize) || 12)),
                    color: el.color || '#A9AFB9',
                    fontWeight: 500,
                  }}
                >
                  {sampleDate}
                </div>
              );
            }
            return (
              <div
                key={idx}
                style={{
                  fontSize: Math.min(16, Math.max(10, Number(el.fontSize) || 12)),
                  fontWeight: el.weight === 'bold' ? 700 : 500,
                  color: el.color || '#F5F6F8',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}
              >
                {el.text || el.label || 'نص مخصص'}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function WidgetsTab({
  widgets,
  depthTools,
  dynamicWidgets = [],
  loading,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('widgets'); // 'widgets' | 'depth' | 'dynamic'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all_filter');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyKeys, setBusyKeys] = useState({});

  // Dynamic JSON Widget Builder State
  const [dynForm, setDynForm] = useState(INITIAL_DYN_FORM);
  const [dynSaving, setDynSaving] = useState(false);
  const [deleteDynTarget, setDeleteDynTarget] = useState(null);
  const [deletingDyn, setDeletingDyn] = useState(false);

  const jsonValidation = useMemo(() => {
    try {
      const parsed = JSON.parse(dynForm.jsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, parsed: null, error: 'يجب أن يكون الجذر كائن JSON Object ({ ... })' };
      }
      return { valid: true, parsed, error: null };
    } catch (err) {
      return { valid: false, parsed: null, error: err.message };
    }
  }, [dynForm.jsonText]);

  // Filtered 40 Home Widgets
  const filteredWidgets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return widgets.filter((w) => {
      if (selectedCategory !== 'all' && w.category !== selectedCategory) return false;
      if (audienceFilter !== 'all_filter' && (w.target_audience || 'all') !== audienceFilter) {
        return false;
      }
      if (q) {
        const hit =
          (w.title_ar || '').toLowerCase().includes(q) ||
          (w.title_en || '').toLowerCase().includes(q) ||
          (w.widget_key || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [widgets, selectedCategory, audienceFilter, searchQuery]);

  const groupedWidgets = useMemo(() => {
    const groups = new Map();
    filteredWidgets.forEach((w) => {
      const cat = w.category || 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(w);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      const oa = WIDGET_CATEGORY_META[a[0]]?.order ?? 99;
      const ob = WIDGET_CATEGORY_META[b[0]]?.order ?? 99;
      return oa - ob;
    });
  }, [filteredWidgets]);

  // Filtered 15 Depth Studio Clocks & Tools
  const filteredDepth = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return depthTools.filter((d) => {
      if (audienceFilter !== 'all_filter' && (d.target_audience || 'all') !== audienceFilter) {
        return false;
      }
      if (q) {
        const hit =
          (d.title_ar || '').toLowerCase().includes(q) ||
          (d.title_en || '').toLowerCase().includes(q) ||
          (d.tool_key || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [depthTools, audienceFilter, searchQuery]);

  const groupedDepth = useMemo(() => {
    const groups = new Map();
    filteredDepth.forEach((d) => {
      const grp = d.group_name || 'tools';
      if (!groups.has(grp)) groups.set(grp, []);
      groups.get(grp).push(d);
    });
    return Array.from(groups.entries()).sort((a, b) => {
      const oa = DEPTH_GROUP_META[a[0]]?.order ?? 99;
      const ob = DEPTH_GROUP_META[b[0]]?.order ?? 99;
      return oa - ob;
    });
  }, [filteredDepth]);

  async function updateWidget(widgetKey, patch) {
    setBusyKeys((prev) => ({ ...prev, [widgetKey]: true }));
    try {
      const { error } = await supabase
        .from('widgets_config')
        .update(patch)
        .eq('widget_key', widgetKey);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`تعذر تحديث الويدجيت: ${err.message}`, 'error');
    } finally {
      setBusyKeys((prev) => ({ ...prev, [widgetKey]: false }));
    }
  }

  async function updateDepthTool(toolKey, patch) {
    setBusyKeys((prev) => ({ ...prev, [toolKey]: true }));
    try {
      const { error } = await supabase
        .from('depth_tools_config')
        .update(patch)
        .eq('tool_key', toolKey);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`تعذر تحديث أداة العمق: ${err.message}`, 'error');
    } finally {
      setBusyKeys((prev) => ({ ...prev, [toolKey]: false }));
    }
  }

  async function updateDynamicWidget(id, patch) {
    setBusyKeys((prev) => ({ ...prev, [id]: true }));
    try {
      const { error } = await supabase
        .from('dynamic_widgets')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`تعذر تحديث الويدجيت الديناميكي: ${err.message}`, 'error');
    } finally {
      setBusyKeys((prev) => ({ ...prev, [id]: false }));
    }
  }

  function handleApplyTemplate(aspect = dynForm.aspect_ratio) {
    const tpl = buildJsonTemplate(aspect);
    setDynForm((prev) => ({
      ...prev,
      aspect_ratio: aspect,
      jsonText: JSON.stringify(tpl, null, 2),
    }));
    notify(`تم تطبيق قالب JSON جاهز لمقاس ${aspect}`, 'info');
  }

  function handleFormatJson() {
    if (!jsonValidation.valid) {
      notify('الـ JSON يحتوي على خطأ نحوي، يرجى تصحيحه أولاً', 'error');
      return;
    }
    setDynForm((prev) => ({
      ...prev,
      jsonText: JSON.stringify(jsonValidation.parsed, null, 2),
    }));
  }

  function startEditDynamic(dw) {
    setDynForm({
      id: dw.id,
      widget_key: dw.widget_key,
      title_ar: dw.title_ar,
      title_en: dw.title_en || '',
      category: dw.category || 'custom',
      aspect_ratio: dw.aspect_ratio || '2x2',
      is_pro: Boolean(dw.is_pro),
      is_new: Boolean(dw.is_new),
      is_visible: Boolean(dw.is_visible),
      target_audience: dw.target_audience || 'all',
      sort_order: dw.sort_order ?? 0,
      jsonText: JSON.stringify(dw.layout_json || {}, null, 2),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSaveDynamicWidget(e) {
    e.preventDefault();
    const cleanKey = dynForm.widget_key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const titleAr = dynForm.title_ar.trim();

    if (!cleanKey || !titleAr) {
      notify('يرجى إدخال العنوان بالعربية ومعرّف الويدجيت (widget_key)', 'error');
      return;
    }
    if (!jsonValidation.valid) {
      notify(`خطأ في تنسيق JSON: ${jsonValidation.error}`, 'error');
      return;
    }

    setDynSaving(true);
    try {
      const payload = {
        widget_key: cleanKey,
        title_ar: titleAr,
        title_en: dynForm.title_en.trim() || null,
        category: dynForm.category.trim() || 'custom',
        aspect_ratio: dynForm.aspect_ratio,
        layout_json: jsonValidation.parsed,
        is_pro: dynForm.is_pro,
        is_new: dynForm.is_new,
        is_visible: dynForm.is_visible,
        target_audience: dynForm.target_audience,
        sort_order: Number(dynForm.sort_order) || 0,
      };

      const { error } = dynForm.id
        ? await supabase.from('dynamic_widgets').update(payload).eq('id', dynForm.id)
        : await supabase.from('dynamic_widgets').insert(payload);

      if (error) throw error;

      triggerSilentSync({ topic: 'all_users' });
      notify(
        dynForm.id
          ? 'تم تحديث ويدجيت JSON ومزامنة التطبيقات فورياً'
          : 'تم نشر ويدجيت JSON الجديد ومزامنة التطبيقات فورياً',
        'success',
      );
      setDynForm(INITIAL_DYN_FORM);
      await onRefresh();
    } catch (err) {
      notify(`تعذر الحفظ: ${err.message}`, 'error');
    } finally {
      setDynSaving(false);
    }
  }

  async function confirmDeleteDynamic() {
    if (!deleteDynTarget) return;
    setDeletingDyn(true);
    try {
      const { error } = await supabase
        .from('dynamic_widgets')
        .delete()
        .eq('id', deleteDynTarget.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify('تم حذف الويدجيت الديناميكي', 'success');
      if (dynForm.id === deleteDynTarget.id) setDynForm(INITIAL_DYN_FORM);
      setDeleteDynTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setDeletingDyn(false);
    }
  }

  function renderControlCard({
    itemKey,
    titleAr,
    titleEn,
    isVisible,
    isPro,
    isNew,
    targetAudience,
    onPatch,
  }) {
    const busy = Boolean(busyKeys[itemKey]);
    const aud = targetAudience || 'all';
    const audBadge = getAudienceBadge(aud);

    return (
      <article key={itemKey} className="glass-panel widget-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '0.96rem' }}>{titleAr}</h3>
              {isPro ? (
                <span className="badge badge-amber">
                  <Crown size={11} /> Pro
                </span>
              ) : (
                <span className="badge badge-neutral">مجاني</span>
              )}
              {isNew && (
                <span className="badge badge-white">
                  <Sparkles size={11} /> جديد
                </span>
              )}
              {aud !== 'all' && (
                <span className={`badge ${audBadge.className}`}>{audBadge.label}</span>
              )}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {titleEn}
            </div>
            <span className="widget-key-pill">{itemKey}</span>
          </div>

          {!isVisible && (
            <span className="badge badge-rose" style={{ alignSelf: 'flex-start' }}>
              <EyeOff size={11} /> مخفي
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
          <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px' }}>
            <span className="switch-title" style={{ fontSize: '0.74rem' }}>
              <Eye size={13} color={isVisible ? 'var(--emerald)' : 'var(--text-muted)'} />
              الظهور
            </span>
            <ToggleSwitch
              checked={isVisible}
              disabled={busy}
              tone="emerald"
              onChange={() => onPatch({ is_visible: !isVisible })}
              ariaLabel={`ظهور ${titleAr}`}
            />
          </div>

          <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px' }}>
            <span className="switch-title" style={{ fontSize: '0.74rem' }}>
              <Crown size={13} color={isPro ? 'var(--amber)' : 'var(--text-muted)'} />
              Pro
            </span>
            <ToggleSwitch
              checked={isPro}
              disabled={busy}
              tone="amber"
              onChange={() => onPatch({ is_pro: !isPro })}
              ariaLabel={`حالة Pro لعنصر ${titleAr}`}
            />
          </div>

          <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px' }}>
            <span className="switch-title" style={{ fontSize: '0.74rem' }}>
              <Sparkles size={13} color={isNew ? '#ffffff' : 'var(--text-muted)'} />
              جديد
            </span>
            <ToggleSwitch
              checked={isNew}
              disabled={busy}
              tone="white"
              onChange={() => onPatch({ is_new: !isNew })}
              ariaLabel={`شارة جديد لعنصر ${titleAr}`}
            />
          </div>
        </div>

        <div>
          <div className="field-hint" style={{ marginBottom: 5 }}>الجمهور المستهدف</div>
          <div className="audience-mini">
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={busy}
                className={`audience-mini-btn${aud === opt.value ? ` active-${opt.value}` : ''}`}
                onClick={() => onPatch({ target_audience: opt.value })}
              >
                {opt.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </article>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الويدجيت وأدوات العمق</h1>
          <p>تحكم فردي في الـ 40 ويدجيت الأصلية، و15 أداة عمق، وبناء ويدجيت JSON ديناميكية عن بُعد</p>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${subTab === 'widgets' ? ' active' : ''}`}
            onClick={() => setSubTab('widgets')}
          >
            <LayoutGrid size={15} />
            الشاشة الرئيسية ({widgets.length})
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'depth' ? ' active' : ''}`}
            onClick={() => setSubTab('depth')}
          >
            <Layers size={15} />
            أدوات العمق ({depthTools.length})
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'dynamic' ? ' active' : ''}`}
            onClick={() => setSubTab('dynamic')}
          >
            <Code2 size={15} />
            ويدجيت JSON (ديناميكي) ({dynamicWidgets.length})
          </button>
        </div>
      </div>

      {/* Search & Filter Panel for Home Widgets & Depth Tools */}
      {subTab !== 'dynamic' && (
        <div className="glass-panel section-card" style={{ padding: 14 }}>
          <div className="form-grid cols-2" style={{ alignItems: 'center', marginBottom: subTab === 'widgets' ? 12 : 0 }}>
            <div className="input-with-icon">
              <span className="input-icon-right">
                <Search size={16} />
              </span>
              <input
                type="search"
                className="input"
                placeholder={
                  subTab === 'widgets'
                    ? 'ابحث باسم الويدجيت أو المعرّف (مثل analog_thuluth)...'
                    : 'ابحث باسم الأداة أو الساعة (مثل tool_magic_depth)...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-strip" style={{ marginBottom: 0 }}>
              {[
                { id: 'all_filter', label: 'كل الجماهير' },
                { id: 'all', label: 'الكل' },
                { id: 'lab', label: 'مختبر' },
                { id: 'dev', label: 'مطورين' },
              ].map((aud) => (
                <button
                  key={aud.id}
                  type="button"
                  className={`chip${audienceFilter === aud.id ? ' active' : ''}`}
                  onClick={() => setAudienceFilter(aud.id)}
                >
                  {aud.label}
                </button>
              ))}
            </div>
          </div>

          {subTab === 'widgets' && (
            <div className="filter-strip" style={{ marginBottom: 0 }}>
              {['all', 'analog', 'digital_glass', 'dates', 'weather'].map((cat) => {
                const count =
                  cat === 'all'
                    ? widgets.length
                    : widgets.filter((w) => w.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`chip${selectedCategory === cat ? ' active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {WIDGET_CATEGORY_META[cat]?.label || cat}
                    <span className="chip-count">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sub-tab 1: 40 Native Home Widgets */}
      {subTab === 'widgets' &&
        (loading && widgets.length === 0 ? (
          <div className="glass-panel empty-state">
            <Loader2 size={28} className="spinner" />
            <span>جاري تحميل الإعدادات...</span>
          </div>
        ) : groupedWidgets.length === 0 ? (
          <div className="glass-panel empty-state">
            <div className="empty-icon">
              <LayoutGrid size={24} />
            </div>
            <strong>لا توجد ويدجيت مطابقة للبحث</strong>
          </div>
        ) : (
          groupedWidgets.map(([catKey, items]) => (
            <div key={catKey}>
              <div className="group-divider">
                <h2>{WIDGET_CATEGORY_META[catKey]?.label || catKey}</h2>
                <span className="badge badge-neutral">{items.length} ويدجيت</span>
              </div>
              <div className="cards-grid cols-3">
                {items.map((w) =>
                  renderControlCard({
                    itemKey: w.widget_key,
                    titleAr: w.title_ar,
                    titleEn: w.title_en,
                    isVisible: w.is_visible,
                    isPro: w.is_pro,
                    isNew: w.is_new,
                    targetAudience: w.target_audience,
                    onPatch: (patch) => updateWidget(w.widget_key, patch),
                  }),
                )}
              </div>
            </div>
          ))
        ))}

      {/* Sub-tab 2: 15 Depth Studio Clocks & Tools */}
      {subTab === 'depth' &&
        (groupedDepth.length === 0 ? (
          <div className="glass-panel empty-state">
            <div className="empty-icon">
              <Layers size={24} />
            </div>
            <strong>لا توجد أدوات عمق مطابقة للبحث</strong>
          </div>
        ) : (
          groupedDepth.map(([groupKey, items]) => (
            <div key={groupKey}>
              <div className="group-divider">
                <h2>{DEPTH_GROUP_META[groupKey]?.label || groupKey}</h2>
                <span className="badge badge-white">{items.length} عنصر</span>
              </div>
              <div className="cards-grid cols-3">
                {items.map((d) =>
                  renderControlCard({
                    itemKey: d.tool_key,
                    titleAr: d.title_ar,
                    titleEn: d.title_en,
                    isVisible: d.is_visible,
                    isPro: d.is_pro,
                    isNew: d.is_new,
                    targetAudience: d.target_audience,
                    onPatch: (patch) => updateDepthTool(d.tool_key, patch),
                  }),
                )}
              </div>
            </div>
          ))
        ))}

      {/* Sub-tab 3: Dynamic JSON Widgets Builder & Manager */}
      {subTab === 'dynamic' && (
        <>
          <form onSubmit={handleSaveDynamicWidget} className="glass-panel section-card">
            <div className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Code2 size={18} />
                {dynForm.id ? 'تعديل ويدجيت JSON ديناميكي' : 'إنشاء ويدجيت JSON ديناميكي جديد'}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleApplyTemplate(dynForm.aspect_ratio)}
                >
                  <Wand2 size={14} />
                  قالب جاهز
                </button>
                {dynForm.id && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDynForm(INITIAL_DYN_FORM)}
                  >
                    <X size={14} /> إلغاء التعديل
                  </button>
                )}
              </div>
            </div>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
              <div className="form-grid" style={{ gap: 12 }}>
                <div className="form-grid cols-2">
                  <div className="field">
                    <label className="field-label" htmlFor="dw-title-ar">
                      العنوان بالعربية *
                    </label>
                    <input
                      id="dw-title-ar"
                      className="input"
                      placeholder="مثال: ساعة زجاجية فورية"
                      value={dynForm.title_ar}
                      onChange={(e) => setDynForm((p) => ({ ...p, title_ar: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="dw-key">
                      المعرف (widget_key) *
                    </label>
                    <input
                      id="dw-key"
                      className="input mono"
                      placeholder="dyn_glass_clock_01"
                      value={dynForm.widget_key}
                      onChange={(e) => setDynForm((p) => ({ ...p, widget_key: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid cols-2">
                  <div className="field">
                    <label className="field-label" htmlFor="dw-title-en">
                      العنوان بالإنجليزية <span className="field-hint">(اختياري)</span>
                    </label>
                    <input
                      id="dw-title-en"
                      className="input ltr"
                      placeholder="Dynamic Glass Clock"
                      value={dynForm.title_en}
                      onChange={(e) => setDynForm((p) => ({ ...p, title_en: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="dw-sort">
                      ترتيب العرض
                    </label>
                    <input
                      id="dw-sort"
                      type="number"
                      className="input mono"
                      value={dynForm.sort_order}
                      onChange={(e) => setDynForm((p) => ({ ...p, sort_order: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-grid cols-2">
                  <div className="field">
                    <span className="field-label">الأبعاد (Aspect Ratio)</span>
                    <div className="segmented" style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                      {ASPECT_OPTIONS.map((ar) => (
                        <button
                          key={ar}
                          type="button"
                          className={`segmented-btn mono${dynForm.aspect_ratio === ar ? ' active' : ''}`}
                          style={{ justifyContent: 'center' }}
                          onClick={() => setDynForm((p) => ({ ...p, aspect_ratio: ar }))}
                        >
                          {ar}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field">
                    <span className="field-label">الجمهور</span>
                    <div className="audience-mini">
                      {AUDIENCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`audience-mini-btn${dynForm.target_audience === opt.value ? ` active-${opt.value}` : ''}`}
                          onClick={() => setDynForm((p) => ({ ...p, target_audience: opt.value }))}
                        >
                          {opt.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px' }}>
                    <span className="switch-title" style={{ fontSize: '0.75rem' }}>ظاهر</span>
                    <ToggleSwitch
                      checked={dynForm.is_visible}
                      tone="emerald"
                      onChange={(v) => setDynForm((p) => ({ ...p, is_visible: v }))}
                    />
                  </div>
                  <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px' }}>
                    <span className="switch-title" style={{ fontSize: '0.75rem' }}>Pro</span>
                    <ToggleSwitch
                      checked={dynForm.is_pro}
                      tone="amber"
                      onChange={(v) => setDynForm((p) => ({ ...p, is_pro: v }))}
                    />
                  </div>
                  <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 6px' }}>
                    <span className="switch-title" style={{ fontSize: '0.75rem' }}>جديد</span>
                    <ToggleSwitch
                      checked={dynForm.is_new}
                      tone="white"
                      onChange={(v) => setDynForm((p) => ({ ...p, is_new: v }))}
                    />
                  </div>
                </div>
              </div>

              {/* Live Miniature Preview Card */}
              <div className="field">
                <span className="field-label">
                  <span>معاينة مصغّرة مباشرة ({dynForm.aspect_ratio})</span>
                  <span className={`badge ${jsonValidation.valid ? 'badge-emerald' : 'badge-rose'}`}>
                    {jsonValidation.valid ? (
                      <>
                        <CheckCircle2 size={11} /> JSON صالح
                      </>
                    ) : (
                      <>
                        <AlertCircle size={11} /> خطأ JSON
                      </>
                    )}
                  </span>
                </span>
                <DynamicWidgetMiniPreview
                  layout={jsonValidation.parsed}
                  aspectRatio={dynForm.aspect_ratio}
                />
              </div>
            </div>

            {/* Monospace JSON Editor */}
            <div className="field" style={{ marginBottom: 14 }}>
              <div className="field-label">
                <span>محرر تصميم الويدجيت (layout_json)</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                  onClick={handleFormatJson}
                >
                  تنسيق JSON
                </button>
              </div>
              <textarea
                className={`json-editor${jsonValidation.valid ? '' : ' invalid'}`}
                spellCheck={false}
                value={dynForm.jsonText}
                onChange={(e) => setDynForm((p) => ({ ...p, jsonText: e.target.value }))}
              />
              {!jsonValidation.valid && (
                <div className="alert-banner alert-danger" style={{ padding: '7px 11px', fontSize: '0.76rem' }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span className="mono">{jsonValidation.error}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={dynSaving || !jsonValidation.valid}
              >
                {dynForm.id ? <Save size={16} /> : <Plus size={16} />}
                {dynSaving
                  ? 'جاري الحفظ...'
                  : dynForm.id
                    ? 'حفظ التعديلات ومزامنة'
                    : 'نشر ويدجيت JSON'}
              </button>
            </div>
          </form>

          {/* List of Saved Dynamic JSON Widgets */}
          {dynamicWidgets.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <Code2 size={24} />
              </div>
              <strong>لا توجد ويدجيت JSON ديناميكية منشورة بعد</strong>
              <span style={{ fontSize: '0.82rem' }}>
                اضغط على "قالب جاهز" أعلاه ثم نشر لإرسال أول ويدجيت ديناميكية للتطبيقات بدون تحديث APK.
              </span>
            </div>
          ) : (
            <div className="cards-grid cols-2">
              {dynamicWidgets.map((dw) => {
                const busy = Boolean(busyKeys[dw.id]);
                const aud = dw.target_audience || 'all';
                return (
                  <article key={dw.id} className="glass-panel widget-card">
                    <DynamicWidgetMiniPreview
                      layout={dw.layout_json}
                      aspectRatio={dw.aspect_ratio || '2x2'}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          <strong style={{ fontSize: '0.96rem' }}>{dw.title_ar}</strong>
                          <span className="badge badge-neutral mono">{dw.aspect_ratio}</span>
                          {dw.is_pro && (
                            <span className="badge badge-amber">
                              <Crown size={11} /> Pro
                            </span>
                          )}
                          {dw.is_new && <span className="badge badge-white">جديد</span>}
                        </div>
                        <span className="widget-key-pill">{dw.widget_key}</span>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => startEditDynamic(dw)}
                          title="تعديل JSON"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => setDeleteDynTarget(dw)}
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                      <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '7px 5px' }}>
                        <span className="switch-title" style={{ fontSize: '0.73rem' }}>الظهور</span>
                        <ToggleSwitch
                          checked={dw.is_visible}
                          disabled={busy}
                          tone="emerald"
                          onChange={() => updateDynamicWidget(dw.id, { is_visible: !dw.is_visible })}
                        />
                      </div>
                      <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '7px 5px' }}>
                        <span className="switch-title" style={{ fontSize: '0.73rem' }}>Pro</span>
                        <ToggleSwitch
                          checked={dw.is_pro}
                          disabled={busy}
                          tone="amber"
                          onChange={() => updateDynamicWidget(dw.id, { is_pro: !dw.is_pro })}
                        />
                      </div>
                      <div className="switch-row" style={{ flexDirection: 'column', alignItems: 'center', gap: 6, padding: '7px 5px' }}>
                        <span className="switch-title" style={{ fontSize: '0.73rem' }}>جديد</span>
                        <ToggleSwitch
                          checked={dw.is_new}
                          disabled={busy}
                          tone="white"
                          onChange={() => updateDynamicWidget(dw.id, { is_new: !dw.is_new })}
                        />
                      </div>
                    </div>

                    <div className="audience-mini">
                      {AUDIENCE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={busy}
                          className={`audience-mini-btn${aud === opt.value ? ` active-${opt.value}` : ''}`}
                          onClick={() => updateDynamicWidget(dw.id, { target_audience: opt.value })}
                        >
                          {opt.shortLabel}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <ConfirmDialog
            open={Boolean(deleteDynTarget)}
            title="حذف ويدجيت JSON"
            message={`هل تريد حذف الويدجيت الديناميكي "${deleteDynTarget?.title_ar || ''}" نهائياً؟`}
            busy={deletingDyn}
            onConfirm={confirmDeleteDynamic}
            onCancel={() => setDeleteDynTarget(null)}
          />
        </>
      )}
    </section>
  );
}
