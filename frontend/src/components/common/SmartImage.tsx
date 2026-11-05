import React, { useEffect, useRef, useState } from 'react';
import { isImageLoaded, markImageLoaded, preloadImage } from '../../utils/imagePreload';

type SmartImageProps = {
  src?: string | null;
  alt: string;
  /** کلاس‌های کادر بیرونی: اندازه، گردی، حاشیه، نمایش (block/flex/inline-flex). */
  className?: string;
  /** کلاس‌های خود تصویر (مثلاً `object-contain`). */
  imgClassName?: string;
  /**
   * چطور در کادر جا شود: `cover` کادر را پر می‌کند (بندانگشتی)، `contain`
   * تصویر را کامل و بدون بریدن نشان می‌دهد (پیش‌نمایش تصویر).
   */
  fit?: 'cover' | 'contain';
  /** بالای صفحه یا داخل مدال: بدون `lazy` و با اولویت بالا لود می‌شود. */
  priority?: boolean;
  /** محتوای جایگزین هنگام خطا یا نبود نشانی. */
  fallback?: React.ReactNode;
  /** نشانگر چرخان در میانهٔ کادر تا آماده‌شدن تصویر. */
  busy?: boolean;
  /** گزارش آماده‌شدن تصویر به والد (مثلاً برای برداشتن اسکلت لودینگ). */
  onReady?: () => void;
  onError?: () => void;
  title?: string;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
};

/**
 * تصویر با لود تدریجی «مات → واضح».
 *
 * نکتهٔ کلیدی کارایی: عنصر `<img>` از همان نخستین رندر ساخته می‌شود و درخواست
 * شبکه بلافاصله آغاز می‌شود؛ هیچ حالت «اول چیزی نشان نده، بعد لود کن» وجود
 * ندارد. حالت مات فقط یک فیلتر CSS است (`blur` + مقیاس کوچک) روی همان
 * درخواست واحد و پس از `decode()` در نیم‌ثانیه برداشته می‌شود. بنابراین زمان
 * رسیدن تصویر دقیقاً همان قبلی است، ولی تجربهٔ بصری پیوسته‌تر است و کادر با
 * پس‌زمینهٔ درخشان، پرش چیدمان (layout shift) ندارد.
 */
export function SmartImage({
  src,
  alt,
  className = '',
  imgClassName = '',
  fit = 'cover',
  priority = false,
  fallback,
  busy = false,
  onReady,
  onError,
  title,
  referrerPolicy,
}: SmartImageProps) {
  const url = (src || '').trim();
  // تصویرِ از قبل لود‌شده از همان نخستین رندر «آماده» است؛ باز‌کردن دوبارهٔ مدال
  // پیش‌نمایش نباید یک‌بار دیگر اسکلت/بلور را نشان دهد.
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(
    url ? (isImageLoaded(url) ? 'ready' : 'loading') : 'error',
  );
  const imgRef = useRef<HTMLImageElement | null>(null);
  const readyReported = useRef(false);
  // کال‌بک در ref نگه داشته می‌شود تا تغییر هویت آن، افکتِ وضعیت را دوباره اجرا نکند.
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;

  const markReady = () => {
    // یک فریم صبر می‌کنیم تا مرورگر حالت «مات» را رنگ کند و سپس گذار واضح‌شدن
    // دیده شود؛ روی تصویر کش‌شده هم همین گذار کوتاه اجرا می‌شود.
    window.requestAnimationFrame(() => setPhase('ready'));
    markImageLoaded(url);
    if (readyReported.current) return;
    readyReported.current = true;
    readyCallback.current?.();
  };

  /**
   * پیش از نمایشِ واضح، `decode()` صدا زده می‌شود.
   *
   * `onLoad` فقط یعنی بایت‌ها رسیده‌اند؛ رمزگشاییِ تصویرهای بزرگ همان لحظهٔ
   * نقاشی انجام می‌شود و می‌تواند یک پرش کوتاه بسازد. با `decode()` تصویر پیش
   * از برداشتنِ بلور آمادهٔ نمایش است، پس گذار «مات → واضح» روان می‌ماند.
   */
  const handleLoad = () => {
    const node = imgRef.current;
    if (node && typeof node.decode === 'function') {
      node.decode().then(markReady).catch(markReady);
      return;
    }
    markReady();
  };

  useEffect(() => {
    readyReported.current = false;
    const cached = url ? isImageLoaded(url) : false;
    setPhase(url ? (cached ? 'ready' : 'loading') : 'error');
    // تصویرِ کش‌شده «همین حالا آماده» است؛ والد هم باید بی‌درنگ خبردار شود تا
    // پردهٔ لودینگ پیش‌نمایش یک‌بار دیگر ظاهر نشود.
    if (cached) {
      readyReported.current = true;
      readyCallback.current?.();
    }
  }, [url]);

  // تصویرِ کش‌شده ممکن است پیش از اتصال `onLoad` کامل شده باشد؛ یک‌بار بررسی
  // می‌شود تا هرگز در حالت «در حال لود» اسیر نماند.
  useEffect(() => {
    const node = imgRef.current;
    if (!node || !url) return;
    if (node.complete && node.naturalWidth > 0) markReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (!url || phase === 'error') {
    return (
      <span className={`ui-img relative overflow-hidden ${className}`} title={title}>
        {fallback ? <span className="absolute inset-0 flex items-center justify-center">{fallback}</span> : null}
      </span>
    );
  }

  return (
    <span
      className={`ui-img relative ${fit === 'contain' ? 'flex items-center justify-center' : ''} overflow-hidden ${className}`}
      title={title}
    >
      <span aria-hidden className={`ui-img-glow ${phase === 'ready' ? 'opacity-0' : ''}`} />
      <img
        ref={imgRef}
        src={url}
        alt={alt}
        // تصویرهای اول‌صفحه بی‌درنگ و با اولویت بالا شروع می‌شوند؛ بقیه با
        // `lazy` تا رقابت بی‌مورد روی شبکه نباشد.
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        referrerPolicy={referrerPolicy}
        className={`relative ui-img-media ${phase === 'ready' ? 'is-ready' : ''} ${
          // `contain`: اندازهٔ طبیعی، محدود به کادر و بدون بریدن.
          // `cover`: پرکردن کامل کادر (نسبت برش می‌خورد؛ برای بندانگشتی).
          fit === 'contain'
            ? 'mx-auto block h-auto w-auto max-h-full max-w-full object-contain'
            : 'h-full w-full object-cover'
        } ${imgClassName}`}
        onLoad={handleLoad}
        onError={() => { setPhase('error'); onError?.(); }}
      />
      {busy && phase === 'loading' && <span aria-hidden className="ui-img-spinner" />}
    </span>
  );
}

/**
 * هندلرهای «قصد کاربر» (هاور/فوکوس) برای پیش‌بارگذاری تصویر.
 * تابع ساده است، نه هوک؛ پس هر جا لازم شد می‌توان بی‌قید صدا زد.
 */
export function imageIntentProps(src?: string | null) {
  return {
    onPointerEnter: () => preloadImage(src),
    onFocus: () => preloadImage(src),
  };
}
