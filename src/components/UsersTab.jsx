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
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import {
  formatRelativeTimeAr,
  formatShortDateAr,
  generateRandomPromoCode,
  getProStatusInfo,
} from '../lib/formatters';
import { ROLE_META } from '../lib/constants';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';
import { DeepLinkPicker } from './DeepLinkPicker';

const PRO_DURATIONS = [
  { label: '7 أيام', days: 7 },
  { label: '30 يوم', days: 30 },
  { label: '90 يوم', days: 90 },
  { label: 'سنة (365 يوم)', days: 365 },
  { label: 'مدى الحياة', days: 0 },
];

export function UsersTab({
  users,
  promoCodes,
  widgets,
  depthTools,
  loading,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('users'); // 'users' | 'promos'

  // Users Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copiedCode, setCopiedCode] = useState('');

  // Selected user drawer state
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [proDays, setProDays] = useState(30);
  const [banReasonInput, setBanReasonInput] = useState('');
  const [unlockSearch, setUnlockSearch] = useState('');
  const [unlockDraft, setUnlockDraft] = useState([]);
  const [unlockDirty, setUnlockDirty] = useState(false);

  // Direct Push form inside drawer
  const [directTitle, setDirectTitle] = useState('');
  const [directBody, setDirectBody] = useState('');
  const [directDeepLink, setDirectDeepLink] = useState('');
  const [sendingDirect, setSendingDirect] = useState(false);
  const [drawerBusy, setDrawerBusy] = useState(false);

  // Promo code form
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoDuration, setPromoDuration] = useState(30);
  const [promoMaxUses, setPromoMaxUses] = useState(1);
  const [promoSaving, setPromoSaving] = useState(false);
  const [deletePromoTarget, setDeletePromoTarget] = useState(null);
  const [deletingPromo, setDeletingPromo] = useState(false);

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
      if (proActive) counts.pro += 1;
      if (!proActive && !u.is_banned) counts.free += 1;
      if (u.activated_via_promo) counts.promo += 1;
      if (u.role === 'dev') counts.dev += 1;
      if (u.role === 'lab') counts.lab += 1;
      if (u.is_banned) counts.banned += 1;
      if (u.is_suspicious) counts.suspicious += 1;
    });
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      const proActive = getProStatusInfo(u).active;
      if (statusFilter === 'pro' && !proActive) return false;
      if (statusFilter === 'free' && (proActive || u.is_banned)) return false;
      if (statusFilter === 'promo' && !u.activated_via_promo) return false;
      if (statusFilter === 'dev' && u.role !== 'dev') return false;
      if (statusFilter === 'lab' && u.role !== 'lab') return false;
      if (statusFilter === 'banned' && !u.is_banned) return false;
      if (statusFilter === 'suspicious' && !u.is_suspicious) return false;

      if (q) {
        const matchCode = (u.user_code || '').toLowerCase().includes(q);
        const matchModel = (u.device_model || '').toLowerCase().includes(q);
        const matchDevice = (u.device_id || '').toLowerCase().includes(q);
        if (!matchCode && !matchModel && !matchDevice) return false;
      }
      return true;
    });
  }, [users, searchQuery, statusFilter]);

  function openUserDrawer(user) {
    setSelectedDeviceId(user.device_id);
    setProDays(30);
    setBanReasonInput(user.ban_reason || '');
    setUnlockDraft(Array.isArray(user.unlocked_widgets) ? [...user.unlocked_widgets] : []);
    setUnlockDirty(false);
    setUnlockSearch('');
    setDirectTitle('');
    setDirectBody('');
    setDirectDeepLink('');
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

  async function syncDeviceIfPossible(user) {
    if (user?.fcm_token) {
      await triggerSilentSync({ fcmToken: user.fcm_token });
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
      await syncDeviceIfPossible(user);
      notify(`تم تغيير دور ${user.user_code} إلى ${ROLE_META[role]?.label || role}`, 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل تغيير الدور: ${err.message}`, 'error');
    } finally {
      setDrawerBusy(false);
    }
  }

  async function handleGrantPro(user) {
    setDrawerBusy(true);
    try {
      let expiresAt = null;
      if (proDays > 0) {
        const currentExp = user.pro_expires_at ? new Date(user.pro_expires_at) : null;
        const base =
          user.is_pro && currentExp && currentExp.getTime() > Date.now()
            ? currentExp
            : new Date();
        expiresAt = new Date(base.getTime() + proDays * 86400 * 1000).toISOString();
      }

      const { error } = await supabase
        .from('app_users')
        .update({ is_pro: true, pro_expires_at: expiresAt })
        .eq('device_id', user.device_id);

      if (error) throw error;
      await syncDeviceIfPossible(user);
      notify(
        proDays === 0
          ? `تم تفعيل Pro مدى الحياة لـ ${user.user_code}`
          : `تم تفعيل Pro لمدة ${proDays} يوم لـ ${user.user_code}`,
        'success',
      );
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
        .update({ is_pro: false, pro_expires_at: null })
        .eq('device_id', user.device_id);
      if (error) throw error;
      await syncDeviceIfPossible(user);
      notify(`تم إلغاء اشتراك Pro لـ ${user.user_code}`, 'info');
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
      await syncDeviceIfPossible(user);
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
      await syncDeviceIfPossible(user);
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

    setPromoSaving(true);
    try {
      const { error } = await supabase.from('promo_codes').insert({
        code: cleanCode,
        duration_days: Number(promoDuration),
        max_uses: Math.max(1, Number(promoMaxUses) || 1),
        is_active: true,
      });
      if (error) throw error;
      notify(`تم إنشاء كود التفعيل ${cleanCode}`, 'success');
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

  const FILTER_PILLS = [
    { id: 'all', label: 'الكل', count: filterCounts.all },
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
          <p>إدارة أدوار المطورين والمختبر، تفعيل Pro، فتح ويدجيت لهاتف واحد، وإشعارات مباشرة</p>
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
                placeholder="ابحث بكود المستخدم (GLF-...) أو نوع الهاتف أو معرّف الجهاز..."
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
              <Loader2 size={28} className="spinner" color="var(--primary)" />
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

                return (
                  <article key={user.device_id} className="glass-panel user-card">
                    <div className="user-card-top">
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
                        {user.activated_via_promo && (
                          <span className="badge badge-sky">برومو</span>
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
                      <span className="user-meta-item mono">v{user.app_version || '—'}</span>
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
                        <span style={{ color: 'var(--primary)' }}>
                          • مفتوح خاصاً: {unlockedCount} عنصر
                        </span>
                      )}
                      <span>• FCM: {user.fcm_token ? 'متصل ✓' : 'غير مسجّل'}</span>
                    </div>

                    {user.is_banned && user.ban_reason && (
                      <div className="alert-banner alert-danger" style={{ padding: '7px 10px', fontSize: '0.77rem' }}>
                        <span>سبب الحظر: {user.ban_reason}</span>
                      </div>
                    )}

                    <div className="user-actions-bar">
                      <button
                        type="button"
                        className="btn btn-indigo btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => openUserDrawer(user)}
                      >
                        <SlidersHorizontal size={14} />
                        إدارة الجهاز والصلاحيات
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Promo Codes Sub-Tab */
        <>
          <form onSubmit={handleCreatePromo} className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Ticket size={18} color="var(--amber)" />
                إنشاء كود تفعيل جديد
              </span>
            </h2>

            <div className="form-grid cols-3" style={{ marginBottom: 14 }}>
              <div className="field">
                <label className="field-label" htmlFor="promo-code">
                  كود التفعيل *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="promo-code"
                    className="input mono"
                    placeholder="GLASSY30"
                    value={promoCodeInput}
                    onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    onClick={() => setPromoCodeInput(generateRandomPromoCode('GLASSY'))}
                    title="توليد كود عشوائي"
                    aria-label="توليد كود عشوائي"
                  >
                    <Wand2 size={16} />
                  </button>
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="promo-days">
                  مدة الاشتراك
                </label>
                <select
                  id="promo-days"
                  className="select"
                  value={promoDuration}
                  onChange={(e) => setPromoDuration(Number(e.target.value))}
                >
                  <option value={7}>7 أيام</option>
                  <option value={30}>30 يوم (شهر)</option>
                  <option value={90}>90 يوم (3 شهور)</option>
                  <option value={180}>180 يوم (6 شهور)</option>
                  <option value={365}>365 يوم (سنة)</option>
                  <option value={0}>مدى الحياة (0)</option>
                </select>
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
                          {promo.duration_days === 0
                            ? 'مدى الحياة'
                            : `${promo.duration_days} يوم`}
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
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono">{selectedUser.user_code}</span>
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  {selectedUser.device_model || 'جهاز غير معروف'} • v{selectedUser.app_version || '—'}
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

            {/* 1. Role Switcher */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <div className="field-label" style={{ marginBottom: 9 }}>
                <span>دور الجهاز (Role)</span>
                <span className="badge badge-indigo">
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

            {/* 2. Timed Pro Controls */}
            <div className="glass-subcard" style={{ padding: 14 }}>
              <div className="field-label" style={{ marginBottom: 9 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Crown size={15} color="var(--amber)" />
                  اشتراك Pro المحدد المدة
                </span>
                <span className="badge badge-amber">
                  {getProStatusInfo(selectedUser).label}
                </span>
              </div>

              <div className="form-grid cols-2" style={{ gap: 7, marginBottom: 10 }}>
                {PRO_DURATIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    className={`btn btn-sm ${proDays === opt.days ? 'btn-amber' : 'btn-secondary'}`}
                    style={opt.days === 0 ? { gridColumn: '1 / -1' } : undefined}
                    onClick={() => setProDays(opt.days)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  disabled={drawerBusy}
                  onClick={() => handleGrantPro(selectedUser)}
                >
                  <Crown size={14} />
                  تفعيل / تمديد Pro
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
                  <KeyRound size={15} color="var(--primary)" />
                  فتح ويدجيت/أدوات مخصصة لهذا الهاتف فقط
                </span>
                <span className="badge badge-indigo">{unlockDraft.length} مفتوح</span>
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
                      {selected && <Check size={14} color="var(--primary)" style={{ flexShrink: 0 }} />}
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

            {/* 4. Direct Single-Device Push Notification */}
            <form
              onSubmit={(e) => handleSendDirectPush(e, selectedUser)}
              className="glass-subcard"
              style={{ padding: 14 }}
            >
              <div className="field-label" style={{ marginBottom: 10 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Send size={15} color="var(--emerald)" />
                  إرسال إشعار مباشر لهذا الهاتف فقط
                </span>
                <span className={`badge ${selectedUser.fcm_token ? 'badge-emerald' : 'badge-rose'}`}>
                  {selectedUser.fcm_token ? 'FCM جاهز' : 'لا يوجد Token'}
                </span>
              </div>

              <div className="form-grid" style={{ gap: 9 }}>
                <input
                  className="input"
                  placeholder="عنوان الإشعار المباشر..."
                  value={directTitle}
                  onChange={(e) => setDirectTitle(e.target.value)}
                  disabled={!selectedUser.fcm_token}
                />
                <textarea
                  className="textarea"
                  style={{ minHeight: 68 }}
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
              </div>
            </form>

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
            </div>
          </aside>
        </div>
      )}

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
