import { useCallback, useEffect, useState } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  LayoutGrid,
  Users,
  Bell,
  SlidersHorizontal,
  RefreshCw,
  LogOut,
  Loader2,
} from 'lucide-react';
import { supabase, verifyAdminAccess } from './lib/supabase';
import { LoginScreen } from './components/LoginScreen';
import { ToastList } from './components/Toast';
import { WallpapersTab } from './components/WallpapersTab';
import { WidgetsTab } from './components/WidgetsTab';
import { UsersTab } from './components/UsersTab';
import { NotificationsTab } from './components/NotificationsTab';
import { ConfigTab } from './components/ConfigTab';

const TABS = [
  { id: 'wallpapers', label: 'الخلفيات', shortLabel: 'الخلفيات', icon: ImageIcon },
  { id: 'widgets', label: 'الويدجيت', shortLabel: 'الويدجيت', icon: LayoutGrid },
  { id: 'users', label: 'المستخدمين والأكواد', shortLabel: 'المستخدمين', icon: Users },
  { id: 'notifications', label: 'الإشعارات والمنبثقة', shortLabel: 'الإشعارات', icon: Bell },
  { id: 'config', label: 'التحديث والصيانة', shortLabel: 'التحديث', icon: SlidersHorizontal },
];

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [session, setSession] = useState(null);
  const [adminRecord, setAdminRecord] = useState(null);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('wallpapers');
  const [dataLoading, setDataLoading] = useState(false);

  const [categories, setCategories] = useState([]);
  const [wallpapers, setWallpapers] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [users, setUsers] = useState([]);
  const [promoCodes, setPromoCodes] = useState([]);
  const [pushHistory, setPushHistory] = useState([]);
  const [popups, setPopups] = useState([]);
  const [appConfig, setAppConfig] = useState(null);

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
        usrRes,
        promoRes,
        pushRes,
        popRes,
        cfgRes,
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
          .from('app_users')
          .select('*')
          .order('last_seen_at', { ascending: false })
          .limit(300),
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
      ]);

      const firstError =
        catRes.error ||
        wpRes.error ||
        widRes.error ||
        usrRes.error ||
        promoRes.error ||
        pushRes.error ||
        popRes.error ||
        cfgRes.error;

      if (firstError) {
        notify(`تنبيه أثناء جلب البيانات: ${firstError.message}`, 'error');
      }

      if (catRes.data) setCategories(catRes.data);
      if (wpRes.data) setWallpapers(wpRes.data);
      if (widRes.data) setWidgets(widRes.data);
      if (usrRes.data) setUsers(usrRes.data);
      if (promoRes.data) setPromoCodes(promoRes.data);
      if (pushRes.data) setPushHistory(pushRes.data);
      if (popRes.data) setPopups(popRes.data);
      if (cfgRes.data) setAppConfig(cfgRes.data);
    } catch {
      notify('تعذر تحديث البيانات من الخادم', 'error');
    } finally {
      setDataLoading(false);
    }
  }, [notify]);

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
    setUsers([]);
    setPromoCodes([]);
    setPushHistory([]);
    setPopups([]);
    setAppConfig(null);
    notify('تم تسجيل الخروج بنجاح', 'info');
  }

  function getTabCount(tabId) {
    if (tabId === 'wallpapers') return wallpapers.length;
    if (tabId === 'widgets') return widgets.length;
    if (tabId === 'users') return users.length;
    if (tabId === 'notifications') return popups.filter((p) => p.is_active).length;
    return null;
  }

  if (authChecking) {
    return (
      <main className="login-shell">
        <div className="glass-panel login-card" style={{ textAlign: 'center', padding: 40 }}>
          <Loader2 size={30} className="spinner" color="var(--accent)" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
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
            notify('أهلاً بك في لوحة تحكم Glassyfi', 'success');
          }}
        />
      </>
    );
  }

  const currentTabMeta = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <div className="app-shell">
      <ToastList toasts={toasts} onDismiss={dismissToast} />

      {/* Mobile Sticky Header */}
      <header className="mobile-topbar">
        <div className="brand-mark">
          <div className="brand-icon" style={{ width: 38, height: 38, borderRadius: 12 }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div className="brand-title" style={{ fontSize: '1.02rem' }}>
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
            title="تحديث البيانات"
          >
            <RefreshCw size={17} className={dataLoading ? 'spinner' : ''} />
          </button>
          <button
            type="button"
            className="btn btn-danger btn-icon"
            onClick={handleLogout}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* Desktop Right-Side Floating Glass Rail (RTL) */}
      <aside className="glass-panel desktop-rail" aria-label="التنقل الرئيسي">
        <div className="brand-mark" style={{ padding: '4px 6px' }}>
          <div className="brand-icon">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="brand-title">Glassyfi</div>
            <div className="brand-subtitle">لوحة التحكم السحابية</div>
          </div>
        </div>

        <nav className="rail-nav">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = getTabCount(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                className={`rail-btn${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="rail-btn-inner">
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </span>
                {count !== null && <span className="rail-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="rail-footer">
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

      {/* Active Tab Content */}
      <main className="main-content">
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
            loading={dataLoading}
            onRefresh={fetchAllData}
            notify={notify}
          />
        )}
        {activeTab === 'users' && (
          <UsersTab
            users={users}
            promoCodes={promoCodes}
            loading={dataLoading}
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

      {/* Mobile Bottom Tab Bar */}
      <nav className="mobile-bottom-nav" aria-label="شريط التنقل السفلي">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-nav-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={20} />
              <span>{tab.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
