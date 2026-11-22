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
  ShieldCheck,
} from 'lucide-react';
import { supabase, triggerSilentSync, extractEdgeFunctionError } from '../lib/supabase';
import {
  formatDateAr,
  getProStatusInfo,
  isUserOnline,
  computeExpirySpec,
  getPopupExpiryInfo,
} from '../lib/formatters';
import {
  MAX_SHOWS_OPTIONS,
  getTopicLabelAr,
  getAudienceBadge,
} from '../lib/constants';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';
import { DeepLinkPicker } from './DeepLinkPicker';
import { ExpiryPicker } from './ExpiryPicker';
import { LosslessImagePickerField } from './LosslessImagePickerField';

const AUDIENCE_FILTER_CHIPS = [
  { id: 'all', label: 'الكل' },
  { id: 'online', label: 'المتصلين الآن', isOnline: true },
  { id: 'pro', label: 'Pro' },
  { id: 'free', label: 'مجاني' },
  { id: 'uptodate', label: 'المحدّثين' },
  { id: 'outdated', label: 'غير المحدّثين' },
  { id: 'lab', label: 'المختبر' },
  { id: 'dev', label: 'المطورين' },
  { id: 'specific', label: 'أشخاص محددين' },
];

const PURE_TOPIC_MAP = {
  all: 'all_users',
  pro: 'pro_users',
  free: 'free_users',
  lab: 'lab_users',
  dev: 'dev_users',
};

const PURE_POPUP_AUDIENCE_SET = new Set(['all', 'pro', 'free', 'lab', 'dev']);

function matchesAudienceChip(user, chipId, selectedDeviceIds, latestVersionCode, nowMs) {
  const proActive = getProStatusInfo(user).active;
  const userVCode = Number(user.app_version_code) || 1;
  switch (chipId) {
    case 'all':
      return true;
    case 'online':
      return isUserOnline(user, nowMs);
    case 'pro':
      return proActive;
    case 'free':
      return !proActive && !user.is_banned;
    case 'uptodate':
      return userVCode >= latestVersionCode;
    case 'outdated':
      return userVCode < latestVersionCode;
    case 'lab':
      return user.role === 'lab';
    case 'dev':
      return user.role === 'dev';
    case 'specific':
      return selectedDeviceIds.includes(user.device_id);
    default:
      return false;
  }
}

function toggleFilterList(prevList, chipId) {
  if (chipId === 'all') return ['all'];
  const withoutAll = prevList.filter((id) => id !== 'all');
  const next = withoutAll.includes(chipId)
    ? withoutAll.filter((id) => id !== chipId)
    : [...withoutAll, chipId];
  return next.length === 0 ? ['all'] : next;
}

function computeAudienceUnion({
  selectedFilters,
  selectedDeviceIds,
  users,
  latestVersionCode,
  nowMs,
}) {
  const deviceSet = new Set();
  const tokenSet = new Set();
  const isAll = selectedFilters.includes('all');

  users.forEach((u) => {
    if (!u?.device_id) return;
    const matched = isAll
      ? true
      : selectedFilters.some((chipId) =>
          matchesAudienceChip(u, chipId, selectedDeviceIds, latestVersionCode, nowMs),
        );
    if (matched) {
      deviceSet.add(u.device_id);
      const token = (u.fcm_token || '').trim();
      if (token) tokenSet.add(token);
    }
  });

  if (!isAll && selectedFilters.includes('specific')) {
    selectedDeviceIds.forEach((id) => {
      if (id) deviceSet.add(id);
    });
  }

  const labelParts = selectedFilters.map(
    (id) => AUDIENCE_FILTER_CHIPS.find((c) => c.id === id)?.label || id,
  );

  return {
    isAll,
    deviceIds: Array.from(deviceSet),
    fcmTokens: Array.from(tokenSet),
    summaryLabel: labelParts.join(' + '),
  };
}

