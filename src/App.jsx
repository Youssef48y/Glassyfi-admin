import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  BarChart3,
  Image as ImageIcon,
  LayoutGrid,
  Users,
  FlaskConical,
  ShieldAlert,
  Bell,
  SlidersHorizontal,
  RefreshCw,
  LogOut,
  Loader2,
  Menu,
  X,
} from 'lucide-react';
import { supabase, verifyAdminAccess } from './lib/supabase';
import { LoginScreen } from './components/LoginScreen';
import { ToastList } from './components/Toast';
import { DashboardTab } from './components/DashboardTab';
import { WallpapersTab } from './components/WallpapersTab';
import { WidgetsTab } from './components/WidgetsTab';
import { UsersTab } from './components/UsersTab';
import { LabFeedbackTab } from './components/LabFeedbackTab';
import { SecurityTab } from './components/SecurityTab';
import { NotificationsTab } from './components/NotificationsTab';
import { ConfigTab } from './components/ConfigTab';

const NAV_GROUPS = [
  {
    label: 'نظرة عامة',
    items: [
      { id: 'dashboard', label: 'لوحة الإحصائيات', shortLabel: 'الإحصائيات', icon: BarChart3 },
    ],
  },
  {
    label: 'المحتوى والميزات',
    items: [
      { id: 'wallpapers', label: 'الخلفيات', shortLabel: 'الخلفيات', icon: ImageIcon },
      { id: 'widgets', label: 'الويدجيت وأدوات العمق', shortLabel: 'الويدجيت', icon: LayoutGrid },
    ],
  },
  {
    label: 'المجتمع والأمان',
    items: [
      { id: 'users', label: 'المستخدمين والأكواد', shortLabel: 'المستخدمين', icon: Users },
      { id: 'lab_feedback', label: 'المختبر والبلاغات', shortLabel: 'المختبر', icon: FlaskConical },
      { id: 'security', label: 'الحماية والمشبوهين', shortLabel: 'الحماية', icon: ShieldAlert },
    ],
  },
  {
    label: 'التواصل والنظام',
    items: [
      { id: 'notifications', label: 'الإشعارات والمنبثقة', shortLabel: 'الإشعارات', icon: Bell },
      { id: 'config', label: 'التحديث والصيانة', shortLabel: 'التحديث', icon: SlidersHorizontal },
    ],
  },
];

const ALL_TABS = NAV_GROUPS.flatMap((g) => g.items);
const MOBILE_PRIMARY_IDS = ['dashboard', 'wallpapers', 'widgets', 'users'];
const MOBILE_MORE_IDS = ['lab_feedback', 'security', 'notifications', 'config'];

