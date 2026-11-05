import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import { installConnectionWatchers, isOffline, subscribeConnection } from '../../utils/connectionState';

/**
 * نوار زیبای «خطای اتصال» در سراسر سامانه.
 *
 * پیش‌تر خطای شبکه به‌صورت یک متن قرمز خشک داخل هر صفحه دیده می‌شد و کاربر
 * نمی‌دانست چه کاری باید بکند. این نوار:
 *  - فقط وقتی اتصال واقعاً قطع است ظاهر می‌شود (نه برای خطای ۴xx/۵xx سرور)،
 *  - وضعیت را با آیکون و جملهٔ روشن می‌گوید و دکمهٔ «تلاش دوباره» دارد که
 *    همهٔ داده‌های صفحه را تازه می‌کند،
 *  - با برگشتن اتصال، پیام سبز کوتاه «اتصال برقرار شد» نشان می‌دهد و خودش
 *    ناپدید می‌شود.
 */
export const ConnectionBanner: React.FC = () => {
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(isOffline());
  const [restored, setRestored] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const uninstall = installConnectionWatchers();
    const unsubscribe = subscribeConnection(next => {
      setOffline(next);
      if (!next) {
        setRetrying(false);
        setRestored(true);
      }
    });
    return () => { unsubscribe(); uninstall(); };
  }, []);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => setRestored(false), 3200);
    return () => window.clearTimeout(timer);
  }, [restored]);

  const retry = async () => {
    setRetrying(true);
    try {
      // همهٔ کوئری‌های فعال دوباره اجرا می‌شوند؛ اگر اتصال برگشته باشد، نوار
      // خودش بسته می‌شود.
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRetrying(false);
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
              اتصال شبکه یا اینترنت دستگاه خود را بررسی کنید. پس از برقراری اتصال، همین صفحه بدون
              از دست رفتن اطلاعات دوباره بارگذاری می‌شود.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="ui-button ui-button-secondary !min-h-9 shrink-0 !rounded-xl !px-3 !py-1.5 text-[11px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden />
            {retrying ? 'در حال تلاش…' : 'تلاش دوباره'}
          </button>
        </div>
        <div className="h-1 bg-gradient-to-l from-amber-400 via-amber-300 to-transparent" aria-hidden />
      </div>
    </div>
  );
};
