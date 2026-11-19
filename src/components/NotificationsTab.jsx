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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateAr } from '../lib/formatters';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';

const PUSH_TOPICS = [
  { value: 'all_users', label: 'الكل (جميع المستخدمين)' },
  { value: 'pro_users', label: 'مشتركو Pro فقط' },
  { value: 'free_users', label: 'المستخدمون المجانيون فقط' },
];

const POPUP_AUDIENCES = [
  { value: 'all', label: 'الكل' },
  { value: 'free', label: 'المجاني' },
  { value: 'pro', label: 'Pro' },
];

function topicLabel(topic) {
  if (topic === 'pro_users') return 'Pro فقط';
  if (topic === 'free_users') return 'المجاني فقط';
  return 'الكل';
}

function audienceLabel(aud) {
  if (aud === 'pro') return 'Pro فقط';
  if (aud === 'free') return 'المجاني فقط';
  return 'الكل';
}

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
  const [sendingPush, setSendingPush] = useState(false);

  // Popup Form
  const [popupTitle, setPopupTitle] = useState('');
  const [popupBody, setPopupBody] = useState('');
  const [popupImageUrl, setPopupImageUrl] = useState('');
  const [popupActionText, setPopupActionText] = useState('');
  const [popupActionUrl, setPopupActionUrl] = useState('');
  const [popupAudience, setPopupAudience] = useState('all');
  const [popupActive, setPopupActive] = useState(true);
  const [savingPopup, setSavingPopup] = useState(false);

  const [deletePopupTarget, setDeletePopupTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSendPush(e) {
    e.preventDefault();
    const title = pushTitle.trim();
    const body = pushBody.trim();
    const image_url = pushImageUrl.trim() || null;

    if (!title || !body) {
      notify('يرجى إدخال عنوان ونص الإشعار', 'error');
      return;
    }

    setSendingPush(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: { title, body, topic: pushTopic, image_url },
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
        action_url: popupActionUrl.trim() || null,
        target_audience: popupAudience,
        is_active: popupActive,
      });

      if (error) throw error;
      notify('تمت إضافة الرسالة المنبثقة بنجاح', 'success');
      setPopupTitle('');
      setPopupBody('');
      setPopupImageUrl('');
      setPopupActionText('');
      setPopupActionUrl('');
      setPopupAudience('all');
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
      notify('تم حذف الرسالة المنبثقة', 'success');
      setDeletePopupTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الإشعارات والرسائل المنبثقة</h1>
          <p>إرسال إشعارات فورية عبر Firebase FCM وإدارة التنبيهات داخل التطبيق</p>
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
                  <Send size={18} color="var(--accent)" />
                  إرسال إشعار فوري جديد
                </span>
              </h2>

              <div className="form-grid">
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
                    {PUSH_TOPICS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

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
                  <Sparkles size={18} color="var(--gold)" />
                  معاينة الإشعار على أندرويد
                </span>
                <span className="badge badge-sky">{topicLabel(pushTopic)}</span>
              </h2>

              <div className="push-preview">
                <div className="push-preview-head">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <Bell size={13} color="var(--accent)" />
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
              </div>

              <p style={{ margin: '14px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                يتم توقيع الطلب وإرساله بشكل آمن من خلال Supabase Edge Function (`send-push`)
                باستخدام صلاحيات Firebase Admin المشفّرة على الخادم فقط.
              </p>
            </div>
          </div>

          {/* Push History */}
          <div className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <History size={18} color="var(--accent)" />
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
                    style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}
                  >
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 10,
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 11,
                          background: 'var(--accent-soft)',
                          display: 'grid',
                          placeItems: 'center',
                          color: 'var(--accent)',
                          flexShrink: 0,
                        }}
                      >
                        <Bell size={18} />
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
                        <span className="badge badge-neutral">{topicLabel(item.topic)}</span>
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
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                <MessageSquareMore size={18} color="var(--accent)" />
                إنشاء رسالة منبثقة داخل التطبيق
              </span>
            </h2>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
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
                  الفئة المستهدفة
                </label>
                <select
                  id="pop-aud"
                  className="select"
                  value={popupAudience}
                  onChange={(e) => setPopupAudience(e.target.value)}
                >
                  {POPUP_AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
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

            <div className="form-grid cols-3" style={{ marginBottom: 14 }}>
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

              <div className="field">
                <label className="field-label" htmlFor="pop-btn">
                  نص الزر <span className="field-hint">(اختياري)</span>
                </label>
                <input
                  id="pop-btn"
                  className="input"
                  placeholder="مثال: اكتشف الآن"
                  value={popupActionText}
                  onChange={(e) => setPopupActionText(e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="pop-url">
                  رابط الزر <span className="field-hint">(اختياري)</span>
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
                <span className="switch-title">مفعّلة فور الحفظ</span>
                <ToggleSwitch
                  checked={popupActive}
                  tone="emerald"
                  onChange={setPopupActive}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={savingPopup}>
                <Plus size={16} />
                {savingPopup ? 'جاري الحفظ...' : 'نشر الرسالة المنبثقة'}
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
              {popups.map((popup) => (
                <article key={popup.id} className="glass-panel user-card">
                  {popup.image_url && (
                    <img
                      src={popup.image_url}
                      alt={popup.title}
                      style={{
                        width: '100%',
                        maxHeight: 160,
                        objectFit: 'cover',
                        borderRadius: 12,
                      }}
                    />
                  )}

                  <div className="user-card-top">
                    <strong style={{ fontSize: '1rem' }}>{popup.title}</strong>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span className="badge badge-sky">
                        {audienceLabel(popup.target_audience)}
                      </span>
                      <span
                        className={`badge ${popup.is_active ? 'badge-emerald' : 'badge-neutral'}`}
                      >
                        {popup.is_active ? 'نشطة' : 'متوقفة'}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                    {popup.body}
                  </p>

                  {popup.action_text && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
                      <span className="badge badge-neutral">
                        <ExternalLink size={12} /> {popup.action_text}
                      </span>
                      {popup.action_url && (
                        <a
                          href={popup.action_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ltr"
                          style={{
                            color: 'var(--accent)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {popup.action_url}
                        </a>
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
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
                        style={{ width: 32, height: 32 }}
                        onClick={() => setDeletePopupTarget(popup)}
                        aria-label={`حذف ${popup.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
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
