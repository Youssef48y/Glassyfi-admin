import { useMemo, useState } from 'react';
import {
  Smartphone,
  Crown,
  FlaskConical,
  ShieldAlert,
  Bug,
  Activity,
  BarChart3,
  Radio,
  Loader2,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { triggerSilentSync } from '../lib/supabase';
import { getProStatusInfo, formatRelativeTimeAr } from '../lib/formatters';
import { getScreenLabelAr } from '../lib/constants';

const CHART_COLORS = ['#818cf8', '#6366f1', '#34d399', '#38bdf8', '#fbbf24', '#f472b6', '#a78bfa'];

function ScreenTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="recharts-tooltip-glass">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#c7d2fe' }}>الزيارات: <strong className="mono">{row?.visits ?? 0}</strong></div>
      <div style={{ color: '#34d399' }}>متوسط البقاء: <strong className="mono">{row?.avgDuration ?? 0}</strong> ثانية</div>
    </div>
  );
}

function UsageTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="recharts-tooltip-glass">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ color: '#34d399' }}>
        {row?.unitLabel || 'الاستخدام'}: <strong className="mono">{row?.count ?? 0}</strong>
      </div>
    </div>
  );
}

export function DashboardTab({
  users,
  wallpapers,
  widgets,
  depthTools,
  analyticsEvents,
  securityAlerts,
  userFeedback,
  labApplications,
  appConfig,
  onNavigate,
  notify,
}) {
  const [screenMetric, setScreenMetric] = useState('visits'); // 'visits' | 'avgDuration'
  const [usageMode, setUsageMode] = useState('events'); // 'events' | 'downloads'
  const [syncing, setSyncing] = useState(false);

  const kpis = useMemo(() => {
    const proUsers = users.filter((u) => getProStatusInfo(u).active).length;
    const labMembers = users.filter((u) => u.role === 'lab').length;
    const devMembers = users.filter((u) => u.role === 'dev').length;
    const suspiciousDevices = users.filter((u) => u.is_suspicious).length;
    const unresolvedAlerts = securityAlerts.filter((a) => !a.resolved).length;
    const newBugsAndFeedback = userFeedback.filter((f) => f.status === 'new').length;
    const pendingLabs = labApplications.filter((a) => a.status === 'pending').length;

    return {
      totalDevices: users.length,
      proUsers,
      labMembers,
      devMembers,
      suspiciousCount: Math.max(suspiciousDevices, unresolvedAlerts),
      unresolvedAlerts,
      newFeedback: newBugsAndFeedback,
      pendingLabs,
    };
  }, [users, securityAlerts, userFeedback, labApplications]);

  // Chart 1: Top screens where users spend time
  const screenData = useMemo(() => {
    const buckets = new Map();
    analyticsEvents.forEach((ev) => {
      const type = String(ev.event_type || '').toLowerCase();
      if (
        type === 'screen_view' ||
        type === 'screen' ||
        type === 'tab_view' ||
        type === 'page_view'
      ) {
        const key = getScreenLabelAr(ev.target_name);
        const cur = buckets.get(key) || { name: key, visits: 0, totalDur: 0, durCount: 0 };
        cur.visits += 1;
        if (Number(ev.duration_sec) > 0) {
          cur.totalDur += Number(ev.duration_sec);
          cur.durCount += 1;
        }
        buckets.set(key, cur);
      }
    });

    return Array.from(buckets.values())
      .map((b) => ({
        name: b.name,
        visits: b.visits,
        avgDuration: b.durCount > 0 ? Math.round(b.totalDur / b.durCount) : 0,
      }))
      .sort((a, b) => b[screenMetric] - a[screenMetric])
      .slice(0, 7);
  }, [analyticsEvents, screenMetric]);

  // Map keys to Arabic labels for usage chart
  const itemLabelMap = useMemo(() => {
    const map = {};
    widgets.forEach((w) => {
      map[w.widget_key] = w.title_ar;
    });
    depthTools.forEach((d) => {
      map[d.tool_key] = d.title_ar;
    });
    wallpapers.forEach((wp) => {
      map[wp.id] = wp.title_ar;
    });
    return map;
  }, [widgets, depthTools, wallpapers]);

  // Chart 2: Top wallpapers & widgets usage
  const usageData = useMemo(() => {
    if (usageMode === 'downloads') {
      return [...wallpapers]
        .filter((w) => (w.downloads_count || 0) > 0)
        .sort((a, b) => (b.downloads_count || 0) - (a.downloads_count || 0))
        .slice(0, 7)
        .map((w) => ({
          name: w.title_ar.length > 18 ? `${w.title_ar.slice(0, 18)}…` : w.title_ar,
          count: w.downloads_count || 0,
          unitLabel: 'التحميلات',
        }));
    }

    const counts = new Map();
    analyticsEvents.forEach((ev) => {
      const type = String(ev.event_type || '').toLowerCase();
      if (
        type.includes('wallpaper') ||
        type.includes('widget') ||
        type.includes('depth') ||
        type.includes('tool')
      ) {
        const rawLabel = itemLabelMap[ev.target_name] || ev.target_name;
        const label = rawLabel.length > 18 ? `${rawLabel.slice(0, 18)}…` : rawLabel;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, unitLabel: 'مرات الاستخدام' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [analyticsEvents, wallpapers, usageMode, itemLabelMap]);

  async function handleManualSync() {
    setSyncing(true);
    const res = await triggerSilentSync({ topic: 'all_users' });
    setSyncing(false);
    if (res.ok) {
      notify('تم إرسال نبضة التحديث الفوري (Silent Sync) لجميع الهواتف المتصلة', 'success');
    } else {
      notify(`تعذر إرسال التحديث الفوري: ${res.error}`, 'error');
    }
  }

  const proPercent =
    kpis.totalDevices > 0 ? Math.round((kpis.proUsers / kpis.totalDevices) * 100) : 0;

  return (
    <section>
      <div className="page-header">
        <div className="page-title-group">
          <h1>لوحة الإحصائيات</h1>
          <p>نظرة شاملة وفورية على الأجهزة، استخدام الشاشات، الخلفيات والويدجيت والأمان</p>
        </div>

        <div className="header-actions">
          <span className="badge badge-indigo" style={{ padding: '6px 12px' }}>
            <Sparkles size={13} />
            نسخة الإعدادات <span className="mono">#{appConfig?.config_revision ?? 1}</span>
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={syncing}
            onClick={handleManualSync}
          >
            {syncing ? <Loader2 size={16} className="spinner" /> : <Radio size={16} />}
            مزامنة فورية لكل الهواتف
          </button>
        </div>
      </div>

      {/* 5 KPI Summary Cards */}
      <div className="kpi-grid">
        <button
          type="button"
          className="kpi-card clickable"
          onClick={() => onNavigate('users')}
        >
          <div className="kpi-top">
            <span className="kpi-label">إجمالي الأجهزة</span>
            <span className="kpi-icon" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
              <Smartphone size={18} />
            </span>
          </div>
          <div className="kpi-value">{kpis.totalDevices}</div>
          <div className="kpi-sub">مطوّرون: {kpis.devMembers} • خلفيات: {wallpapers.length}</div>
        </button>

        <button
          type="button"
          className="kpi-card clickable"
          onClick={() => onNavigate('users')}
        >
          <div className="kpi-top">
            <span className="kpi-label">مستخدمو Pro</span>
            <span className="kpi-icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
              <Crown size={18} />
            </span>
          </div>
          <div className="kpi-value" style={{ color: 'var(--amber)' }}>
            {kpis.proUsers}
          </div>
          <div className="kpi-sub">نسبة الاشتراك: {proPercent}%</div>
        </button>

        <button
          type="button"
          className="kpi-card clickable"
          onClick={() => onNavigate('lab_feedback')}
        >
          <div className="kpi-top">
            <span className="kpi-label">أعضاء المختبر</span>
            <span className="kpi-icon" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
              <FlaskConical size={18} />
            </span>
          </div>
          <div className="kpi-value" style={{ color: 'var(--emerald)' }}>
            {kpis.labMembers}
          </div>
          <div className="kpi-sub">
            {kpis.pendingLabs > 0
              ? `${kpis.pendingLabs} طلب بانتظار الموافقة`
              : 'لا توجد طلبات معلقة'}
          </div>
        </button>

        <button
          type="button"
          className="kpi-card clickable"
          onClick={() => onNavigate('security')}
        >
          <div className="kpi-top">
            <span className="kpi-label">الأجهزة المشبوهة</span>
            <span className="kpi-icon" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
              <ShieldAlert size={18} />
            </span>
          </div>
          <div
            className="kpi-value"
            style={{ color: kpis.suspiciousCount > 0 ? 'var(--rose)' : 'var(--text-primary)' }}
          >
            {kpis.suspiciousCount}
          </div>
          <div className="kpi-sub">تنبيهات نشطة: {kpis.unresolvedAlerts}</div>
        </button>

        <button
          type="button"
          className="kpi-card clickable"
          onClick={() => onNavigate('lab_feedback')}
        >
          <div className="kpi-top">
            <span className="kpi-label">البلاغات الجديدة</span>
            <span className="kpi-icon" style={{ background: 'var(--sky-soft)', color: 'var(--sky)' }}>
              <Bug size={18} />
            </span>
          </div>
          <div
            className="kpi-value"
            style={{ color: kpis.newFeedback > 0 ? 'var(--sky)' : 'var(--text-primary)' }}
          >
            {kpis.newFeedback}
          </div>
          <div className="kpi-sub">إجمالي البلاغات والاقتراحات: {userFeedback.length}</div>
        </button>
      </div>

      {/* 2 Interactive Recharts Bar Charts */}
      <div className="charts-grid">
        {/* Chart 1: Top Screens */}
        <article className="glass-panel chart-card">
          <div className="section-heading" style={{ marginBottom: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} color="var(--primary)" />
              أكتر الشاشات اللي الناس بتقف عندها
            </span>
            <div className="segmented" style={{ padding: 3 }}>
              <button
                type="button"
                className={`segmented-btn${screenMetric === 'visits' ? ' active' : ''}`}
                style={{ padding: '5px 9px', fontSize: '0.74rem' }}
                onClick={() => setScreenMetric('visits')}
              >
                الزيارات
              </button>
              <button
                type="button"
                className={`segmented-btn${screenMetric === 'avgDuration' ? ' active' : ''}`}
                style={{ padding: '5px 9px', fontSize: '0.74rem' }}
                onClick={() => setScreenMetric('avgDuration')}
              >
                متوسط الثواني
              </button>
            </div>
          </div>

          {screenData.length === 0 ? (
            <div className="empty-state" style={{ padding: '56px 16px' }}>
              <Clock size={24} color="var(--text-muted)" />
              <strong style={{ fontSize: '0.9rem' }}>لا توجد أحداث شاشات مسجّلة بعد</strong>
              <span style={{ fontSize: '0.79rem' }}>
                ستظهر الزيارات ومتوسط مدة البقاء فور إرسال التطبيق لأحداث `log_analytics_event`.
              </span>
            </div>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={screenData} margin={{ top: 10, right: 12, left: -14, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#98a2b3', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#667085', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ScreenTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar
                    dataKey={screenMetric}
                    radius={[8, 8, 0, 0]}
                    maxBarSize={46}
                  >
                    {screenData.map((entry, idx) => (
                      <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        {/* Chart 2: Top Wallpapers & Widgets */}
        <article className="glass-panel chart-card">
          <div className="section-heading" style={{ marginBottom: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={18} color="var(--emerald)" />
              أكتر الخلفيات والويدجيت استخدامًا
            </span>
            <div className="segmented" style={{ padding: 3 }}>
              <button
                type="button"
                className={`segmented-btn${usageMode === 'events' ? ' active' : ''}`}
                style={{ padding: '5px 9px', fontSize: '0.74rem' }}
                onClick={() => setUsageMode('events')}
              >
                الأحداث
              </button>
              <button
                type="button"
                className={`segmented-btn${usageMode === 'downloads' ? ' active' : ''}`}
                style={{ padding: '5px 9px', fontSize: '0.74rem' }}
                onClick={() => setUsageMode('downloads')}
              >
                التحميلات
              </button>
            </div>
          </div>

          {usageData.length === 0 ? (
            <div className="empty-state" style={{ padding: '56px 16px' }}>
              <BarChart3 size={24} color="var(--text-muted)" />
              <strong style={{ fontSize: '0.9rem' }}>لا توجد بيانات استخدام مسجّلة بعد</strong>
              <span style={{ fontSize: '0.79rem' }}>
                ستمتلئ الرسوم تلقائياً عند تفاعل المستخدمين مع الخلفيات، الـ 40 ويدجيت، وأدوات العمق.
              </span>
            </div>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={usageData} margin={{ top: 10, right: 12, left: -14, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#98a2b3', fontSize: 11 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#667085', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<UsageTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={46}>
                    {usageData.map((entry, idx) => (
                      <Cell key={entry.name} fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </div>

      {/* Live Overview Strip */}
      <div className="glass-panel section-card" style={{ marginBottom: 0 }}>
        <h2 className="section-heading">
          <span>ملخص النظام السحابي المباشر</span>
          <span className="badge badge-emerald">40 ويدجيت • 15 أداة عمق</span>
        </h2>

        <div className="cards-grid cols-3">
          <div className="glass-subcard" style={{ padding: 13 }}>
            <div className="field-hint">حالة الإعدادات والمزامنة</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>
              الإصدار <span className="mono">v{appConfig?.latest_version_name || '1.0.0'}</span>{' '}
              • مراجعة <span className="mono">#{appConfig?.config_revision ?? 1}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              آخر تعديل: {formatRelativeTimeAr(appConfig?.updated_at)}
            </div>
          </div>

          <div className="glass-subcard" style={{ padding: 13 }}>
            <div className="field-hint">توزيع الويدجيت وأدوات العمق</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>
              {widgets.filter((w) => w.is_visible).length}/{widgets.length} ويدجيت ظاهرة •{' '}
              {depthTools.filter((d) => d.is_visible).length}/{depthTools.length} أداة عمق
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              مخصص للمختبر/المطورين:{' '}
              {widgets.filter((w) => w.target_audience !== 'all').length +
                depthTools.filter((d) => d.target_audience !== 'all').length}{' '}
              عنصر
            </div>
          </div>

          <div className="glass-subcard" style={{ padding: 13 }}>
            <div className="field-hint">آخر أحداث التحليلات المسجلة</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>
              <span className="mono">{analyticsEvents.length}</span> حدث في الذاكرة الحديثة
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {analyticsEvents[0]
                ? `آخر حدث: ${getScreenLabelAr(analyticsEvents[0].target_name)} (${formatRelativeTimeAr(analyticsEvents[0].created_at)})`
                : 'بانتظار أول تفاعل من التطبيق'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
