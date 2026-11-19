import { useEffect, useState } from 'react';
import {
  Rocket,
  Wrench,
  Save,
  ExternalLink,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import { formatDateAr } from '../lib/formatters';
import { ToggleSwitch } from './ToggleSwitch';

const DEFAULT_CONFIG = {
  latest_version_code: 1,
  latest_version_name: '1.0.0',
  min_supported_version_code: 1,
  is_force_update: false,
  update_url: '',
  update_changelog_ar: '',
  maintenance_mode: false,
  maintenance_message_ar: '',
  config_revision: 1,
  updated_at: null,
};

export function ConfigTab({ config, loading, onRefresh, notify }) {
  const [form, setForm] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        latest_version_code: config.latest_version_code ?? 1,
        latest_version_name: config.latest_version_name ?? '1.0.0',
        min_supported_version_code: config.min_supported_version_code ?? 1,
        is_force_update: Boolean(config.is_force_update),
        update_url: config.update_url ?? '',
        update_changelog_ar: config.update_changelog_ar ?? '',
        maintenance_mode: Boolean(config.maintenance_mode),
        maintenance_message_ar: config.maintenance_message_ar ?? '',
        config_revision: config.config_revision ?? 1,
        updated_at: config.updated_at ?? null,
      });
    }
  }, [config]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        id: 1,
        latest_version_code: Math.max(1, Number(form.latest_version_code) || 1),
        latest_version_name: form.latest_version_name.trim() || '1.0.0',
        min_supported_version_code: Math.max(
          1,
          Number(form.min_supported_version_code) || 1,
        ),
        is_force_update: Boolean(form.is_force_update),
        update_url: form.update_url.trim(),
        update_changelog_ar: form.update_changelog_ar.trim(),
        maintenance_mode: Boolean(form.maintenance_mode),
        maintenance_message_ar: form.maintenance_message_ar.trim(),
      };

      const { error } = await supabase
        .from('app_config')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      // Immediately broadcast silent_sync so live apps fetch the updated revision within ~1s
      triggerSilentSync({ topic: 'all_users' });
      notify('تم حفظ الإعدادات وإرسال نبضة التحديث الفوري لجميع التطبيقات', 'success');
      await onRefresh();
    } catch (err) {
      notify(`تعذر حفظ الإعدادات: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>التحديث التلقائي والصيانة</h1>
          <p>تحكم في إصدارات التطبيق، رابط التحميل المباشر APK، ووضع الصيانة مع مزامنة فورية</p>
        </div>

        <div className="header-actions">
          <span className="badge badge-indigo" style={{ padding: '6px 12px' }}>
            <Sparkles size={13} />
            Revision <span className="mono">#{form.config_revision}</span>
          </span>
          {form.updated_at && (
            <span className="badge badge-neutral" style={{ padding: '6px 12px' }}>
              <Clock size={13} />
              آخر تحديث: {formatDateAr(form.updated_at)}
            </span>
          )}
        </div>
      </div>

      {loading && !config ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" color="var(--primary)" />
          <span>جاري تحميل إعدادات التطبيق...</span>
        </div>
      ) : (
        <form onSubmit={handleSave}>
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Rocket size={18} color="var(--primary)" />
                إعدادات التحديث التلقائي
              </span>
              {form.is_force_update && (
                <span className="badge badge-rose">تحديث إجباري مفعّل</span>
              )}
            </h2>

            <div className="form-grid cols-3" style={{ marginBottom: 15 }}>
              <div className="field">
                <label className="field-label" htmlFor="cfg-vcode">
                  أحدث رقم إصدار (Version Code)
                </label>
                <input
                  id="cfg-vcode"
                  type="number"
                  min={1}
                  className="input mono"
                  value={form.latest_version_code}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, latest_version_code: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="cfg-vname">
                  اسم الإصدار (Version Name)
                </label>
                <input
                  id="cfg-vname"
                  className="input mono"
                  placeholder="2.0.0"
                  value={form.latest_version_name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, latest_version_name: e.target.value }))
                  }
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="cfg-min-vcode">
                  أقل إصدار مدعوم (Min Code)
                </label>
                <input
                  id="cfg-min-vcode"
                  type="number"
                  min={1}
                  className="input mono"
                  value={form.min_supported_version_code}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      min_supported_version_code: e.target.value,
                    }))
                  }
                  required
                />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 15 }}>
              <label className="field-label" htmlFor="cfg-url">
                رابط تحميل التحديث المباشر (Direct APK / Store Link)
                {form.update_url.trim() && (
                  <a
                    href={form.update_url.trim()}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: 'var(--primary)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.75rem',
                    }}
                  >
                    تجربة الرابط <ExternalLink size={12} />
                  </a>
                )}
              </label>
              <input
                id="cfg-url"
                type="url"
                className="input ltr"
                placeholder="https://github.com/.../releases/download/v2.0.0/Glassyfi.apk"
                value={form.update_url}
                onChange={(e) => setForm((p) => ({ ...p, update_url: e.target.value }))}
              />
            </div>

            <div className="field" style={{ marginBottom: 15 }}>
              <label className="field-label" htmlFor="cfg-changelog">
                ما الجديد في التحديث (بالعربية)
              </label>
              <textarea
                id="cfg-changelog"
                className="textarea"
                placeholder="• تحسين سلاسة خلفيات العمق&#10;• إضافة 40 ويدجيت وأدوات استوديو العمق&#10;• تحسينات عامة للأداء"
                value={form.update_changelog_ar}
                onChange={(e) =>
                  setForm((p) => ({ ...p, update_changelog_ar: e.target.value }))
                }
              />
            </div>

            <div className="switch-row">
              <div className="switch-meta">
                <span className="switch-title">
                  <ShieldAlert size={16} color="var(--rose)" />
                  تحديث إجباري (Force Update)
                </span>
                <span className="switch-desc">
                  يمنع المستخدم من تجاوز نافذة التحديث قبل تنزيل الإصدار الجديد
                </span>
              </div>
              <ToggleSwitch
                checked={form.is_force_update}
                tone="rose"
                onChange={(v) => setForm((p) => ({ ...p, is_force_update: v }))}
                ariaLabel="تفعيل التحديث الإجباري"
              />
            </div>
          </div>

          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Wrench size={18} color="var(--amber)" />
                وضع الصيانة (Maintenance Mode)
              </span>
              {form.maintenance_mode && (
                <span className="badge badge-rose">التطبيق في وضع الصيانة</span>
              )}
            </h2>

            {form.maintenance_mode && (
              <div className="alert-banner alert-amber" style={{ marginBottom: 14 }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  تنبيه: عند الحفظ مع تفعيل وضع الصيانة، سيتوقف التطبيق فوراً لدى جميع المستخدمين
                  وتظهر لهم رسالة الصيانة أدناه.
                </span>
              </div>
            )}

            <div className="switch-row" style={{ marginBottom: 14 }}>
              <div className="switch-meta">
                <span className="switch-title">تفعيل وضع الصيانة</span>
                <span className="switch-desc">
                  إيقاف مؤقت للتطبيق أثناء الصيانة أو التحديثات الكبرى
                </span>
              </div>
              <ToggleSwitch
                checked={form.maintenance_mode}
                tone="rose"
                onChange={(v) => setForm((p) => ({ ...p, maintenance_mode: v }))}
                ariaLabel="تفعيل وضع الصيانة"
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="cfg-maint-msg">
                رسالة الصيانة للمستخدمين (بالعربية)
              </label>
              <textarea
                id="cfg-maint-msg"
                className="textarea"
                placeholder="التطبيق قيد التطوير والصيانة حالياً، سنعود خلال دقائق..."
                value={form.maintenance_message_ar}
                onChange={(e) =>
                  setForm((p) => ({ ...p, maintenance_message_ar: e.target.value }))
                }
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minWidth: 215, padding: '12px 22px' }}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 size={17} className="spinner" />
                  جاري الحفظ والمزامنة...
                </>
              ) : (
                <>
                  <Save size={17} />
                  حفظ الإعدادات ومزامنة التطبيق
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
