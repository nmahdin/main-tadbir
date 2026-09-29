import { runtime } from '../../config/runtime';
import { usePageCorrection } from '../../routing/usePageCorrection';
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useNotificationRead, useWorkspacePage } from '../../queries/workspacePages';
import { notificationDestination } from '../../routing/listQuery';
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, Select } from '../common/Primitives';
import { FilterBar, Pagination } from '../common/WorkspacePatterns';
import { formatPersianDate } from '../../utils/date';
const labels: Record<string,string> = { assignment:'تخصیص',deadline:'سررسید',overdue:'تأخیر',comment:'دیدگاه',status_change:'تغییر وضعیت',system:'سیستمی',info:'اطلاع',mention:'اشاره' };
export function NotificationInbox() {
  const [params, setParams] = useSearchParams(); const page = Number(params.get('page'));
  const filters: Record<string,string|number> = { page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1, per_page:20 };
  if (['read','unread'].includes(params.get('read') || '')) filters.read = params.get('read')!;
  if (params.get('type') && params.get('type')!.length <= 80) filters.type = params.get('type')!;
  const query = useWorkspacePage('notifications',filters); const mutation = useNotificationRead(); usePageCorrection(query);
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key,value); else next.delete(key); if(key !== 'page') next.delete('page'); setParams(next); };
  if (runtime.demoMode) return <EmptyState title="این بخش عملیاتی در محیط نمایشی فعال نیست؛ به API واقعی نیاز دارد." />;
  return <section className="max-w-5xl mx-auto p-2 sm:p-5" dir="rtl">
    <PageHeader title="اعلان‌ها" description={query.data?.meta ? `${query.data.meta.unread_count ?? 0} اعلان نخوانده` : undefined} actions={<Button disabled={!query.data?.meta?.unread_count} loading={mutation.isPending} onClick={() => mutation.mutate(null)}>خواندن همه</Button>} />
    <FilterBar><label>وضعیت<Select aria-label="وضعیت خواندن" value={filters.read || ''} onChange={e => update('read',e.target.value)}><option value="">همه</option><option value="unread">نخوانده</option><option value="read">خوانده‌شده</option></Select></label><label>نوع<Select aria-label="نوع اعلان" value={filters.type || ''} onChange={e => update('type',e.target.value)}><option value="">همهٔ انواع</option>{query.data?.meta?.types?.map(type => <option key={type} value={type}>{labels[type] || type}</option>)}</Select></label>{(filters.read || filters.type) && <Button variant="ghost" onClick={() => setParams({})}>پاک‌کردن فیلترها</Button>}</FilterBar>
    {mutation.isError && <ErrorState error={mutation.error} />}
    {mutation.isSuccess && <p role="status" className="text-sm text-emerald-700 p-2">وضعیت خواندن در سرور ثبت شد.</p>}
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <>
      {!query.data?.data.length ? <EmptyState title="اعلانی در این فهرست نیست." /> : <ul className="space-y-3">{query.data.data.map(row => {
        const target = notificationDestination(row);
        return <li key={row.id} className={`bg-white border rounded-xl p-4 break-words space-y-2 ${row.read ? 'border-slate-200' : 'border-indigo-300'}`}><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">{row.title}</h2><span className="text-xs">{row.read ? 'خوانده‌شده' : 'نخوانده'}</span></div><p className="text-sm">{row.message}</p><p className="text-xs text-slate-500">{formatPersianDate(row.timestamp || row.createdAt)}</p><div className="flex flex-wrap gap-2">
          {target && <Link className="ui-button ui-button-secondary" to={`${target}?${new URLSearchParams({returnTo:`/notifications${params.size ? `?${params}` : ''}`})}`}>بازکردن مورد مرتبط</Link>}
          {!row.read && <Button variant="ghost" loading={mutation.isPending && mutation.variables === row.id} disabled={mutation.isPending} onClick={() => mutation.mutate(row.id)}>علامت خوانده‌شده</Button>}
        </div></li>;
      })}</ul>}<Pagination meta={query.data?.meta} busy={query.isFetching} onPage={page => update('page',String(page))} />
    </>}
  </section>;
}
