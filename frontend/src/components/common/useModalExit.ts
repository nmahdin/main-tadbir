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
  /** فقط شروع انیمیشن خروج، بدون بستن؛ برای دکمه‌هایی که خودشان می‌بندند. */
  startExit: () => void;
};

/**
 * انیمیشن خروج مدال‌ها، برای هر مسیر بستنی.
 *
 * دو واقعیت اینجا مهم است:
 * ۱. بیشتر مدال‌ها در والد به‌صورت `{open && <Modal/>}` رندر می‌شوند؛ پس اگر
 *    انیمیشن خروج را به «پس از بسته‌شدن» بسپاریم، کامپوننت همان لحظه از DOM
 *    حذف می‌شود و هیچ انیمیشنی دیده نمی‌شود. بنابراین `requestClose` اول کادر
 *    را در حالت `closing` نگه می‌دارد و بعد `close` را صدا می‌زند: انیمیشن
 *    *پیش از* بسته‌شدن اجرا می‌شود.
 * ۲. دکمه‌های «انصراف» پای مدال‌ها مستقیم `onClose` والد را صدا می‌زنند؛ برای
 *    آن‌ها `startExit` انیمیشن را شروع می‌کند و کامپوننت Modal کلیک اصلی را پس
 *    از پایان انیمیشن تکرار می‌کند تا منطق خودِ دکمه از دست نرود.
 */
export function useModalExit(open: boolean, close: () => void): ModalPresence {
  // `open` اولیه false است اما مدالِ بسته نباید رندر شود.
  const [exiting, setExiting] = useState(false);
  const [preClosing, setPreClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const skipExit = useRef(false);
  const timer = useRef<number | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setExiting(false);
      setPreClosing(false);
      skipExit.current = false;
    } else if (skipExit.current) {
      // انیمیشن خروج همین حالا اجرا شده؛ نباید دوباره تکرار شود.
      skipExit.current = false;
      setExiting(false);
    } else if (!prefersReducedMotion()) {
      setExiting(true);
    }
  }

  // انیمیشن `exiting` (والد بدون درخواست ما بسته است) پس از پایان پاک می‌شود.
  useEffect(() => {
    if (!exiting) return;
    const id = window.setTimeout(() => setExiting(false), MODAL_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [exiting]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  /** شروع انیمیشن خروج بدون بستن؛ اگر کسی نبندد، کادر به حالت باز برمی‌گردد. */
  const startExit = useCallback(() => {
    if (prefersReducedMotion()) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    setPreClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPreClosing(false);
    }, MODAL_EXIT_MS);
  }, []);

  /** بستنِ نرم: انیمیشن خروج، سپس همان `close` والد. */
  const requestClose = useCallback(() => {
    if (prefersReducedMotion()) {
      closeRef.current();
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    setPreClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // خروج انجام شد؛ تغییر `open` به false نباید انیمیشن دوم را شروع کند.
      skipExit.current = true;
      setPreClosing(false);
      closeRef.current();
    }, MODAL_EXIT_MS);
  }, []);

  const closing = exiting || preClosing;

  return {
    visible: open || closing,
    state: open && !closing ? 'open' : 'closing',
    requestClose,
    startExit,
  };
}