const REALTIME_TABLES = [
  'app_users',
  'analytics_events',
  'security_alerts',
  'user_feedback',
  'lab_applications',
  'wallpapers',
  'widgets_config',
  'depth_tools_config',
  'popup_announcements',
  'app_config',
  'promo_codes',
  'categories',
  'push_history',
];

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [adminRecord, setAdminRecord] = useState(null);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting'); // 'connecting' | 'live'

  const [categories, setCategories] = useState([]);
  const [wallpapers, setWallpapers] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [depthTools, setDepthTools] = useState([]);
  const [users, setUsers] = useState([]);
  const [promoCodes, setPromoCodes] = useState([]);
  const [pushHistory, setPushHistory] = useState([]);
  const [popups, setPopups] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [analyticsEvents, setAnalyticsEvents] = useState([]);
  const [userFeedback, setUserFeedback] = useState([]);
  const [labApplications, setLabApplications] = useState([]);

  const [toasts, setToasts] = useState([]);
  const debounceTimersRef = useRef({});

  const notify = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Targeted per-table refresh for instant zero-flicker Realtime updates
  const refreshTable = useCallback(async (tableName) => {
    try {
      switch (tableName) {
        case 'categories': {
          const { data } = await supabase
            .from('categories')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true });
          if (data) setCategories(data);
          break;
        }
        case 'wallpapers': {
          const { data } = await supabase
            .from('wallpapers')
            .select('*')
            .order('is_builtin', { ascending: false })
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });
          if (data) setWallpapers(data);
          break;
        }
        case 'widgets_config': {
          const { data } = await supabase
            .from('widgets_config')
            .select('*')
            .order('sort_order', { ascending: true });
          if (data) setWidgets(data);
          break;
        }
        case 'depth_tools_config': {
          const { data } = await supabase
            .from('depth_tools_config')
            .select('*')
            .order('sort_order', { ascending: true });
          if (data) setDepthTools(data);
          break;
        }
        case 'app_users': {
          const { data } = await supabase
            .from('app_users')
            .select('*')
            .order('is_starred', { ascending: false })
            .order('last_seen_at', { ascending: false })
            .limit(400);
          if (data) setUsers(data);
          break;
        }
        case 'promo_codes': {
          const { data } = await supabase
            .from('promo_codes')
            .select('*')
            .order('created_at', { ascending: false });
          if (data) setPromoCodes(data);
          break;
        }
        case 'push_history': {
          const { data } = await supabase
            .from('push_history')
            .select('*')
            .order('sent_at', { ascending: false })
            .limit(50);
          if (data) setPushHistory(data);
          break;
        }
        case 'popup_announcements': {
          const { data } = await supabase
            .from('popup_announcements')
            .select('*')
            .order('created_at', { ascending: false });
          if (data) setPopups(data);
          break;
        }
        case 'app_config': {
          const { data } = await supabase
            .from('app_config')
            .select('*')
            .eq('id', 1)
            .maybeSingle();
          if (data) setAppConfig(data);
          break;
        }
        case 'security_alerts': {
          const { data } = await supabase
            .from('security_alerts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(150);
          if (data) setSecurityAlerts(data);
          break;
        }
        case 'analytics_events': {
          const { data } = await supabase
            .from('analytics_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1500);
          if (data) setAnalyticsEvents(data);
          break;
        }
        case 'user_feedback': {
          const { data } = await supabase
            .from('user_feedback')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
          if (data) setUserFeedback(data);
          break;
        }
        case 'lab_applications': {
          const { data } = await supabase
            .from('lab_applications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);
          if (data) setLabApplications(data);
          break;
        }
        default:
          break;
      }
    } catch {
      // Non-fatal realtime refresh glitch; next event or manual refresh will catch up
    }
  }, []);

  const scheduleTableRefresh = useCallback(
    (tableName) => {
      if (debounceTimersRef.current[tableName]) {
        clearTimeout(debounceTimersRef.current[tableName]);
      }
      debounceTimersRef.current[tableName] = setTimeout(() => {
        refreshTable(tableName);
      }, 220);
    },
    [refreshTable],
  );

  const fetchAllData = useCallback(async () => {
    setDataLoading(true);
    try {
      await Promise.all(REALTIME_TABLES.map((tbl) => refreshTable(tbl)));
    } catch {
      notify('تعذر تحديث البيانات من الخادم', 'error');
    } finally {
      setDataLoading(false);
    }
  }, [notify, refreshTable]);

  // Restore session & enforce admin_users check
  useEffect(() => {
    let active = true;

    async function checkSession(currentSession) {
      if (!currentSession?.user) {
        if (active) {
          setSession(null);
          setAdminRecord(null);
          setAuthChecking(false);
        }
        return;
      }

      const { isAdmin, record } = await verifyAdminAccess(currentSession.user.id);
      if (!active) return;

      if (!isAdmin) {
        await supabase.auth.signOut();
        setSession(null);
        setAdminRecord(null);
        setAuthError('تم رفض الوصول: هذا الحساب غير مسجّل كمدير للنظام.');
        setAuthChecking(false);
        return;
      }

      setAuthError('');
      setSession(currentSession);
      setAdminRecord(record);
      setAuthChecking(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      checkSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        setSession(null);
        setAdminRecord(null);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load initial data + establish live Supabase Realtime postgres_changes subscription
  useEffect(() => {
    if (!session || !adminRecord) return undefined;

    fetchAllData();
    setRealtimeStatus('connecting');

    let channel = supabase.channel('glassyfi-admin-live-v3');
    REALTIME_TABLES.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          scheduleTableRefresh(table);
        },
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setRealtimeStatus('live');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setRealtimeStatus('connecting');
      }
    });

    const timersMap = debounceTimersRef.current;
    return () => {
      Object.values(timersMap).forEach((t) => clearTimeout(t));
      supabase.removeChannel(channel);
      setRealtimeStatus('connecting');
    };
  }, [session, adminRecord, fetchAllData, scheduleTableRefresh]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
    setAdminRecord(null);
    setCategories([]);
    setWallpapers([]);
    setWidgets([]);
    setDepthTools([]);
    setUsers([]);
    setPromoCodes([]);
    setPushHistory([]);
    setPopups([]);
    setAppConfig(null);
    setSecurityAlerts([]);
    setAnalyticsEvents([]);
    setUserFeedback([]);
    setLabApplications([]);
    notify('تم تسجيل الخروج بنجاح', 'info');
  }

  const pendingLabCount = labApplications.filter((a) => a.status === 'pending').length;
  const newFeedbackCount = userFeedback.filter((f) => f.status === 'new').length;
  const unresolvedSecCount = securityAlerts.filter((a) => !a.resolved).length;
  const moreAlertsTotal = pendingLabCount + newFeedbackCount + unresolvedSecCount;

  function getTabBadge(tabId) {
    if (tabId === 'wallpapers') return { value: wallpapers.length, alert: false };
    if (tabId === 'widgets') return { value: widgets.length + depthTools.length, alert: false };
    if (tabId === 'users') return { value: users.length, alert: false };
    if (tabId === 'lab_feedback') {
      const total = pendingLabCount + newFeedbackCount;
      return { value: total, alert: total > 0 };
    }
    if (tabId === 'security') {
      return { value: unresolvedSecCount, alert: unresolvedSecCount > 0 };
    }
    if (tabId === 'notifications') {
      return { value: popups.filter((p) => p.is_active).length, alert: false };
    }
    return null;
  }

  function handleSelectTab(tabId) {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (authChecking) {
    return (
      <main className="login-shell">
        <div className="glass-panel login-card" style={{ textAlign: 'center', padding: 40 }}>
          <Loader2 size={30} className="spinner" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            جاري التحقق من الجلسة...
          </div>
        </div>
      </main>
    );
  }

  if (!session || !adminRecord) {
    return (
      <>
        <ToastList toasts={toasts} onDismiss={dismissToast} />
        <LoginScreen
          initialError={authError}
          onAuthenticated={(nextSession, record) => {
            setAuthError('');
            setSession(nextSession);
            setAdminRecord(record);
            notify('أهلاً بك في لوحة تحكم Glassyfi v3 المباشرة', 'success');
          }}
        />
      </>
    );
  }

  const currentTabMeta = ALL_TABS.find((t) => t.id === activeTab) || ALL_TABS[0];
  const isMoreTabActive = MOBILE_MORE_IDS.includes(activeTab);

  return (
    <div className="app-shell">
      <ToastList toasts={toasts} onDismiss={dismissToast} />

      {/* Mobile Sticky Header with Live Pulsing Badge */}
      <header className="mobile-topbar">
        <div className="brand-mark">
          <div className="brand-icon" style={{ width: 35, height: 35, borderRadius: 10 }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div className="brand-title" style={{ fontSize: '0.95rem' }}>
              Glassyfi Admin
            </div>
            <div className="brand-subtitle">{currentTabMeta.label}</div>
          </div>
        </div>

        <div className="mobile-topbar-actions">
          <span
            className={`live-pill${realtimeStatus === 'live' ? '' : ' connecting'}`}
            style={{ padding: '4px 9px', fontSize: '0.7rem' }}
          >
            <span className="live-pulse-dot" />
            {realtimeStatus === 'live' ? 'مباشر' : '...'}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={fetchAllData}
            disabled={dataLoading}
            aria-label="تحديث البيانات"
          >
            <RefreshCw size={15} className={dataLoading ? 'spinner' : ''} />
          </button>
          <button
            type="button"
            className="btn btn-danger btn-icon"
            onClick={handleLogout}
            aria-label="تسجيل الخروج"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Desktop Right Sidebar (RTL) */}
      <aside className="glass-panel desktop-rail" aria-label="التنقل الرئيسي">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 4px' }}>
          <div className="brand-mark">
            <div className="brand-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="brand-title">Glassyfi</div>
              <div className="brand-subtitle">لوحة التحكم v3</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, padding: '0 4px' }}>
          <span
            className={`live-pill${realtimeStatus === 'live' ? '' : ' connecting'}`}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <span className="live-pulse-dot" />
            {realtimeStatus === 'live' ? 'مباشر (Live) • Realtime' : 'جاري الاتصال بـ Realtime...'}
          </span>
        </div>

        <nav className="rail-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="rail-section-label">{group.label}</div>
              {group.items.map((tab) => {
                const Icon = tab.icon;
                const badge = getTabBadge(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rail-btn${activeTab === tab.id ? ' active' : ''}`}
                    onClick={() => handleSelectTab(tab.id)}
                  >
                    <span className="rail-btn-inner">
                      <Icon size={17} />
                      <span>{tab.label}</span>
                    </span>
                    {badge !== null && (
                      <span className={`rail-count${badge.alert ? ' alert' : ''}`}>
                        {badge.value}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="rail-footer">
          <div className="sync-status-card">
            <span style={{ color: 'var(--text-secondary)' }}>نسخة الإعدادات</span>
            <span className="mono" style={{ fontWeight: 700, color: '#ffffff' }}>
              rev #{appConfig?.config_revision ?? 1}
            </span>
          </div>

          <div className="admin-chip">
            <span className="admin-chip-label">حساب المدير</span>
            <span className="admin-chip-email mono">{adminRecord.email}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchAllData}
              disabled={dataLoading}
            >
              <RefreshCw size={14} className={dataLoading ? 'spinner' : ''} />
              تحديث
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleLogout}
            >
              <LogOut size={14} />
              خروج
            </button>
          </div>
        </div>
      </aside>

      {/* Active Tab View */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <DashboardTab
            users={users}
            wallpapers={wallpapers}
            widgets={widgets}
            depthTools={depthTools}
            analyticsEvents={analyticsEvents}
            securityAlerts={securityAlerts}
            userFeedback={userFeedback}
            labApplications={labApplications}
            appConfig={appConfig}
            realtimeStatus={realtimeStatus}
            onNavigate={handleSelectTab}
            notify={notify}
          />
        )}
        {activeTab === 'wallpapers' && (
          <WallpapersTab
            wallpapers={wallpapers}
            categories={categories}
            loading={dataLoading}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
        {activeTab === 'widgets' && (
          <WidgetsTab
            widgets={widgets}
            depthTools={depthTools}
            loading={dataLoading}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
        {activeTab === 'users' && (
          <UsersTab
            users={users}
            promoCodes={promoCodes}
            widgets={widgets}
            depthTools={depthTools}
            appConfig={appConfig}
            loading={dataLoading}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
        {activeTab === 'lab_feedback' && (
          <LabFeedbackTab
            labApplications={labApplications}
            userFeedback={userFeedback}
            users={users}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
        {activeTab === 'security' && (
          <SecurityTab
            securityAlerts={securityAlerts}
            users={users}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
        {activeTab === 'notifications' && (
          <NotificationsTab
            pushHistory={pushHistory}
            popups={popups}
            users={users}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
        {activeTab === 'config' && (
          <ConfigTab
            config={appConfig}
            loading={dataLoading}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
      </main>

      {/* Mobile Bottom Dock */}
      <nav className="mobile-bottom-nav" aria-label="شريط التنقل السفلي">
        {MOBILE_PRIMARY_IDS.map((id) => {
          const tab = ALL_TABS.find((t) => t.id === id);
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-nav-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => handleSelectTab(tab.id)}
            >
              <Icon size={19} />
              <span>{tab.shortLabel}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`mobile-nav-btn${isMoreTabActive || mobileMenuOpen ? ' active' : ''}`}
          onClick={() => setMobileMenuOpen((prev) => !prev)}
        >
          {moreAlertsTotal > 0 && <span className="nav-dot">{moreAlertsTotal}</span>}
          <Menu size={19} />
          <span>المزيد</span>
        </button>
      </nav>

      {/* Mobile Bottom Sheet for Remaining 4 Tabs */}
      {mobileMenuOpen && (
        <div className="sheet-backdrop" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="sheet-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="أقسام إضافية"
          >
            <div className="modal-head" style={{ marginBottom: 12 }}>
              <h2>أقسام لوحة التحكم</h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MOBILE_MORE_IDS.map((id) => {
                const tab = ALL_TABS.find((t) => t.id === id);
                const Icon = tab.icon;
                const badge = getTabBadge(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rail-btn${activeTab === tab.id ? ' active' : ''}`}
                    style={{ padding: '12px 14px' }}
                    onClick={() => handleSelectTab(tab.id)}
                  >
                    <span className="rail-btn-inner">
                      <Icon size={18} />
                      <span>{tab.label}</span>
                    </span>
                    {badge !== null && (
                      <span className={`rail-count${badge.alert ? ' alert' : ''}`}>
                        {badge.value}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
