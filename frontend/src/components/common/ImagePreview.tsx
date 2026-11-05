import React, { useEffect, useState } from 'react';
import { LoaderCircle, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { SmartImage } from './SmartImage';
import { isImageLoaded } from '../../utils/imagePreload';

type ImagePreviewProps = {
  src: string;
  alt: string;
  /**
   * ارتفاع ثابت کادر نمایش. ثابت بودنش دو فایده دارد: پیش از رسیدن تصویر صفحه
   * نمی‌لرزد و تصویر همیشه کامل و متناسب در همین کادر جا می‌شود (بدون بریدن).
   */
  heightClass?: string;
  className?: string;
  /** گزارش خطای لود به والد (مثلاً برای نمایش پیام مجوز). */
  onError?: () => void;
  onReady?: () => void;
  /** متن پیام وقتی تصویر لود نمی‌شود. */
  errorText?: string;
};

/**
 * نمایش کامل تصویر در پیش‌نمایش‌ها.
 *
 * مشکل قبلی: کادر پیش‌نمایش ارتفاع آزاد داشت و تصویر با `h-full w-full` درون
 * آن کشیده می‌شد؛ نتیجه این بود که تصویرهای بلند بریده می‌شدند و «کامل» دیده
 * نمی‌شدند. اینجا تصویر همیشه با `object-contain` و «اندازهٔ کامل» نشان داده
 * می‌شود (نسبت ابعاد حفظ می‌شود، هیچ بخشی بریده نمی‌شود) و اگر کاربر بخواهد،
 * با یک کلیک به اندازهٔ واقعی و اسکرول‌دار می‌رود.
 */
export function ImagePreview({
  src,
  alt,
  heightClass = 'h-[62dvh]',
  className = '',
  onError,
  onReady,
  errorText = 'پیش‌نمایش این تصویر در دسترس نیست؛ فایل را دانلود کنید.',
}: ImagePreviewProps) {
  // تصویرِ کش‌شده از همان ابتدا «آماده» است: نه اسکلت، نه برچسب «در حال لود».
  const [ready, setReady] = useState(() => isImageLoaded(src));
  const [failed, setFailed] = useState(false);
  /** `fit` = کل تصویر در کادر، `actual` = اندازهٔ واقعی با اسکرول. */
  const [mode, setMode] = useState<'fit' | 'actual'>('fit');

  useEffect(() => {
    setReady(isImageLoaded(src));
    setFailed(false);
    setMode('fit');
  }, [src]);

  const handleError = () => {
    setFailed(true);
    onError?.();
  };

  if (failed) {
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center ${heightClass} ${className}`}
      >
        <p className="text-xs leading-6 text-slate-600">{errorText}</p>
        <button
          type="button"
          onClick={() => { setFailed(false); setReady(isImageLoaded(src)); }}
          className="ui-button ui-button-secondary !min-h-8 !px-3 !py-1.5 text-[10px]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          تلاش دوباره
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 ${heightClass}`}
      >
        {!ready && <div className="ui-skeleton absolute inset-0" aria-hidden />}
        {mode === 'fit' ? (
          <SmartImage
            src={src}
            alt={alt}
            priority
            busy
            fit="contain"
            onReady={() => { setReady(true); onReady?.(); }}
            onError={handleError}
            className="relative h-full w-full"
          />
        ) : (
          // اندازهٔ واقعی: تصویر با ابعاد طبیعی خودش و اسکرول افقی/عمودی.
          <div className={`h-full w-full overflow-auto`}>
            <img
              src={src}
              alt={alt}
              onLoad={() => setReady(true)}
              onError={handleError}
              className="mx-auto block max-w-none"
            />
          </div>
        )}
        {!ready && (
          <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-bold text-indigo-700 shadow-xs">
            <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
            در حال لود تصویر…
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-slate-400">
          {mode === 'fit' ? 'کل تصویر در کادر دیده می‌شود.' : 'تصویر در اندازهٔ واقعی خودش؛ برای دیدن بخش‌های دیگر اسکرول کنید.'}
        </span>
        <button
          type="button"
          onClick={() => setMode(previous => (previous === 'fit' ? 'actual' : 'fit'))}
          className="ui-button ui-button-ghost !min-h-7 !rounded-lg !px-2 !py-1 text-[10px]"
        >
          {mode === 'fit' ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          {mode === 'fit' ? 'نمایش اندازهٔ کامل' : 'متناسب با کادر'}
        </button>
      </div>
    </div>
  );
}
