import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
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
  LoaderCircle
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

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  
  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

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

    if (isSubmitting) return;
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
      setIsSubmitting(false);
    }
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
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  نام کاربری <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="mahdi.nabavi" dir="ltr" style={{ textAlign: "left" }}
                    className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    رمز عبور <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                  >
                    رمز عبور را فراموش کرده‌ام
                  </button>
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="رمز عبور ورود به سامانه..."
                    className="w-full pr-9 pl-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-700">مرا به خاطر بسپار (ورود خودکار)</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="w-full py-3 px-4 rounded-xl disabled:opacity-70 disabled:cursor-wait bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-extrabold text-xs transition-all shadow-md shadow-indigo-200 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {isSubmitting ? <><LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" /><span role="status">در حال ورود، لطفاً منتظر بمانید…</span></> : <><span>ورود به سامانه تدبیر</span><ArrowLeft className="w-4 h-4" /></>}
              </button>
            </form>
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

          {/* Recovery is an authorized administrator action, never a simulated code flow. */}
          {mode === 'forgot' && (
            <div role="status" className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm leading-relaxed">
              برای بازیابی رمز عبور، با مدیر سامانه تماس بگیرید. مدیر پس از احراز هویت شما، از بخش مدیریت کاربران رمز جدید تعیین می‌کند.
            </div>
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
