import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authErrorMessage, authExtApi } from './api';

/** Public auth shell — Persian RTL, flat Ocean surfaces (ADR-0020). Public
 * auth pages never render inside authenticated sidebars. */
export function PublicAuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main dir="rtl" data-auth-public className="min-h-screen bg-[#F5F9FA] text-[#1d2f38]">
      <div className="mx-auto w-full max-w-md px-4 py-10">
        <p className="mb-2 text-center text-sm font-bold text-[#39677C]">تدبیر</p>
        <h1 className="mb-6 text-center text-xl font-extrabold">{title}</h1>
        <section className="rounded-2xl border border-[#dbe7ec] bg-white p-5 shadow-surface">{children}</section>
      </div>
    </main>
  );
}

const inputClassName = 'w-full rounded-lg border border-[#dbe7ec] bg-white px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39677C]';
const buttonClassName = 'w-full rounded-lg bg-[#39677C] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39677C] focus-visible:ring-offset-2';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { setMessage((await authExtApi.forgotPassword(email)).message); }
    catch (e) { setError(authErrorMessage(e, 'ثبت درخواست بازیابی ناموفق بود.')); }
  };
  return (
    <PublicAuthShell title="بازیابی رمز عبور">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">ایمیل تأییدشده
          <input dir="ltr" className={inputClassName} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button className={buttonClassName} type="submit">ارسال پیوند بازیابی</button>
        <p className="text-center text-sm"><Link className="text-[#39677C] font-bold" to="/login">بازگشت به ورود</Link></p>
      </form>
    </PublicAuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      await authExtApi.resetPassword({ email: params.get('email') || '', token: params.get('token') || '', password, password_confirmation: confirmation });
      navigate('/login');
    } catch (e) { setError(authErrorMessage(e, 'بازنشانی رمز ناموفق بود؛ پیوند ممکن است منقضی شده باشد.')); }
  };
  return (
    <PublicAuthShell title="تنظیم رمز عبور جدید">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">رمز عبور جدید
          <input dir="ltr" className={inputClassName} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm">تکرار رمز عبور
          <input dir="ltr" className={inputClassName} type="password" required minLength={8} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button className={buttonClassName} type="submit">ذخیره رمز جدید و ورود</button>
      </form>
    </PublicAuthShell>
  );
}

export function EmailConfirmPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'pending' | 'done' | 'error'>('pending');
  useEffect(() => {
    let cancelled = false;
    const token = params.get('token');
    if (!token) { setState('error'); return; }
    authExtApi.confirmEmail(token)
      .then(() => { if (!cancelled) setState('done'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [params]);
  return (
    <PublicAuthShell title="تأیید ایمیل">
      {state === 'pending' && <p role="status">در حال تأیید ایمیل…</p>}
      {state === 'done' && <div className="space-y-4"><p role="status" className="text-emerald-700">ایمیل شما تأیید شد و حساب فعال گردید.</p><Link className={buttonClassName + ' block text-center'} to="/welcome">ادامه و شروع کار</Link></div>}
      {state === 'error' && <p role="alert" className="text-rose-700">پیوند تأیید نامعتبر یا منقضی شده است. از حساب کاربری، پیوند تازه درخواست کنید.</p>}
    </PublicAuthShell>
  );
}

/** Mobile OTP login: challenge → code with resend countdown + attempt copy. */
export function MobileOtpPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);
  const requestCode = async () => {
    setError('');
    try { await authExtApi.otpChallenge(phone); setSent(true); setCountdown(60); }
    catch (e) { setError(authErrorMessage(e, 'ارسال کد تأیید ناموفق بود.')); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { await authExtApi.otpLogin(phone, code); navigate('/dashboard'); }
    catch (e) { setError(authErrorMessage(e, 'کد واردشده معتبر نیست یا منقضی شده است.')); }
  };
  return (
    <PublicAuthShell title="ورود با موبایل">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">شماره موبایل
          <input dir="ltr" className={inputClassName} inputMode="tel" placeholder="09…" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {!sent && <button type="button" className={buttonClassName} onClick={() => void requestCode()}>دریافت کد تأیید</button>}
        {sent && (
          <>
            <label className="block text-sm">کد تأیید پیامکی
              <input dir="ltr" className={inputClassName} inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <button type="submit" className={buttonClassName}>ورود</button>
            <button type="button" disabled={countdown > 0} className="w-full text-sm text-[#39677C] disabled:text-slate-400" onClick={() => void requestCode()}>
              {countdown > 0 ? `ارسال دوباره کد تا ${countdown} ثانیه دیگر` : 'ارسال دوباره کد'}
            </button>
          </>
        )}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <p className="text-center text-sm"><Link className="text-[#39677C] font-bold" to="/login">ورود با نام کاربری و رمز</Link></p>
      </form>
    </PublicAuthShell>
  );
}

/** Step-up: sensitive action after 30 days on a new device (AMB-04=A). */
export function StepUpPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try { await authExtApi.reauthenticate(password); await authExtApi.completeStepUp(); navigate('/dashboard'); }
    catch (e) { setError(authErrorMessage(e, 'تأیید هویت دوباره ناموفق بود.')); }
  };
  return (
    <PublicAuthShell title="تأیید هویت دوباره">
      <p className="mb-4 text-sm text-slate-600">برای امنیت حساب، پس از مدت طولانی عدم فعالیت در یک دستگاه تازه، رمز عبور را دوباره وارد کنید.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">رمز عبور
          <input dir="ltr" className={inputClassName} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button className={buttonClassName} type="submit">تأیید و ادامه</button>
      </form>
    </PublicAuthShell>
  );
}

