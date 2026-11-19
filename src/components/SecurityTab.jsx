import { useMemo, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Ban,
  CheckCircle2,
  Smartphone,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { supabase, triggerSilentSync } from '../lib/supabase';
import { formatDateAr, formatRelativeTimeAr } from '../lib/formatters';

function severityMeta(sev) {
  const s = String(sev || 'high').toLowerCase();
  if (s === 'critical') return { label: 'حرج Critical', cls: 'badge-rose' };
  if (s === 'high') return { label: 'عالي High', cls: 'badge-rose' };
  if (s === 'medium') return { label: 'متوسط Medium', cls: 'badge-amber' };
  return { label: 'منخفض Low', cls: 'badge-neutral' };
}

export function SecurityTab({ securityAlerts, users, onRefresh, notify }) {
  const [filter, setFilter] = useState('unresolved'); // 'unresolved' | 'all' | 'resolved'
  const [busyId, setBusyId] = useState('');

  const suspiciousUsers = useMemo(
    () => users.filter((u) => u.is_suspicious),
    [users],
  );

  const filteredAlerts = useMemo(() => {
    if (filter === 'unresolved') return securityAlerts.filter((a) => !a.resolved);
    if (filter === 'resolved') return securityAlerts.filter((a) => a.resolved);
    return securityAlerts;
  }, [securityAlerts, filter]);

  const unresolvedCount = securityAlerts.filter((a) => !a.resolved).length;
  const criticalCount = securityAlerts.filter(
    (a) => !a.resolved && (a.severity === 'high' || a.severity === 'critical'),
  ).length;

  async function handleBanFromAlert(alert) {
    setBusyId(alert.id);
    try {
      const { data: userRow, error: banErr } = await supabase
        .from('app_users')
        .update({
          is_banned: true,
          ban_reason: `تنبيه أمني: ${alert.reason}`,
          is_suspicious: true,
          suspicious_reason: alert.reason,
        })
        .eq('device_id', alert.device_id)
        .select('fcm_token')
        .maybeSingle();

      if (banErr) throw banErr;

      await supabase
        .from('security_alerts')
        .update({ resolved: true })
        .eq('device_id', alert.device_id);

      if (userRow?.fcm_token) {
        triggerSilentSync({ fcmToken: userRow.fcm_token });
      }

      notify(`تم حظر الجهاز ${alert.user_code || alert.device_id} فورياً`, 'info');
      await onRefresh();
    } catch (err) {
      notify(`فشل الحظر: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function handleDismissAlert(alert) {
    setBusyId(alert.id);
    try {
      const { error } = await supabase
        .from('security_alerts')
        .update({ resolved: true })
        .eq('id', alert.id);
      if (error) throw error;

      // Clear suspicious flag on user if no other unresolved alerts remain
      const otherActive = securityAlerts.some(
        (a) => a.device_id === alert.device_id && a.id !== alert.id && !a.resolved,
      );
      if (!otherActive) {
        await supabase
          .from('app_users')
          .update({ is_suspicious: false, suspicious_reason: null })
          .eq('device_id', alert.device_id);
      }

      notify('تمت مراجعة التنبيه وإغلاقه', 'success');
      await onRefresh();
    } catch (err) {
      notify(`تعذر إغلاق التنبيه: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function handleClearSuspiciousUser(user) {
    setBusyId(user.device_id);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({ is_suspicious: false, suspicious_reason: null })
        .eq('device_id', user.device_id);
      if (error) throw error;
      notify(`تمت إزالة علامة الاشتباه عن ${user.user_code}`, 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل التحديث: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function handleBanSuspiciousUser(user) {
    setBusyId(user.device_id);
    try {
      const { error } = await supabase
        .from('app_users')
        .update({
          is_banned: true,
          ban_reason: user.suspicious_reason || 'نشاط أمني مشبوه',
        })
        .eq('device_id', user.device_id);
      if (error) throw error;
      if (user.fcm_token) triggerSilentSync({ fcmToken: user.fcm_token });
      notify(`تم حظر الجهاز ${user.user_code}`, 'info');
      await onRefresh();
    } catch (err) {
      notify(`فشل الحظر: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الحماية والمشبوهين</h1>
          <p>مراقبة محاولات التلاعب، التهكير أو التعديل وحظر الأجهزة المشبوهة بضغطة واحدة</p>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${filter === 'unresolved' ? ' active' : ''}`}
            onClick={() => setFilter('unresolved')}
          >
            نشطة ({unresolvedCount})
          </button>
          <button
            type="button"
            className={`segmented-btn${filter === 'all' ? ' active' : ''}`}
            onClick={() => setFilter('all')}
          >
            الكل ({securityAlerts.length})
          </button>
          <button
            type="button"
            className={`segmented-btn${filter === 'resolved' ? ' active' : ''}`}
            onClick={() => setFilter('resolved')}
          >
            تمت المراجعة ({securityAlerts.length - unresolvedCount})
          </button>
        </div>
      </div>

      {/* Security Summary KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">تنبيهات بانتظار الإجراء</span>
            <span className="kpi-icon" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
              <ShieldAlert size={18} />
            </span>
          </div>
          <div className="kpi-value" style={{ color: unresolvedCount > 0 ? 'var(--rose)' : 'var(--emerald)' }}>
            {unresolvedCount}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">خطورة عالية / حرجة</span>
            <span className="kpi-icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
              <AlertTriangle size={18} />
            </span>
          </div>
          <div className="kpi-value" style={{ color: criticalCount > 0 ? 'var(--amber)' : 'var(--text-primary)' }}>
            {criticalCount}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">أجهزة موسومة كمشبوهة</span>
            <span className="kpi-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              <Smartphone size={18} />
            </span>
          </div>
          <div className="kpi-value">{suspiciousUsers.length}</div>
        </div>
      </div>

      {/* Live Alerts List */}
      {filteredAlerts.length === 0 ? (
        <div className="glass-panel empty-state" style={{ marginBottom: 20 }}>
          <div className="empty-icon" style={{ color: 'var(--emerald)' }}>
            <ShieldCheck size={26} />
          </div>
          <strong>الوضع الأمني سليم — لا توجد تنبيهات في هذا العرض</strong>
          <span style={{ fontSize: '0.82rem' }}>
            أي محاولة تلاعب يبلغ عنها التطبيق عبر `report_security_event` ستظهر هنا فوراً.
          </span>
        </div>
      ) : (
        <div className="cards-grid cols-2" style={{ marginBottom: 22 }}>
          {filteredAlerts.map((alert) => {
            const sev = severityMeta(alert.severity);
            const matchedUser = users.find((u) => u.device_id === alert.device_id);
            const alreadyBanned = Boolean(matchedUser?.is_banned);

            return (
              <article key={alert.id} className="glass-panel user-card">
                <div className="user-card-top">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span className={`badge ${sev.cls}`}>{sev.label}</span>
                    {alert.user_code && (
                      <span className="badge badge-indigo mono">{alert.user_code}</span>
                    )}
                    {alert.resolved && (
                      <span className="badge badge-emerald">تمت المراجعة</span>
                    )}
                    {alreadyBanned && <span className="badge badge-rose">محظور</span>}
                  </div>
                  <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    {formatRelativeTimeAr(alert.created_at)}
                  </span>
                </div>

                <div>
                  <strong style={{ fontSize: '0.96rem', color: 'var(--rose)' }}>
                    {alert.reason}
                  </strong>
                  {alert.details && (
                    <p style={{ margin: '5px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {alert.details}
                    </p>
                  )}
                </div>

                <div className="user-meta-line">
                  <span className="user-meta-item">
                    <Smartphone size={14} /> {alert.device_model || 'غير معروف'}
                  </span>
                  <span className="user-meta-item mono" style={{ fontSize: '0.73rem' }}>
                    ID: {alert.device_id}
                  </span>
                  <span className="user-meta-item">
                    <Clock size={13} /> {formatDateAr(alert.created_at)}
                  </span>
                </div>

                {!alert.resolved && (
                  <div className="user-actions-bar">
                    <button
                      type="button"
                      className="btn btn-danger-solid btn-sm"
                      disabled={busyId === alert.id}
                      onClick={() => handleBanFromAlert(alert)}
                    >
                      <Ban size={14} />
                      {alreadyBanned ? 'تأكيد الحظر وإغلاق' : 'حظر الجهاز'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === alert.id}
                      onClick={() => handleDismissAlert(alert)}
                    >
                      <CheckCircle2 size={14} />
                      تجاهل / تمت المراجعة
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Suspicious Flagged Devices Summary */}
      {suspiciousUsers.length > 0 && (
        <div className="glass-panel section-card" style={{ marginBottom: 0 }}>
          <h2 className="section-heading">
            <span>الأجهزة الموسومة كمشبوهة حالياً ({suspiciousUsers.length})</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {suspiciousUsers.map((u) => (
              <div
                key={u.device_id}
                className="glass-subcard"
                style={{
                  padding: '11px 14px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <strong className="mono">{u.user_code}</strong>{' '}
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    • {u.device_model || 'جهاز غير معروف'}
                  </span>
                  <div style={{ fontSize: '0.78rem', color: 'var(--rose)', marginTop: 2 }}>
                    السبب: {u.suspicious_reason || 'نشاط غير طبيعي'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  {!u.is_banned && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === u.device_id}
                      onClick={() => handleBanSuspiciousUser(u)}
                    >
                      <Ban size={13} /> حظر
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === u.device_id}
                    onClick={() => handleClearSuspiciousUser(u)}
                  >
                    <ShieldCheck size={13} /> إزالة الاشتباه
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
