import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/auth';
import { 
  Building2, 
  Lock, 
  User as UserIcon, 
  Phone, 
  ArrowLeft, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  KeyRound, 
  Clock, 
  X, 
  Check, 
  ChevronRight,
  LoaderCircle,
  Bot,
  RotateCcw
} from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    isLoggedIn, 
    loginWithCredentials,
    registerUser,
    authNotice
  } = useApp();
  const { loginWithBale } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loginMethod, setLoginMethod] = useState<'password' | 'bale'>('password');
  
  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [baleCode, setBaleCode] = useState('');
  const [baleCodeRequested, setBaleCodeRequested] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regDepartment, setRegDepartment] = useState('دپارتمان مهندسی نرم‌افزار');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Feedback states
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const loginSubmitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthModalOpen && isLoggedIn) return null;

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: 'رمز عبور را وارد کنید', color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) || /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, text: 'ضعیف (غیرایمن)', color: 'bg-rose-500', width: '33%' };
    if (score <= 4) return { score: 2, text: 'متوسط (قابل قبول)', color: 'bg-amber-500', width: '66%' };
    return { score: 3, text: 'بسیار قوی (ایمن)', color: 'bg-emerald-500', width: '100%' };
  };

  const passwordStrength = getPasswordStrength(regPassword);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!identifier.trim() || !password.trim()) {
      setErrorMessage('لطفاً نام کاربری و رمز عبور را وارد کنید.');
      return;
    }

    if (loginSubmitting.current) return;
    loginSubmitting.current = true;
    setIsSubmitting(true);
    try {
      const result = await loginWithCredentials(identifier.trim(), password, rememberMe);
      if (!result.success) {
        setErrorMessage(result.error || result.message || 'اطلاعات ورود نادرست است.');
      } else {
        setSuccessMessage(result.message || 'با موفقیت وارد شدید!');
        setTimeout(() => {
          setIsAuthModalOpen(false);
        }, 500);
      }
    } catch {
      setErrorMessage('اتصال به سرور برقرار نشد. دوباره تلاش کنید.');
    } finally {
      loginSubmitting.current = false;
      setIsSubmitting(false);
    }
  };

  const requestBaleCode = async (purpose: 'login' | 'password_reset') => {
    if (!identifier.trim() || isSubmitting) {
      if (!identifier.trim()) setErrorMessage('ابتدا نام کاربری خود را وارد کنید.');
      return;
    }
    setIsSubmitting(true); setErrorMessage(''); setSuccessMessage('');
    try {
      const response = await authApi.requestBaleCode(identifier.trim(), purpose);
      setBaleCodeRequested(true);
      setSuccessMessage(response.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ارسال کد ناموفق بود.');
    } finally { setIsSubmitting(false); }
  };

  const handleBaleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!baleCodeRequested) { await requestBaleCode('login'); return; }
    if (!/^\d{6}$/.test(baleCode)) { setErrorMessage('کد شش‌رقمی ارسال‌شده در بله را وارد کنید.'); return; }
    setIsSubmitting(true); setErrorMessage(''); setSuccessMessage('');
    try {
      const response = await loginWithBale(identifier.trim(), baleCode, rememberMe);
      setSuccessMessage(response.message || 'ورود امن با بله انجام شد.');
      setTimeout(() => setIsAuthModalOpen(false), 400);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ورود با کد بله ناموفق بود.');
    } finally { setIsSubmitting(false); }
  };

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!baleCodeRequested) { await requestBaleCode('password_reset'); return; }
    if (!/^\d{6}$/.test(baleCode)) { setErrorMessage('کد شش‌رقمی ارسال‌شده در بله را وارد کنید.'); return; }
    if (resetPassword.length < 8) { setErrorMessage('رمز عبور جدید باید حداقل ۸ نویسه باشد.'); return; }
    if (resetPassword !== resetPasswordConfirmation) { setErrorMessage('رمز عبور و تکرار آن یکسان نیستند.'); return; }
    setIsSubmitting(true); setErrorMessage(''); setSuccessMessage('');
    try {
      const response = await authApi.resetPasswordWithBale({ login: identifier.trim(), code: baleCode, password: resetPassword, password_confirmation: resetPasswordConfirmation });
      setSuccessMessage(response.message);
      setPassword(''); setBaleCode(''); setBaleCodeRequested(false); setResetPassword(''); setResetPasswordConfirmation('');
      setTimeout(() => setMode('login'), 900);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'بازیابی رمز عبور ناموفق بود.');
    } finally { setIsSubmitting(false); }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!regName.trim() || !regUsername.trim() || !regPassword.trim()) {
      setErrorMessage('لطفاً تمام فیلدهای الزامی ستاره‌دار را تکمیل کنید.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('رمز عبور و تکرار آن یکسان نیستند.');
      return;
    }

    if (!agreeTerms) {
      setErrorMessage('پذیرش قوانین و مقررات سازمانی الزامی است.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerUser({
        name: regName.trim(),
        username: regUsername.trim(),
        phone: regPhone.trim() || undefined,
        department: regDepartment,
        password: regPassword
      });

      if (!result.success) {
        setErrorMessage(result.error || result.message || 'خطا در ثبت‌نام کاربر.');
      } else {
        setSuccessMessage(result.message || 'ثبت‌نام با موفقیت انجام شد. پس از تأیید مدیر وارد شوید.');
        setPassword('');
        setTimeout(() => setMode('login'), 1200);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200 text-right" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Brand Banner Header */}
        <div className="p-6 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white relative">
          {isLoggedIn && (
            <button
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-4 left-4 p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-3.5 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center text-indigo-300 shadow-md">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-white">سامانه تدبیر</h2>
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/40 text-indigo-100 text-[10px] font-bold border border-indigo-400/30">
                  نسخه سازمانی
                </span>
              </div>
              <p className="text-xs text-indigo-100/80 mt-0.5">
                سامانه جامع مدیریت پروژه‌ها، دپارتمان‌ها و وظایف سازمانی
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body & Forms */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {/* Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {mode === 'login' && authNotice && !successMessage && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>{authNotice}</span>
            </div>
          )}

          {/* 1. LOGIN FORM */}
          {mode === 'login' && (
            <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button type="button" onClick={() => { setLoginMethod('password'); setBaleCodeRequested(false); setBaleCode(''); setErrorMessage(''); setSuccessMessage(''); }} className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${loginMethod === 'password' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}><Lock className="w-3.5 h-3.5" />رمز عبور</button>
                <button type="button" onClick={() => { setLoginMethod('bale'); setErrorMessage(''); setSuccessMessage(''); }} className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${loginMethod === 'bale' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500'}`}><Bot className="w-3.5 h-3.5" />کد یک‌بارمصرف بله</button>
              </div>

              {loginMethod === 'password' ? (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">نام کاربری <span className="text-rose-500">*</span></label>
                    <div className="relative"><UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" /><input type="text" required value={identifier} onChange={event => setIdentifier(event.target.value)} placeholder="mahdi.nabavi" dir="ltr" className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-left focus:bg-white focus:border-indigo-500 focus:outline-hidden" /></div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5"><label className="text-xs font-bold text-slate-700">رمز عبور <span className="text-rose-500">*</span></label><button type="button" onClick={() => { setMode('forgot'); setBaleCodeRequested(false); setBaleCode(''); setErrorMessage(''); setSuccessMessage(''); }} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold">رمز عبور را فراموش کرده‌ام</button></div>
                    <div className="relative"><Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" /><input type={showPassword ? 'text' : 'password'} required value={password} onChange={event => setPassword(event.target.value)} placeholder="رمز عبور ورود به سامانه" className="w-full pr-9 pl-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-3 text-slate-400 hover:text-slate-600">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} /><span className="text-xs font-bold text-slate-700">مرا به خاطر بسپار</span></label>
                  <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="w-full py-3 px-4 rounded-xl disabled:opacity-70 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-200 flex items-center justify-center gap-2">{isSubmitting ? <><LoaderCircle className="w-4 h-4 animate-spin" /><span>در حال ورود…</span></> : <><span>ورود به سامانه تدبیر</span><ArrowLeft className="w-4 h-4" /></>}</button>
                </form>
              ) : (
                <form onSubmit={handleBaleLogin} className="space-y-4">
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-[11px] leading-6 text-emerald-900">کد فقط به گفت‌وگوی خصوصی بله‌ای ارسال می‌شود که قبلاً از پروفایل شما به حساب سامانه متصل شده است.</div>
                  <div><label className="block text-xs font-bold text-slate-700 mb-1.5">نام کاربری</label><div className="relative"><UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" /><input type="text" required disabled={baleCodeRequested} value={identifier} onChange={event => setIdentifier(event.target.value)} dir="ltr" className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-left disabled:opacity-70" /></div></div>
                  {baleCodeRequested && <div><label className="block text-xs font-bold text-slate-700 mb-1.5">کد یک‌بارمصرف شش‌رقمی</label><div className="relative"><KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-3" /><input autoFocus inputMode="numeric" maxLength={6} value={baleCode} onChange={event => setBaleCode(event.target.value.replace(/\D/g, ''))} placeholder="••••••" dir="ltr" className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center tracking-[.45em] text-base font-bold" /></div><button type="button" disabled={isSubmitting} onClick={() => void requestBaleCode('login')} className="mt-2 text-[11px] font-bold text-indigo-700 flex items-center gap-1"><RotateCcw className="w-3 h-3" />ارسال کد جدید</button></div>}
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} /><span className="text-xs font-bold text-slate-700">مرا به خاطر بسپار</span></label>
                  <button type="submit" disabled={isSubmitting || (baleCodeRequested && baleCode.length !== 6)} aria-busy={isSubmitting} className="w-full py-3 px-4 rounded-xl disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-200 flex items-center justify-center gap-2">{isSubmitting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}{baleCodeRequested ? 'ورود با کد بله' : 'ارسال کد در بله'}</button>
                </form>
              )}
            </>
          )}

          {/* 2. REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نام و نام خانوادگی <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="مثال: کیانوش راد"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نام کاربری سازمانی <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required minLength={3}
                    value={regUsername}
                    onChange={e => setRegUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    placeholder="kianoush.rad"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all font-mono text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">


                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    شماره تلفن همراه
                  </label>
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all text-left font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  واحد سازمانی / دپارتمان
                </label>
                <select
                  value={regDepartment}
                  onChange={e => setRegDepartment(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer"
                >
                  <option value="دپارتمان مهندسی نرم‌افزار">دپارتمان مهندسی نرم‌افزار</option>
                  <option value="دپارتمان طراحی محصول و تجربه کاربری (UI/UX)">دپارتمان طراحی محصول و UI/UX</option>
                  <option value="دپارتمان زیرساخت و DevOps">دپارتمان زیرساخت و DevOps</option>
                  <option value="دپارتمان تضمین کیفیت (QA)">دپارتمان تضمین کیفیت (QA)</option>
                  <option value="دپارتمان بازاریابی و رشد">دپارتمان بازاریابی و رشد</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رمز عبور <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="حداقل ۶ کاراکتر"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تکرار رمز عبور <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={regConfirmPassword}
                    onChange={e => setRegConfirmPassword(e.target.value)}
                    placeholder="تکرار همان رمز"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                  />
                </div>
              </div>

              {/* Password strength visual indicator */}
              {regPassword && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">قدرت رمز عبور:</span>
                    <span className="font-bold text-slate-700">{passwordStrength.text}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${passwordStrength.color} transition-all duration-300`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                </div>
              )}

              {/* Terms Checkbox */}
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={e => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-[11px] text-slate-600 leading-relaxed">
                  تمامی قوانین و مقررات محرمانگی و امنیت اطلاعات <span className="font-bold text-slate-900">سامانه تدبیر</span> را می‌پذیرم.
                </span>
              </label>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <span>ثبت‌نام و عضویت در سامانه</span>
                <Check className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* بازیابی رمز با احراز هویت حساب متصل بله */}
          {mode === 'forgot' && (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3 text-[11px] leading-6 text-emerald-900">برای حفظ امنیت، کد بازیابی فقط به حساب بله‌ای ارسال می‌شود که قبلاً به پروفایل شما متصل شده است.</div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1.5">نام کاربری</label><input required disabled={baleCodeRequested} value={identifier} onChange={event => setIdentifier(event.target.value)} dir="ltr" className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-left disabled:opacity-70" /></div>
              {baleCodeRequested && <>
                <div><label className="block text-xs font-bold text-slate-700 mb-1.5">کد یک‌بارمصرف بله</label><input inputMode="numeric" maxLength={6} value={baleCode} onChange={event => setBaleCode(event.target.value.replace(/\D/g, ''))} dir="ltr" className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center tracking-[.45em] text-base font-bold" /></div>
                <div className="grid sm:grid-cols-2 gap-3"><div><label className="block text-xs font-bold text-slate-700 mb-1.5">رمز عبور جدید</label><input type="password" minLength={8} value={resetPassword} onChange={event => setResetPassword(event.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs" /></div><div><label className="block text-xs font-bold text-slate-700 mb-1.5">تکرار رمز عبور</label><input type="password" minLength={8} value={resetPasswordConfirmation} onChange={event => setResetPasswordConfirmation(event.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs" /></div></div>
                <button type="button" disabled={isSubmitting} onClick={() => void requestBaleCode('password_reset')} className="text-[11px] font-bold text-indigo-700 flex items-center gap-1"><RotateCcw className="w-3 h-3" />ارسال دوباره کد</button>
              </>}
              <button type="submit" disabled={isSubmitting || (baleCodeRequested && (baleCode.length !== 6 || resetPassword.length < 8))} className="w-full py-3 px-4 rounded-xl disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2">{isSubmitting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}{baleCodeRequested ? 'ثبت رمز عبور جدید' : 'ارسال کد بازیابی در بله'}</button>
            </form>
          )}

          {/* Mode Switchers */}
          <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
            {mode === 'login' && false && (
              <p>
                حساب کاربری در سامانه تدبیر ندارید؟{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className="font-extrabold text-indigo-600 hover:text-indigo-800 cursor-pointer underline mr-1"
                >
                  ثبت‌نام و ایجاد حساب
                </button>
              </p>
            )}

            {mode === 'register' && (
              <p>
                قبلاً در سامانه تدبیر ثبت‌نام کرده‌اید؟{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className="font-extrabold text-indigo-600 hover:text-indigo-800 cursor-pointer underline mr-1"
                >
                  ورود به حساب کاربری
                </button>
              </p>
            )}

            {mode === 'forgot' && (
              <p>
                رمز عبور خود را به یاد آوردید؟{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setBaleCodeRequested(false);
                    setBaleCode('');
                    setResetPassword('');
                    setResetPasswordConfirmation('');
                    setErrorMessage('');
                    setSuccessMessage('');
                  }}
                  className="font-extrabold text-indigo-600 hover:text-indigo-800 cursor-pointer underline mr-1"
                >
                  بازگشت به صفحه ورود
                </button>
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
