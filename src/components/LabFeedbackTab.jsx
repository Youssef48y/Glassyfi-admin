import { useMemo, useState } from 'react';
import {
  FlaskConical,
  Bug,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Smartphone,
  Phone,
  Clock,
  Trash2,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { supabase, extractEdgeFunctionError } from '../lib/supabase';
import { formatDateAr, formatRelativeTimeAr } from '../lib/formatters';
import { ConfirmDialog } from './ConfirmDialog';

export function LabFeedbackTab({
  labApplications,
  userFeedback,
  users,
  onRefresh,
  notify,
}) {
  const [subTab, setSubTab] = useState('lab'); // 'lab' | 'bugs' | 'suggestions'
  const [busyId, setBusyId] = useState('');
  const [copiedPhone, setCopiedPhone] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const bugs = useMemo(
    () => userFeedback.filter((f) => f.feedback_type === 'bug'),
    [userFeedback],
  );
  const suggestions = useMemo(
    () => userFeedback.filter((f) => f.feedback_type === 'suggestion'),
    [userFeedback],
  );

  const pendingLabCount = labApplications.filter((a) => a.status === 'pending').length;
  const newBugsCount = bugs.filter((b) => b.status === 'new').length;
  const newSuggestionsCount = suggestions.filter((s) => s.status === 'new').length;

  async function copyPhone(phone) {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      notify(`تم نسخ الرقم: ${phone}`, 'info');
      setTimeout(() => setCopiedPhone(''), 1600);
    } catch {
      notify('تعذر نسخ الرقم', 'error');
    }
  }

  async function handleApproveLab(app) {
    setBusyId(app.id);
    try {
      // 1. Mark application approved
      const { error: appErr } = await supabase
        .from('lab_applications')
        .update({ status: 'approved' })
        .eq('id', app.id);
      if (appErr) throw appErr;

      // 2. Promote user to Lab + set lab_welcome_pending = true
      const { data: updatedUser, error: userErr } = await supabase
        .from('app_users')
        .update({ role: 'lab', lab_welcome_pending: true })
        .eq('device_id', app.device_id)
        .select('fcm_token, user_code')
        .maybeSingle();

      if (userErr) throw userErr;

      const fcmToken =
        updatedUser?.fcm_token ||
        users.find((u) => u.device_id === app.device_id)?.fcm_token ||
        null;

      // 3. Automatically send celebratory push notification + silent_sync to that user's phone
      if (fcmToken) {
        const { data: pushRes, error: pushErr } = await supabase.functions.invoke('send-push', {
          body: {
            fcm_token: fcmToken,
            target_label: app.user_code || app.full_name,
            title: 'تمت الموافقة على تسجيلك في مختبر Vitrify 🧪',
            body: `أهلاً بك يا ${app.full_name}! تم تفعيل عضويتك في مختبر Vitrify ويمكنك الآن تجربة المزايا الجديدة قبل الجميع.`,
            deep_link: 'glassyfi://lab',
            also_silent_sync: true,
          },
        });

        if (pushErr || !pushRes?.ok) {
          const reason = await extractEdgeFunctionError(
            pushErr,
            pushRes,
            'تعذر تسليم الإشعار الفوري للهاتف',
          );
          notify(`تمت الموافقة وتفعيل عضوية المختبر (${reason})`, 'info');
        } else {
          notify('تمت الموافقة وإرسال إشعار الترحيب والمزامنة الفورية لهاتف العضو 🧪', 'success');
        }
      } else {
        notify('تمت الموافقة وتفعيل عضوية المختبر (سيظهر الترحيب فور فتح التطبيق)', 'success');
      }

      await onRefresh();
    } catch (err) {
      notify(`فشل قبول الطلب: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function handleRejectLab(app) {
    setBusyId(app.id);
    try {
      const { error } = await supabase
        .from('lab_applications')
        .update({ status: 'rejected' })
        .eq('id', app.id);
      if (error) throw error;
      notify(`تم رفض طلب ${app.full_name}`, 'info');
      await onRefresh();
    } catch (err) {
      notify(`فشل رفض الطلب: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function handleResolveFeedback(item) {
    setBusyId(item.id);
    try {
      const nextStatus = item.status === 'resolved' ? 'new' : 'resolved';
      const { error } = await supabase
        .from('user_feedback')
        .update({ status: nextStatus })
        .eq('id', item.id);
      if (error) throw error;
      notify(nextStatus === 'resolved' ? 'تم تحديد العنصر كـ "تم الحل"' : 'تمت إعادة فتح العنصر', 'success');
      await onRefresh();
    } catch (err) {
      notify(`فشل التحديث: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const table = deleteTarget.kind === 'lab' ? 'lab_applications' : 'user_feedback';
      const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
      if (error) throw error;
      notify('تم الحذف بنجاح', 'success');
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`فشل الحذف: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  }

  function renderFeedbackList(items, typeLabel) {
    if (items.length === 0) {
      return (
        <div className="glass-panel empty-state">
          <div className="empty-icon">
            {subTab === 'bugs' ? <Bug size={24} /> : <Lightbulb size={24} />}
          </div>
          <strong>لا توجد {typeLabel} حالياً</strong>
        </div>
      );
    }

    return (
      <div className="cards-grid cols-2">
        {items.map((item) => {
          const isResolved = item.status === 'resolved';
          return (
            <article key={item.id} className="glass-panel user-card">
              <div className="user-card-top">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {item.user_code && (
                    <span className="badge badge-indigo mono">{item.user_code}</span>
                  )}
                  <span className={`badge ${isResolved ? 'badge-emerald' : 'badge-amber'}`}>
                    {isResolved ? 'تم الحل' : 'جديد'}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-danger btn-icon"
                  style={{ width: 30, height: 30 }}
                  onClick={() => setDeleteTarget({ kind: 'feedback', id: item.id, title: item.message.slice(0, 40) })}
                  aria-label="حذف"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {item.message}
              </p>

              <div className="user-meta-line">
                <span className="user-meta-item">
                  <Smartphone size={14} /> {item.device_model}
                </span>
                {item.app_version && (
                  <span className="user-meta-item mono">v{item.app_version}</span>
                )}
                <span className="user-meta-item">
                  <Clock size={14} /> {formatRelativeTimeAr(item.created_at)}
                </span>
              </div>

              <div className="user-actions-bar">
                <button
                  type="button"
                  className={`btn btn-sm ${isResolved ? 'btn-secondary' : 'btn-emerald'}`}
                  disabled={busyId === item.id}
                  onClick={() => handleResolveFeedback(item)}
                >
                  <CheckCircle2 size={14} />
                  {isResolved ? 'إعادة فتح' : 'تحديد كـ تم الحل'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>المختبر والبلاغات</h1>
          <p>مراجعة طلبات الانضمام لمختبر Vitrify، وبلاغات الأخطاء واقتراحات المستخدمين</p>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={`segmented-btn${subTab === 'lab' ? ' active' : ''}`}
            onClick={() => setSubTab('lab')}
          >
            <FlaskConical size={15} />
            طلبات المختبر ({pendingLabCount > 0 ? `${pendingLabCount} جديد` : labApplications.length})
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'bugs' ? ' active' : ''}`}
            onClick={() => setSubTab('bugs')}
          >
            <Bug size={15} />
            البلاغات ({newBugsCount > 0 ? `${newBugsCount} جديد` : bugs.length})
          </button>
          <button
            type="button"
            className={`segmented-btn${subTab === 'suggestions' ? ' active' : ''}`}
            onClick={() => setSubTab('suggestions')}
          >
            <Lightbulb size={15} />
            الاقتراحات ({newSuggestionsCount > 0 ? `${newSuggestionsCount} جديد` : suggestions.length})
          </button>
        </div>
      </div>

      {subTab === 'lab' &&
        (labApplications.length === 0 ? (
          <div className="glass-panel empty-state">
            <div className="empty-icon">
              <FlaskConical size={24} />
            </div>
            <strong>لا توجد طلبات انضمام للمختبر حالياً</strong>
            <span style={{ fontSize: '0.83rem' }}>
              ستظهر هنا الطلبات المرسلة من التطبيق عبر `submit_lab_application`.
            </span>
          </div>
        ) : (
          <div className="cards-grid cols-2">
            {labApplications.map((app) => {
              const statusBadge =
                app.status === 'approved'
                  ? { label: 'مقبول (عضو مختبر)', cls: 'badge-emerald' }
                  : app.status === 'rejected'
                    ? { label: 'مرفوض', cls: 'badge-rose' }
                    : { label: 'قيد المراجعة', cls: 'badge-amber' };

              return (
                <article key={app.id} className="glass-panel user-card">
                  <div className="user-card-top">
                    <div>
                      <strong style={{ fontSize: '1rem' }}>{app.full_name}</strong>
                      {app.user_code && (
                        <div className="mono" style={{ fontSize: '0.76rem', color: 'var(--primary)', marginTop: 2 }}>
                          {app.user_code}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>
                      <button
                        type="button"
                        className="btn btn-danger btn-icon"
                        style={{ width: 28, height: 28 }}
                        onClick={() => setDeleteTarget({ kind: 'lab', id: app.id, title: app.full_name })}
                        aria-label="حذف الطلب"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="user-meta-line">
                    <button
                      type="button"
                      className="quick-toggle-pill"
                      onClick={() => copyPhone(app.phone_number)}
                    >
                      {copiedPhone === app.phone_number ? <Check size={12} color="var(--emerald)" /> : <Phone size={12} />}
                      <span className="mono">{app.phone_number}</span>
                      <Copy size={11} style={{ opacity: 0.7 }} />
                    </button>
                    <span className="user-meta-item">
                      <Smartphone size={14} /> {app.device_model}
                    </span>
                    <span className="user-meta-item">
                      <Clock size={14} /> {formatDateAr(app.created_at)}
                    </span>
                  </div>

                  {app.status === 'pending' && (
                    <div className="user-actions-bar">
                      <button
                        type="button"
                        className="btn btn-emerald btn-sm"
                        style={{ flex: 1 }}
                        disabled={busyId === app.id}
                        onClick={() => handleApproveLab(app)}
                      >
                        {busyId === app.id ? (
                          <Loader2 size={14} className="spinner" />
                        ) : (
                          <CheckCircle2 size={14} />
                        )}
                        موافقة وتفعيل المختبر + إشعار فوري
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyId === app.id}
                        onClick={() => handleRejectLab(app)}
                      >
                        <XCircle size={14} />
                        رفض
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ))}

      {subTab === 'bugs' && renderFeedbackList(bugs, 'بلاغات أخطاء')}
      {subTab === 'suggestions' && renderFeedbackList(suggestions, 'اقتراحات')}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="تأكيد الحذف"
        message={`هل تريد حذف هذا السجل نهائياً؟`}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
