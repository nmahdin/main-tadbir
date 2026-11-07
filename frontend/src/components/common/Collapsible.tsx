import React from 'react';

interface CollapsibleProps {
  /** باز بودن بخش؛ انیمیشن با همان مقدار کلید می‌خورد. */
  open: boolean;
  children: React.ReactNode;
  /** شناسهٔ بیرونی برای `aria-controls` دکمهٔ بازکننده. */
  id?: string;
  className?: string;
  /** کلاس محتوای درونی (مثلاً فاصلهٔ داخلی یا حاشیه). */
  innerClassName?: string;
}

/**
 * بخش جمع‌شو با انیمیشن ارتفاع واقعی.
 *
 * چرا CSS Grid: با `0fr → 1fr` ارتفاعِ واقعی محتوا بدون اندازه‌گیری با JS
 * باز و بسته می‌شود؛ پس نه `max-height` حدسی لازم است نه بازچینش پرش‌دار.
 * وقتی بسته است، `inert` فوکوس و اسکرین‌ریدر را هم قطع می‌کند تا محتوای پنهان
 * با Tab در دسترس نباشد.
 */
export const Collapsible: React.FC<CollapsibleProps> = ({
  open,
  children,
  id,
  className = '',
  innerClassName = '',
}) => (
  <div
    id={id}
    className={`ui-collapsible ${open ? '' : '!mt-0'} ${className}`.trim()}
    data-open={open ? 'true' : 'false'}
    inert={!open}
  >
    <div className={`ui-collapsible-inner ${innerClassName}`.trim()}>{children}</div>
  </div>
);
