import { useMemo, useState } from 'react';
import {
  LayoutGrid,
  Layers,
  Crown,
  Eye,
  EyeOff,
  Sparkles,
  Search,
  Loader2,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import {
  AUDIENCE_OPTIONS,
  WIDGET_CATEGORY_META,
  DEPTH_GROUP_META,
  getAudienceBadge,
} from '../lib/constants';
import { ToggleSwitch } from './ToggleSwitch';

export function WidgetsTab({ widgets, depthTools, loading, onRefresh, notify }) {
  const [subTab, setSubTab] = useState('widgets'); // 'widgets' | 'depth'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [audienceFilter, setAudienceFilter] = useState('all_filter');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyKeys, setBusyKeys] = useState({});

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

  // Grouped widgets by category
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
                <span className="badge badge-indigo">
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
              <Sparkles size={13} color={isNew ? 'var(--primary)' : 'var(--text-muted)'} />
              جديد
            </span>
            <ToggleSwitch
              checked={isNew}
              disabled={busy}
              tone="indigo"
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
          <p>تحكم فردي فوري في كل الـ 40 ويدجيت الأصلية و15 ساعة وأداة في استوديو العمق</p>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${subTab === 'widgets' ? ' active' : ''}`}
            onClick={() => setSubTab('widgets')}
          >
            <LayoutGrid size={15} />
            ويدجيت الشاشة الرئيسية ({widgets.length})
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'depth' ? ' active' : ''}`}
            onClick={() => setSubTab('depth')}
          >
            <Layers size={15} />
            أدوات وساعات العمق ({depthTools.length})
          </button>
        </div>
      </div>

      {/* Search & Filter Panel */}
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

      {loading && widgets.length === 0 ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" color="var(--primary)" />
          <span>جاري تحميل الإعدادات...</span>
        </div>
      ) : subTab === 'widgets' ? (
        groupedWidgets.length === 0 ? (
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
        )
      ) : groupedDepth.length === 0 ? (
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
              <span className="badge badge-indigo">{items.length} عنصر</span>
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
      )}
    </section>
  );
}
