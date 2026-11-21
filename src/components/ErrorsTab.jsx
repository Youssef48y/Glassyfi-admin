import { useMemo, useState } from 'react';
import {
  Bug,
  Search,
  Smartphone,
  Cpu,
  Clock,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertOctagon,
  Monitor,
  Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  formatDateAr,
  formatRelativeTimeAr,
  formatAndroidVersion,
} from '../lib/formatters';
import { getScreenLabelAr } from '../lib/constants';
import { ConfirmDialog } from './ConfirmDialog';

export function ErrorsTab({
  appErrors = [],
  loading = false,
  onRefresh,
  notify,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'unresolved' | 'fatal'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(() => {
    let unresolved = 0;
    let fatal = 0;
    appErrors.forEach((e) => {
      if (!e.resolved) unresolved += 1;
      if (e.is_fatal) fatal += 1;
    });
    return { all: appErrors.length, unresolved, fatal };
  }, [appErrors]);

  const filteredErrors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appErrors.filter((e) => {
      if (filter === 'unresolved' && e.resolved) return false;
      if (filter === 'fatal' && !e.is_fatal) return false;
      if (q) {
        const hay = [
          e.error_title,
          e.stack_trace,
          e.user_code,
          e.device_model,
          e.android_version,
          e.app_version,
          e.screen_name,
          e.device_id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [appErrors, filter, searchQuery]);

  async function handleToggleResolved(item) {
    setBusyId(item.id);
    try {
      const nextResolved = !item.resolved;
      const { error } = await supabase
        .from('app_errors')
        .update({ resolved: nextResolved })
        .eq('id', item.id);
      if (error) throw error;
      notify(
        nextResolved ? 'تم تعليم الخطأ كمحلول بنجاح' : 'تمت إعادة فتح الخطأ',
        'success',
      );
      await onRefresh();
    } catch (err) {
      notify(`تعذر تحديث حالة الخطأ: ${err.message}`, 'error');
    } finally {
      setBusyId('');
    }
  }

  async function confirmDeleteError() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('app_errors')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      notify('تم حذف سجل الخطأ بنجاح', 'success');
      if (expandedId === deleteTarget.id) setExpandedId('');
      setDeleteTarget(null);
      await onRefresh();
    } catch (err) {
      notify(`تعذر حذف سجل الخطأ: ${err.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function copyStackTrace(item) {
    const text = [
      `Error: ${item.error_title || ''}`,
      `User: ${item.user_code || item.device_id || '—'}`,
      `Device: ${item.device_model || '—'} (${formatAndroidVersion(item.android_version) || 'Android —'})`,
      `App Version: ${item.app_version || '—'}`,
      `Screen: ${item.screen_name || '—'}`,
      `Fatal: ${item.is_fatal ? 'Yes' : 'No'}`,
      '',
      item.stack_trace || '',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      notify('تم نسخ تفاصيل الخطأ و الـ Stack Trace', 'info');
      setTimeout(() => {
        setCopiedId((prev) => (prev === item.id ? '' : prev));
      }, 1800);
    } catch {
      notify('تعذر النسخ التلقائي', 'error');
    }
  }

  const FILTER_PILLS = [
    { id: 'all', label: 'الكل', count: counts.all },
    { id: 'unresolved', label: 'غير محلولة', count: counts.unresolved },
    { id: 'fatal', label: 'Fatal', count: counts.fatal },
  ];

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>الأخطاء والانهيارات (Errors &amp; Crashes)</h1>
          <p>مراقبة فورية (Realtime) لأعطال وأخطاء التطبيق مع تفاصيل الجهاز و الـ Stack Trace الكامل</p>
        </div>

        <div className="header-actions">
          {counts.unresolved > 0 ? (
            <span className="badge badge-rose" style={{ padding: '6px 12px' }}>
              <AlertOctagon size={13} />
              {counts.unresolved} غير محلولة
            </span>
          ) : (
            <span className="badge badge-emerald" style={{ padding: '6px 12px' }}>
              <CheckCircle2 size={13} />
              لا توجد أخطاء مفتوحة
            </span>
          )}
        </div>
      </div>

      <div className="glass-panel section-card" style={{ padding: 14 }}>
        <div className="input-with-icon" style={{ marginBottom: 12 }}>
          <span className="input-icon-right">
            <Search size={16} />
          </span>
          <input
            type="search"
            className="input"
            placeholder="ابحث بعنوان الخطأ، الـ Stack Trace، كود المستخدم، نوع الهاتف، أو الشاشة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-strip" style={{ marginBottom: 0 }}>
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              className={`chip${filter === pill.id ? ' active' : ''}`}
              onClick={() => setFilter(pill.id)}
            >
              {pill.label}
              <span className="chip-count">({pill.count})</span>
            </button>
          ))}
        </div>
      </div>

      {loading && appErrors.length === 0 ? (
        <div className="glass-panel empty-state">
          <Loader2 size={28} className="spinner" />
          <span>جاري تحميل سجل الأخطاء...</span>
        </div>
      ) : filteredErrors.length === 0 ? (
        <div className="glass-panel empty-state">
          <div className="empty-icon">
            <Bug size={24} />
          </div>
          <strong>
            {appErrors.length === 0
              ? 'لا توجد أخطاء أو انهيارات مسجّلة حتى الآن 🎉'
              : 'لا توجد أخطاء مطابقة لهذا الفلتر'}
          </strong>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredErrors.map((item) => {
            const isExpanded = expandedId === item.id;
            const busy = busyId === item.id;
            const androidLabel =
              formatAndroidVersion(item.android_version) || 'Android —';

            return (
              <article
                key={item.id}
                className="glass-panel user-card"
                style={item.resolved ? { opacity: 0.72 } : undefined}
              >
                <div className="user-card-top">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1 }}>
                    <Bug
                      size={17}
                      color={item.is_fatal ? 'var(--rose)' : 'var(--amber)'}
                      style={{ flexShrink: 0, marginTop: 2 }}
                    />
                    <strong style={{ fontSize: '0.96rem', wordBreak: 'break-word' }}>
                      {item.error_title}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, flexShrink: 0 }}>
                    <span className={`badge ${item.is_fatal ? 'badge-rose' : 'badge-amber'}`}>
                      {item.is_fatal ? 'Fatal' : 'Non-Fatal'}
                    </span>
                    <span className={`badge ${item.resolved ? 'badge-emerald' : 'badge-neutral'}`}>
                      {item.resolved ? 'محلول' : 'غير محلول'}
                    </span>
                  </div>
                </div>

                <div className="user-meta-line">
                  <span className="user-meta-item mono">
                    {item.user_code || item.device_id?.slice(0, 12) || 'مجهول'}
                  </span>
                  <span className="user-meta-item">
                    <Smartphone size={14} />
                    {item.device_model || 'جهاز غير معروف'}
                  </span>
                  <span className="user-meta-item mono">
                    <Cpu size={14} />
                    {androidLabel}
                  </span>
                  <span className="user-meta-item mono">
                    v{item.app_version || '—'}
                  </span>
                  {item.screen_name && (
                    <span className="user-meta-item">
                      <Monitor size={14} />
                      {getScreenLabelAr(item.screen_name)}
                    </span>
                  )}
                  <span className="user-meta-item" title={formatDateAr(item.created_at)}>
                    <Clock size={14} />
                    {formatRelativeTimeAr(item.created_at)}
                  </span>
                </div>

                {isExpanded && item.stack_trace && (
                  <pre
                    className="mono ltr"
                    style={{
                      margin: 0,
                      padding: 12,
                      borderRadius: 10,
                      background: '#16181c',
                      border: '1px solid var(--glass-border)',
                      color: '#e2e8f0',
                      fontSize: '0.74rem',
                      lineHeight: 1.5,
                      maxHeight: 300,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {item.stack_trace}
                  </pre>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    paddingTop: 10,
                    borderTop: '1px solid var(--glass-border)',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {item.stack_trace ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setExpandedId(isExpanded ? '' : item.id)}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? 'إخفاء Stack Trace' : 'عرض Stack Trace'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        لا يوجد Stack Trace مرفق
                      </span>
                    )}

                    {item.stack_trace && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => copyStackTrace(item)}
                      >
                        {copiedId === item.id ? (
                          <Check size={14} color="var(--emerald)" />
                        ) : (
                          <Copy size={14} />
                        )}
                        نسخ
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${item.resolved ? 'btn-secondary' : 'btn-emerald'}`}
                      disabled={busy}
                      onClick={() => handleToggleResolved(item)}
                    >
                      <CheckCircle2 size={14} />
                      {item.resolved ? 'إعادة فتح' : 'تم الحل'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busy}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 size={14} />
                      حذف
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="حذف سجل الخطأ"
        message={`هل تريد حذف الخطأ "${deleteTarget?.error_title || ''}" نهائياً؟`}
        confirmText="حذف"
        busy={deleting}
        onConfirm={confirmDeleteError}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
