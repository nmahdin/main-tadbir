import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bell, CheckSquare2, Clock3, FolderKanban, LayoutDashboard, PenTool, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { canUsePermission } from '../../utils/permissions';
import { useWorkspacePage, type WorkspaceModule } from '../../queries/workspacePages';
import { EmptyState, ErrorState, LoadingState } from '../common/Primitives';
import { listStatuses, notificationDestination } from '../../routing/listQuery';
import { formatPersianDate } from '../../utils/date';

type Tone = 'indigo' | 'rose' | 'amber' | 'emerald' | 'violet' | 'sky';
const tones: Record<Tone, { icon: string; edge: string; link: string }> = {
  indigo: { icon: 'bg-indigo-50 text-indigo-600', edge: 'border-indigo-100', link: 'text-indigo-700' },
  rose: { icon: 'bg-rose-50 text-rose-600', edge: 'border-rose-100', link: 'text-rose-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', edge: 'border-amber-100', link: 'text-amber-700' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', edge: 'border-emerald-100', link: 'text-emerald-700' },
  violet: { icon: 'bg-violet-50 text-violet-600', edge: 'border-violet-100', link: 'text-violet-700' },
  sky: { icon: 'bg-sky-50 text-sky-600', edge: 'border-sky-100', link: 'text-sky-700' },
};

function ActionSection({ module, title, description, params, destination, icon: Icon, tone }: { module: WorkspaceModule; title: string; description: string; params: Record<string, string>; destination: string; icon: React.ElementType; tone: Tone }) {
  const query = useWorkspacePage(module, { ...params, per_page: 5 });
  const palette = tones[tone];
  return <section aria-label={title} className={`rounded-3xl border bg-white min-w-0 overflow-hidden shadow-xs hover:shadow-md transition-shadow ${palette.edge}`}>
    <header className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3"><div className="flex items-start gap-3 min-w-0"><div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${palette.icon}`}><Icon className="w-5 h-5" /></div><div className="min-w-0"><h2 className="font-black text-sm text-slate-900">{title}</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p></div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{(query.data?.meta?.total ?? query.data?.data?.length ?? 0).toLocaleString('fa-IR')}</span></header>
    <div className="p-4 sm:px-5">{query.isPending ? <LoadingState label="در حال دریافت…" /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.data.length ? <EmptyState title="کاری در انتظار شما نیست." /> : <ul className="divide-y divide-slate-100">{query.data.data.map(row => {
      const target = module === 'notifications' ? notificationDestination(row) : module === 'approvals' ? `/approvals?item=${row.id}` : `/${module}/${row.id}`;
      return <li key={row.id} className="py-3 first:pt-0 last:pb-0 text-sm min-w-0"><div className="flex items-start justify-between gap-3">{target ? <Link className={`font-extrabold truncate hover:underline ${palette.link}`} to={target}>{row.name || row.title}</Link> : <strong className="truncate">{row.title}</strong>}{(row.deadline || row.timestamp) && <time className="shrink-0 text-[9px] text-slate-400">{formatPersianDate(row.deadline || row.timestamp)}</time>}</div><p className="mt-1 text-xs text-slate-500 line-clamp-2">{module === 'notifications' ? row.message : listStatuses[module]?.[row.status] || row.status}</p></li>;
    })}</ul>}</div>
    <Link className={`flex items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-3 text-xs font-black hover:bg-slate-50 ${palette.link}`} to={destination}>مشاهدهٔ فهرست کامل<ArrowLeft className="w-3.5 h-3.5" /></Link>
  </section>;
}

export function ActionDashboard() {
  const { currentUser } = useAuth();
  const can = (permission: string) => canUsePermission(currentUser, [], permission);
  return <section className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8 space-y-5" dir="rtl">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-indigo-950 to-indigo-800 p-6 sm:p-8 text-white shadow-lg">
      <div className="absolute -left-16 -top-20 w-64 h-64 rounded-full bg-violet-500/20 blur-3xl" /><div className="relative flex items-center gap-4"><div className="w-13 h-13 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm flex items-center justify-center"><LayoutDashboard className="w-7 h-7" /></div><div><p className="text-xs text-indigo-200 font-bold">فضای کاری شخصی</p><h1 className="mt-1 text-2xl sm:text-3xl font-black">کارتابل من</h1><p className="mt-2 text-xs sm:text-sm text-indigo-100/80">کارهای فوری، ارجاع‌ها و قدم بعدی شما بر پایهٔ داده‌های زندهٔ سامانه</p></div></div>
    </header>
    <div className="grid lg:grid-cols-2 gap-4">
      {can('tasks.view') && <><ActionSection module="tasks" title="کارهای امروز من" description="تسک‌هایی که موعد انجامشان امروز است" params={{ assignee: 'me', due: 'today', sort: 'deadline', direction: 'asc' }} destination="/tasks?assignee=me&due=today" icon={CheckSquare2} tone="indigo" /><ActionSection module="tasks" title="تسک‌های عقب‌افتاده" description="مواردی که از موعد تعیین‌شده عبور کرده‌اند" params={{ assignee: 'me', due: 'overdue', sort: 'deadline', direction: 'asc' }} destination="/tasks?assignee=me&due=overdue" icon={AlertTriangle} tone="rose" /></>}
      {can('content.approve') && can('content.view') && <ActionSection module="approvals" title="منتظر بررسی من" description="مراحل محتوایی که به تصمیم شما نیاز دارند" params={{}} destination="/approvals" icon={ShieldCheck} tone="amber" />}
      {can('content.view') && <ActionSection module="contents" title="محتواهای جاری من" description="پرونده‌های محتوایی باز تحت مسئولیت شما" params={{ owner: 'me', status: 'open', sort: 'deadline', direction: 'asc' }} destination="/contents?owner=me&status=open" icon={PenTool} tone="violet" />}
      <ActionSection module="notifications" title="اعلان‌های نخوانده" description="رویدادهای تازه‌ای که هنوز مشاهده نکرده‌اید" params={{ read: 'unread' }} destination="/notifications?read=unread" icon={Bell} tone="emerald" />
      {can('projects.view') && <ActionSection module="projects" title="پروژه‌های تأخیردار من" description="پروژه‌های تحت مدیریت شما با سررسید گذشته" params={{ project_manager_id: currentUser.id, due: 'overdue', sort: 'deadline', direction: 'asc' }} destination={`/projects?project_manager_id=${currentUser.id}&due=overdue`} icon={FolderKanban} tone="sky" />}
    </div>
  </section>;
}
