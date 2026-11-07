import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ActiveView } from '../types';
import { runtime } from '../config/runtime';
import { resolveRoute } from './routes';

export const PAGE_TITLE_SUFFIX = 'پلتفرم تدبیر';

const pageNames: Record<ActiveView, string> = {
  dashboard: 'داشبورد',
  projects: 'پروژه‌ها',
  'project-detail': 'جزئیات پروژه',
  'my-tasks': 'وظایف من',
  'thought-room': 'اتاق فکر',
  content: 'محتوا',
  'content-series': 'مجموعه‌های محتوا',
  'content-detail': 'جزئیات محتوا',
  'content-publishing': 'در حال انتشار',
  'content-published': 'محتواهای منتشرشده',
  archive: 'آرشیو',
  departments: 'دپارتمان‌ها',
  'department-dashboard': 'داشبورد دپارتمان',
  secretariat: 'دبیرخانه',
  assets: 'مدیریت دارایی‌ها',
  messages: 'گفتگوها',
  calendar: 'تقویم',
  analytics: 'تحلیل و گزارش‌ها',
  reports: 'گزارش‌ها',
  activity: 'فعالیت‌ها',
  approvals: 'تأییدیه‌ها',
  notifications: 'اعلان‌ها',
  comments: 'دیدگاه‌ها',
  settings: 'تنظیمات',
  integrity: 'یکپارچگی اطلاعات',
  'user-management': 'مدیریت کاربران',
  'roles-management': 'مدیریت نقش‌ها',
  'user-profile': 'پروفایل',
  templates: 'قالب‌ها',
};

/** Single source of truth for the browser tab across client-side navigation. */
export function getPageTitle(pathname: string): string {
  if (pathname.replace(/\/$/, '') === '/login') return `ورود | ${PAGE_TITLE_SUFFIX}`;
  const route = resolveRoute(pathname, runtime.demoMode);
  const name = route.known ? (pageNames[route.view] ?? 'داشبورد') : 'صفحه یافت نشد';
  if (route.module === 'tasks') return `جزئیات وظیفه | ${PAGE_TITLE_SUFFIX}`;
  return `${name} | ${PAGE_TITLE_SUFFIX}`;
}

export function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = getPageTitle(pathname);
  }, [pathname]);
  return null;
}
