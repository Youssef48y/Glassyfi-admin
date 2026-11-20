import { useMemo, useState } from 'react';
import {
  Users,
  Ticket,
  Search,
  Crown,
  Ban,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Clock,
  Copy,
  Check,
  Plus,
  Trash2,
  Wand2,
  X,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  Send,
  KeyRound,
  FlaskConical,
  Code2,
  User as UserIcon,
  Star,
  StickyNote,
  MessageSquareMore,
  ArrowUpCircle,
  Save,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import {
  formatRelativeTimeAr,
  formatShortDateAr,
  generateRandomPromoCode,
  getProStatusInfo,
  computeDurationSpec,
  formatDurationAr,
} from '../lib/formatters';
import { ROLE_META, MAX_SHOWS_OPTIONS } from '../lib/constants';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';
import { DeepLinkPicker } from './DeepLinkPicker';
import { DurationPicker } from './DurationPicker';

export function UsersTab({
  users,
  promoCodes,
  widgets,
  depthTools,
  appConfig,
  loading,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('users'); // 'users' | 'promos'

  // Users Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copiedCode, setCopiedCode] = useState('');
  const [starringId, setStarringId] = useState('');

  // Selected user drawer state
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [proDuration, setProDuration] = useState({ amount: 30, unit: 'days' });
  const [banReasonInput, setBanReasonInput] = useState('');
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [unlockSearch, setUnlockSearch] = useState('');
  const [unlockDraft, setUnlockDraft] = useState([]);
  const [unlockDirty, setUnlockDirty] = useState(false);

  // Direct Push form inside drawer
  const [directTitle, setDirectTitle] = useState('');
  const [directBody, setDirectBody] = useState('');
  const [directDeepLink, setDirectDeepLink] = useState('');
  const [sendingDirect, setSendingDirect] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);

  // Targeted Single-User Pop-up Modal
  const [popupTargetUser, setPopupTargetUser] = useState(null);
  const [tpTitle, setTpTitle] = useState('');
  const [tpBody, setTpBody] = useState('');
  const [tpImageUrl, setTpImageUrl] = useState('');
  const [tpActionText, setTpActionText] = useState('');
  const [tpDeepLink, setTpDeepLink] = useState('');
  const [tpMaxShows, setTpMaxShows] = useState(1);
  const [sendingPopup, setSendingPopup] = useState(false);

  // Promo code form (flexible minutes/hours/days/lifetime)
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoDur, setPromoDur] = useState({ amount: 30, unit: 'days' });
  const [promoMaxUses, setPromoMaxUses] = useState(1);
  const [promoSaving, setPromoSaving] = useState(false);
  const [deletePromoTarget, setDeletePromoTarget] = useState(null);
  const [deletingPromo, setDeletingPromo] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const latestVersionCode = Number(appConfig?.latest_version_code ?? 1);

  const selectedUser = useMemo(
    () => users.find((u) => u.device_id === selectedDeviceId) || null,
    [users, selectedDeviceId],
  );

  // Combined unlockable catalog (40 home widgets + 15 depth studio tools)
  const unlockCatalog = useMemo(() => {
    const wItems = widgets.map((w) => ({
      key: w.widget_key,
      title: w.title_ar,
      sub: w.widget_key,
      group: 'ويدجيت',
    }));
    const dItems = depthTools.map((d) => ({
      key: d.tool_key,
      title: d.title_ar,
      sub: d.tool_key,
      group: 'استوديو العمق',
    }));
    return [...wItems, ...dItems];
  }, [widgets, depthTools]);

  const filteredUnlockCatalog = useMemo(() => {
    const q = unlockSearch.trim().toLowerCase();
    if (!q) return unlockCatalog;
    return unlockCatalog.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        item.group.includes(q),
    );
  }, [unlockCatalog, unlockSearch]);

  const filterCounts = useMemo(() => {
    const counts = {
      all: users.length,
      starred: 0,
      outdated: 0,
      pro: 0,
      free: 0,
      promo: 0,
      dev: 0,
      lab: 0,
      banned: 0,
      suspicious: 0,
    };
    users.forEach((u) => {
      const proActive = getProStatusInfo(u).active;
      const isOutdated = (Number(u.app_version_code) || 1) < latestVersionCode;
      if (u.is_starred) counts.starred += 1;
      if (isOutdated) counts.outdated += 1;
      if (proActive) counts.pro += 1;
      if (!proActive && !u.is_banned) counts.free += 1;
      if (proActive && u.is_pro && u.activated_via_promo) counts.promo += 1;
      if (u.role === 'dev') counts.dev += 1;
      if (u.role === 'lab') counts.lab += 1;
      if (u.is_banned) counts.banned += 1;
      if (u.is_suspicious) counts.suspicious += 1;
    });
    return counts;
  }, [users, latestVersionCode]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      const proActive = getProStatusInfo(u).active;
      const isOutdated = (Number(u.app_version_code) || 1) < latestVersionCode;

      if (statusFilter === 'starred' && !u.is_starred) return false;
      if (statusFilter === 'outdated' && !isOutdated) return false;
      if (statusFilter === 'pro' && !proActive) return false;
      if (statusFilter === 'free' && (proActive || u.is_banned)) return false;
      if (statusFilter === 'promo' && !(proActive && u.is_pro && u.activated_via_promo)) {
        return false;
      }
      if (statusFilter === 'dev' && u.role !== 'dev') return false;
      if (statusFilter === 'lab' && u.role !== 'lab') return false;
      if (statusFilter === 'banned' && !u.is_banned) return false;
      if (statusFilter === 'suspicious' && !u.is_suspicious) return false;

      if (q) {
        const matchCode = (u.user_code || '').toLowerCase().includes(q);
        const matchModel = (u.device_model || '').toLowerCase().includes(q);
        const matchDevice = (u.device_id || '').toLowerCase().includes(q);
        const matchNote = (u.admin_note || '').toLowerCase().includes(q);
        if (!matchCode && !matchModel && !matchDevice && !matchNote) return false;
      }
      return true;
    });
  }, [users, searchQuery, statusFilter, latestVersionCode]);

  function openUserDrawer(user) {
    setSelectedDeviceId(user.device_id);
    setProDuration({ amount: 30, unit: 'days' });
    setBanReasonInput(user.ban_reason || '');
    setAdminNoteDraft(user.admin_note || '');
    setUnlockDraft(Array.isArray(user.unlocked_widgets) ? [...user.unlocked_widgets] : []);
    setUnlockDirty(false);
    setUnlockSearch('');
    setDirectTitle('');
    setDirectBody('');
    setDirectDeepLink('');
  }

  function openTargetedPopupModal(user) {
    setPopupTargetUser(user);
    setTpTitle('');
    setTpBody('');
    setTpImageUrl('');
    setTpActionText('');
    setTpDeepLink('');
    setTpMaxShows(1);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      notify(`تم النسخ: ${text}`, 'info');
      setTimeout(() => {
        setCopiedCode((prev) => (prev === text ? '' : prev));
      }, 1800);
    } catch {
      notify('تعذر النسخ التلقائي', 'error');
    }
  }

  async function syncDevice(user) {
    if (user?.fcm_token) {
      await triggerSilentSync({ fcmToken: user.fcm_token });
    } else {
      await triggerSilentSync({ topic: 'all_users' });
    }
  }

  async function handleToggleStar(user) {
    setStarringId(user.device_id);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ is_starred: !user.is_starred })
        .eq('device_id', user.device_id);
      if (error) throw error;
      await onRefresh();
    } catch (err) {
      notify(`تعذر تحديث التمييز: ${err.message}`, 'error');
    } finally {
      setStarringId('');
    }
  }

  async function handleSaveAdminNote(user) {
    setSavingNote(true);
    try {
      const cleanNote = adminNoteDraft.trim() || null;
      const { error } = await supabase
        .from('app_users')
        .update({ admin_note: cleanNote })
        .eq('device_id', user.device_id);
      if (error) throw error;
      notify('تم حفظ الملاحظة الإدارية الخاصة', 'success');
      await onRefresh();
    } catch (err) {
      notify(`تعذر حفظ الملاحظة: ${err.message}`, 'error');
    } finally {
      setSavingNote(false);
    }
  }

  async function handleChangeRole(user, role) {
    if (user.role === role) return;
    setDrawerBusy(true);
    try {
      const patch = { role };
      if (role === 'lab') patch.lab_welcome_pending = true;
      const { error } = await supabase
        .from('app_users')
        .update(patch)
        .eq('device_id', user.device_id);
      if (error) throw error;
      await syncDevice(user);
      notify(`تم تغيير دور ${user.user_code} إلى ${ROLE_META[role]?.label || role}`, 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل تغيير الدور: ${err.message}`, 'error');
    } finally {
      setDrawerBusy(false);
    }
  }

  async function handleGrantPro(user) {
    const spec = computeDurationSpec(proDuration.amount, proDuration.unit);
    setDrawerBusy(true);
    try {
      let expiresAt = null;
      if (spec.totalMinutes > 0) {
        const currentExp = user.pro_expires_at ? new Date(user.pro_expires_at) : null;
        const base =
          user.is_pro && currentExp && currentExp.getTime() > Date.now()
            ? currentExp
            : new Date();
        expiresAt = spec.buildExpiryIso(base);
      }

      const { error } = await supabase
        .from('app_users')
        .update({
          is_pro: true,
          pro_expires_at: expiresAt,
        })
        .eq('device_id', user.device_id);

      if (error) throw error;
      await syncDevice(user);
      notify(`تم تفعيل Pro (${spec.labelAr}) للمستخدم ${user.user_code}`, 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل تفعيل Pro: ${err.message}`, 'error');
    } finally {
      setDrawerBusy(false);
    }
  }

  async function handleRevokePro(user) {
    setDrawerBusy(true);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({
          is_pro: false,
          pro_expires_at: null,
          activated_via_promo: false,
        })
        .eq('device_id', user.device_id);
      if (error) throw error;
      await syncDevice(user);
      notify(`تم إلغاء اشتراك Pro وتصفير حالة البرومو لـ ${user.user_code}`, 'info');
      await onRefresh();
    } catch (err) {
      notify(`فشل إلغاء Pro: ${err.message}`, 'error');
    } finally {
      setDrawerBusy(false);
    }
  }

  function toggleUnlockKey(key) {
    setUnlockDirty(true);
    setUnlockDraft((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function handleSaveUnlockedWidgets(user) {
    setDrawerBusy(true);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ unlocked_widgets: unlockDraft })
        .eq('device_id', user.device_id);
      if (error) throw error;
      await syncDevice(user);
      setUnlockDirty(false);
      notify(`تم حفظ العناصر المفتوحة خصيصاً للهاتف (${unlockDraft.length})`, 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل الحفظ: ${err.message}`, 'error');
    } finally {
      setDrawerBusy(false);
    }
  }

  async function handleSendDirectPush(e, user) {
    e.preventDefault();
    if (!user.fcm_token) {
      notify('لا يوجد FCM Token مسجّل لهذا الهاتف بعد', 'error');
      return;
    }
    if (!directTitle.trim() || !directBody.trim()) {
      notify('يرجى إدخال عنوان ونص الإشعار المباشر', 'error');
      return;
    }

    setSendingDirect(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push', {
        body: {
          fcm_token: user.fcm_token,
          target_label: user.user_code,
          title: directTitle.trim(),
          body: directBody.trim(),
          deep_link: directDeepLink.trim() || null,
        },
      });
      if (error || !data?.ok) {
        throw new Error(error?.message || data?.details || data?.error || 'فشل الإرسال');
      }
      notify(`تم إرسال الإشعار المباشر إلى ${user.user_code}`, 'success');
      setDirectTitle('');
      setDirectBody('');
      setDirectDeepLink('');
      await onRefresh();
    } catch (err) {
      notify(`تعذر إرسال الإشعار المباشر: ${err.message}`, 'error');
    } finally {
      setSendingDirect(false);
    }
  }

  async function handleSendTargetedPopup(e) {
    e.preventDefault();
    if (!popupTargetUser) return;
    if (!tpTitle.trim() || !tpBody.trim()) {
      notify('يرجى إدخال عنوان ونص الرسالة المنبثقة', 'error');
      return;
    }

    setSendingPopup(true);
    try {
      const { error } = await supabase.from('popup_announcements').insert({
        title: tpTitle.trim(),
        body: tpBody.trim(),
        image_url: tpImageUrl.trim() || null,
        action_text: tpActionText.trim() || null,
        deep_link: tpDeepLink.trim() || null,
        action_url: tpDeepLink.trim() || null,
        target_audience: 'specific',
        target_device_ids: [popupTargetUser.device_id],
        max_shows_per_user: Number(tpMaxShows),
        is_active: true,
      });

      if (error) throw error;
      await syncDevice(popupTargetUser);
      notify(`تم إرسال رسالة منبثقة مخصصة إلى ${popupTargetUser.user_code}`, 'success');
      setPopupTargetUser(null);
      await onRefresh();
    } catch (err) {
      notify(`تعذر إنشاء الرسالة المنبثقة: ${err.message}`, 'error');
    } finally {
      setSendingPopup(false);
    }
  }

  async function handleToggleBan(user) {
    setDrawerBusy(true);
    try {
      const nextBan = !user.is_banned;
      const { error } = await supabase
        .from('app_users')
        .update({
          is_banned: nextBan,
          ban_reason: nextBan ? banReasonInput.trim() || 'مخالفة شروط الاستخدام' : null,
        })
        .eq('device_id', user.device_id);
      if (error) throw error;
      await syncDevice(user);
      notify(
        nextBan ? `تم حظر الجهاز ${user.user_code}` : `تم فك الحظر عن ${user.user_code}`,
        nextBan ? 'info' : 'success',
      );
      await onRefresh();
    } catch (err) {
      notify(`فشل تحديث حالة الحظر: ${err.message}`, 'error');
    } finally {
      setDrawerBusy(false);
    }
  }

  async function handleCreatePromo(e) {
    e.preventDefault();
    const cleanCode = promoCodeInput.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanCode) {
      notify('يرجى إدخال كود التفعيل أو توليده تلقائياً', 'error');
      return;
    }

    const spec = computeDurationSpec(promoDur.amount, promoDur.unit);
    setPromoSaving(true);
    try {
      const { error } = await supabase.from('promo_codes').insert({
        code: cleanCode,
        duration_minutes: spec.totalMinutes,
        duration_days: spec.daysCompat,
        max_uses: Math.max(1, Number(promoMaxUses) || 1),
        is_active: true,
      });
      if (error) throw error;
      notify(`تم إنشاء كود التفعيل ${cleanCode} (${spec.labelAr})`, 'success');
      setPromoCodeInput('');
      await onRefresh();
    } catch (err) {
      notify(`تعذر إنشاء الكود: ${err.message}`, 'error');
    } finally {
      setPromoSaving(false);
    }
  }

  async function handleTogglePromoActive(promo) {
    const { error } = await supabase
      .from('promo_codes')
      .update({ is_active: !promo.is_active })
      .eq('code', promo.code);
    if (error) {
      notify(`فشل تحديث حالة الكود: ${error.message}`, 'error');
      return;
    }
    await onRefresh();
  }

  async function confirmDeletePromo() {
    if (!deletePromoTarget) return;
    setDeletingPromo(true);
    try {
      const { error } = await supabase
        .from('promo_codes')
        .delete()
        .eq('code', deletePromoTarget.code);
      if (error) throw error;
      notify(`تم حذف الكود ${deletePromoTarget.code}`, 'success');
      setDeletePromoTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`تعذر حذف الكود: ${err.message}`, 'error');
    } finally {
      setDeletingPromo(false);
    }
  }

  async function confirmDeleteUser() {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    try {
      const { error } = await supabase
        .from('app_users')
        .delete()
        .eq('device_id', deleteUserTarget.device_id);
      if (error) throw error;
      notify(`تم حذف الجهاز ${deleteUserTarget.user_code} نهائياً`, 'success');
      if (selectedDeviceId === deleteUserTarget.device_id) {
        setSelectedDeviceId(null);
      }
      setDeleteUserTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`تعذر حذف الجهاز: ${err.message}`, 'error');
    } finally {
      setDeletingUser(false);
    }
  }

  const FILTER_PILLS = [
    { id: 'all', label: 'الكل', count: filterCounts.all },
    { id: 'starred', label: 'المميزين ★', count: filterCounts.starred },
    { id: 'outdated', label: 'لم يحدّثوا', count: filterCounts.outdated },
    { id: 'pro', label: 'Pro', count: filterCounts.pro },
    { id: 'free', label: 'مجاني', count: filterCounts.free },
    { id: 'promo', label: 'عبر برومو كود', count: filterCounts.promo },
    { id: 'dev', label: 'المطورين', count: filterCounts.dev },
    { id: 'lab', label: 'المختبر', count: filterCounts.lab },
    { id: 'banned', label: 'محظورين', count: filterCounts.banned },
    { id: 'suspicious', label: 'مشبوهين', count: filterCounts.suspicious },
  ];

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>المستخدمين والأكواد</h1>
          <p>تفعيل Pro بالدقيقة والساعة واليوم، تمييز الأجهزة، ملاحظات إدارية خاصة، ورسائل مخصصة</p>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${subTab === 'users' ? ' active' : ''}`}
            onClick={() => setSubTab('users')}
          >
            <Users size={15} />
            المستخدمين ({users.length})
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'promos' ? ' active' : ''}`}
            onClick={() => setSubTab('promos')}
          >
            <Ticket size={15} />
            أكواد التفعيل ({promoCodes.length})
          </button>
        </div>
      </div>

      {subTab === 'users' ? (
        <>
          <div className="glass-panel section-card" style={{ padding: 14 }}>
            <div className="input-with-icon" style={{ marginBottom: 12 }}>
              <span className="input-icon-right">
                <Search size={16} />
              </span>
              <input
                type="search"
                className="input"
                placeholder="ابحث بكود المستخدم (GLF-...) أو نوع الهاتف أو الملاحظة الإدارية..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-strip" style={{ marginBottom: 0 }}>
              {FILTER_PILLS.map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  className={`chip${statusFilter === pill.id ? ' active' : ''}`}
                  onClick={() => setStatusFilter(pill.id)}
                >
                  {pill.label}
                  <span className="chip-count">({pill.count})</span>
                </button>
              ))}
            </div>
          </div>

          {loading && users.length === 0 ? (
            <div className="glass-panel empty-state">
              <Loader2 size={28} className="spinner" />
              <span>جاري تحميل المستخدمين...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <Users size={24} />
              </div>
              <strong>لا يوجد مستخدمون مطابقون لهذا الفلتر</strong>
            </div>
          ) : (
            <div className="cards-grid cols-2">
              {filteredUsers.map((user) => {
                const proInfo = getProStatusInfo(user);
                const roleInfo = ROLE_META[user.role || 'normal'] || ROLE_META.normal;
                const unlockedCount = Array.isArray(user.unlocked_widgets)
                  ? user.unlocked_widgets.length
                  : 0;
                const userVCode = Number(user.app_version_code) || 1;
                const isOutdated = userVCode < latestVersionCode;

                return (
                  <article key={user.device_id} className="glass-panel user-card">
                    <div className="user-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <button
                          type="button"
                          className={`star-btn${user.is_starred ? ' starred' : ''}`}
                          disabled={starringId === user.device_id}
                          onClick={() => handleToggleStar(user)}
                          title={user.is_starred ? 'إزالة من المميزين' : 'تمييز المستخدم (خاص بالإدارة)'}
                          aria-label="تمييز المستخدم"
                        >
                          <Star
                            size={15}
                            fill={user.is_starred ? 'currentColor' : 'none'}
                          />
                        </button>

                        <button
                          type="button"
                          className="user-code-btn"
                          onClick={() => copyText(user.user_code)}
                          title="نسخ كود المستخدم"
                        >
                          {copiedCode === user.user_code ? (
                            <Check size={13} color="var(--emerald)" />
                          ) : (
                            <Copy size={13} />
                          )}
                          {user.user_code}
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        <span className={`badge ${roleInfo.badgeClass}`}>
                          {user.role === 'dev' ? (
                            <Code2 size={11} />
                          ) : user.role === 'lab' ? (
                            <FlaskConical size={11} />
                          ) : (
                            <UserIcon size={11} />
                          )}
                          {roleInfo.label}
                        </span>
                        {proInfo.active ? (
                          <span className="badge badge-amber">
                            <Crown size={11} /> {proInfo.label}
                          </span>
                        ) : (
                          <span className="badge badge-neutral">مجاني</span>
                        )}
                        {proInfo.active && user.activated_via_promo && (
                          <span className="badge badge-sky">برومو</span>
                        )}
                        {isOutdated && (
                          <span className="badge badge-amber">
                            <ArrowUpCircle size={11} /> لم يحدّث
                          </span>
                        )}
                        {user.is_suspicious && (
                          <span className="badge badge-rose">
                            <ShieldAlert size={11} /> مشبوه
                          </span>
                        )}
                        {user.is_banned && (
                          <span className="badge badge-rose">
                            <Ban size={11} /> محظور
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="user-meta-line">
                      <span className="user-meta-item">
                        <Smartphone size={14} />
                        {user.device_model || 'جهاز غير معروف'}
                      </span>
                      <span className="user-meta-item mono">
                        v{user.app_version || '—'} (#{userVCode})
                      </span>
                      <span className="user-meta-item">
                        <Clock size={14} />
                        {formatRelativeTimeAr(user.last_seen_at)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {proInfo.detail && (
                        <span style={{ color: 'var(--amber)' }}>Pro: {proInfo.detail}</span>
                      )}
                      {unlockedCount > 0 && (
                        <span style={{ color: 'var(--text-primary)' }}>
                          • مفتوح خاصاً: {unlockedCount} عنصر
                        </span>
                      )}
                      <span>• FCM: {user.fcm_token ? 'متصل ✓' : 'غير مسجّل'}</span>
                    </div>

                    {user.admin_note && (
                      <div className="admin-note-chip">
                        <StickyNote size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>{user.admin_note}</span>
                      </div>
                    )}

                    {user.is_banned && user.ban_reason && (
                      <div className="alert-banner alert-danger" style={{ padding: '7px 10px', fontSize: '0.77rem' }}>
                        <span>سبب الحظر: {user.ban_reason}</span>
                      </div>
                    )}

                    <div className="user-actions-bar">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => openUserDrawer(user)}
                      >
                        <SlidersHorizontal size={14} />
                        إدارة الجهاز
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openTargetedPopupModal(user)}
                      >
                        <MessageSquareMore size={14} />
                        رسالة منبثقة لهذا الشخص
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteUserTarget(user)}
                        title="حذف الجهاز نهائياً"
                        aria-label={`حذف الجهاز ${user.user_code}`}
                      >
                        <Trash2 size={14} />
                        حذف الجهاز
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Promo Codes Sub-Tab with Flexible Minutes/Hours/Days/Lifetime Picker */
        <>
          <form onSubmit={handleCreatePromo} className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Ticket size={18} color="var(--amber)" />
                إنشاء كود تفعيل جديد (مدة مرنة: دقيقة / ساعة / يوم / مدى الحياة)
              </span>
            </h2>

            <div className="form-grid cols-2" style={{ marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="promo-code">
                  كود التفعيل *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="promo-code"
                    className="input mono"
                    placeholder="VITRIFY30"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    onClick={() => setPromoCodeInput(generateRandomPromoCode('VITRIFY'))}
                    title="توليد كود عشوائي"
                    aria-label="توليد كود عشوائي"
                  >
                    <Wand2 size={16} />
                  </button>
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="promo-max">
                  الحد الأقصى للاستخدام
                </label>
                <input
                  id="promo-max"
                  type="number"
                  min={1}
                  max={100000}
                  className="input mono"
                  value={promoMaxUses}
                  onChange={(e) => setPromoMaxUses(e.target.value)}
                />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 16 }}>
              <span className="field-label">
                مدة الاشتراك الدقيقة
                <span className="badge badge-white">
                  {computeDurationSpec(promoDur.amount, promoDur.unit).labelAr}
                </span>
              </span>
              <DurationPicker
                idPrefix="promo-dur"
                amount={promoDur.amount}
                unit={promoDur.unit}
                onChange={setPromoDur}
                disabled={promoSaving}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={promoSaving}>
                <Plus size={16} />
                {promoSaving ? 'جاري الإنشاء...' : 'إنشاء الكود'}
              </button>
            </div>
          </form>

          {promoCodes.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <Ticket size={24} />
              </div>
              <strong>لا توجد أكواد تفعيل بعد</strong>
            </div>
          ) : (
            <div className="cards-grid cols-2">
              {promoCodes.map((promo) => {
                const ratio = Math.min(
                  100,
                  Math.round(((promo.used_count || 0) / Math.max(1, promo.max_uses)) * 100),
                );
                const exhausted = promo.used_count >= promo.max_uses;

                return (
                  <article key={promo.code} className="glass-panel user-card">
                    <div className="user-card-top">
                      <button
                        type="button"
                        className="user-code-btn"
                        onClick={() => copyText(promo.code)}
                      >
                        {copiedCode === promo.code ? (
                          <Check size={14} color="var(--emerald)" />
                        ) : (
                          <Copy size={14} />
                        )}
                        {promo.code}
                      </button>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="badge badge-amber">
                          <Sparkles size={11} />
                          {formatDurationAr(promo)}
                        </span>
                        {exhausted ? (
                          <span className="badge badge-rose">مكتمل</span>
                        ) : promo.is_active ? (
                          <span className="badge badge-emerald">نشط</span>
                        ) : (
                          <span className="badge badge-neutral">متوقف</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          marginBottom: 6,
                        }}
                      >
                        <span>الاستخدامات</span>
                        <span className="mono">
                          {promo.used_count} / {promo.max_uses}
                        </span>
                      </div>
                      <div className="promo-progress">
                        <div className="promo-progress-fill" style={{ width: `${ratio}%` }} />
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 8,
                        borderTop: '1px solid var(--glass-border)',
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        أُنشئ في {formatShortDateAr(promo.created_at)}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ToggleSwitch
                          checked={promo.is_active}
                          tone="emerald"
                          onChange={() => handleTogglePromoActive(promo)}
                          ariaLabel={`تفعيل الكود ${promo.code}`}
                        />
                        <button
                          type="button"
                          className="btn btn-danger btn-icon"
                          style={{ width: 30, height: 30 }}
                          onClick={() => setDeletePromoTarget(promo)}
                          aria-label={`حذف الكود ${promo.code}`}
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

      {/* Per-User Detail Slide-Over Drawer */}
      {selectedUser && (
        <div
          className="drawer-backdrop"
          onClick={() => setSelectedDeviceId(null)}
        >
          <aside
            className="drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`إدارة المستخدم ${selectedUser.user_code}`}
          >
            <div className="modal-head" style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className={`star-btn${selectedUser.is_starred ? ' starred' : ''}`}
                  onClick={() => handleToggleStar(selectedUser)}
                  title="تمييز المستخدم (خاص بالإدارة)"
                >
                  <Star size={16} fill={selectedUser.is_starred ? 'currentColor' : 'none'} />
                </button>
                <div>
                  <h2 className="mono">{selectedUser.user_code}</h2>
                  <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {selectedUser.device_model || 'جهاز غير معروف'} • v{selectedUser.app_version || '—'} (#{selectedUser.app_version_code || 1})
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setSelectedDeviceId(null)}
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            {/* Admin-Only Private Note */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <StickyNote size={15} color="var(--amber)" />
                  ملاحظة إدارية خاصة (لا تظهر للمستخدم)
                </span>
              </div>
              <textarea
                className="textarea"
                style={{ minHeight: 68, marginBottom: 9 }}
                placeholder="اكتب ملاحظة خاصة عن هذا الشخص (مثل: مؤثر / عميل VIP / متعاون بالمختبر)..."
                value={adminNoteDraft}
                onChange={(e) => setAdminNoteDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={savingNote}
                onClick={() => handleSaveAdminNote(selectedUser)}
              >
                <Save size={14} />
                {savingNote ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
              </button>
            </div>

            {/* 1. Role Switcher */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <div className="field-label" style={{ marginBottom: 9 }}>
                <span>دور الجهاز (Role)</span>
                <span className="badge badge-white">
                  {ROLE_META[selectedUser.role || 'normal']?.label}
                </span>
              </div>
              <div className="segmented" style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  { value: 'normal', label: 'عادي' },
                  { value: 'lab', label: 'مختبر (Lab)' },
                  { value: 'dev', label: 'مطوّر (Dev)' },
                ].map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    disabled={drawerBusy}
                    className={`segmented-btn${(selectedUser.role || 'normal') === r.value ? ' active' : ''}`}
                    style={{ justifyContent: 'center' }}
                    onClick={() => handleChangeRole(selectedUser, r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Flexible Minutes/Hours/Days/Lifetime Pro Activation */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <div className="field-label" style={{ marginBottom: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Crown size={15} color="var(--amber)" />
                  تفعيل Pro بمدة مخصصة
                </span>
                <span className="badge badge-amber">
                  {getProStatusInfo(selectedUser).label}
                </span>
              </div>

              <DurationPicker
                idPrefix="user-pro-dur"
                amount={proDuration.amount}
                unit={proDuration.unit}
                onChange={setProDuration}
                disabled={drawerBusy}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  disabled={drawerBusy}
                  onClick={() => handleGrantPro(selectedUser)}
                >
                  <Crown size={14} />
                  تفعيل ({computeDurationSpec(proDuration.amount, proDuration.unit).labelAr})
                </button>
                {selectedUser.is_pro && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={drawerBusy}
                    onClick={() => handleRevokePro(selectedUser)}
                  >
                    إلغاء Pro
                  </button>
                )}
              </div>
            </div>

            {/* 3. Custom Single-Phone Widget / Depth Tool Unlocks */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <KeyRound size={15} />
                  فتح ويدجيت/أدوات مخصصة لهذا الهاتف فقط
                </span>
                <span className="badge badge-white">{unlockDraft.length} مفتوح</span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="search"
                  className="input"
                  style={{ padding: '8px 11px', fontSize: '0.8rem' }}
                  placeholder="ابحث باسم الويدجيت أو أداة العمق..."
                  value={unlockSearch}
                  onChange={(e) => setUnlockSearch(e.target.value)}
                />
                {unlockDraft.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setUnlockDraft([]);
                      setUnlockDirty(true);
                    }}
                  >
                    مسح الكل
                  </button>
                )}
              </div>

              <div className="unlock-grid">
                {filteredUnlockCatalog.map((item) => {
                  const selected = unlockDraft.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`unlock-item${selected ? ' selected' : ''}`}
                      onClick={() => toggleUnlockKey(item.key)}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </div>
                        <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {item.group} • {item.key}
                        </div>
                      </div>
                      {selected && <Check size={14} style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="btn btn-primary btn-sm btn-block"
                style={{ marginTop: 10 }}
                disabled={drawerBusy || !unlockDirty}
                onClick={() => handleSaveUnlockedWidgets(selectedUser)}
              >
                حفظ العناصر المفتوحة لهذا الهاتف
              </button>
            </div>

            {/* 4. Quick Targeted Pop-up + Direct Single-Device Push */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm btn-block"
                style={{ marginBottom: 14 }}
                onClick={() => openTargetedPopupModal(selectedUser)}
              >
                <MessageSquareMore size={15} />
                إرسال رسالة منبثقة داخل التطبيق لهذا الشخص فقط
              </button>

              <form onSubmit={(e) => handleSendDirectPush(e, selectedUser)} className="form-grid" style={{ gap: 9 }}>
                <div className="field-label">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Send size={15} color="var(--emerald)" />
                    إشعار فوري (FCM) لهذا الهاتف فقط
                  </span>
                  <span className={`badge ${selectedUser.fcm_token ? 'badge-emerald' : 'badge-rose'}`}>
                    {selectedUser.fcm_token ? 'FCM جاهز' : 'لا يوجد Token'}
                  </span>
                </div>

                <input
                  className="input"
                  placeholder="عنوان الإشعار المباشر..."
                  value={directTitle}
                  onChange={(e) => setDirectTitle(e.target.value)}
                  disabled={!selectedUser.fcm_token}
                />
                <textarea
                  className="textarea"
                  style={{ minHeight: 66 }}
                  placeholder="رسالة خاصة لهذا المستخدم فقط..."
                  value={directBody}
                  onChange={(e) => setDirectBody(e.target.value)}
                  disabled={!selectedUser.fcm_token}
                />
                <DeepLinkPicker
                  id="direct-push-deeplink"
                  label="توجيه الإشعار (Deep Link)"
                  value={directDeepLink}
                  onChange={setDirectDeepLink}
                />
                <button
                  type="submit"
                  className="btn btn-emerald btn-sm btn-block"
                  disabled={sendingDirect || !selectedUser.fcm_token}
                >
                  {sendingDirect ? (
                    <>
                      <Loader2 size={14} className="spinner" /> جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Send size={14} /> إرسال إشعار مباشر الآن
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* 5. Ban / Unban */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <div className="field-label" style={{ marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Ban size={15} color="var(--rose)" />
                  الحظر والأمان
                </span>
              </div>
              {!selectedUser.is_banned && (
                <input
                  className="input"
                  style={{ marginBottom: 10 }}
                  placeholder="سبب الحظر (اختياري)..."
                  value={banReasonInput}
                  onChange={(e) => setBanReasonInput(e.target.value)}
                />
              )}
              <button
                type="button"
                className={`btn btn-sm btn-block ${selectedUser.is_banned ? 'btn-emerald' : 'btn-danger-solid'}`}
                disabled={drawerBusy}
                onClick={() => handleToggleBan(selectedUser)}
              >
                {selectedUser.is_banned ? (
                  <>
                    <ShieldCheck size={15} /> فك الحظر عن الجهاز
                  </>
                ) : (
                  <>
                    <Ban size={15} /> حظر الجهاز نهائياً
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn btn-danger btn-sm btn-block"
                style={{ marginTop: 8 }}
                disabled={drawerBusy}
                onClick={() => setDeleteUserTarget(selectedUser)}
              >
                <Trash2 size={15} />
                حذف الجهاز من قاعدة البيانات
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Quick Targeted Single-User Pop-up Modal */}
      {popupTargetUser && (
        <div className="modal-backdrop" onClick={() => setPopupTargetUser(null)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquareMore size={19} />
                رسالة منبثقة مخصصة لـ <span className="mono">{popupTargetUser.user_code}</span>
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setPopupTargetUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendTargetedPopup} className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="tp-title">العنوان *</label>
                <input
                  id="tp-title"
                  className="input"
                  placeholder="مثال: هدية خاصة لحسابك!"
                  value={tpTitle}
                  onChange={(e) => setTpTitle(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="tp-body">نص الرسالة *</label>
                <textarea
                  id="tp-body"
                  className="textarea"
                  placeholder="تظهر هذه الرسالة المنبثقة لهذا الجهاز فقط..."
                  value={tpBody}
                  onChange={(e) => setTpBody(e.target.value)}
                  required
                />
              </div>

              <div className="form-grid cols-2">
                <div className="field">
                  <label className="field-label" htmlFor="tp-shows">عدد مرات الظهور</label>
                  <select
                    id="tp-shows"
                    className="select"
                    value={tpMaxShows}
                    onChange={(e) => setTpMaxShows(Number(e.target.value))}
                  >
                    {MAX_SHOWS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="tp-btn">نص الزر (اختياري)</label>
                  <input
                    id="tp-btn"
                    className="input"
                    placeholder="حسناً / افتح الآن"
                    value={tpActionText}
                    onChange={(e) => setTpActionText(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="tp-img">رابط صورة (اختياري)</label>
                <input
                  id="tp-img"
                  type="url"
                  className="input ltr"
                  placeholder="https://..."
                  value={tpImageUrl}
                  onChange={(e) => setTpImageUrl(e.target.value)}
                />
              </div>

              <DeepLinkPicker
                id="tp-deeplink"
                label="توجيه الزر (Deep Link)"
                value={tpDeepLink}
                onChange={setTpDeepLink}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={sendingPopup}
                  onClick={() => setPopupTargetUser(null)}
                >
                  إلغاء
                </button>
                <button type="submit" className="btn btn-primary" disabled={sendingPopup}>
                  {sendingPopup ? 'جاري النشر...' : 'إرسال الرسالة المنبثقة الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteUserTarget)}
        title="حذف الجهاز"
        message={`هل أنت متأكد من حذف الجهاز "${deleteUserTarget?.user_code || ''}" (${deleteUserTarget?.device_model || 'جهاز غير معروف'}) نهائياً من قاعدة البيانات؟`}
        confirmText="حذف الجهاز"
        busy={deletingUser}
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteUserTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deletePromoTarget)}
        title="حذف كود التفعيل"
        message={`هل تريد حذف الكود "${deletePromoTarget?.code || ''}" نهائياً؟`}
        busy={deletingPromo}
        onConfirm={confirmDeletePromo}
        onCancel={() => setDeletePromoTarget(null)}
      />
    </section>
  );
}
