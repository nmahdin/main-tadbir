import { useEffect, useRef, useState } from 'react';

/**
 * نگه‌داشتن یک لایهٔ شناور در صفحه تا پایان انیمیشن خروج.
 *
 * منوهای شناور (منوی پروفایل، اعلان‌ها، «ایجاد جدید»، گزینشگر فرم و مانند آن)
 * با `{open && …}` رندر می‌شوند؛ پس با بسته‌شدن، همان لحظه از DOM حذف می‌شدند و
 * فقط انیمیشن ورود داشتند. این هوک با وضعیت `closing` یک انیمیشن کوتاه خروج
 * اجرا می‌کند و بعد لایه را از صفحه برمی‌دارد — بدون هیچ تغییری در منطق بستن.
 *
 * استفاده:
 *   const presence = useExitPresence(open);
 *   {presence.visible && <div className="ui-pop" data-state={presence.state}>…</div>}
 */
export const FLOAT_EXIT_MS = 140;

export function useExitPresence(open: boolean) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (open) {
      setVisible(true);
      setClosing(false);
      return;
    }
    if (!visible) return;
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setClosing(false);
      setVisible(false);
    }, FLOAT_EXIT_MS);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [open, visible]);

  return { visible: visible || open, state: open ? ('open' as const) : ('closing' as const) };
}
