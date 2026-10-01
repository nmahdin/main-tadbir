import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { request } from '../../api/client';
import { PersianDatePicker } from '../common/PersianDatePicker';

type DamActivity = {
  id: number; action: string; metadata?: Record<string, unknown>; created_at: string;
  actor?: { id: number; name: string }; asset?: { id: number; title: string; type: string };
};

type Page<T> = { data: T[]; current_page: number; last_page: number; total: number };

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'ایجاد دارایی', updated: 'ویرایش مشخصات', moved: 'انتقال به پوشه', downloaded: 'دانلود فایل', previewed: 'پیش‌نمایش فایل',
  attached: 'اتصال به یک بخش', deleted: 'بایگانی', restored: 'بازیابی', version_created: 'ایجاد نسخه',
  version_restored: 'بازیابی نسخه', status_changed: 'تغییر وضعیت',
  confidentiality_changed: 'تغییر سطح محرمانگی', ownership_changed: 'تغییر مالک',
};

const formatDate = (date?: string) => date
  ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
  : '—';

/** Repository activity history — shown inside the Settings DAM tab. */
export const DamActivityHistory: React.FC = () => {
  const [activities, setActivities] = useState<DamActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ page: String(page), per_page: '20' });
    if (fromDate) query.set('from', fromDate);
    if (toDate) query.set('to', toDate);
    void request<Page<DamActivity>>(`/dam/library/activities?${query}`, { signal: controller.signal })
      .then(result => {
        if (!active) return;
        setActivities(result.data);
        setLastPage(result.last_page || 1);
        setTotal(result.total || 0);
      })
      .catch(error => {
        if (active) setError(error instanceof Error ? error.message : 'دریافت تاریخچه ناموفق بود.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, fromDate, toDate]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
        <div>
          <h2 className="text-sm font-black text-slate-900">تاریخچه فعالیت‌های مخزن</h2>
          <p className="mt-1 text-[11px] text-slate-500">رویدادهای مهم دارایی‌ها با هویت انجام‌دهنده ثبت می‌شوند.</p>
        </div>
        <span className="text-[10px] font-bold text-slate-500">{total.toLocaleString('fa-IR')} رویداد</span>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/60 p-3"><div className="min-w-40 flex-1 sm:flex-none"><PersianDatePicker value={fromDate} onChange={value => { setFromDate(value); if (toDate && value > toDate) setToDate(value); setPage(1); }} label="از تاریخ" placeholder="شروع بازه" /></div><div className="min-w-40 flex-1 sm:flex-none"><PersianDatePicker value={toDate} onChange={value => { setToDate(value); setPage(1); }} label="تا تاریخ" placeholder="پایان بازه" minDate={fromDate || undefined} /></div>{(fromDate || toDate) && <button type="button" onClick={() => { setFromDate(''); setToDate(''); setPage(1); }} className="ui-button ui-button-ghost text-xs">پاک‌کردن بازه</button>}</div>
      {loading ? (
        <div className="p-10 text-center text-xs text-slate-400">در حال دریافت فعالیت‌ها...</div>
      ) : error ? (
        <p className="p-10 text-center text-xs text-rose-500">{error}</p>
      ) : activities.length === 0 ? (
        <p className="p-10 text-center text-xs text-slate-400">هنوز فعالیتی ثبت نشده است.</p>
      ) : (
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {activities.map(activity => (
            <div key={activity.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Activity className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">
                  {ACTIVITY_LABELS[activity.action] || activity.action}{activity.asset?.title ? `: ${activity.asset.title}` : ''}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {activity.actor?.name || 'کاربر سامانه'} <span className="mx-1">•</span>{formatDate(activity.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      {lastPage > 1 && <div className="flex items-center justify-center gap-3 border-t border-slate-100 p-3"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)} className="ui-button ui-button-secondary disabled:opacity-50">صفحه قبل</button><span className="text-[10px] font-bold text-slate-600">صفحه {page.toLocaleString('fa-IR')} از {lastPage.toLocaleString('fa-IR')}</span><button type="button" disabled={page >= lastPage || loading} onClick={() => setPage(current => current + 1)} className="ui-button ui-button-secondary disabled:opacity-50">صفحه بعد</button></div>}
    </div>
  );
};
