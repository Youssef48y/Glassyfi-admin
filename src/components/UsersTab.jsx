import { useMemo, useState } from 'react';
import {
  Users,
  Ticket,
  Search,
  Crown,
  Ban,
  ShieldCheck,
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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  formatRelativeTimeAr,
  formatShortDateAr,
  generateRandomPromoCode,
  getProStatusInfo,
} from '../lib/formatters';
import { ToggleSwitch } from './ToggleSwitch';
import { ConfirmDialog } from './ConfirmDialog';

const PRO_DURATIONS = [
  { label: '7 أيام', days: 7 },
  { label: '30 يوم', days: 30 },
  { label: '90 يوم', days: 90 },
  { label: 'سنة (365 يوم)', days: 365 },
  { label: 'مدى الحياة', days: 0 },
];

export function UsersTab({ users, promoCodes, loading, onRefresh, notify }) {
  const [subTab, setSubTab] = useState('users'); // 'users' | 'promos'

  // Users filter & actions
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pro' | 'free' | 'banned'
  const [proModalUser, setProModalUser] = useState(null);
  const [selectedDays, setSelectedDays] = useState(30);
  const [banModalUser, setBanModalUser] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');

  // Promo code form
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoDuration, setPromoDuration] = useState(30);
  const [promoMaxUses, setPromoMaxUses] = useState(1);
  const [promoSaving, setPromoSaving] = useState(false);
  const [deletePromoTarget, setDeletePromoTarget] = useState(null);
  const [deletingPromo, setDeletingPromo] = useState(false);

  const stats = useMemo(() => {
    let pro = 0;
    let banned = 0;
    users.forEach((u) => {
      if (getProStatusInfo(u).active) pro += 1;
      if (u.is_banned) banned += 1;
    });
    return { total: users.length, pro, banned };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      const proInfo = getProStatusInfo(u);
      if (statusFilter === 'pro' && !proInfo.active) return false;
      if (statusFilter === 'free' && (proInfo.active || u.is_banned)) return false;
      if (statusFilter === 'banned' && !u.is_banned) return false;

      if (q) {
        const matchCode = (u.user_code || '').toLowerCase().includes(q);
        const matchModel = (u.device_model || '').toLowerCase().includes(q);
        const matchDevice = (u.device_id || '').toLowerCase().includes(q);
        if (!matchCode && !matchModel && !matchDevice) return false;
      }
      return true;
    });
  }, [users, searchQuery, statusFilter]);

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(text);
      notify(`تم نسخ الكود: ${text}`, 'info');
      setTimeout(() => {
        setCopiedCode((prev) => (prev === text ? '' : prev));
      }, 1800);
    } catch {
      notify('تعذر النسخ التلقائي', 'error');
    }
  }

  async function handleGrantPro() {
    if (!proModalUser) return;
    setActionBusy(true);
    try {
      let expiresAt = null;
      if (selectedDays > 0) {
        const currentExp = proModalUser.pro_expires_at
          ? new Date(proModalUser.pro_expires_at)
          : null;
        const base =
          proModalUser.is_pro && currentExp && currentExp.getTime() > Date.now()
            ? currentExp
            : new Date();
        expiresAt = new Date(base.getTime() + selectedDays * 86400 * 1000).toISOString();
      }

      const { error } = await supabase
        .from('app_users')
        .update({
          is_pro: true,
          pro_expires_at: expiresAt,
        })
        .eq('device_id', proModalUser.device_id);

      if (error) throw error;
      notify(
        selectedDays === 0
          ? `تم تفعيل Pro مدى الحياة للمستخدم ${proModalUser.user_code}`
          : `تم تفعيل Pro لمدة ${selectedDays} يوم للمستخدم ${proModalUser.user_code}`,
        'success',
      );
      setProModalUser(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل تفعيل Pro: ${err.message}`, 'error');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRevokePro(user) {
    setActionBusy(true);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ is_pro: false, pro_expires_at: null })
        .eq('device_id', user.device_id);
      if (error) throw error;
      notify(`تم إلغاء اشتراك Pro للمستخدم ${user.user_code}`, 'info');
      await onRefresh();
    } catch (err) {
      notify(`فشل إلغاء Pro: ${err.message}`, 'error');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleConfirmBan(e) {
    e.preventDefault();
    if (!banModalUser) return;
    setActionBusy(true);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({
          is_banned: true,
          ban_reason: banReason.trim() || 'مخالفة شروط الاستخدام',
        })
        .eq('device_id', banModalUser.device_id);
      if (error) throw error;
      notify(`تم حظر المستخدم ${banModalUser.user_code}`, 'info');
      setBanModalUser(null);
      setBanReason('');
      await onRefresh();
    } catch (err) {
      notify(`فشل حظر المستخدم: ${err.message}`, 'error');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnban(user) {
    setActionBusy(true);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ is_banned: false, ban_reason: null })
        .eq('device_id', user.device_id);
      if (error) throw error;
      notify(`تم فك الحظر عن ${user.user_code}`, 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل فك الحظر: ${err.message}`, 'error');
    } finally {
      setActionBusy(false);
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

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>المستخدمين والأكواد</h1>
          <p>تفعيل Pro يدوياً، الحظر، وإنشاء أكواد التفعيل الترويجية</p>
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
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">إجمالي الأجهزة</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">مشتركو Pro</div>
              <div className="stat-value" style={{ color: 'var(--gold)' }}>
                {stats.pro}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">المحظورون</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>
                {stats.banned}
              </div>
            </div>
          </div>

          <div className="glass-panel section-card" style={{ padding: 14 }}>
            <div className="form-grid cols-2" style={{ alignItems: 'center' }}>
              <div className="input-with-icon">
                <span className="input-icon-right">
                  <Search size={16} />
                </span>
                <input
                  type="search"
                  className="input"
                  placeholder="ابحث بكود المستخدم (GLF-...) أو نوع الجهاز..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-strip" style={{ marginBottom: 0 }}>
                {[
                  { id: 'all', label: 'الكل' },
                  { id: 'pro', label: 'Pro فقط' },
                  { id: 'free', label: 'مجاني' },
                  { id: 'banned', label: 'محظور' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`chip${statusFilter === f.id ? ' active' : ''}`}
                    onClick={() => setStatusFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading && users.length === 0 ? (
            <div className="glass-panel empty-state">
              <Loader2 size={28} className="spinner" color="var(--accent)" />
              <span>جاري تحميل المستخدمين...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="glass-panel empty-state">
              <div className="empty-icon">
                <Users size={24} />
              </div>
              <strong>لا يوجد مستخدمون مطابقون حالياً</strong>
              <span style={{ fontSize: '0.84rem' }}>
                سيظهر المستخدمون هنا تلقائياً فور فتح تطبيق Glassyfi ومزامنة أجهزتهم.
              </span>
            </div>
          ) : (
            <div className="cards-grid cols-2">
              {filteredUsers.map((user) => {
                const proInfo = getProStatusInfo(user);
                return (
                  <article key={user.device_id} className="glass-panel user-card">
                    <div className="user-card-top">
                      <button
                        type="button"
                        className="user-code-btn"
                        onClick={() => copyText(user.user_code)}
                        title="اضغط لنسخ كود المستخدم"
                      >
                        {copiedCode === user.user_code ? (
                          <Check size={14} color="var(--emerald)" />
                        ) : (
                          <Copy size={14} />
                        )}
                        {user.user_code}
                      </button>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {proInfo.active ? (
                          <span className="badge badge-gold">
                            <Crown size={12} /> {proInfo.label}
                          </span>
                        ) : (
                          <span className="badge badge-neutral">{proInfo.label}</span>
                        )}
                        {user.is_banned && (
                          <span className="badge badge-danger">
                            <Ban size={12} /> محظور
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
                        v{user.app_version || '—'}
                      </span>
                      <span className="user-meta-item">
                        <Clock size={14} />
                        آخر ظهور: {formatRelativeTimeAr(user.last_seen_at)}
                      </span>
                    </div>

                    {proInfo.detail && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gold)' }}>
                        صلاحية Pro: {proInfo.detail}
                      </div>
                    )}

                    {user.is_banned && user.ban_reason && (
                      <div className="alert-banner alert-danger" style={{ padding: '8px 11px', fontSize: '0.78rem' }}>
                        <span>سبب الحظر: {user.ban_reason}</span>
                      </div>
                    )}

                    <div className="user-actions-bar">
                      <button
                        type="button"
                        className="btn btn-gold btn-sm"
                        disabled={actionBusy}
                        onClick={() => {
                          setSelectedDays(30);
                          setProModalUser(user);
                        }}
                      >
                        <Crown size={14} />
                        {proInfo.active ? 'تمديد Pro' : 'تفعيل Pro'}
                      </button>

                      {user.is_pro && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={actionBusy}
                          onClick={() => handleRevokePro(user)}
                        >
                          إلغاء Pro
                        </button>
                      )}

                      {user.is_banned ? (
                        <button
                          type="button"
                          className="btn btn-emerald btn-sm"
                          disabled={actionBusy}
                          onClick={() => handleUnban(user)}
                        >
                          <ShieldCheck size={14} />
                          فك الحظر
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={actionBusy}
                          onClick={() => {
                            setBanReason('');
                            setBanModalUser(user);
                          }}
                        >
                          <Ban size={14} />
                          حظر
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Promo Codes Sub-section */
        <>
          <form onSubmit={handleCreatePromo} className="glass-panel section-card">
            <h2 className="section-heading">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Ticket size={18} color="var(--gold)" />
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
              <span style={{ fontSize: '0.84rem' }}>
                أنشئ كوداً من النموذج أعلاه وشاركه مع المستخدمين لتفعيل Pro تلقائياً.
              </span>
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-gold">
                          <Sparkles size={11} />
                          {promo.duration_days === 0
                            ? 'مدى الحياة'
                            : `${promo.duration_days} يوم`}
                        </span>
                        {exhausted ? (
                          <span className="badge badge-danger">مكتمل</span>
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
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
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
                          style={{ width: 32, height: 32 }}
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

      {/* Grant Pro Modal */}
      {proModalUser && (
        <div className="modal-backdrop" onClick={() => setProModalUser(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Crown size={20} color="var(--gold)" />
                تفعيل Pro للمستخدم
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setProModalUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              اختر مدة التفعيل للحساب{' '}
              <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                {proModalUser.user_code}
              </strong>
              :
            </p>

            <div className="form-grid cols-2" style={{ marginBottom: 20 }}>
              {PRO_DURATIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  className={`btn ${selectedDays === opt.days ? 'btn-gold' : 'btn-secondary'}`}
                  style={opt.days === 0 ? { gridColumn: '1 / -1' } : undefined}
                  onClick={() => setSelectedDays(opt.days)}
                >
                  {opt.days === 0 && <Crown size={15} />}
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={actionBusy}
                onClick={() => setProModalUser(null)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionBusy}
                onClick={handleGrantPro}
              >
                {actionBusy ? 'جاري التفعيل...' : 'تأكيد التفعيل'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban User Modal */}
      {banModalUser && (
        <div className="modal-backdrop" onClick={() => setBanModalUser(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-head">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Ban size={20} color="var(--danger)" />
                حظر المستخدم
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setBanModalUser(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmBan} className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="ban-reason">
                  سبب الحظر (يظهر للمستخدم في التطبيق)
                </label>
                <textarea
                  id="ban-reason"
                  className="textarea"
                  placeholder="مثال: استخدام نسخة معدّلة أو مخالفة الشروط"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionBusy}
                  onClick={() => setBanModalUser(null)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-danger-solid"
                  disabled={actionBusy}
                >
                  {actionBusy ? 'جاري الحظر...' : 'تأكيد الحظر'}
                </button>
              </div>
            </form>
          </div>
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
