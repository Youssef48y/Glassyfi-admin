import { useState } from 'react';
import {
  Bell,
  MessageSquareMore,
  Send,
  History,
  Trash2,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
  Link2,
  Repeat,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import { formatDateAr } from '../lib/formatters';
import {
  PUSH_TOPIC_OPTIONS,
  POPUP_AUDIENCE_OPTIONS,
  MAX_SHOWS_OPTIONS,
  getTopicLabelAr,
  getAudienceBadge,
} from '../lib/constants';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';
import { DeepLinkPicker } from './DeepLinkPicker';

export function NotificationsTab({
  pushHistory,
  popups,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('push'); // 'push' | 'popups'

  // Push FCM Form
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushImageUrl, setPushImageUrl] = useState('');
  const [pushTopic, setPushTopic] = useState('all_users');
  const [pushDeepLink, setPushDeepLink] = useState('');
  const [sendingPush, setSendingPush] = useState(false);

  // Popup Form
  const [popupTitle, setPopupTitle] = useState('');
  const [popupBody, setPopupBody] = useState('');
  const [popupImageUrl, setPopupImageUrl] = useState('');
  const [popupActionText, setPopupActionText] = useState('');
  const [popupDeepLink, setPopupDeepLink] = useState('');
  const [popupActionUrl, setPopupActionUrl] = useState('');
  const [popupAudience, setPopupAudience] = useState('all');
  const [popupMaxShows, setPopupMaxShows] = useState(1);
  const [popupActive, setPopupActive] = useState(true);
  const [savingPopup, setSavingPopup] = useState(false);

  const [deletePopupTarget, setDeletePopupTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSendPush(e) {
    e.preventDefault();
    const title = pushTitle.trim();
    const body = pushBody.trim();
    const image_url = pushImageUrl.trim() || null;
    const deep_link = pushDeepLink.trim() || null;

    if (!title || !body) {
      notify('يرجى إدخال عنوان ونص الإشعار', 'error');
      return;
    }

    setSendingPush(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: { title, body, topic: pushTopic, image_url, deep_link },
      });

      if (error) {
        throw new Error(error.message || 'فشل استدعاء دالة الإشعارات');
      }
      if (!data?.ok) {
        throw new Error(data?.error || data?.details || 'فشل إرسال الإشعار عبر FCM');
      }

      notify('تم إرسال الإشعار الفوري بنجاح!', 'success');
      setPushTitle('');
      setPushBody('');
      setPushImageUrl('');
      setPushDeepLink('');
      await onRefresh();
    } catch (err) {
      notify(`خطأ في الإرسال: ${err.message}`, 'error');
    } finally {
      setSendingPush(false);
    }
  }

  async function handleCreatePopup(e) {
    e.preventDefault();
    if (!popupTitle.trim() || !popupBody.trim()) {
      notify('يرجى إدخال عنوان ومحتوى الرسالة المنبثقة', 'error');
      return;
    }

    setSavingPopup(true);
    try {
      const { error } = await supabase.from('popup_announcements').insert({
        title: popupTitle.trim(),
        body: popupBody.trim(),
        image_url: popupImageUrl.trim() || null,
        action_text: popupActionText.trim() || null,
        deep_link: popupDeepLink.trim() || null,
        action_url: popupActionUrl.trim() || popupDeepLink.trim() || null,
        target_audience: popupAudience,
        max_shows_per_user: Number(popupMaxShows),
        is_active: popupActive,
      });

      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify('تم نشر الرسالة المنبثقة ومزامنة التطبيقات فورياً', 'success');
      setPopupTitle('');
      setPopupBody('');
      setPopupImageUrl('');
      setPopupActionText('');
      setPopupDeepLink('');
      setPopupActionUrl('');
      setPopupAudience('all');
      setPopupMaxShows(1);
      setPopupActive(true);
      await onRefresh();
    } catch (err) {
      notify(`تعذر حفظ الرسالة: ${err.message}`, 'error');
    } finally {
      setSavingPopup(false);
    }
  }

  async function handleTogglePopup(popup) {
    const { error } = await supabase
      .from('popup_announcements')
      .update({ is_active: !popup.is_active })
      .eq('id', popup.id);
    if (error) {
      notify(`تعذر تحديث الحالة: ${error.message}`, 'error');
      return;
    }
    triggerSilentSync({ topic: 'all_users' });
    await onRefresh();
  }

  async function confirmDeletePopup() {
    if (!deletePopupTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('popup_announcements')
        .delete()
        .eq('id', deletePopupTarget.id);
      if (error) throw error;
      triggerSilentSync({ topic: 'all_users' });
      notify('تم حذف الرسالة المنبثقة', 'success');
      setDeletePopupTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  }

  function maxShowsLabel(n) {
    if (n === 0) return 'كل مرة';
    if (n === 1) return 'مرة واحدة';
    if (n === 2) return 'مرتان';
    return `${n} مرات`;
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الإشعارات والرسائل المنبثقة</h1>
          <p>إشعارات FCM فورية مع التوجيه العميق (Deep Links) ورسائل منبثقة محددة التكرار</p>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${subTab === 'push' ? ' active' : ''}`}
            onClick={() => setSubTab('push')}
          >
            <Bell size={15} />
            إشعار فوري (FCM)
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'popups' ? ' active' : ''}`}
            onClick={() => setSubTab('popups')}
          >
            <MessageSquareMore size={15} />
            المنبثقة ({popups.length})
          </button>
        </div>
      </div>

      {subTab === 'push' ? (
        <>
          <div className="form-grid cols-2" style={{ marginBottom: 20 }}>
            {/* Push Form */}
            <form onSubmit={handleSendPush} className="glass-panel section-card" style={{ marginBottom: 0 }}>
              <h2 className="section-heading">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Send size={18} color="var(--primary)" />
                  إرسال إشعار فوري جديد
                </span>
              </h2>

              <div className="form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="push-topic">
                    الجمهور المستهدف
                  </label>
                  <select
                    id="push-topic"
                    className="select"
                    value={pushTopic}
                    onChange={(e) => setPushTopic(e.target.value)}
                  >
                    {PUSH_TOPIC_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="push-title">
                    عنوان الإشعار *
                  </label>
                  <input
                    id="push-title"
                    className="input"
                    placeholder="مثال: خلفيات عمق جديدة متاحة الآن!"
                    value={pushTitle}
                    onChange={(e) => setPushTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="push-body">
                    نص الإشعار *
                  </label>
                  <textarea
                    id="push-body"
                    className="textarea"
                    placeholder="اكتشف أحدث مجموعة خلفيات 4K زجاجية..."
                    value={pushBody}
                    onChange={(e) => setPushBody(e.target.value)}
                    required
                  />
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="push-img">
                    رابط صورة مرفقة <span className="field-hint">(اختياري)</span>
                  </label>
                  <input
                    id="push-img"
                    type="url"
                    className="input ltr"
                    placeholder="https://..."
                    value={pushImageUrl}
                    onChange={(e) => setPushImageUrl(e.target.value)}
                  />
                </div>

                <DeepLinkPicker
                  id="push-deeplink"
                  label="قسم التوجيه عند الضغط على الإشعار (Deep Link)"
                  value={pushDeepLink}
                  onChange={setPushDeepLink}
                />

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 4 }}
                  disabled={sendingPush}
                >
                  {sendingPush ? (
                    <>
                      <Loader2 size={17} className="spinner" />
                      جاري الإرسال عبر FCM...
                    </>
                  ) : (
                    <>
                      <Send size={17} />
                      إرسال الإشعار الآن
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Live Notification Preview */}
            <div className="glass-panel section-card" style={{ marginBottom: 0 }}>
              <h2 className="section-heading">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color="var(--amber)" />
                  معاينة الإشعار على أندرويد
                </span>
                <span className="badge badge-indigo">{getTopicLabelAr(pushTopic)}</span>
              </h2>

              <div className="push-preview">
                <div className="push-preview-head">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <Bell size={13} color="var(--primary)" />
                    Glassyfi
                  </span>
                  <span>الآن</span>
                </div>
                <strong style={{ fontSize: '0.96rem' }}>
                  {pushTitle.trim() || 'عنوان الإشعار سيظهر هنا'}
                </strong>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  {pushBody.trim() || 'محتوى الرسالة التي ستصل للمستخدمين على شاشة القفل.'}
                </p>
                {pushImageUrl.trim() && (
                  <img
                    src={pushImageUrl.trim()}
                    alt="معاينة الصورة"
                    className="push-preview-img"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                {pushDeepLink.trim() && (
                  <div style={{ marginTop: 4 }}>
                    <span className="badge badge-indigo mono">
                      <Link2 size={11} /> {pushDeepLink.trim()}
                    </span>
                  </div>
                )}
              </div>

              <p style={{ margin: '14px 0 0', fontSize: '0.77rem', color: 'var(--text-muted)' }}>
                يتم إرسال بيانات التوجيه العميق (`deep_link`) داخل حزمة FCM Data ليفتح التطبيق
                مباشرة على القسم أو الخلفية المحددة.
              </p>
            </div>
          </div>

          {/* Push History */}
          <div className="glass-panel section-card" style={{ marginBottom: 0 }}>
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <History size={18} color="var(--primary)" />
                سجل الإشعارات المرسلة ({pushHistory.length})
              </span>
            </h2>

            {pushHistory.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 12px' }}>
                <span>لم يتم إرسال أي إشعارات بعد.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pushHistory.map((item) => (
                  <div
                    key={item.id}
                    className="glass-subcard"
                    style={{ padding: 13, display: 'flex', gap: 12, alignItems: 'flex-start' }}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        style={{
                          width: 54,
                          height: 54,
                          borderRadius: 10,
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 11,
                          background: 'var(--primary-soft)',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--primary)',
                          flexShrink: 0,
                        }}
                      >
                        <Bell size={17} />
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <strong>{item.title}</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          <span className="badge badge-neutral">
                            {item.target_label
                              ? `${getTopicLabelAr(item.topic)}: ${item.target_label}`
                              : getTopicLabelAr(item.topic)}
                          </span>
                          {item.deep_link && (
                            <span className="badge badge-indigo mono">{item.deep_link}</span>
                          )}
                        </div>
                      </div>
                      <p
                        style={{
                          margin: '4px 0 6px',
                          fontSize: '0.84rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {item.body}
                      </p>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {formatDateAr(item.sent_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* In-App Pop-up Announcements */
        <>
          <form onSubmit={handleCreatePopup} className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <MessageSquareMore size={18} color="var(--primary)" />
                إنشاء رسالة منبثقة داخل التطبيق
              </span>
            </h2>

            <div className="form-grid cols-3" style={{ marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="pop-title">
                  العنوان *
                </label>
                <input
                  id="pop-title"
                  className="input"
                  placeholder="عرض خاص لمستخدمي Glassyfi"
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="pop-aud">
                  الجمهور المستهدف
                </label>
                <select
                  id="pop-aud"
                  className="select"
                  value={popupAudience}
                  onChange={(e) => setPopupAudience(e.target.value)}
                >
                  {POPUP_AUDIENCE_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="pop-shows">
                  عدد مرات الظهور لكل مستخدم
                </label>
                <select
                  id="pop-shows"
                  className="select"
                  value={popupMaxShows}
                  onChange={(e) => setPopupMaxShows(Number(e.target.value))}
                >
                  {MAX_SHOWS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="pop-body">
                نص الرسالة *
              </label>
              <textarea
                id="pop-body"
                className="textarea"
                placeholder="اكتب التفاصيل التي ستظهر في النافذة المنبثقة عند فتح التطبيق..."
                value={popupBody}
                onChange={(e) => setPopupBody(e.target.value)}
                required
              />
            </div>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="pop-btn">
                  نص زر الإجراء (CTA) <span className="field-hint">(اختياري)</span>
                </label>
                <input
                  id="pop-btn"
                  className="input"
                  placeholder="مثال: افتح استوديو العمق"
                  value={popupActionText}
                  onChange={(e) => setPopupActionText(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="pop-img">
                  رابط الصورة <span className="field-hint">(اختياري)</span>
                </label>
                <input
                  id="pop-img"
                  type="url"
                  className="input ltr"
                  placeholder="https://..."
                  value={popupImageUrl}
                  onChange={(e) => setPopupImageUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
              <DeepLinkPicker
                id="pop-deeplink"
                label="توجيه زر الرسالة (Deep Link)"
                value={popupDeepLink}
                onChange={setPopupDeepLink}
              />

              <div className="field">
                <label className="field-label" htmlFor="pop-url">
                  رابط خارجي بديل <span className="field-hint">(اختياري)</span>
                </label>
                <input
                  id="pop-url"
                  type="url"
                  className="input ltr"
                  placeholder="https://..."
                  value={popupActionUrl}
                  onChange={(e) => setPopupActionUrl(e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div className="switch-row" style={{ minWidth: 220 }}>
                <span className="switch-title">مفعّلة فور النشر</span>
                <ToggleSwitch
                  checked={popupActive}
                  tone="emerald"
                  onChange={setPopupActive}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={savingPopup}>
                <Plus size={16} />
                {savingPopup ? 'جاري النشر...' : 'نشر الرسالة المنبثقة'}
              </button>
            </div>
          </form>

          {popups.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <MessageSquareMore size={24} />
              </div>
              <strong>لا توجد رسائل منبثقة حالياً</strong>
            </div>
          ) : (
            <div className="cards-grid cols-2">
              {popups.map((popup) => {
                const aud = getAudienceBadge(popup.target_audience);
                return (
                  <article key={popup.id} className="glass-panel user-card">
                    {popup.image_url && (
                      <img
                        src={popup.image_url}
                        alt={popup.title}
                        style={{
                          width: '100%',
                          maxHeight: 160,
                          objectFit: 'cover',
                          borderRadius: 11,
                        }}
                      />
                    )}

                    <div className="user-card-top">
                      <strong style={{ fontSize: '0.98rem' }}>{popup.title}</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        <span className={`badge ${aud.className}`}>{aud.label}</span>
                        <span className="badge badge-sky">
                          <Repeat size={11} /> {maxShowsLabel(popup.max_shows_per_user ?? 1)}
                        </span>
                        <span
                          className={`badge ${popup.is_active ? 'badge-emerald' : 'badge-neutral'}`}
                        >
                          {popup.is_active ? 'نشطة' : 'متوقفة'}
                        </span>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {popup.body}
                    </p>

                    {(popup.action_text || popup.deep_link || popup.action_url) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, fontSize: '0.78rem' }}>
                        {popup.action_text && (
                          <span className="badge badge-neutral">
                            <ExternalLink size={11} /> {popup.action_text}
                          </span>
                        )}
                        {popup.deep_link && (
                          <span className="badge badge-indigo mono">
                            <Link2 size={11} /> {popup.deep_link}
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 'auto',
                        paddingTop: 10,
                        borderTop: '1px solid var(--glass-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {formatDateAr(popup.created_at)}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ToggleSwitch
                          checked={popup.is_active}
                          tone="emerald"
                          onChange={() => handleTogglePopup(popup)}
                          ariaLabel={`تفعيل الرسالة ${popup.title}`}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => setDeletePopupTarget(popup)}
                          aria-label={`حذف ${popup.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deletePopupTarget)}
        title="حذف الرسالة المنبثقة"
        message={`هل تريد حذف الرسالة المنبثقة "${deletePopupTarget?.title || ''}"؟`}
        busy={deleting}
        onConfirm={confirmDeletePopup}
        onCancel={() => setDeletePopupTarget(null)}
      />
    </section>
  );
}
