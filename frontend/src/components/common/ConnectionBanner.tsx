import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import { installConnectionWatchers, isOffline, probeConnection, subscribeConnection } from '../../utils/connectionState';

/** فاصلهٔ تلاش‌های خودکار؛ کوتاه، ولی نه آن‌قدر که هر ثانیه شبکه را بزند. */
const AUTO_RETRY_DELAYS = [2000, 6000, 12000];
/** چند تلاش خودکار دونبال هم؛ بعد از آن فقط با دکمه بررسی می‌شود. */
const MAX_AUTO_ATTEMPTS = AUTO_RETRY_DELAYS.length;

/**
 * نوار «خطای اتصال» در سراسر سامانه.
 *
 * تاریخچهٔ این نوار: پیش‌تر خطای شبکه یک متن قرمز خشک داخل صفحه بود. سپس نوار
 * زیبای پایین صفحه آمد، اما یک ایراد داشت: **خودش هیچ بررسی‌ای نمی‌کرد**.
 * کافی بود یک درخواست در لحظهٔ ضعیف‌بودن شبکه شکست بخورد تا پیام «اینترنت قطع
 * است» تا ابد روی صفحه بماند؛ کاربر فکر می‌کرد سامانه خراب است، در حالی که
 * اتصال چند ثانیه بعد برگشته بود.
 *
 * رفتار دور ۸۰:
 *  ۱) به‌محض دیده‌شدن قطعی، خودش **چند بار** اتصال را بررسی می‌کند
 *     (۲ ثانیه، ۶ ثانیه و ۱۲ ثانیه بعد)؛
 *  ۲) اگر بررسی موفق شد، پیام سبز «اتصال دوباره برقرار شد» می‌آید و پس از چند
 *     ثانیه **خودکار** محو می‌شود؛
 *  ۳) اگر هر سه تلاش ناموفق بود، پنجرهٔ بزرگ **خودکار جمع می‌شود** و فقط یک
 *     قرص کوچک با دکمهٔ «بررسی اتصال» می‌ماند؛ از آن به بعد هیچ درخواست
 *     خودکاری فرستاده نمی‌شود و بررسی فقط با خواست کاربر انجام می‌شود.
 */
export const ConnectionBanner: React.FC = () => {
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(isOffline());
  const [restored, setRestored] = useState(false);
  const [checking, setChecking] = useState(false);
  /** چند تلاش خودکار انجام شده است؛ با رسیدن به سقف، حالت «فقط دکمه» می‌شود. */
  const [autoAttempts, setAutoAttempts] = useState(0);
  const timerRef = useRef<number | null>(null);
  const checkingRef = useRef(false);

  /** یک بررسی واقعی؛ نتیجه‌اش وضعیت مشترک را هم به‌روز می‌کند. */
  const check = useCallback(async (): Promise<boolean> => {
    if (checkingRef.current) return false;
    checkingRef.current = true;
    setChecking(true);
    try {
      const reachable = await probeConnection();
      if (reachable) {
        setOffline(false);
        setRestored(true);
        // داده‌های صفحه با برگشتن اتصال تازه می‌شوند تا کاربر کارش را ادامه دهد.
        void queryClient.refetchQueries({ type: 'active' });
      }
      return reachable;
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [queryClient]);

  useEffect(() => {
    const uninstall = installConnectionWatchers();
    const unsubscribe = subscribeConnection(next => {
      setOffline(next);
      if (!next) {
        setRestored(true);
        setAutoAttempts(0);
      } else {
        // قطع تازه: شمارندهٔ تلاش‌ها از صفر شروع می‌شود.
        setAutoAttempts(0);
      }
    });
    return () => { unsubscribe(); uninstall(); };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => setRestored(false), 3200);
    return () => window.clearTimeout(timer);
  }, [restored]);

  /**
   * حلقهٔ تلاش خودکار.
   *
   * هر تلاش یک تایمر تازه می‌گیرد تا فاصله‌ها پلکانی باشند؛ نتیجهٔ دیررس پس از
   * قطع‌شدن اثر (unmount یا برگشتن اتصال) نادیده گرفته می‌شود.
   */
  useEffect(() => {
    if (!offline || autoAttempts >= MAX_AUTO_ATTEMPTS) return;
    const delay = AUTO_RETRY_DELAYS[autoAttempts];
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void check().then(reachable => {
        if (!reachable) setAutoAttempts(previous => previous + 1);
      });
    }, delay);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [offline, autoAttempts, check]);

  /** دکمهٔ «بررسی اتصال»: همیشه بررسی می‌کند و در صورت شکست، تلاش‌ها را از نو می‌گذارد. */
  const manualCheck = async () => {
    const reachable = await check();
    if (!reachable) {
      setAutoAttempts(0);
    }
  };

  if (!offline && !restored) return null;

  if (!offline) {
    return (
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4" dir="rtl">
        <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-2.5 text-[11px] font-bold text-emerald-700 shadow-lg backdrop-blur">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          اتصال دوباره برقرار شد.
        </div>
      </div>
    );
  }

  const exhausted = autoAttempts >= MAX_AUTO_ATTEMPTS;

  // سقف تلاش خودکار: پنجرهٔ بزرگ جمع می‌شود و فقط یک قرص کوچک می‌ماند.
  if (exhausted && !checking) {
    return (
      <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4" dir="rtl">
        <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2 rounded-full border border-amber-200 bg-white/95 py-1.5 pe-1.5 ps-3 text-[11px] font-bold text-amber-900 shadow-lg backdrop-blur">
          <WifiOff className="h-3.5 w-3.5 text-amber-600" aria-hidden />
          اتصال برقرار نشد؛ بررسی خودکار متوقف شد.
          <button
            type="button"
            onClick={() => void manualCheck()}
            className="ui-button ui-button-secondary !min-h-8 !rounded-full !px-3 !py-1 text-[11px]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            بررسی اتصال
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="alert" aria-live="assertive" className="fixed inset-x-0 bottom-4 z-[120] flex justify-center px-4" dir="rtl">
      <div className="animate-in fade-in slide-in-from-bottom-2 w-full max-w-xl overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
        <div className="flex items-start gap-3 p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <WifiOff className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-slate-900">ارتباط با اینترنت برقرار نیست</p>
            <p className="mt-1 text-[11px] leading-6 text-slate-500">
              {checking
                ? 'در حال بررسی اتصال… اگر اتصال برگشته باشد، همین صفحه بدون از دست رفتن اطلاعات دوباره بارگذاری می‌شود.'
                : 'اتصال شبکه یا اینترنت دستگاه خود را بررسی کنید. تلاش خودکار ادامه دارد و پس از برقراری اتصال، همین پیام خودش بسته می‌شود.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void manualCheck()}
            disabled={checking}
            className="ui-button ui-button-secondary !min-h-9 shrink-0 !rounded-xl !px-3 !py-1.5 text-[11px]"
          >
            {checking
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            {checking ? 'در حال بررسی…' : 'بررسی اتصال'}
          </button>
        </div>
        <div className="h-1 bg-gradient-to-l from-amber-400 via-amber-300 to-transparent" aria-hidden>
          {/* پیشرفت تلاش‌های خودکار: کاربر می‌داند سیستم دارد تلاش می‌کند. */}
          <div className="flex h-1 gap-0.5">
            {Array.from({ length: MAX_AUTO_ATTEMPTS }, (_, index) => (
              <span key={index} className={`h-1 flex-1 rounded-full ${index < autoAttempts ? 'bg-amber-500' : 'bg-amber-200/60'}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
