import React from 'react';
import { Wrench, RefreshCw, LogOut, ShieldCheck, Clock } from 'lucide-react';

export interface MaintenanceScreenProps {
  /** پیامِ فارسیِ مدیر سیستم؛ اگر خالی باشد متن پیش‌فرض نمایش داده می‌شود. */
  message?: string | null;
  /** نام سازمان برای سرصفحه. */
  orgName?: string;
  /** زمانِ شروع تعمیر (ISO)؛ اگر معتبر باشد به زمان محلی نمایش داده می‌شود. */
  startedAt?: string | null;
  /** بررسی دوبارهٔ وضعیت سامانه. */
  onRetry?: () => void | Promise<unknown>;
  retrying?: boolean;
  /** خروج از حساب؛ برای نشستی که پیش از تعمیر باز بوده است. */
  onLogout?: () => void | Promise<unknown>;
  /** رفتن به فرم ورود؛ مدیر کل سیستم باید بتواند وارد شود. */
  onAdminLogin?: () => void;
}

const DEFAULT_MESSAGE = 'سامانه در حال به‌روزرسانی و تعمیر است؛ لطفاً چند دقیقهٔ دیگر دوباره تلاش کنید.';

/** زمانِ شروع تعمیر با تقویم و ساعتِ محلی؛ مقدار نامعتبر نمایش داده نمی‌شود. */
function readableStart(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

/**
 * صفحهٔ «حالت تعمیر» — تنها چیزی که کاربران غیرمدیر در این حالت می‌بینند.
 *
 * این صفحه عمداً یک صفحهٔ مستقل و تمام‌صفحه است (نه توست یا بنر) تا کاربر
 * به‌جای «خطای عمومی» دقیقاً بداند سامانه در تعمیر است، چه زمانی برمی‌گردد و
 * چگونه خارج شود.
 */
export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  message, orgName, startedAt, onRetry, retrying = false, onLogout, onAdminLogin,
}) => {
  const text = (message || '').trim() || DEFAULT_MESSAGE;
  const started = readableStart(startedAt);

  return (
    <div dir="rtl" className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4 sm:p-6 font-sans text-slate-900">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 overflow-hidden" role="alert" aria-live="polite">
        <div className="bg-gradient-to-l from-amber-400 to-amber-500 px-6 py-7 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/40">
              <Wrench className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-black leading-7">سامانه در حال تعمیر است</h1>
              <p className="mt-0.5 text-xs text-amber-50/95 break-words">
                {orgName?.trim() ? orgName : 'سامانه سازمانی تدبیر'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          <p className="text-sm leading-7 text-slate-700 whitespace-pre-line break-words">{text}</p>

          {started && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>شروع تعمیر: {started}</span>
            </p>
          )}

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900 flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>در این مدت تنها کاربران با نقش «مدیریت کل سیستم» می‌توانند وارد شوند و بقیهٔ کاربران پس از پایان تعمیر دسترسی خود را باز می‌بینند.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {onRetry && (
              <button
                type="button"
                onClick={() => void onRetry()}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-200 transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{retrying ? 'در حال بررسی…' : 'بررسی دوباره'}</span>
              </button>
            )}
            {onAdminLogin && (
              <button
                type="button"
                onClick={onAdminLogin}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>ورود مدیر کل سیستم</span>
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={() => void onLogout()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>خروج از حساب</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
