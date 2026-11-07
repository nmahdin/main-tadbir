import React from 'react';
import { CalendarDays } from 'lucide-react';
import { Modal } from '../common/Primitives';
import type { CalendarDay } from './CalendarViews';

/**
 * پنجرهٔ مشترک «جزئیات یک روز» برای همهٔ تقویم‌های سامانه.
 *
 * با کلیک روی روز (نه فقط رویداد) باز می‌شود و همهٔ موارد آن روز را با جزئیات
 * بیشتر نشان می‌دهد؛ محتوای هر تقویم را خودش می‌سازد تا هیچ داده‌ای جعل نشود.
 */
export function CalendarDayModal({
  day,
  count,
  onClose,
  children,
  emptyText = 'برای این روز موردی ثبت نشده است.',
  hint,
}: {
  day: CalendarDay | null;
  count: number;
  onClose: () => void;
  children: React.ReactNode;
  emptyText?: string;
  hint?: string;
}) {
  return (
    <Modal
      open={Boolean(day)}
      onClose={onClose}
      title={day ? `${day.weekday} ${day.date.toLocaleDateString('fa-IR', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'جزئیات روز'}
      description={day ? `${count.toLocaleString('fa-IR')} مورد در این روز${hint ? ` · ${hint}` : ''}` : undefined}
      icon={<CalendarDays className="h-5 w-5" />}
      size="lg"
    >
      <div className="max-h-[70dvh] space-y-2.5 overflow-y-auto p-4 sm:p-5">
        {count === 0
          ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">{emptyText}</p>
          : children}
      </div>
    </Modal>
  );
}
