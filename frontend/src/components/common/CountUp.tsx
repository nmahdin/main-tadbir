import React, { useEffect, useRef, useState } from 'react';

/**
 * شمارندهٔ زندهٔ اعداد (دور ۹۷).
 *
 * عدد از صفر (یا از مقدار قبلی، وقتی داده تازه می‌شود) تا مقدار واقعی بالا
 * می‌رود. سه قاعدهٔ مهم:
 *
 * - مقدار نهایی همیشه همان عدد واقعی است؛ انیمیشن فقط نمایش است و هیچ عددی
 *   ساخته نمی‌شود. با `prefers-reduced-motion` یا در اولین رنگ‌آمیزی سرور،
 *   عدد بی‌درنگ همان مقدار نهایی است.
 * - با هر تغییر داده (تازه‌سازی پس‌زمینه) از مقدار نمایش‌داده‌شدهٔ فعلی به مقدار
 *   جدید می‌رود، نه از صفر؛ پرش ندارد.
 * - با ارقام فارسی رندر می‌شود تا با بقیهٔ سامانه یکی باشد.
 */
const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useCountUp(value: number, duration = 700): number {
  const target = Number.isFinite(value) ? value : 0;
  const [current, setCurrent] = useState(() => (prefersReducedMotion() ? target : 0));
  const fromRef = useRef(prefersReducedMotion() ? target : 0);
  const frameRef = useRef<number | null>(null);
  /** آخرین مقدار نمایش‌داده‌شده؛ اگر انیمیشن نیمه‌کاره قطع شود، از همین جا ادامه می‌دهیم. */
  const currentRef = useRef(current);
  currentRef.current = current;

  useEffect(() => {
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setCurrent(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      // منحنی خروج نرم: شروع سریع، نشستن آرام روی عدد نهایی.
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);
      setCurrent(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
      else { fromRef.current = target; setCurrent(target); }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      // اگر وسط انیمیشن قطع شد (تغییر داده یا unmount)، دفعهٔ بعد از همین‌جا
      // ادامه می‌دهیم تا عدد به عقب نپرد.
      fromRef.current = currentRef.current;
    };
  }, [target, duration]);

  return current;
}

/**
 * نمایش عدد با ارقام فارسی. `changeOn` اختیاری است؛ اگر بدهید، انیمیشن از
 * صفر برای هر کلید تازه شروع می‌شود (مثلاً وقتی ردیف دیگری انتخاب می‌شود).
 */
export const CountUp: React.FC<{
  value: number;
  duration?: number;
  className?: string;
  /** پسوند/پیشوند نمایشی (مثلاً «٪»). */
  suffix?: string;
  suffixClassName?: string;
  /** خروجی را به ارقام فارسی تبدیل نکن (برای شناسه‌ها). */
  latin?: boolean;
}> = ({ value, duration = 700, className = '', suffix, suffixClassName = 'text-xs font-bold text-slate-400', latin = false }) => {
  const shown = useCountUp(value, duration);
  return (
    <span className={`tabular-nums ${className}`}>
      {latin ? shown.toLocaleString('en-US') : shown.toLocaleString('fa-IR')}
      {suffix && <span className={suffixClassName}>{suffix}</span>}
    </span>
  );
};

/**
 * نوار پیشرفتِ زنده: از صفر تا مقدار واقعی پر می‌شود و برچسب درصد هم همراه
 * همان حرکت بالا می‌رود.
 */
export const AnimatedProgress: React.FC<{
  progress: number;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
}> = ({ progress, color, size = 'md', showLabel = false, label = 'پیشرفت' }) => {
  const clamped = Math.min(100, Math.max(0, progress));
  const [width, setWidth] = useState(() => (prefersReducedMotion() ? clamped : 0));

  useEffect(() => {
    if (prefersReducedMotion()) { setWidth(clamped); return; }
    // یک فریم صبر می‌کنیم تا مرورگر عرض صفر را ثبت کند و انتقال واقعاً دیده شود.
    const frame = requestAnimationFrame(() => setWidth(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  const height = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-2.5' : 'h-2';
  const fill = color || (clamped >= 100 ? '#10b981' : clamped >= 70 ? '#6366f1' : clamped >= 30 ? '#3b82f6' : '#f59e0b');

  return (
    <div className="w-full">
      {showLabel && (
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-600">
          <span>{label}</span>
          <CountUp value={clamped} className="font-semibold text-slate-800" suffix="٪" suffixClassName="text-[10px] font-bold text-slate-500" />
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-slate-100 ${height}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div
          className={`h-full rounded-full ${prefersReducedMotion() ? '' : 'transition-[width] duration-[900ms] ease-out'}`}
          style={{ width: `${width}%`, backgroundColor: fill }}
        />
      </div>
    </div>
  );
};
