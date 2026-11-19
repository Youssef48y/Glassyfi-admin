import { useMemo, useState } from 'react';
import {
  LayoutGrid,
  Crown,
  Eye,
  Sparkles,
  Plus,
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';

const CATEGORY_LABELS = {
  all: 'الكل',
  clocks: 'الساعات',
  dates: 'التواريخ',
  lifestyle: 'أسلوب الحياة',
  system: 'النظام',
};

const EMPTY_WIDGET = {
  widget_key: '',
  title_ar: '',
  title_en: '',
  category: 'clocks',
  sort_order: 20,
  is_pro: false,
  is_visible: true,
  is_new: true,
};

export function WidgetsTab({ widgets, loading, onRefresh, notify }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [busyKeys, setBusyKeys] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_WIDGET);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const categories = useMemo(() => {
    const set = new Set(['clocks', 'dates', 'lifestyle', 'system']);
    widgets.forEach((w) => {
      if (w.category) set.add(w.category);
    });
    return ['all', ...Array.from(set)];
  }, [widgets]);

  const filteredWidgets = useMemo(() => {
    if (selectedCategory === 'all') return widgets;
    return widgets.filter((w) => w.category === selectedCategory);
  }, [widgets, selectedCategory]);

  async function handleToggle(widget, field) {
    setBusyKeys((prev) => ({ ...prev, [widget.widget_key]: true }));
    try {
      const { error } = await supabase
        .from('widgets_config')
        .update({ [field]: !widget[field] })
        .eq('widget_key', widget.widget_key);
      if (error) throw error;
      await onRefresh();
    } catch (err) {
      notify(`تعذر تحديث الويدجيت: ${err.message}`, 'error');
    } finally {
      setBusyKeys((prev) => ({ ...prev, [widget.widget_key]: false }));
    }
  }

  async function handleCreateWidget(e) {
    e.preventDefault();
    const key = form.widget_key
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!key || !form.title_ar.trim() || !form.title_en.trim()) {
      notify('يرجى إدخال مفتاح الويدجيت والاسم بالعربية والإنجليزية', 'error');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('widgets_config').insert({
        widget_key: key,
        title_ar: form.title_ar.trim(),
        title_en: form.title_en.trim(),
        category: form.category,
        sort_order: Number(form.sort_order) || 0,
        is_pro: form.is_pro,
        is_visible: form.is_visible,
        is_new: form.is_new,
      });
      if (error) throw error;

      notify('تمت إضافة الويدجيت بنجاح', 'success');
      setForm({ ...EMPTY_WIDGET, sort_order: widgets.length + 1 });
      setShowAddModal(false);
      await onRefresh();
    } catch (err) {
      notify(`تعذر إضافة الويدجيت: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteWidget() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('widgets_config')
        .delete()
        .eq('widget_key', deleteTarget.widget_key);
      if (error) throw error;
      notify('تم حذف الويدجيت بنجاح', 'success');
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  }

  const proCount = widgets.filter((w) => w.is_pro).length;
  const visibleCount = widgets.filter((w) => w.is_visible).length;

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الويدجيت</h1>
          <p>تحكم فوري في ظهور الويدجيت وحالة Pro وشارة "جديد" داخل التطبيق</p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setForm({ ...EMPTY_WIDGET, sort_order: widgets.length + 1 });
            setShowAddModal(true);
          }}
        >
          <Plus size={17} />
          إضافة ويدجيت
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">إجمالي الويدجيت</div>
          <div className="stat-value">{widgets.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ظاهرة حالياً</div>
          <div className="stat-value" style={{ color: 'var(--emerald)' }}>
            {visibleCount}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">مدفوعة (Pro)</div>
          <div className="stat-value" style={{ color: 'var(--gold)' }}>
            {proCount}
          </div>
        </div>
      </div>

      <div className="filter-strip">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`chip${selectedCategory === cat ? ' active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {loading && widgets.length === 0 ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" color="var(--accent)" />
          <span>جاري تحميل الويدجيت...</span>
        </div>
      ) : filteredWidgets.length === 0 ? (
        <div className="glass-panel empty-state">
          <div className="empty-icon">
            <LayoutGrid size={24} />
          </div>
          <strong>لا توجد ويدجيت في هذا القسم</strong>
        </div>
      ) : (
        <div className="cards-grid cols-2">
          {filteredWidgets.map((w) => {
            const busy = Boolean(busyKeys[w.widget_key]);
            return (
              <article key={w.widget_key} className="glass-panel widget-card">
                <div className="widget-card-head">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>{w.title_ar}</h3>
                      {w.is_pro ? (
                        <span className="badge badge-gold">
                          <Crown size={11} /> Pro
                        </span>
                      ) : (
                        <span className="badge badge-neutral">مجاني</span>
                      )}
                      {w.is_new && (
                        <span className="badge badge-sky">
                          <Sparkles size={11} /> جديد
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      {w.title_en} • {CATEGORY_LABELS[w.category] || w.category}
                    </div>
                    <span className="widget-key-pill">{w.widget_key}</span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    style={{ width: 34, height: 34, color: 'var(--text-muted)' }}
                    onClick={() => setDeleteTarget(w)}
                    aria-label={`حذف ${w.title_ar}`}
                    title="حذف الويدجيت"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="switch-row">
                    <span className="switch-title">
                      <Crown size={15} color={w.is_pro ? 'var(--gold)' : 'var(--text-muted)'} />
                      {w.is_pro ? 'مدفوع (Pro)' : 'مجاني للجميع'}
                    </span>
                    <ToggleSwitch
                      checked={w.is_pro}
                      disabled={busy}
                      tone="gold"
                      onChange={() => handleToggle(w, 'is_pro')}
                      ariaLabel={`حالة Pro لويدجيت ${w.title_ar}`}
                    />
                  </div>

                  <div className="switch-row">
                    <span className="switch-title">
                      <Eye size={15} color={w.is_visible ? 'var(--emerald)' : 'var(--text-muted)'} />
                      {w.is_visible ? 'ظاهر في التطبيق' : 'مخفي عن المستخدمين'}
                    </span>
                    <ToggleSwitch
                      checked={w.is_visible}
                      disabled={busy}
                      tone="emerald"
                      onChange={() => handleToggle(w, 'is_visible')}
                      ariaLabel={`ظهور ويدجيت ${w.title_ar}`}
                    />
                  </div>

                  <div className="switch-row">
                    <span className="switch-title">
                      <Sparkles size={15} color={w.is_new ? 'var(--accent)' : 'var(--text-muted)'} />
                      شارة "جديد" (New)
                    </span>
                    <ToggleSwitch
                      checked={w.is_new}
                      disabled={busy}
                      tone="sky"
                      onChange={() => handleToggle(w, 'is_new')}
                      ariaLabel={`شارة جديد لويدجيت ${w.title_ar}`}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add Widget Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <h2>إضافة ويدجيت جديد</h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowAddModal(false)}
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateWidget} className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="w-key">
                  مفتاح الويدجيت (widget_key) *
                </label>
                <input
                  id="w-key"
                  className="input mono"
                  placeholder="weather_glass"
                  value={form.widget_key}
                  onChange={(e) => setForm((p) => ({ ...p, widget_key: e.target.value }))}
                  required
                />
              </div>

              <div className="form-grid cols-2">
                <div className="field">
                  <label className="field-label" htmlFor="w-ar">
                    الاسم بالعربية *
                  </label>
                  <input
                    id="w-ar"
                    className="input"
                    placeholder="الطقس الزجاجي"
                    value={form.title_ar}
                    onChange={(e) => setForm((p) => ({ ...p, title_ar: e.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="w-en">
                    الاسم بالإنجليزية *
                  </label>
                  <input
                    id="w-en"
                    className="input ltr"
                    placeholder="Glass Weather"
                    value={form.title_en}
                    onChange={(e) => setForm((p) => ({ ...p, title_en: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-grid cols-2">
                <div className="field">
                  <label className="field-label" htmlFor="w-cat">
                    التصنيف
                  </label>
                  <select
                    id="w-cat"
                    className="select"
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="clocks">الساعات (clocks)</option>
                    <option value="dates">التواريخ (dates)</option>
                    <option value="lifestyle">أسلوب الحياة (lifestyle)</option>
                    <option value="system">النظام (system)</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="w-sort">
                    ترتيب العرض
                  </label>
                  <input
                    id="w-sort"
                    type="number"
                    className="input mono"
                    value={form.sort_order}
                    onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
                  />
                </div>
              </div>

              <div className="switch-row">
                <span className="switch-title">مدفوع (Pro)</span>
                <ToggleSwitch
                  checked={form.is_pro}
                  tone="gold"
                  onChange={(v) => setForm((p) => ({ ...p, is_pro: v }))}
                />
              </div>

              <div className="switch-row">
                <span className="switch-title">ظاهر في التطبيق</span>
                <ToggleSwitch
                  checked={form.is_visible}
                  tone="emerald"
                  onChange={(v) => setForm((p) => ({ ...p, is_visible: v }))}
                />
              </div>

              <div className="switch-row">
                <span className="switch-title">شارة "جديد" (New)</span>
                <ToggleSwitch
                  checked={form.is_new}
                  tone="sky"
                  onChange={(v) => setForm((p) => ({ ...p, is_new: v }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'جاري الحفظ...' : 'إضافة الويدجيت'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="حذف الويدجيت"
        message={`هل تريد حذف إعدادات الويدجيت "${deleteTarget?.title_ar || ''}" (${deleteTarget?.widget_key || ''})؟`}
        busy={deleting}
        onConfirm={confirmDeleteWidget}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
