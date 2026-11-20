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
  LifeBuoy,
  FileText,
  HelpCircle,
  MessageCircle,
  Send,
  Instagram,
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import { formatDateAr } from '../lib/formatters';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';

const DEFAULT_CONFIG = {
  latest_version_code: 1,
  latest_version_name: '1.0.0',
  min_supported_version_code: 1,
  is_force_update: false,
  update_url: '',
  update_changelog_ar: '',
  maintenance_mode: false,
  maintenance_message_ar: '',
  instagram_url: '',
  instagram_visible: true,
  whatsapp_url: '',
  whatsapp_visible: true,
  telegram_url: '',
  telegram_visible: true,
  terms_ar: 'مرحباً بك في Glassyfi...',
  terms_updated_at: null,
  welcome_enabled: true,
  welcome_title_ar: 'مرحباً بك في Glassyfi ✨',
  welcome_body_ar: 'استمتع بأجمل خلفيات العمق الحية والويدجيت الزجاجية المصممة خصيصاً لهاتفك.',
  welcome_image_url: '',
  welcome_cta_text: 'ابدأ الاستكشاف',
  config_revision: 1,
  updated_at: null,
};

const EMPTY_FAQ = {
  id: null,
  question_ar: '',
  answer_ar: '',
  sort_order: 10,
  is_visible: true,
};

