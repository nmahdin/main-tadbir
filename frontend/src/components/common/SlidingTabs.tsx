import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * نشانگر متحرک تب‌ها (دور ۹۵).
 *
 * پیش‌تر هر تب فعال پس‌زمینهٔ رنگی خودش را داشت؛ با تغییر تب، رنگ یک‌باره از یک
 * دکمه حذف و روی دکمهٔ بعدی ظاهر می‌شد. حالا آن پس‌زمینه یک لایهٔ جدا
 * (`ui-tab-pill`) است که روی مختصات تب فعال قرار می‌گیرد و با
 * `transform` بین دو تب می‌لغزد؛ یعنی رنگ «کشیده» می‌شود تا به تب بعدی برسد.
 *
 * قرارداد استفاده:
 *
 * ۱) `const tabStrip = useSlidingTabs(activeKey)` در بالای کامپوننت.
 * ۲) `ref={tabStrip.stripRef}` روی همان ظرفی که تب‌ها داخلش هستند
 *    (باید `relative` باشد تا مختصات نسبت به خودش حساب شود).
 * ۳) `{tabStrip.pill}` به‌عنوان فرزند اول همان ظرف.
 * ۴) روی هر تب `data-tab-active={active}` و کلاس متنی `text-white` در حالت فعال؛
 *    پس‌زمینهٔ رنگی را دیگر خودِ دکمه ندارد، نشانگر می‌دهد.
 *
 * مختصات با `getBoundingClientRect` حساب می‌شود، نه `offsetLeft`؛ بنابراین در
 * چیدمان راست‌به‌چپ، تب‌های هم‌عرض (`flex-1`)، شبکه‌های چندستونه، نوارهای
 * اسکرول‌شو و حالت عمودی هم درست کار می‌کند.
 */

export type SlidingTabTone = 'primary' | 'slate' | 'light' | 'outlined';

/** رنگ نشانگر؛ هر نوار تب یکی از این‌ها را انتخاب می‌کند. */
export const SLIDING_TAB_TONES: Record<SlidingTabTone, string> = {
  primary: 'bg-indigo-600 shadow-sm shadow-indigo-600/25',
  slate: 'bg-slate-700 shadow-sm shadow-slate-700/25',
  light: 'bg-white shadow-xs',
  // برای نوارهای خاکستری که تب فعال کارت سفیدِ حاشیه‌دار است.
  outlined: 'bg-white shadow-sm ring-1 ring-slate-200',
};

type PillBox = { left: number; top: number; width: number; height: number; radius: string };

export function useSlidingTabs(activeKey: string | number | null | undefined, tone: SlidingTabTone = 'primary') {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<PillBox | null>(null);
  /** پیش از اولین اندازه‌گیری انیمیشن خاموش است تا نشانگر از گوشهٔ نوار پرواز نکند. */
  const [animated, setAnimated] = useState(false);

  const measure = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!active) {
      setBox(null);
      return;
    }
    const stripBox = strip.getBoundingClientRect();
    const target = active.getBoundingClientRect();
    if (target.width < 1 || target.height < 1) {
      setBox(null);
      return;
    }
    setBox({
      left: target.left - stripBox.left - strip.clientLeft,
      top: target.top - stripBox.top - strip.clientTop,
      width: target.width,
      height: target.height,
      // گوشهٔ نشانگر از خود تب گرفته می‌شود تا با هر نوار هم‌شکل بماند.
      radius: getComputedStyle(active).borderRadius || '0.75rem',
    });
  }, []);

  // پیش از رنگ‌آمیزی مرورگر اندازه می‌گیریم تا هیچ لحظه‌ای تب فعال بی‌پس‌زمینه نماند.
  // دو اندازه‌گیری تأخیری هم برای حالتی است که نوار داخل مدال/پنلی با انیمیشن باز
  // می‌شود: در آن لحظه مختصات با مقیاس بزرگ‌نمایی‌شده خوانده می‌شود و بعد از پایان
  // انیمیشن باید اصلاح شود.
  useLayoutEffect(() => {
    measure();
    const soon = window.setTimeout(measure, 220);
    const settled = window.setTimeout(measure, 620);
    return () => {
      window.clearTimeout(soon);
      window.clearTimeout(settled);
    };
  }, [measure, activeKey]);

  // با رسیدن فونت فارسی، عرض برچسب‌ها عوض می‌شود.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready?.then(() => measure()).catch(() => undefined);
  }, [measure]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(strip);
    const active = strip.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (active) observer?.observe(active);
    const remeasure = () => measure();
    strip.addEventListener('scroll', remeasure, { passive: true });
    window.addEventListener('resize', remeasure);
    // شمارنده‌های داخل تب‌ها (مثل «۳») عرض دکمه را عوض می‌کنند؛ با تغییر متن هم
    // دوباره اندازه می‌گیریم تا نشانگر روی دکمه بماند.
    const mutations = typeof MutationObserver === 'function'
      ? new MutationObserver(() => measure())
      : null;
    mutations?.observe(strip, { childList: true, subtree: true, characterData: true });
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      strip.removeEventListener('scroll', remeasure);
      window.removeEventListener('resize', remeasure);
    };
  }, [measure, activeKey]);

  const pill = box ? (
    <span
      aria-hidden="true"
      data-state={animated ? 'moving' : 'idle'}
      style={{
        transform: `translate(${box.left}px, ${box.top}px)`,
        width: box.width,
        height: box.height,
        borderRadius: box.radius,
      }}
      className={`ui-tab-pill pointer-events-none absolute left-0 top-0 z-0 ${SLIDING_TAB_TONES[tone]}`}
    />
  ) : null;

  return { stripRef, pill };
}
