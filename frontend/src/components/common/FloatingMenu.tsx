import type { CSSProperties, ReactNode } from 'react';
import { useExitPresence } from './useExitPresence';

type FloatingMenuProps = {
  /** آیا منو باز است؟ بسته‌شدن، انیمیشن خروج را اجرا می‌کند و بعد لایه را برمی‌دارد. */
  open: boolean;
  /** بستن با کلیک بیرون (پوشش شفاف زیر منو). */
  onClose: () => void;
  /** برچسب پوشش برای صفحه‌خوان‌ها، مثل «بستن فهرست وضعیت مرحله». */
  closeLabel: string;
  /** کلاس‌های خود پنل شناور (عرض، فاصله، رنگ…). */
  className?: string;
  /**
   * گوشه‌ای که انیمیشن از آن شروع می‌شود.
   * `start` = بالا-چپ (منوی چپ‌چین) و `end` = بالا-راست (منوی راست‌چین).
   */
  origin?: 'start' | 'end';
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * پنل شناور کوچک (منوی وضعیت، انتخاب مسئول، انتخاب تاریخ و مانند آن).
 *
 * چرا کامپوننت جدا؟ این منوها در جریان محتوا با `{open && …}` رندر می‌شدند؛ پس
 * به‌محض بسته‌شدن همان لحظه از DOM حذف می‌شدند و جز یک ورود کوتاه، هیچ انیمیشن
 * خروجی دیده نمی‌شد. اینجا `useExitPresence` پنل را تا پایان انیمیشن خروج نگه
 * می‌دارد و کلاس مشترک `ui-pop` (با `data-state`) هر دو جهت را نرم اجرا می‌کند.
 *
 * پوشش شفاف زیر منو هم در حالت خروج `pointer-events-none` می‌شود تا در آن
 * چندصدم‌ثانیه، کلیک‌های کاربر بلعیده نشوند.
 */
export function FloatingMenu({
  open,
  onClose,
  closeLabel,
  className = '',
  origin = 'end',
  style,
  children,
}: FloatingMenuProps) {
  const presence = useExitPresence(open);
  const closing = presence.state === 'closing';

  return (
    <>
      {presence.visible && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={closeLabel}
          onClick={onClose}
          className={`fixed inset-0 z-30 cursor-default bg-transparent transition-opacity duration-150 ${closing ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        />
      )}
      {presence.visible && (
        <div
          className={`ui-pop absolute top-full z-40 mt-1 ${origin === 'start' ? 'left-0' : 'right-0'} ${className}`}
          data-state={presence.state}
          style={{ transformOrigin: origin === 'start' ? 'top left' : 'top right', ...style }}
        >
          {children}
        </div>
      )}
    </>
  );
}
