import { useState } from 'react';
import {
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { supabase, verifyAdminAccess } from '../lib/supabase';

export function LoginScreen({ onAuthenticated, initialError = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError || !data?.session?.user) {
        setError('بيانات الدخول غير صحيحة. تأكد من البريد الإلكتروني وكلمة المرور.');
        return;
      }

      const { isAdmin, record } = await verifyAdminAccess(data.session.user.id);
      if (!isAdmin) {
        await supabase.auth.signOut();
        setError('هذا الحساب غير مخوّل للوصول إلى لوحة تحكم Glassyfi الإدارية.');
        return;
      }

      onAuthenticated(data.session, record);
    } catch {
      setError('تعذر الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="glass-panel login-card" aria-label="تسجيل دخول الإدارة">
        <div className="login-header">
          <div className="brand-icon">
            <Sparkles size={26} />
          </div>
          <h1>Glassyfi Admin</h1>
          <p>لوحة التحكم السحابية لإدارة التطبيق والخلفيات</p>
        </div>

        {error && (
          <div className="alert-banner alert-danger" style={{ marginBottom: 18 }}>
            <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid" noValidate>
          <div className="field">
            <label className="field-label" htmlFor="admin-email">
              البريد الإلكتروني
            </label>
            <div className="input-with-icon">
              <span className="input-icon-right">
                <Mail size={16} />
              </span>
              <input
                id="admin-email"
                type="email"
                className="input ltr"
                placeholder="admin@glassyfi.app"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="admin-password">
              كلمة المرور
            </label>
            <div className="input-with-icon">
              <span className="input-icon-right">
                <Lock size={16} />
              </span>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                className="input ltr"
                style={{ paddingLeft: 42 }}
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="input-action-left"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            style={{ marginTop: 8, padding: '12px 18px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="spinner" />
                جاري التحقق من الصلاحيات...
              </>
            ) : (
              <>
                <LogIn size={18} />
                تسجيل الدخول
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
