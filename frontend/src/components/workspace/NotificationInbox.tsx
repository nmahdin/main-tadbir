import { runtime } from '../../config/runtime';
import { usePageCorrection } from '../../routing/usePageCorrection';
import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  MessageSquare,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { useNotificationRead, useWorkspacePage } from '../../queries/workspacePages';
import { notificationDestination } from '../../routing/listQuery';
import { Button, EmptyState, ErrorState, LoadingState } from '../common/Primitives';
import { Pagination } from '../common/WorkspacePatterns';
import { formatPersianDate } from '../../utils/date';

type Category = 'tasks' | 'content' | 'meetings' | 'secretariat' | 'collaboration' | 'system';
type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message?: string;
  read?: boolean;
  timestamp?: string;
  createdAt?: string;
  notificationCategory?: Category;
  linkTaskId?: string;
  linkProjectId?: string;
  linkContentId?: string;
  linkMeetingId?: string;
  linkIdeaId?: string;
  linkLetterId?: string;
  linkResolutionId?: string;
};

const labels: Record<string, string> = { assignment: 'تخصیص وظیفه', deadline: 'سررسید', overdue: 'تأخیر', comment: 'دیدگاه', reply: 'پاسخ', status_change: 'تغییر وضعیت', system: 'سیستمی', info: 'اطلاع', mention: 'اشاره' };
const categories: { id: '' | Category; label: string; icon: React.ElementType; tone: string }[] = [
  { id: '', label: 'همه', icon: Bell, tone: 'text-slate-600' },
  { id: 'tasks', label: 'وظایف', icon: UserCheck, tone: 'text-indigo-600' },
  { id: 'meetings', label: 'جلسه‌ها', icon: CalendarDays, tone: 'text-sky-600' },
  { id: 'collaboration', label: 'دیدگاه‌ها', icon: MessageSquare, tone: 'text-amber-600' },
  { id: 'content', label: 'محتوا', icon: FileText, tone: 'text-violet-600' },
  { id: 'secretariat', label: 'دبیرخانه', icon: ShieldCheck, tone: 'text-emerald-600' },
  { id: 'system', label: 'سامانه', icon: Bell, tone: 'text-slate-500' },
];

const categoryOf = (row: NotificationRow): Category => {
  if (row.notificationCategory && categories.some(category => category.id === row.notificationCategory)) return row.notificationCategory;
  if (row.linkTaskId) return 'tasks';
  if (row.linkContentId) return 'content';
  if (row.linkMeetingId || row.linkIdeaId) return 'meetings';
  if (row.linkLetterId || row.linkResolutionId) return 'secretariat';
  if (['comment', 'reply', 'mention'].includes(row.type)) return 'collaboration';
  return 'system';
};

const visualOf = (row: NotificationRow) => {
  if (row.type === 'overdue') return { icon: AlertTriangle, box: 'bg-rose-50 text-rose-600' };
  if (row.type === 'deadline') return { icon: Clock3, box: 'bg-amber-50 text-amber-600' };
  return ({
    tasks: { icon: UserCheck, box: 'bg-indigo-50 text-indigo-600' },
    content: { icon: FileText, box: 'bg-violet-50 text-violet-600' },
    meetings: { icon: CalendarDays, box: 'bg-sky-50 text-sky-600' },
    secretariat: { icon: ShieldCheck, box: 'bg-emerald-50 text-emerald-600' },
    collaboration: { icon: MessageSquare, box: 'bg-amber-50 text-amber-600' },
    system: { icon: Bell, box: 'bg-slate-100 text-slate-600' },
  } as const)[categoryOf(row)];
};

