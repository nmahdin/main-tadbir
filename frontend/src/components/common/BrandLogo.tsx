import React from 'react';
import { mediaUrl } from '../../utils/mediaUrl';
import { SmartImage } from './SmartImage';

type BrandLogoProps = {
  /** مسیر یا نشانی فایل لوگو/فاوآیکون که از تنظیمات آمده است. */
  url?: string | null;
  alt?: string;
  /** کلاس کادر بیرونی: اندازه، گردی، پس‌زمینه. */
  className?: string;
  /** کلاس خود تصویر، مثل `object-contain`. */
  imgClassName?: string;
  /** نشان جایگزین وقتی فایلی ثبت نشده یا تصویر لود نمی‌شود. */
  fallback?: React.ReactNode;
  /** در سربرگ و صفحهٔ ورود اولویت لود دارد. */
  priority?: boolean;
  /** چرخندهٔ کوچک تا رسیدن تصویر (در تنظیمات مفید است). */
  busy?: boolean;
  /** بدون زمینهٔ خاکستری/درخشش؛ آیکون پیش‌فرض داخل کادر رنگی دیده می‌شود. */
  plain?: boolean;
};

/**
 * لوگو/فاوآیکون سامانه با همان مسیر رسانهٔ تصاویر پروفایل.
 *
 * پیش‌تر این دو تصویر با `<img>` تخت رندر می‌شدند و اگر فایل در دسترس نبود،
 * کادر خالی یا آیکون شکستهٔ مرورگر دیده می‌شد؛ همچنین نشانی نسبی
 * `/storage/brand/...` نسبت به دامنهٔ پنل خوانده می‌شد. این کامپوننت نشانی را
 * با `mediaUrl` به مسیر کارای API تبدیل می‌کند و در خطا نشان جایگزین
 * (آیکون ساختمان) را نشان می‌دهد تا هرگز کادر شکسته دیده نشود.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  url,
  alt = 'لوگوی سامانه',
  className = '',
  imgClassName = '',
  fallback,
  priority = false,
  busy = false,
  plain = false,
}) => (
  <SmartImage
    src={mediaUrl(url)}
    alt={alt}
    priority={priority}
    busy={busy}
    plain={plain}
    className={`inline-flex items-center justify-center ${className}`}
    imgClassName={imgClassName}
    fallback={fallback}
  />
);