function AudienceMultiSelect({
  selectedFilters,
  onToggleFilter,
  chipCounts,
  selectedDeviceIds,
  onToggleDevice,
  onSelectOnlineDevices,
  onClearDevices,
  onlineCount,
  users,
  searchValue,
  onSearchChange,
  nowMs,
  uniqueCount,
  secondaryCountNote,
}) {
  const filteredUsers = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.user_code || '').toLowerCase().includes(q) ||
        (u.device_model || '').toLowerCase().includes(q) ||
        (u.admin_note || '').toLowerCase().includes(q),
    );
  }, [users, searchValue]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="filter-strip" style={{ marginBottom: 0 }}>
        {AUDIENCE_FILTER_CHIPS.map((chip) => {
          const isActive = selectedFilters.includes(chip.id);
          const count =
            chip.id === 'specific'
              ? selectedDeviceIds.length
              : chipCounts[chip.id] ?? 0;
          return (
            <button
              key={chip.id}
              type="button"
              className={`chip${isActive ? ' active' : ''}`}
              onClick={() => onToggleFilter(chip.id)}
            >
              {chip.isOnline && (
                <span
                  className="live-pulse-dot"
                  style={{ width: 7, height: 7, marginInlineEnd: 2 }}
                />
              )}
              {chip.label}
              <span className="chip-count">({count})</span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          className={`badge ${uniqueCount > 0 ? 'badge-emerald' : 'badge-amber'}`}
          style={{ padding: '5px 11px', fontSize: '0.78rem' }}
        >
          <ShieldCheck size={13} />
          سيصل إلى {uniqueCount} جهاز فريد بدون تكرار
        </span>
        {secondaryCountNote && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {secondaryCountNote}
          </span>
        )}
      </div>

      {selectedFilters.includes('specific') && (
        <div className="glass-subcard" style={{ padding: 14 }}>
          <div className="field-label" style={{ marginBottom: 9 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Users size={15} />
              اختر أشخاصاً محددين (يُدمجون بدون تكرار مع الفلاتر الأخرى)
            </span>
            <span className="badge badge-white">{selectedDeviceIds.length} محدد</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              type="search"
              className="input"
              style={{ padding: '8px 11px', fontSize: '0.82rem', flex: 1, minWidth: 200 }}
              placeholder="ابحث بكود المستخدم أو نوع الهاتف أو الملاحظة..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {onlineCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onSelectOnlineDevices}
              >
                <span className="live-pulse-dot" style={{ width: 7, height: 7 }} />
                تحديد المتصلين الآن ({onlineCount})
              </button>
            )}
            {selectedDeviceIds.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onClearDevices}
              >
                مسح التحديد
              </button>
            )}
          </div>

          {filteredUsers.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: 10, textAlign: 'center' }}>
              لا يوجد مستخدمون مطابقون للبحث
            </div>
          ) : (
            <div className="unlock-grid">
              {filteredUsers.map((u) => {
                const isSel = selectedDeviceIds.includes(u.device_id);
                const uOnline = isUserOnline(u, nowMs);
                return (
                  <button
                    key={u.device_id}
                    type="button"
                    className={`unlock-item${isSel ? ' selected' : ''}`}
                    onClick={() => onToggleDevice(u.device_id)}
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
    </div>
  );
}

export function NotificationsTab({
  pushHistory,
  popups,
  users,
  appConfig,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('push'); // 'push' | 'popups'

  // Live clock tick (1s on popups for smooth countdowns, 5s on push for exact online presence <= 45s)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const intervalMs = subTab === 'popups' ? 1000 : 5000;
    const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [subTab]);

  // Push FCM Form (Multi-Select Audience)
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushImageUrl, setPushImageUrl] = useState('');
  const [pushFilters, setPushFilters] = useState(['all']);
  const [pushSelectedDevices, setPushSelectedDevices] = useState([]);
  const [pushUserSearch, setPushUserSearch] = useState('');
  const [pushDeepLink, setPushDeepLink] = useState('');
  const [sendingPush, setSendingPush] = useState(false);

  // Popup Form (Multi-Select Audience + Auto-Expire)
  const [popupTitle, setPopupTitle] = useState('');
  const [popupBody, setPopupBody] = useState('');
  const [popupImageUrl, setPopupImageUrl] = useState('');
  const [popupActionText, setPopupActionText] = useState('');
  const [popupDeepLink, setPopupDeepLink] = useState('');
  const [popupActionUrl, setPopupActionUrl] = useState('');
  const [popupFilters, setPopupFilters] = useState(['all']);
  const [popupMaxShows, setPopupMaxShows] = useState(1);
  const [popupExpiry, setPopupExpiry] = useState({ amount: 0, unit: 'never' });
  const [popupActive, setPopupActive] = useState(true);
  const [popupSelectedDevices, setPopupSelectedDevices] = useState([]);
  const [popupUserSearch, setPopupUserSearch] = useState('');
  const [savingPopup, setSavingPopup] = useState(false);

  const [deletePopupTarget, setDeletePopupTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const latestVersionCode = Number(appConfig?.latest_version_code ?? 1);

  const userCodeMap = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      map[u.device_id] = u.user_code;
    });
    return map;
  }, [users]);

  const chipCounts = useMemo(() => {
    const counts = {
      all: users.length,
      online: 0,
      pro: 0,
      free: 0,
      uptodate: 0,
      outdated: 0,
      lab: 0,
      dev: 0,
    };
    users.forEach((u) => {
      const proActive = getProStatusInfo(u).active;
      const vCode = Number(u.app_version_code) || 1;
      if (isUserOnline(u, nowMs)) counts.online += 1;
      if (proActive) counts.pro += 1;
      if (!proActive && !u.is_banned) counts.free += 1;
      if (vCode >= latestVersionCode) counts.uptodate += 1;
      else counts.outdated += 1;
      if (u.role === 'lab') counts.lab += 1;
      if (u.role === 'dev') counts.dev += 1;
    });
    return counts;
  }, [users, latestVersionCode, nowMs]);

  const onlineDeviceIds = useMemo(
    () => users.filter((u) => isUserOnline(u, nowMs)).map((u) => u.device_id).filter(Boolean),
    [users, nowMs],
  );

  // Deduplicated Set unions for Push & Popups
  const pushAudienceUnion = useMemo(
    () =>
      computeAudienceUnion({
        selectedFilters: pushFilters,
        selectedDeviceIds: pushSelectedDevices,
        users,
        latestVersionCode,
        nowMs,
      }),
    [pushFilters, pushSelectedDevices, users, latestVersionCode, nowMs],
  );

  const popupAudienceUnion = useMemo(
    () =>
      computeAudienceUnion({
        selectedFilters: popupFilters,
        selectedDeviceIds: popupSelectedDevices,
        users,
        latestVersionCode,
        nowMs,
      }),
    [popupFilters, popupSelectedDevices, users, latestVersionCode, nowMs],
  );

  function togglePushDevice(deviceId) {
    setPushSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId],
    );
  }

  function togglePopupDevice(deviceId) {
    setPopupSelectedDevices((prev) =>
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

    if (
      pushFilters.length === 1 &&
      pushFilters[0] === 'specific' &&
      pushSelectedDevices.length === 0
    ) {
      notify('يرجى اختيار مستخدم واحد على الأقل عند تحديد "أشخاص محددين"', 'error');
      return;
    }

    const singlePureTopic =
      pushFilters.length === 1 && PURE_TOPIC_MAP[pushFilters[0]]
        ? PURE_TOPIC_MAP[pushFilters[0]]
        : null;

    if (!singlePureTopic && pushAudienceUnion.fcmTokens.length === 0) {
      notify('لا توجد أجهزة مطابقة للفلاتر المختارة تحمل FCM Token نشطاً', 'error');
      return;
    }

    setSendingPush(true);
    try {
      const requestBody = singlePureTopic
        ? {
            title,
            body,
            topic: singlePureTopic,
            image_url,
            deep_link,
          }
        : {
            title,
            body,
            topic:
              pushFilters.length === 1 && pushFilters[0] === 'online'
                ? 'online_now'
                : 'direct_device',
            fcm_tokens: pushAudienceUnion.fcmTokens,
            target_label: `${pushAudienceUnion.summaryLabel} (${pushAudienceUnion.fcmTokens.length} جهاز)`,
            image_url,
            deep_link,
          };

      const { data, error } = await supabase.functions.invoke('send-push', {
        body: requestBody,
      });

      if (error || !data?.ok) {
        const errMsg = await extractEdgeFunctionError(
          error,
          data,
          'فشل إرسال الإشعار عبر FCM',
        );
        if (data?.unregistered || (data?.unregistered_count ?? 0) > 0) {
          await onRefresh();
        }
        if (!singlePureTopic) {
          const totalSelected = pushAudienceUnion.deviceIds.length;
          const sentCount = data?.sent_count ?? data?.sentCount ?? 0;
          throw new Error(
            `تم الإرسال إلى ${sentCount} من أصل ${totalSelected} جهاز — ${errMsg}`,
          );
        }
        throw new Error(errMsg);
      }

      if (!singlePureTopic) {
        const totalSelected = pushAudienceUnion.deviceIds.length;
        const sentCount =
          data.sent_count ?? data.sentCount ?? pushAudienceUnion.fcmTokens.length;
        const unregCount =
          data.unregistered_count ?? data.unregisteredCount ?? 0;
        const noTokenCount = Math.max(
          0,
          totalSelected - pushAudienceUnion.fcmTokens.length,
        );
        const notes = [];
        if (noTokenCount > 0) notes.push(`${noTokenCount} بدون توكن`);
        if (unregCount > 0) notes.push(`${unregCount} حذف التطبيق/توكن منتهي`);
        const suffix = notes.length > 0 ? ` (${notes.join(' • ')})` : '';

        notify(
          `تم الإرسال إلى ${sentCount} من أصل ${totalSelected} جهاز${suffix}`,
          'success',
        );
      } else {
        notify(`تم إرسال الإشعار الفوري بنجاح (${pushAudienceUnion.summaryLabel})!`, 'success');
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
    if (
      popupFilters.length === 1 &&
      popupFilters[0] === 'specific' &&
      popupSelectedDevices.length === 0
    ) {
      notify('يرجى اختيار مستخدم واحد على الأقل عند تحديد "أشخاص محددين"', 'error');
      return;
    }

    const singlePureAudience =
      popupFilters.length === 1 && PURE_POPUP_AUDIENCE_SET.has(popupFilters[0])
        ? popupFilters[0]
        : null;

    if (!singlePureAudience && popupAudienceUnion.deviceIds.length === 0) {
      notify('لا توجد أجهزة مطابقة للفلاتر المختارة لإرسال الرسالة لها', 'error');
      return;
    }

    const expirySpec = computeExpirySpec(popupExpiry.amount, popupExpiry.unit);
    const expiresAt = expirySpec.buildExpiresAtIso();

    setSavingPopup(true);
    try {
      const dbAudience = singlePureAudience || 'all';
      const targetDevices = singlePureAudience ? [] : popupAudienceUnion.deviceIds;

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
      if (
        !singlePureAudience &&
        popupAudienceUnion.fcmTokens.length > 0 &&
        popupAudienceUnion.fcmTokens.length === popupAudienceUnion.deviceIds.length
      ) {
        triggerSilentSync({ fcmTokens: popupAudienceUnion.fcmTokens });
      } else {
        triggerSilentSync({ topic: 'all_users' });
      }

      notify(
        singlePureAudience
          ? `تم نشر الرسالة المنبثقة ومزامنة التطبيقات فورياً (${expirySpec.labelAr})`
          : `تم نشر الرسالة المنبثقة لـ ${targetDevices.length} جهاز فريد بدون تكرار (${expirySpec.labelAr})`,
        'success',
      );
      setPopupTitle('');
      setPopupBody('');
      setPopupImageUrl('');
      setPopupActionText('');
      setPopupDeepLink('');
      setPopupActionUrl('');
      setPopupFilters(['all']);
      setPopupSelectedDevices([]);
      setPopupUserSearch('');
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

  const pushUsesTokenBatch = !(
    pushFilters.length === 1 && PURE_TOPIC_MAP[pushFilters[0]]
  );
  const popupUsesDeviceList = !(
    popupFilters.length === 1 && PURE_POPUP_AUDIENCE_SET.has(popupFilters[0])
  );

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الإشعارات والرسائل المنبثقة</h1>
          <p>استهداف متعدد الفلاتر بدون تكرار (Set Union)، إشعارات FCM فورية، ورسائل منبثقة مؤقتة</p>
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
                  <span className="field-label">
                    الجمهور المستهدف (يمكنك اختيار أكثر من فلتر معاً)
                  </span>
                  <AudienceMultiSelect
                    selectedFilters={pushFilters}
                    onToggleFilter={(id) =>
                      setPushFilters((prev) => toggleFilterList(prev, id))
                    }
                    chipCounts={chipCounts}
                    selectedDeviceIds={pushSelectedDevices}
                    onToggleDevice={togglePushDevice}
                    onSelectOnlineDevices={() => setPushSelectedDevices(onlineDeviceIds)}
                    onClearDevices={() => setPushSelectedDevices([])}
                    onlineCount={onlineDeviceIds.length}
                    users={users}
                    searchValue={pushUserSearch}
                    onSearchChange={setPushUserSearch}
                    nowMs={nowMs}
                    uniqueCount={
                      pushUsesTokenBatch
                        ? pushAudienceUnion.fcmTokens.length
                        : pushAudienceUnion.deviceIds.length
                    }
                    secondaryCountNote={
                      pushUsesTokenBatch &&
                      pushAudienceUnion.deviceIds.length > pushAudienceUnion.fcmTokens.length
                        ? `(إجمالي مطابق: ${pushAudienceUnion.deviceIds.length} • لديهم FCM Token: ${pushAudienceUnion.fcmTokens.length})`
                        : null
                    }
                  />
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

                <LosslessImagePickerField
                  id="push-img"
                  label="صورة مرفقة للإشعار"
                  hint="(اختياري — بدون ضغط)"
                  value={pushImageUrl}
                  onChange={setPushImageUrl}
                  notify={notify}
                  disabled={sendingPush}
                  showPreview={false}
                />

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
                    (pushUsesTokenBatch && pushAudienceUnion.fcmTokens.length === 0)
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
                      {pushUsesTokenBatch
                        ? `إرسال الإشعار لـ ${pushAudienceUnion.fcmTokens.length} جهاز فريد`
                        : `إرسال الإشعار الآن (${pushAudienceUnion.summaryLabel})`}
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
                <span className="badge badge-white">{pushAudienceUnion.summaryLabel}</span>
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
                عند دمج أكثر من فلتر، يتم حساب اتحاد الأجهزة الفريدة (Set Union) بحيث يتلقى كل جهاز
                إشعاراً واحداً فقط بدون أي تكرار.
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
        /* In-App Pop-up Announcements with Multi-Select Audience & Auto-Expire */
        <>
          <form onSubmit={handleCreatePopup} className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <MessageSquareMore size={18} />
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
                  placeholder="عرض خاص لمستخدمي Vitrify"
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  required
                />
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
              <span className="field-label">
                الجمهور المستهدف (يمكنك اختيار أكثر من فلتر معاً بدون تكرار)
              </span>
              <AudienceMultiSelect
                selectedFilters={popupFilters}
                onToggleFilter={(id) =>
                  setPopupFilters((prev) => toggleFilterList(prev, id))
                }
                chipCounts={chipCounts}
                selectedDeviceIds={popupSelectedDevices}
                onToggleDevice={togglePopupDevice}
                onSelectOnlineDevices={() => setPopupSelectedDevices(onlineDeviceIds)}
                onClearDevices={() => setPopupSelectedDevices([])}
                onlineCount={onlineDeviceIds.length}
                users={users}
                searchValue={popupUserSearch}
                onSearchChange={setPopupUserSearch}
                nowMs={nowMs}
                uniqueCount={popupAudienceUnion.deviceIds.length}
              />
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

              <LosslessImagePickerField
                id="pop-img"
                label="صورة الرسالة المنبثقة"
                hint="(اختياري — بدون ضغط)"
                value={popupImageUrl}
                onChange={setPopupImageUrl}
                notify={notify}
                disabled={savingPopup}
                previewMaxHeight={150}
              />
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
                  (popupUsesDeviceList && popupAudienceUnion.deviceIds.length === 0)
                }
              >
                <Plus size={16} />
                {savingPopup
                  ? 'جاري النشر...'
                  : popupUsesDeviceList
                    ? `نشر الرسالة لـ ${popupAudienceUnion.deviceIds.length} جهاز فريد`
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