export function NotificationInbox() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page'));
  const filters: Record<string, string | number> = { page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1, per_page: 20 };
  if (['read', 'unread'].includes(params.get('read') || '')) filters.read = params.get('read')!;
  if (categories.some(category => category.id && category.id === params.get('category'))) filters.category = params.get('category')!;
  const query = useWorkspacePage<NotificationRow>('notifications', filters);
  const mutation = useNotificationRead();
  usePageCorrection(query);
  const update = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const unread = query.data?.meta?.unread_count ?? 0;
  const readFilter = String(filters.read || '');
  const categoryFilter = String(filters.category || '');

  if (runtime.demoMode) return <EmptyState title="این بخش عملیاتی در محیط نمایشی فعال نیست؛ به API واقعی نیاز دارد." />;
  return <section className="mx-auto max-w-6xl space-y-5 p-3 sm:p-6 lg:p-8" dir="rtl">
    <header className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:p-6">
      <div className="flex items-center gap-3.5"><div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Bell className="h-6 w-6" />{unread > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black ring-2 ring-white">{unread.toLocaleString('fa-IR')}</span>}</div><div><h1 className="text-xl font-black text-slate-900 sm:text-2xl">مرکز اعلان‌ها</h1><p className="mt-1 text-xs text-slate-500 sm:text-sm">ارجاع‌ها، جلسه‌ها، دیدگاه‌ها و رویدادهای کاری شما</p></div></div>
      <Button disabled={!unread} loading={mutation.isPending && mutation.variables === null} onClick={() => mutation.mutate(null)}><CheckCheck className="h-4 w-4" />خواندن همه</Button>
    </header>

    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-black text-slate-500">وضعیت اعلان‌ها</span><div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">{[
        { id: '', label: 'همه' }, { id: 'unread', label: 'خوانده‌نشده' }, { id: 'read', label: 'خوانده‌شده' },
      ].map(item => <button key={item.id || 'all'} type="button" onClick={() => update('read', item.id)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${readFilter === item.id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}{item.id === 'unread' && unread > 0 ? ` (${unread.toLocaleString('fa-IR')})` : ''}</button>)}</div></div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">{categories.map(category => { const Icon = category.icon; return <button key={category.id || 'all'} type="button" onClick={() => update('category', category.id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition ${categoryFilter === category.id ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent bg-slate-50 text-slate-600 hover:border-slate-200'}`}><Icon className={`h-3.5 w-3.5 ${categoryFilter === category.id ? 'text-indigo-600' : category.tone}`} />{category.label}</button>; })}</div>
    </section>

    {mutation.isError && <ErrorState error={mutation.error} />}
    {query.isPending ? <LoadingState label="در حال دریافت اعلان‌ها…" /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.data.length ? <div className="rounded-3xl border border-slate-200 bg-white"><EmptyState title="اعلانی در این دسته نیست."><Bell className="mx-auto mb-3 h-10 w-10 text-slate-300" /></EmptyState></div> : <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">{query.data.data.map(row => {
        const target = notificationDestination(row);
        const visual = visualOf(row);
        const Icon = visual.icon;
        const category = categories.find(item => item.id === categoryOf(row));
        return <article key={row.id} className={`flex items-start gap-3.5 p-4 transition-colors sm:p-5 ${row.read ? 'hover:bg-slate-50' : 'bg-indigo-50/35'}`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${visual.box}`}><Icon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-black text-slate-900">{row.title}</h2>{!row.read && <span className="h-2 w-2 rounded-full bg-indigo-600" />}<span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{category?.label || labels[row.type] || row.type}</span></div><span className="mt-1 inline-block text-[10px] font-bold text-slate-400">{labels[row.type] || row.type}</span></div><time className="text-[10px] text-slate-400">{formatPersianDate(row.timestamp || row.createdAt)}</time></div><p className="mt-2 whitespace-pre-line text-xs leading-6 text-slate-600 sm:text-sm">{row.message}</p><div className="mt-3 flex flex-wrap gap-2">{target && <Link className="ui-button ui-button-secondary !min-h-8 !px-2.5 text-[11px]" to={`${target}?${new URLSearchParams({ returnTo: `/notifications${params.size ? `?${params}` : ''}` })}`}><ExternalLink className="h-3.5 w-3.5" />بازکردن مورد مرتبط</Link>}{!row.read && <Button variant="ghost" className="!min-h-8 !px-2.5 text-[11px]" loading={mutation.isPending && mutation.variables === row.id} disabled={mutation.isPending} onClick={() => mutation.mutate(row.id)}><CheckCircle2 className="h-3.5 w-3.5" />خوانده شد</Button>}</div></div>
        </article>;
      })}</div>
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={nextPage => update('page', String(nextPage))} />
    </>}
  </section>;
}
