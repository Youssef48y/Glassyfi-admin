import { useEffect, useMemo, useState } from 'react';
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
  Users,
  Check,
  Star,
  Clock,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import {
  formatDateAr,
  isUserOnline,
  computeExpirySpec,
  getPopupExpiryInfo,
} from '../lib/formatters';
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
import { ExpiryPicker } from './ExpiryPicker';

export function NotificationsTab({
  pushHistory,
  popups,
  users,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('push'); // 'push' | 'popups'

  // Live clock tick (1s on popups for smooth countdowns, 5s on push for live online count)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const intervalMs = subTab === 'popups' ? 1000 : 5000;
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [subTab]);

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
  const [popupExpiry, setPopupExpiry] = useState({ amount: 0, unit: 'never' });
  const [popupActive, setPopupActive] = useState(true);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [savingPopup, setSavingPopup] = useState(false);

  const [deletePopupTarget, setDeletePopupTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const userCodeMap = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      map[u.device_id] = u.user_code;
    });
    return map;
  }, [users]);

  const onlineUsers = useMemo(
    () => users.filter((u) => isUserOnline(u, nowMs)),
    [users, nowMs],
  );

  const onlineDeviceIds = useMemo(
    () => onlineUsers.map((u) => u.device_id).filter(Boolean),
    [onlineUsers],
  );

  const onlineFcmTokens = useMemo(
    () =>
      Array.from(
        new Set(
          onlineUsers
            .map((u) => (u.fcm_token || '').trim())
            .filter(Boolean),
        ),
      ),
    [onlineUsers],
  );

  const filteredPickerUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.user_code || '').toLowerCase().includes(q) ||
        (u.device_model || '').toLowerCase().includes(q) ||
        (u.admin_note || '').toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  function toggleTargetDevice(deviceId) {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId],
    );
  }

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

    const isOnlineOnly = pushTopic === 'online_now';
    if (isOnlineOnly && onlineFcmTokens.length === 0) {
      notify('لا يوجد مستخدمون متصلون الآن لديهم FCM Token نشط', 'error');
      return;
    }

    setSendingPush(true);
    try {
      const requestBody = isOnlineOnly
        ? {
            title,
            body,
            topic: 'online_now',
            fcm_tokens: onlineFcmTokens,
            target_label: `${onlineFcmTokens.length} متصل الآن`,
            image_url,
            deep_link,
          }
        : {
            title,
            body,
            topic: pushTopic,
            image_url,
            deep_link,
          };

      const { data, error } = await supabase.functions.invoke('send-push', {
        body: requestBody,
      });

      if (error) {
        let serverError = error.message || 'فشل استدعاء دالة الإشعارات';
        if (error.context && typeof error.context.json === 'function') {
          const errJson = await error.context.json().catch(() => null);
          if (errJson?.error) serverError = errJson.error;
        }
        throw new Error(serverError);
      }
      if (!data?.ok) {
        throw new Error(data?.error || data?.details || 'فشل إرسال الإشعار عبر FCM');
      }

      if (isOnlineOnly) {
        const sent = data.sentCount ?? onlineFcmTokens.length;
        const failNote =
          data.failedCount > 0 ? ` (تعذر الوصول إلى ${data.failedCount} جهاز)` : '';
        notify(`تم إرسال الإشعار إلى ${sent} مستخدم متصل الآن بنجاح!${failNote}`, 'success');
      } else {
        notify('تم إرسال الإشعار الفوري بنجاح!', 'success');
      }
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
    if (popupAudience === 'specific' && selectedDeviceIds.length === 0) {
      notify('يرجى اختيار مستخدم واحد على الأقل عند تحديد "مستخدمين محددين"', 'error');
      return;
    }
    if (popupAudience === 'online' && onlineDeviceIds.length === 0) {
      notify('لا يوجد مستخدمون متصلون الآن لإرسال الرسالة لهم', 'error');
      return;
    }

    const expirySpec = computeExpirySpec(popupExpiry.amount, popupExpiry.unit);
    const expiresAt = expirySpec.buildExpiresAtIso();

    setSavingPopup(true);
    try {
      let targetDevices = [];
      let dbAudience = popupAudience;

      if (popupAudience === 'online') {
        targetDevices = onlineDeviceIds;
        dbAudience = 'all';
      } else if (popupAudience === 'specific') {
        targetDevices = selectedDeviceIds;
        dbAudience = 'all';
      }

      const { error } = await supabase.from('popup_announcements').insert({
        title: popupTitle.trim(),
        body: popupBody.trim(),
        image_url: popupImageUrl.trim() || null,
        action_text: popupActionText.trim() || null,
        deep_link: popupDeepLink.trim() || null,
        action_url: popupActionUrl.trim() || popupDeepLink.trim() || null,
        target_audience: dbAudience,
        target_device_ids: targetDevices,
        max_shows_per_user: Number(popupMaxShows ?? 1),
        expires_at: expiresAt,
        is_active: popupActive,
      });

      if (error) throw error;

      // Trigger immediate silent_sync so live devices receive the popup instantly
      if (popupAudience === 'online' && onlineFcmTokens.length > 0) {
        triggerSilentSync({ fcmTokens: onlineFcmTokens });
      } else if (popupAudience === 'specific') {
        const selectedTokens = Array.from(
          new Set(
            users
              .filter((u) => selectedDeviceIds.includes(u.device_id))
              .map((u) => (u.fcm_token || '').trim())
              .filter(Boolean),
          ),
        );
        if (selectedTokens.length > 0 && selectedTokens.length === selectedDeviceIds.length) {
          triggerSilentSync({ fcmTokens: selectedTokens });
        } else {
          triggerSilentSync({ topic: 'all_users' });
        }
      } else {
        triggerSilentSync({ topic: 'all_users' });
      }

      notify(
        popupAudience === 'online'
          ? `تم نشر الرسالة المنبثقة لـ ${targetDevices.length} مستخدم متصل الآن (${expirySpec.labelAr})`
          : `تم نشر الرسالة المنبثقة ومزامنة التطبيقات فورياً (${expirySpec.labelAr})`,
        'success',
      );
      setPopupTitle('');
      setPopupBody('');
      setPopupImageUrl('');
      setPopupActionText('');
      setPopupDeepLink('');
      setPopupActionUrl('');
      setPopupAudience('all');
      setSelectedDeviceIds([]);
      setUserSearch('');
      setPopupMaxShows(1);
      setPopupExpiry({ amount: 0, unit: 'never' });
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
          <p>إشعارات FCM فورية مع التوجيه العميق ورسائل منبثقة عامة أو لمستخدمين محددين</p>
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
            <form onSubmit={handleSendPush} className="glass-panel section-card" style={{ marginBottom: 0 }}>
              <h2 className="section-heading">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Send size={18} />
                  إرسال إشعار فوري جديد
                </span>
              </h2>

              <div className="form-grid">
                <div className="field">
                  <label className="field-label" htmlFor="push-topic">
                    الجمهور المستهدف
                    {pushTopic === 'online_now' && (
                      <span className="badge badge-emerald">
                        <span className="live-pulse-dot" style={{ width: 7, height: 7 }} />
                        {onlineFcmTokens.length} جاهز للإرسال
                      </span>
                    )}
                  </label>
                  <select
                    id="push-topic"
                    className="select"
                    value={pushTopic}
                    onChange={(e) => setPushTopic(e.target.value)}
                  >
                    {PUSH_TOPIC_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.value === 'online_now'
                          ? `${t.label} (${onlineUsers.length})`
                          : t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {pushTopic === 'online_now' && (
                  <div className="glass-subcard" style={{ padding: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginBottom: onlineUsers.length > 0 ? 8 : 0,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: onlineFcmTokens.length > 0 ? 'var(--emerald)' : 'var(--amber)',
                        }}
                      >
                        <span
                          className="live-pulse-dot"
                          style={{
                            width: 7,
                            height: 7,
                            background: onlineFcmTokens.length > 0 ? 'var(--emerald)' : 'var(--amber)',
                          }}
                        />
                        {onlineUsers.length === 0
                          ? 'لا يوجد مستخدمون متصلون الآن (آخر 65 ثانية)'
                          : `متصل الآن: ${onlineUsers.length} مستخدم (${onlineFcmTokens.length} لديهم FCM Token نشط)`}
                      </span>
                    </div>
                    {onlineUsers.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {onlineUsers.slice(0, 8).map((u) => (
                          <span
                            key={u.device_id}
                            className={`badge mono ${u.fcm_token ? 'badge-emerald' : 'badge-neutral'}`}
                          >
                            {u.user_code}
                          </span>
                        ))}
                        {onlineUsers.length > 8 && (
                          <span className="badge badge-neutral">+{onlineUsers.length - 8}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
                  disabled={
                    sendingPush ||
                    (pushTopic === 'online_now' && onlineFcmTokens.length === 0)
                  }
                >
                  {sendingPush ? (
                    <>
                      <Loader2 size={17} className="spinner" />
                      جاري الإرسال عبر FCM...
                    </>
                  ) : (
                    <>
                      <Send size={17} />
                      {pushTopic === 'online_now'
                        ? `إرسال الإشعار للمتصلين الآن (${onlineFcmTokens.length})`
                        : 'إرسال الإشعار الآن'}
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
                <span className="badge badge-white">{getTopicLabelAr(pushTopic)}</span>
              </h2>

              <div className="push-preview">
                <div className="push-preview-head">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                    <Bell size={13} />
                    Vitrify
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
                    <span className="badge badge-white mono">
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
                <History size={18} />
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
                          background: 'var(--bg-input)',
                          border: '1px solid var(--glass-border)',
                          display: 'grid',
                          placeItems: 'center',
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
                            <span className="badge badge-white mono">{item.deep_link}</span>
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
        /* In-App Pop-up Announcements with Targeted Multi-User Picker */
        <>
          <form onSubmit={handleCreatePopup} className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <MessageSquareMore size={18} />
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
                  placeholder="عرض خاص لمستخدمي Vitrify"
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
                      {a.value === 'online'
                        ? `${a.label} (${onlineUsers.length})`
                        : a.label}
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

            {/* Live Online Now Auto-Filled Devices Preview */}
            {popupAudience === 'online' && (
              <div className="glass-subcard" style={{ padding: 14, marginBottom: 14 }}>
                <div className="field-label" style={{ marginBottom: onlineUsers.length > 0 ? 9 : 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span
                      className="live-pulse-dot"
                      style={{
                        width: 8,
                        height: 8,
                        background: onlineUsers.length > 0 ? 'var(--emerald)' : 'var(--amber)',
                      }}
                    />
                    {onlineUsers.length === 0
                      ? 'لا يوجد مستخدمون متصلون الآن (آخر 65 ثانية)'
                      : `سيتم تعبئة target_device_ids تلقائياً لجميع المتصلين الآن (${onlineUsers.length} جهاز)`}
                  </span>
                  <span className={`badge ${onlineUsers.length > 0 ? 'badge-emerald' : 'badge-amber'}`}>
                    {onlineUsers.length} متصل الآن
                  </span>
                </div>

                {onlineUsers.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {onlineUsers.slice(0, 12).map((u) => (
                      <span key={u.device_id} className="badge badge-emerald mono">
                        {u.user_code}
                        {u.device_model ? ` • ${u.device_model}` : ''}
                      </span>
                    ))}
                    {onlineUsers.length > 12 && (
                      <span className="badge badge-neutral">+{onlineUsers.length - 12}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Searchable Multi-Select User Picker when audience === 'specific' */}
            {popupAudience === 'specific' && (
              <div className="glass-subcard" style={{ padding: 14, marginBottom: 14 }}>
                <div className="field-label" style={{ marginBottom: 9 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Users size={15} />
                    اختر المستخدمين المستهدفين (تظهر الرسالة لهم فقط)
                  </span>
                  <span className="badge badge-white">{selectedDeviceIds.length} محدد</span>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <input
                    type="search"
                    className="input"
                    style={{ padding: '8px 11px', fontSize: '0.82rem', flex: 1, minWidth: 200 }}
                    placeholder="ابحث بكود المستخدم أو نوع الهاتف أو الملاحظة..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  {onlineDeviceIds.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedDeviceIds(onlineDeviceIds)}
                    >
                      <span className="live-pulse-dot" style={{ width: 7, height: 7 }} />
                      تحديد المتصلين الآن ({onlineDeviceIds.length})
                    </button>
                  )}
                  {selectedDeviceIds.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setSelectedDeviceIds([])}
                    >
                      مسح التحديد
                    </button>
                  )}
                </div>

                {filteredPickerUsers.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: 10, textAlign: 'center' }}>
                    لا يوجد مستخدمون مطابقون للبحث
                  </div>
                ) : (
                  <div className="unlock-grid">
                    {filteredPickerUsers.map((u) => {
                      const isSel = selectedDeviceIds.includes(u.device_id);
                      const uOnline = isUserOnline(u, nowMs);
                      return (
                        <button
                          key={u.device_id}
                          type="button"
                          className={`unlock-item${isSel ? ' selected' : ''}`}
                          onClick={() => toggleTargetDevice(u.device_id)}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                              {uOnline && (
                                <span
                                  className="live-pulse-dot"
                                  style={{ width: 7, height: 7 }}
                                  title="متصل الآن"
                                />
                              )}
                              <span className="mono">{u.user_code}</span>
                              {u.is_starred && <Star size={12} color="var(--amber)" fill="currentColor" />}
                            </div>
                            <div style={{ fontSize: '0.71rem', opacity: 0.78, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {u.device_model || 'جهاز غير معروف'}
                              {u.admin_note ? ` • ${u.admin_note}` : ''}
                            </div>
                          </div>
                          {isSel && <Check size={14} style={{ flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

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

            {/* Auto-Expire Timed Popup Duration Picker */}
            <div className="glass-subcard" style={{ padding: 14, marginBottom: 14 }}>
              <div className="field-label" style={{ marginBottom: 9 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={15} color="var(--amber)" />
                  مدة صلاحية الرسالة (Auto-Expire)
                </span>
                <span className="badge badge-white">
                  {computeExpirySpec(popupExpiry.amount, popupExpiry.unit).labelAr}
                </span>
              </div>
              <ExpiryPicker
                idPrefix="pop-exp"
                amount={popupExpiry.amount}
                unit={popupExpiry.unit}
                onChange={setPopupExpiry}
                disabled={savingPopup}
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

              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  savingPopup ||
                  (popupAudience === 'online' && onlineDeviceIds.length === 0)
                }
              >
                <Plus size={16} />
                {savingPopup
                  ? 'جاري النشر...'
                  : popupAudience === 'online'
                    ? `نشر الرسالة للمتصلين الآن (${onlineDeviceIds.length})`
                    : 'نشر الرسالة المنبثقة'}
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
                const targetedIds = Array.isArray(popup.target_device_ids)
                  ? popup.target_device_ids
                  : [];
                const isTargeted = targetedIds.length > 0 || popup.target_audience === 'specific';
                const aud = getAudienceBadge(isTargeted ? 'specific' : popup.target_audience);
                const expiryInfo = getPopupExpiryInfo(popup.expires_at, nowMs);

                return (
                  <article
                    key={popup.id}
                    className="glass-panel user-card"
                    style={expiryInfo.expired ? { opacity: 0.72 } : undefined}
                  >
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
                        <span className={`badge ${aud.className}`}>
                          {isTargeted ? `محدد (${targetedIds.length} جهاز)` : aud.label}
                        </span>
                        <span className="badge badge-sky">
                          <Repeat size={11} /> {maxShowsLabel(popup.max_shows_per_user ?? 1)}
                        </span>
                        <span className={`badge ${expiryInfo.className}`}>
                          <Clock size={11} /> {expiryInfo.label}
                        </span>
                        <span
                          className={`badge ${
                            expiryInfo.expired
                              ? 'badge-neutral'
                              : popup.is_active
                                ? 'badge-emerald'
                                : 'badge-neutral'
                          }`}
                        >
                          {popup.is_active ? 'نشطة' : 'متوقفة'}
                        </span>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {popup.body}
                    </p>

                    {targetedIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {targetedIds.slice(0, 6).map((devId) => (
                          <span key={devId} className="badge badge-neutral mono">
                            {userCodeMap[devId] || devId.slice(0, 10)}
                          </span>
                        ))}
                        {targetedIds.length > 6 && (
                          <span className="badge badge-neutral">+{targetedIds.length - 6}</span>
                        )}
                      </div>
                    )}

                    {(popup.action_text || popup.deep_link) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, fontSize: '0.78rem' }}>
                        {popup.action_text && (
                          <span className="badge badge-neutral">
                            <ExternalLink size={11} /> {popup.action_text}
                          </span>
                        )}
                        {popup.deep_link && (
                          <span className="badge badge-white mono">
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
