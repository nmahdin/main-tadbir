import { useCallback, useEffect, useRef, useState } from 'react';

export const MODAL_EXIT_MS = 170;

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export type ModalPresence = {
  /** عنصر باید تا پایان انیمیشن خروج در صفحه بماند. */
  visible: boolean;
  /** `open` یا `closing`؛ برای `data-state` روی پوشش و کادر مدال. */
  state: 'open' | 'closing';
  /** بستنِ نرم: اول انیمیشن خروج، بعد فراخوانی بستنِ واقعی. */
  requestClose: () => void;
};

/**
 * انیمیشن خروج مدال‌های دست‌ساز.
 *
 * مدال‌هایی که با `Modal` مشترک ساخته شده‌اند این کار را داخلی انجام می‌دهند؛
 * این هوک همان رفتار را برای پوشش‌های اختصاصی (`fixed inset-0 …`) فراهم می‌کند:
 * به‌جای حذف فوری از DOM، کوتاه‌مدت `state='closing'` می‌شود تا CSS محو/جمع‌شدن
 * را اجرا کند و سپس بستن واقعی انجام می‌شود.
 */
export function useModalExit(open: boolean, close: () => void): ModalPresence {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const requestClose = useCallback(() => {
    if (timer.current !== null) return;
    if (prefersReducedMotion()) { closeRef.current(); return; }
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setClosing(false);
      closeRef.current();
    }, MODAL_EXIT_MS);
  }, []);

  return { visible: open || closing, state: closing ? 'closing' : 'open', requestClose };
}
