import { useCallback, useEffect, useState } from 'react';
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

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [adminRecord, setAdminRecord] = useState(null);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

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

  const fetchAllData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [
        catRes,
        wpRes,
        widRes,
        depthRes,
        usrRes,
        promoRes,
        pushRes,
        popRes,
        cfgRes,
        secRes,
        anaRes,
        fbRes,
        labRes,
      ] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('wallpapers')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase
          .from('widgets_config')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('depth_tools_config')
          .select('*')
          .order('sort_order', { ascending: true }),
        supabase
          .from('app_users')
          .select('*')
          .order('last_seen_at', { ascending: false })
          .limit(400),
        supabase
          .from('promo_codes')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('push_history')
          .select('*')
          .order('sent_at', { ascending: false })
          .limit(50),
        supabase
          .from('popup_announcements')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('app_config').select('*').eq('id', 1).maybeSingle(),
        supabase
          .from('security_alerts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('analytics_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1500),
        supabase
          .from('user_feedback')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('lab_applications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const firstError =
        catRes.error ||
        wpRes.error ||
        widRes.error ||
        depthRes.error ||
        usrRes.error ||
        promoRes.error ||
        pushRes.error ||
        popRes.error ||
        cfgRes.error ||
        secRes.error ||
        anaRes.error ||
        fbRes.error ||
        labRes.error;

      if (firstError) {
        notify(`تنبيه أثناء جلب البيانات: ${firstError.message}`, 'error');
      }

      if (catRes.data) setCategories(catRes.data);
      if (wpRes.data) setWallpapers(wpRes.data);
      if (widRes.data) setWidgets(widRes.data);
      if (depthRes.data) setDepthTools(depthRes.data);
      if (usrRes.data) setUsers(usrRes.data);
      if (promoRes.data) setPromoCodes(promoRes.data);
      if (pushRes.data) setPushHistory(pushRes.data);
      if (popRes.data) setPopups(popRes.data);
      if (cfgRes.data) setAppConfig(cfgRes.data);
      if (secRes.data) setSecurityAlerts(secRes.data);
      if (anaRes.data) setAnalyticsEvents(anaRes.data);
      if (fbRes.data) setUserFeedback(fbRes.data);
      if (labRes.data) setLabApplications(labRes.data);
    } catch {
      notify('تعذر تحديث البيانات من الخادم', 'error');
    } finally {
      setDataLoading(false);
    }
  }, [notify]);

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

  useEffect(() => {
    if (session && adminRecord) {
      fetchAllData();
    }
  }, [session, adminRecord, fetchAllData]);

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
          <Loader2 size={30} className="spinner" color="var(--primary)" style={{ margin: '0 auto 12px' }} />
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
            notify('أهلاً بك في لوحة تحكم Glassyfi v2', 'success');
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

      {/* Mobile Sticky Header */}
      <header className="mobile-topbar">
        <div className="brand-mark">
          <div className="brand-icon" style={{ width: 36, height: 36, borderRadius: 11 }}>
            <Sparkles size={19} />
          </div>
          <div>
            <div className="brand-title" style={{ fontSize: '0.98rem' }}>
              Glassyfi Admin
            </div>
            <div className="brand-subtitle">{currentTabMeta.label}</div>
          </div>
        </div>

        <div className="mobile-topbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={fetchAllData}
            disabled={dataLoading}
            aria-label="تحديث البيانات"
          >
            <RefreshCw size={16} className={dataLoading ? 'spinner' : ''} />
          </button>
          <button
            type="button"
            className="btn btn-danger btn-icon"
            onClick={handleLogout}
            aria-label="تسجيل الخروج"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Desktop Right Sidebar (RTL) */}
      <aside className="glass-panel desktop-rail" aria-label="التنقل الرئيسي">
        <div className="brand-mark" style={{ padding: '2px 6px' }}>
          <div className="brand-icon">
            <Sparkles size={21} />
          </div>
          <div>
            <div className="brand-title">Glassyfi</div>
            <div className="brand-subtitle">Obsidian Admin v2</div>
          </div>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--emerald)' }}>
              <span className="live-dot" />
              مزامنة فورية مفعّلة
            </span>
            <span className="mono" style={{ color: 'var(--text-secondary)' }}>
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
