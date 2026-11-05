import { useCallback, useEffect, useRef, useState } from 'react';

export const MODAL_EXIT_MS = 170;

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export type ModalPresence = {
  /** عنصر باید تا پایان انیمیشن خروج در صفحه بماند. */
  visible: boolean;
  /** `open` یا `closing`؛ برای `data-state` روی پوشش و کادر مدال. */
  state: 'open' | 'closing';
  /** بستنِ نرم: ابتدا انیمیشن خروج اجرا می‌شود و سپس بستن واقعی. */
  requestClose: () => void;
};

/**
 * انیمیشن خروج مدال‌ها، برای هر مسیر بستنی.
 *
 * پیش‌تر انیمیشن خروج فقط وقتی اجرا می‌شد که کاربر روی ضربدر یا پوشش کلیک
 * می‌کرد؛ دکمهٔ «انصراف» در پای مدال‌ها مستقیماً `onClose` والد را صدا می‌زد،
 * پس مودال همان لحظه از DOM حذف می‌شد و انیمیشنی دیده نمی‌شد.
 *
 * اکنون ملاک، خودِ وضعیت `open` است: هر بار که `open` از `true` به `false`
 * برگردد (ضربدر، پوشش، انصراف، Escape یا هر بستنِ برنامه‌ای) عنصر تا پایان
 * انیمیشن در صفحه می‌ماند و با `data-state='closing'` محو می‌شود.
 */
export function useModalExit(open: boolean, close: () => void): ModalPresence {
  // `open` اولیه false است اما مدالِ بسته نباید رندر شود.
  const [exiting, setExiting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const timer = useRef<number | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setExiting(false);
    else if (!prefersReducedMotion()) setExiting(true);
  }

  useEffect(() => {
    if (!exiting) return;
    timer.current = window.setTimeout(() => { timer.current = null; setExiting(false); }, MODAL_EXIT_MS);
    return () => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  }, [exiting]);

  /** بستنِ نرم: همان `close` والد؛ انیمیشن از تغییر `open` آغاز می‌شود. */
  const requestClose = useCallback(() => { close(); }, [close]);

  return { visible: open || exiting, state: open ? 'open' : 'closing', requestClose };
}
