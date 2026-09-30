import { runtime } from '../../config/runtime';
import { usePageCorrection } from '../../routing/usePageCorrection';
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Clock3, ExternalLink, MessageSquare, RotateCcw, UserCheck } from 'lucide-react';
import { useNotificationRead, useWorkspacePage } from '../../queries/workspacePages';
import { notificationDestination } from '../../routing/listQuery';
import { Button, EmptyState, ErrorState, LoadingState, Select } from '../common/Primitives';
import { Pagination } from '../common/WorkspacePatterns';
import { formatPersianDate } from '../../utils/date';

const labels: Record<string, string> = { assignment: 'تخصیص', deadline: 'سررسید', overdue: 'تأخیر', comment: 'دیدگاه', status_change: 'تغییر وضعیت', system: 'سیستمی', info: 'اطلاع', mention: 'اشاره' };
const visuals: Record<string, { icon: React.ElementType; box: string }> = {
  assignment: { icon: UserCheck, box: 'bg-indigo-50 text-indigo-600' },
  deadline: { icon: Clock3, box: 'bg-amber-50 text-amber-600' },
  overdue: { icon: AlertTriangle, box: 'bg-rose-50 text-rose-600' },
  comment: { icon: MessageSquare, box: 'bg-violet-50 text-violet-600' },
  status_change: { icon: CheckCircle2, box: 'bg-emerald-50 text-emerald-600' },
};

export function NotificationInbox() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page'));
  const filters: Record<string, string | number> = { page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1, per_page: 20 };
  if (['read', 'unread'].includes(params.get('read') || '')) filters.read = params.get('read')!;
  if (params.get('type') && params.get('type')!.length <= 80) filters.type = params.get('type')!;
  const query = useWorkspacePage('notifications', filters);
  const mutation = useNotificationRead();
  usePageCorrection(query);
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const unread = query.data?.meta?.unread_count ?? 0;

  if (runtime.demoMode) return <EmptyState title="این بخش عملیاتی در محیط نمایشی فعال نیست؛ به API واقعی نیاز دارد." />;
  return <section className="max-w-6xl mx-auto p-3 sm:p-6 lg:p-8 space-y-5" dir="rtl">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3.5"><div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-700 text-white flex items-center justify-center shadow-md shadow-indigo-200"><Bell className="w-6 h-6" />{unread > 0 && <span className="absolute -top-1 -left-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-[10px] font-black flex items-center justify-center ring-2 ring-white">{unread.toLocaleString('fa-IR')}</span>}</div><div><h1 className="text-xl sm:text-2xl font-black text-slate-900">مرکز اعلان‌ها</h1><p className="mt-1 text-xs sm:text-sm text-slate-500">رویدادها، ارجاع‌ها و هشدارهای کاری شما در یک نمای یکپارچه</p></div></div>
      <Button disabled={!unread} loading={mutation.isPending && mutation.variables === null} onClick={() => mutation.mutate(null)}><CheckCheck className="w-4 h-4" />خواندن همه</Button>
    </header>

    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-xs flex flex-wrap items-end gap-3">
      <label className="text-[11px] font-bold text-slate-600 min-w-36">وضعیت<Select className="mt-1.5 text-xs" aria-label="وضعیت خواندن" value={filters.read || ''} onChange={event => update('read', event.target.value)}><option value="">همه اعلان‌ها</option><option value="unread">فقط نخوانده</option><option value="read">خوانده‌شده</option></Select></label>
      <label className="text-[11px] font-bold text-slate-600 min-w-40">نوع اعلان<Select className="mt-1.5 text-xs" aria-label="نوع اعلان" value={filters.type || ''} onChange={event => update('type', event.target.value)}><option value="">همهٔ انواع</option>{query.data?.meta?.types?.map(type => <option key={type} value={type}>{labels[type] || type}</option>)}</Select></label>
      {(filters.read || filters.type) && <Button variant="ghost" onClick={() => setParams({})}><RotateCcw className="w-4 h-4" />پاک‌کردن فیلترها</Button>}
    </div>

    {mutation.isError && <ErrorState error={mutation.error} />}
    {query.isPending ? <LoadingState label="در حال دریافت اعلان‌ها…" /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.data.length ? <div className="rounded-3xl border border-slate-200 bg-white"><EmptyState title="اعلانی در این فهرست نیست."><Bell className="w-10 h-10 mx-auto mb-3 text-slate-300" /></EmptyState></div> : <>
      <div className="space-y-3">{query.data.data.map(row => {
        const target = notificationDestination(row);
        const visual = visuals[row.type] || { icon: Bell, box: 'bg-slate-100 text-slate-600' };
        const Icon = visual.icon;
        return <article key={row.id} className={`group rounded-2xl border bg-white p-4 sm:p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md ${row.read ? 'border-slate-200' : 'border-indigo-200 ring-1 ring-indigo-50'}`}>
          <div className="flex items-start gap-3"><div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${visual.box}`}><Icon className="w-5 h-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><h2 className="text-sm font-black text-slate-900">{row.title}</h2>{!row.read && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black text-indigo-700"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />جدید</span>}</div><span className="mt-1 inline-block text-[10px] font-bold text-slate-400">{labels[row.type] || row.type}</span></div><time className="text-[10px] text-slate-400">{formatPersianDate(row.timestamp || row.createdAt)}</time></div><p className="mt-2 text-xs sm:text-sm leading-6 text-slate-600">{row.message}</p><div className="mt-4 flex flex-wrap gap-2">{target && <Link className="ui-button ui-button-secondary" to={`${target}?${new URLSearchParams({ returnTo: `/notifications${params.size ? `?${params}` : ''}` })}`}><ExternalLink className="w-4 h-4" />بازکردن مورد مرتبط</Link>}{!row.read && <Button variant="ghost" loading={mutation.isPending && mutation.variables === row.id} disabled={mutation.isPending} onClick={() => mutation.mutate(row.id)}><CheckCheck className="w-4 h-4" />خوانده شد</Button>}</div></div></div>
        </article>;
      })}</div>
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={nextPage => update('page', String(nextPage))} />
    </>}
  </section>;
}