/** One-time welcome: invitations + personal workspace checklist (SPEC §6.7). */
export function WelcomePage() {
  const navigate = useNavigate();
  const [state, setState] = useState<{ welcomed: boolean; invitations: number; personal_workspace: boolean } | null>(null);
  useEffect(() => { authExtApi.welcomeState().then(setState).catch(() => setState(null)); }, []);
  const finish = async () => { try { await authExtApi.welcomeComplete(); } finally { navigate('/select-environment'); } };
  return (
    <PublicAuthShell title="خوش آمدید به تدبیر">
      {state === null ? <p role="status">در حال آماده‌سازی فضای کاری شما…</p> : (
        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            <li>{state.personal_workspace ? '✓ فضای کاری شخصی شما ساخته شد.' : 'فضای کاری شخصی در حال آماده‌سازی است؛ در صورت نبود بسته رایگان، این مورد به‌عنوان وابستگی ثبت شده است.'}</li>
            <li>{state.invitations > 0 ? `✓ ${state.invitations} دعوت در انتظار بررسی دارید.` : 'دعوت فعالی برای شما ثبت نشده است.'}</li>
          </ul>
          <button type="button" className={buttonClassName} onClick={() => void finish()}>شروع کار</button>
        </div>
      )}
    </PublicAuthShell>
  );
}

/** Registration (A01): user-chosen username, optional email, terms evidence. */
export function RegisterPage() {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', password_confirmation: '' });
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!terms) { setError('پذیرش قوانین و حریم خصوصی برای ساخت حساب الزامی است.'); return; }
    try {
      const { request, initSanctum } = await import('../../shared/api/client');
      await initSanctum();
      await request('/auth/register', { method: 'POST', body: { ...form, email: form.email || undefined, terms_accepted: true, terms_version: '1.0' } });
      setDone(true);
    } catch (e) { setError(authErrorMessage(e, 'ثبت‌نام ناموفق بود.')); }
  };
  if (done) return (
    <PublicAuthShell title="حساب ساخته شد">
      <div className="space-y-4">
        <p role="status">ثبت‌نام انجام شد. {form.email ? 'پیوند تأیید به ایمیل شما ارسال شد؛ پس از تأیید، حساب و فضای کاری شخصی فعال می‌شود.' : 'حساب شما در انتظار فعال‌سازی است.'}</p>
        <Link className={buttonClassName + ' block text-center'} to="/login">رفتن به ورود</Link>
      </div>
    </PublicAuthShell>
  );
  return (
    <PublicAuthShell title="ساخت حساب">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">نام نمایشی
          <input className={inputClassName} required value={form.name} onChange={(e) => set('name')(e.target.value)} />
        </label>
        <label className="block text-sm">نام کاربری (به انتخاب شما)
          <input dir="ltr" className={inputClassName} required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}" title="نام کاربری لاتین، حداقل ۳ نویسه" value={form.username} onChange={(e) => set('username')(e.target.value)} />
          <span className="mt-1 block text-xs text-slate-500">نام کاربری شناسهٔ ورود شماست و با حروف کوچک و بزرگ یکسان در نظر گرفته می‌شود.</span>
        </label>
        <label className="block text-sm">ایمیل (اختیاری)
          <input dir="ltr" className={inputClassName} type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
        </label>
        <label className="block text-sm">رمز عبور
          <input dir="ltr" className={inputClassName} type="password" required minLength={8} value={form.password} onChange={(e) => set('password')(e.target.value)} />
          <span className="mt-1 block text-xs text-slate-500">حداقل ۸ نویسه؛ رمز طولانی‌تر، امن‌تر است.</span>
        </label>
        <label className="block text-sm">تکرار رمز عبور
          <input dir="ltr" className={inputClassName} type="password" required minLength={8} value={form.password_confirmation} onChange={(e) => set('password_confirmation')(e.target.value)} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
          <span>قوانین استفاده و حریم خصوصی (نسخه 1.0) را می‌پذیرم.</span>
        </label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button className={buttonClassName} type="submit">ساخت حساب</button>
        <a className="block text-center text-sm font-bold text-[#39677C]" href="/api/v1/auth/google/redirect">ادامه با گوگل</a>
        <p className="text-center text-sm">حساب دارید؟ <Link className="text-[#39677C] font-bold" to="/login">ورود</Link></p>
      </form>
    </PublicAuthShell>
  );
}