export function ConfigTab({ config, faqItems = [], loading, onRefresh, notify }) {
  const [subTab, setSubTab] = useState('update'); // 'update' | 'content' | 'faq'
  const [form, setForm] = useState(DEFAULT_CONFIG);
  const [initialTerms, setInitialTerms] = useState('');
  const [saving, setSaving] = useState(false);

  // FAQ state
  const [faqForm, setFaqForm] = useState(EMPTY_FAQ);
  const [faqSaving, setFaqSaving] = useState(false);
  const [faqBusyId, setFaqBusyId] = useState('');
  const [deleteFaqTarget, setDeleteFaqTarget] = useState(null);
  const [deletingFaq, setDeletingFaq] = useState(false);

  useEffect(() => {
    if (config) {
      const termsVal = config.terms_ar ?? 'مرحباً بك في Glassyfi...';
      setInitialTerms(termsVal);
      setForm({
        latest_version_code: config.latest_version_code ?? 1,
        latest_version_name: config.latest_version_name ?? '1.0.0',
        min_supported_version_code: config.min_supported_version_code ?? 1,
        is_force_update: Boolean(config.is_force_update),
        update_url: config.update_url ?? '',
        update_changelog_ar: config.update_changelog_ar ?? '',
        maintenance_mode: Boolean(config.maintenance_mode),
        maintenance_message_ar: config.maintenance_message_ar ?? '',
        instagram_url: config.instagram_url ?? '',
        instagram_visible: config.instagram_visible ?? true,
        whatsapp_url: config.whatsapp_url ?? '',
        whatsapp_visible: config.whatsapp_visible ?? true,
        telegram_url: config.telegram_url ?? '',
        telegram_visible: config.telegram_visible ?? true,
        terms_ar: termsVal,
        terms_updated_at: config.terms_updated_at ?? null,
        welcome_enabled: config.welcome_enabled ?? true,
        welcome_title_ar: config.welcome_title_ar ?? 'مرحباً بك في Glassyfi ✨',
        welcome_body_ar:
          config.welcome_body_ar ??
          'استمتع بأجمل خلفيات العمق الحية والويدجيت الزجاجية المصممة خصيصاً لهاتفك.',
        welcome_image_url: config.welcome_image_url ?? '',
        welcome_cta_text: config.welcome_cta_text ?? 'ابدأ الاستكشاف',
        config_revision: config.config_revision ?? 1,
        updated_at: config.updated_at ?? null,
      });
    }
  }, [config]);

  async function handleSaveConfig(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const cleanTerms = form.terms_ar.trim();
      const termsChanged = cleanTerms !== (initialTerms || '').trim();

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
        instagram_url: form.instagram_url.trim(),
        instagram_visible: Boolean(form.instagram_visible),
        whatsapp_url: form.whatsapp_url.trim(),
        whatsapp_visible: Boolean(form.whatsapp_visible),
        telegram_url: form.telegram_url.trim(),
        telegram_visible: Boolean(form.telegram_visible),
        terms_ar: cleanTerms,
        ...(termsChanged ? { terms_updated_at: new Date().toISOString() } : {}),
        welcome_enabled: Boolean(form.welcome_enabled),
        welcome_title_ar: form.welcome_title_ar.trim(),
        welcome_body_ar: form.welcome_body_ar.trim(),
        welcome_image_url: form.welcome_image_url.trim(),
        welcome_cta_text: form.welcome_cta_text.trim() || 'ابدأ الاستكشاف',
      };

      const { error } = await supabase
        .from('app_config')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;

      triggerSilentSync({ topic: 'all_users' });
      notify('تم حفظ الإعدادات وإرسال نبضة التحديث الفوري لجميع التطبيقات', 'success');
      await onRefresh();
    } catch (err) {
      notify(`تعذر حفظ الإعدادات: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFaq(e) {
    e.preventDefault();
    const q = faqForm.question_ar.trim();
    const a = faqForm.answer_ar.trim();
    if (!q || !a) {
      notify('يرجى إدخال السؤال والإجابة بالعربية', 'error');
      return;
    }

    setFaqSaving(true);
    try {
      const payload = {
        question_ar: q,
        answer_ar: a,
        sort_order: Number(faqForm.sort_order) || 0,
        is_visible: Boolean(faqForm.is_visible),
      };

      const { error } = faqForm.id
        ? await supabase.from('faq_items').update(payload).eq('id', faqForm.id)
        : await supabase.from('faq_items').insert(payload);

      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify(faqForm.id ? 'تم تحديث السؤال بنجاح' : 'تمت إضافة السؤال بنجاح', 'success');
      setFaqForm({ ...EMPTY_FAQ, sort_order: faqItems.length + 1 });
      await onRefresh();
    } catch (err) {
      notify(`تعذر حفظ السؤال: ${err.message}`, 'error');
    } finally {
      setFaqSaving(false);
    }
  }

  async function handleToggleFaqVisible(item) {
    setFaqBusyId(item.id);
    try {
      const { error } = await supabase
        .from('faq_items')
        .update({ is_visible: !item.is_visible })
        .eq('id', item.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`فشل التحديث: ${err.message}`, 'error');
    } finally {
      setFaqBusyId('');
    }
  }

  async function handleReorderFaq(index, direction) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= faqItems.length) return;
    const current = faqItems[index];
    const target = faqItems[swapIndex];

    setFaqBusyId(current.id);
    try {
      const currentOrder = current.sort_order === target.sort_order ? index : current.sort_order;
      const targetOrder = current.sort_order === target.sort_order ? swapIndex : target.sort_order;

      await Promise.all([
        supabase.from('faq_items').update({ sort_order: targetOrder }).eq('id', current.id),
        supabase.from('faq_items').update({ sort_order: currentOrder }).eq('id', target.id),
      ]);
      triggerSilentSync({ topic: 'all_users' });
      await onRefresh();
    } catch (err) {
      notify(`تعذر إعادة الترتيب: ${err.message}`, 'error');
    } finally {
      setFaqBusyId('');
    }
  }

  async function confirmDeleteFaq() {
    if (!deleteFaqTarget) return;
    setDeletingFaq(true);
    try {
      const { error } = await supabase
        .from('faq_items')
        .delete()
        .eq('id', deleteFaqTarget.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify('تم حذف السؤال بنجاح', 'success');
      if (faqForm.id === deleteFaqTarget.id) setFaqForm(EMPTY_FAQ);
      setDeleteFaqTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setDeletingFaq(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الإعدادات، التحديث والدعم</h1>
          <p>التحديث التلقائي، الصيانة، روابط الدعم، الرسالة الترحيبية، الشروط والأحكام، والأسئلة الشائعة</p>
        </div>

        <div className="header-actions">
          <span className="badge badge-white" style={{ padding: '6px 12px' }}>
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

      {/* Sub-navigation */}
      <div style={{ marginBottom: 18 }}>
        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${subTab === 'update' ? ' active' : ''}`}
            onClick={() => setSubTab('update')}
          >
            <Rocket size={15} />
            التحديث والصيانة
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'content' ? ' active' : ''}`}
            onClick={() => setSubTab('content')}
          >
            <LifeBuoy size={15} />
            الدعم والترحيب والشروط
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'faq' ? ' active' : ''}`}
            onClick={() => setSubTab('faq')}
          >
            <HelpCircle size={15} />
            الأسئلة الشائعة ({faqItems.length})
          </button>
        </div>
      </div>

      {loading && !config ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" />
          <span>جاري تحميل إعدادات التطبيق...</span>
        </div>
      ) : subTab === 'update' ? (
        <form onSubmit={handleSaveConfig}>
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Rocket size={18} />
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
                  placeholder="1.0.0"
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
                      color: 'var(--text-primary)',
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
                placeholder="https://github.com/.../releases/download/v1.0.0/Glassyfi.apk"
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
                placeholder="• تحسين سلاسة خلفيات العمق&#10;• إضافة 40 ويدجيت وأدوات استوديو العمق"
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
      ) : subTab === 'content' ? (
        <form onSubmit={handleSaveConfig}>
          {/* 1. Support Links */}
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <LifeBuoy size={18} />
                روابط الدعم والتواصل الاجتماعي
              </span>
            </h2>

            <div className="form-grid" style={{ gap: 12 }}>
              {/* Instagram */}
              <div className="glass-subcard" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="switch-title">
                    <Instagram size={16} /> إنستغرام (Instagram)
                  </span>
                  <ToggleSwitch
                    checked={form.instagram_visible}
                    tone="emerald"
                    onChange={(v) => setForm((p) => ({ ...p, instagram_visible: v }))}
                    ariaLabel="إظهار رابط إنستغرام"
                  />
                </div>
                <input
                  type="url"
                  className="input ltr"
                  placeholder="https://instagram.com/glassyfi"
                  value={form.instagram_url}
                  onChange={(e) => setForm((p) => ({ ...p, instagram_url: e.target.value }))}
                />
              </div>

              {/* WhatsApp */}
              <div className="glass-subcard" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="switch-title">
                    <MessageCircle size={16} color="var(--emerald)" /> واتساب (WhatsApp)
                  </span>
                  <ToggleSwitch
                    checked={form.whatsapp_visible}
                    tone="emerald"
                    onChange={(v) => setForm((p) => ({ ...p, whatsapp_visible: v }))}
                    ariaLabel="إظهار رابط واتساب"
                  />
                </div>
                <input
                  type="url"
                  className="input ltr"
                  placeholder="https://wa.me/201000000000"
                  value={form.whatsapp_url}
                  onChange={(e) => setForm((p) => ({ ...p, whatsapp_url: e.target.value }))}
                />
              </div>

              {/* Telegram */}
              <div className="glass-subcard" style={{ padding: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="switch-title">
                    <Send size={16} color="var(--sky)" /> تيليجرام (Telegram)
                  </span>
                  <ToggleSwitch
                    checked={form.telegram_visible}
                    tone="emerald"
                    onChange={(v) => setForm((p) => ({ ...p, telegram_visible: v }))}
                    ariaLabel="إظهار رابط تيليجرام"
                  />
                </div>
                <input
                  type="url"
                  className="input ltr"
                  placeholder="https://t.me/glassyfi"
                  value={form.telegram_url}
                  onChange={(e) => setForm((p) => ({ ...p, telegram_url: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* 2. First-Launch Welcome Message */}
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="var(--amber)" />
                الرسالة الترحيبية عند أول تشغيل
              </span>
              <ToggleSwitch
                checked={form.welcome_enabled}
                tone="emerald"
                onChange={(v) => setForm((p) => ({ ...p, welcome_enabled: v }))}
                ariaLabel="تفعيل الرسالة الترحيبية"
              />
            </h2>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="wel-title">
                  عنوان الترحيب
                </label>
                <input
                  id="wel-title"
                  className="input"
                  value={form.welcome_title_ar}
                  onChange={(e) => setForm((p) => ({ ...p, welcome_title_ar: e.target.value }))}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="wel-cta">
                  نص زر البدء (CTA)
                </label>
                <input
                  id="wel-cta"
                  className="input"
                  value={form.welcome_cta_text}
                  onChange={(e) => setForm((p) => ({ ...p, welcome_cta_text: e.target.value }))}
                />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="wel-body">
                نص الرسالة الترحيبية
              </label>
              <textarea
                id="wel-body"
                className="textarea"
                value={form.welcome_body_ar}
                onChange={(e) => setForm((p) => ({ ...p, welcome_body_ar: e.target.value }))}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="wel-img">
                رابط صورة الترحيب <span className="field-hint">(اختياري)</span>
              </label>
              <input
                id="wel-img"
                type="url"
                className="input ltr"
                placeholder="https://..."
                value={form.welcome_image_url}
                onChange={(e) => setForm((p) => ({ ...p, welcome_image_url: e.target.value }))}
              />
            </div>
          </div>

          {/* 3. Terms & Conditions */}
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} />
                الشروط والأحكام (Terms & Conditions)
              </span>
              {form.terms_updated_at && (
                <span className="badge badge-neutral">
                  آخر تحديث للشروط: {formatDateAr(form.terms_updated_at)}
                </span>
              )}
            </h2>

            <div className="field">
              <label className="field-label" htmlFor="terms-ar">
                نص الشروط والأحكام بالعربية (يتم تحديث تاريخ المراجعة تلقائياً عند التعديل)
              </label>
              <textarea
                id="terms-ar"
                className="textarea"
                style={{ minHeight: 180 }}
                value={form.terms_ar}
                onChange={(e) => setForm((p) => ({ ...p, terms_ar: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ minWidth: 220, padding: '12px 22px' }}
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
                  حفظ الدعم والترحيب والشروط
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        /* Sub-tab 3: FAQ Manager */
        <>
          <form onSubmit={handleSaveFaq} className="glass-panel section-card">
            <div className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={18} />
                {faqForm.id ? 'تعديل سؤال شائع' : 'إضافة سؤال شائع جديد'}
              </span>
              {faqForm.id && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFaqForm({ ...EMPTY_FAQ, sort_order: faqItems.length + 1 })}
                >
                  <X size={14} /> إلغاء التعديل
                </button>
              )}
            </div>

            <div className="form-grid" style={{ gap: 12, marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="faq-q">
                  السؤال بالعربية *
                </label>
                <input
                  id="faq-q"
                  className="input"
                  placeholder="مثال: كيف أضيف الويدجيت على الشاشة الرئيسية؟"
                  value={faqForm.question_ar}
                  onChange={(e) => setFaqForm((p) => ({ ...p, question_ar: e.target.value }))}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="faq-a">
                  الإجابة بالعربية *
                </label>
                <textarea
                  id="faq-a"
                  className="textarea"
                  placeholder="اكتب إجابة واضحة ومختصرة للمستخدم..."
                  value={faqForm.answer_ar}
                  onChange={(e) => setFaqForm((p) => ({ ...p, answer_ar: e.target.value }))}
                  required
                />
              </div>

              <div className="form-grid cols-2" style={{ alignItems: 'center' }}>
                <div className="field">
                  <label className="field-label" htmlFor="faq-order">
                    الترتيب
                  </label>
                  <input
                    id="faq-order"
                    type="number"
                    className="input mono"
                    value={faqForm.sort_order}
                    onChange={(e) => setFaqForm((p) => ({ ...p, sort_order: e.target.value }))}
                  />
                </div>

                <div className="switch-row" style={{ marginTop: 20 }}>
                  <span className="switch-title">ظاهر في التطبيق</span>
                  <ToggleSwitch
                    checked={faqForm.is_visible}
                    tone="emerald"
                    onChange={(v) => setFaqForm((p) => ({ ...p, is_visible: v }))}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={faqSaving}>
                {faqForm.id ? <Save size={16} /> : <Plus size={16} />}
                {faqSaving ? 'جاري الحفظ...' : faqForm.id ? 'حفظ التعديل' : 'إضافة السؤال'}
              </button>
            </div>
          </form>

          {faqItems.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <HelpCircle size={24} />
              </div>
              <strong>لا توجد أسئلة شائعة بعد</strong>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {faqItems.map((item, idx) => {
                const busy = faqBusyId === item.id;
                return (
                  <article key={item.id} className="glass-panel faq-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                          <span className="badge badge-neutral mono">#{idx + 1}</span>
                          <strong style={{ fontSize: '0.96rem' }}>{item.question_ar}</strong>
                          {!item.is_visible && <span className="badge badge-rose">مخفي</span>}
                        </div>
                        <p style={{ margin: '7px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                          {item.answer_ar}
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: 30, height: 30 }}
                          disabled={busy || idx === 0}
                          onClick={() => handleReorderFaq(idx, -1)}
                          title="تحريك لأعلى"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: 30, height: 30 }}
                          disabled={busy || idx === faqItems.length - 1}
                          onClick={() => handleReorderFaq(idx, 1)}
                          title="تحريك لأسفل"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <ToggleSwitch
                          checked={item.is_visible}
                          disabled={busy}
                          tone="emerald"
                          onChange={() => handleToggleFaqVisible(item)}
                          ariaLabel={`إظهار سؤال ${item.question_ar}`}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => {
                            setFaqForm({
                              id: item.id,
                              question_ar: item.question_ar,
                              answer_ar: item.answer_ar,
                              sort_order: item.sort_order ?? idx + 1,
                              is_visible: Boolean(item.is_visible),
                            });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          title="تعديل"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => setDeleteFaqTarget(item)}
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <ConfirmDialog
            open={Boolean(deleteFaqTarget)}
            title="حذف السؤال الشائع"
            message={`هل تريد حذف السؤال "${deleteFaqTarget?.question_ar || ''}" نهائياً؟`}
            busy={deletingFaq}
            onConfirm={confirmDeleteFaq}
            onCancel={() => setDeleteFaqTarget(null)}
          />
        </>
      )}
    </section>
  );
}
