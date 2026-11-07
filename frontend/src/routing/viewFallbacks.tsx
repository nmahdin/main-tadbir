import React from 'react';
import type { ActiveView } from '../types';
import {
  ApprovalCardsSkeleton,
  CalendarSkeleton,
  DetailPageSkeleton,
  ListRowsSkeleton,
  ReportSkeleton,
  TableSkeleton,
} from '../components/common/Shimmer';

/**
 * اسکلت هر صفحه هنگام دانلود کد آن صفحه (دور ۱۰۰).
 *
 * پیش‌تر تا وقتی فایل جاوااسکریپت یک صفحهٔ تنبل (`React.lazy`) دانلود می‌شد،
 * `WorkspaceLoader` تمام‌صفحه یک چرخندهٔ بزرگ وسط صفحه نشان می‌داد؛ یعنی کاربر
 * دقیقاً همان چیزی را می‌دید که دور ۹۷ و ۹۹ قرار بود حذف شود. حالا هر نما اسکلت
 * هم‌شکل خودش را نشان می‌دهد: صفحهٔ جزئیات، اسکلت سربرگ و تب‌ها؛ تقویم، اسکلت
 * شبکهٔ ماه؛ فهرست‌ها، اسکلت ردیف‌ها؛ گزارش‌ها، اسکلت کارت و نمودار.
 *
 * قاعده: این تابع فقط قالب را می‌سازد، هیچ درخواستی نمی‌فرستد و هیچ حالتی را
 * تغییر نمی‌دهد؛ بنابراین امن است که در `fallback` هر `Suspense` بنشیند.
 */

/** قابی که با padding واقعی صفحه‌های داخل `main` هم‌خوان است. */
const shell = (children: React.ReactNode) => (
  <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8" dir="rtl">{children}</div>
);

const CONTENT_DETAIL = 'در حال باز کردن پروندهٔ محتوا…';
const CALENDAR = 'در حال آماده‌سازی تقویم…';

export function viewSkeleton(view: ActiveView | string): React.ReactNode {
  switch (view) {
    // صفحه‌های جزئیات: سربرگ + تب‌ها + بدنه، همان چیزی که بلافاصله می‌آید.
    case 'content-detail':
      return shell(<DetailPageSkeleton label={CONTENT_DETAIL} tabs={6} />);
    case 'content-series':
      return shell(<DetailPageSkeleton label="در حال باز کردن مجموعهٔ محتوا…" tabs={4} />);
    case 'project-detail':
      return shell(<DetailPageSkeleton label="در حال باز کردن پروندهٔ پروژه…" tabs={5} />);
    case 'user-profile':
      return shell(<DetailPageSkeleton label="در حال باز کردن نمایه…" tabs={3} />);

    // تقویم: شبکهٔ ماه، نه فهرست.
    case 'calendar':
      return shell(<CalendarSkeleton label={CALENDAR} />);

    // گزارش و تحلیل: کارت آماری + نمودار.
    case 'analytics':
    case 'reports':
    case 'dashboard':
    case 'department-dashboard':
      return shell(<ReportSkeleton label="در حال آماده‌سازی گزارش…" />);

    // تأییدها: کارت‌های نیازمند بررسی.
    case 'approvals':
      return shell(<ApprovalCardsSkeleton count={4} />);

    // فهرست‌ها و جدول‌ها: ردیف‌های هم‌شکل.
    case 'content':
    case 'content-published':
    case 'archive':
    case 'assets':
      return shell(<ListRowsSkeleton rows={5} label="در حال دریافت فهرست از سرور…" />);
    case 'my-tasks':
    case 'projects':
      return shell(<TableSkeleton rows={6} columns={['عنوان', 'مسئول', 'وضعیت', 'سررسید', 'عملیات']} label="در حال دریافت فهرست از سرور…" />);
    case 'notifications':
    case 'comments':
    case 'activity':
    case 'departments':
    case 'templates':
    case 'user-management':
    case 'roles-management':
      return shell(<ListRowsSkeleton rows={5} label="در حال بارگذاری صفحه…" />);

    // بقیه (چت، اتاق فکر، دبیرخانه، تنظیمات، انتشار، یکپارچگی، دارایی‌های دیجیتال
    // با نمای خودش): اسکلت عمومی ردیف‌ها؛ هیچ‌جا چرخندهٔ تمام‌صفحه.
    default:
      return shell(<ListRowsSkeleton rows={4} label="در حال بارگذاری صفحه…" />);
  }
}

export default viewSkeleton;
