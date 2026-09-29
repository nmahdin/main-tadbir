import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { canUsePermission } from '../../utils/permissions';
import { useWorkspacePage, type WorkspaceModule } from '../../queries/workspacePages';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../common/Primitives';
import { listStatuses, notificationDestination } from '../../routing/listQuery';
import { formatPersianDate } from '../../utils/date';
function ActionSection({ module, title, params, destination }: { module: WorkspaceModule; title: string; params: Record<string,string>; destination: string }) {
  const query = useWorkspacePage(module, {...params, per_page: 5});
  return <section aria-label={title} className="bg-white border border-slate-200 rounded-xl min-w-0 p-4">
    <header className="flex justify-between flex-wrap gap-2 mb-3"><h2 className="font-bold">{title}</h2><Link className="text-indigo-700 text-sm" to={destination}>مشاهدهٔ فهرست</Link></header>
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.data.length ? <EmptyState title="در این بخش کاری در انتظار شما نیست." /> : <ul className="divide-y divide-slate-100">{query.data.data.map(row => {
      const target = module === 'notifications' ? notificationDestination(row) : module === 'approvals' ? `/approvals?item=${row.id}` : `/${module}/${row.id}`;
      return <li key={row.id} className="py-3 text-sm space-y-1 break-words">{target ? <Link className="font-bold text-indigo-700 hover:underline" to={target}>{row.name || row.title}</Link> : <strong>{row.title}</strong>}
        <p className="text-slate-600">{module === 'notifications' ? row.message : listStatuses[module]?.[row.status] || row.status}</p>
        {(row.deadline || row.timestamp) && <p className="text-xs text-slate-500">{formatPersianDate(row.deadline || row.timestamp)}</p>}
      </li>;
    })}</ul>}
  </section>;
}
export function ActionDashboard() {
  const { currentUser } = useAuth(); const can = (permission: string) => canUsePermission(currentUser,[],permission);
  return <div className="max-w-7xl mx-auto p-2 sm:p-5" dir="rtl"><PageHeader title="کارتابل من" description="قدم بعدی شما؛ بر پایهٔ اطلاعات ثبت‌شده در سرور." />
    <div className="grid lg:grid-cols-2 gap-4">
      {can('tasks.view') && <><ActionSection module="tasks" title="کارهای امروز من" params={{assignee:'me',due:'today',sort:'deadline',direction:'asc'}} destination="/tasks?assignee=me&due=today" /><ActionSection module="tasks" title="تسک‌های عقب‌افتاده" params={{assignee:'me',due:'overdue',sort:'deadline',direction:'asc'}} destination="/tasks?assignee=me&due=overdue" /></>}
      {can('content.approve') && can('content.view') && <ActionSection module="approvals" title="منتظر بررسی من" params={{}} destination="/approvals" />}
      {can('content.view') && <ActionSection module="contents" title="محتواهای جاری من" params={{owner:'me',status:'open',sort:'deadline',direction:'asc'}} destination="/contents?owner=me&status=open" />}
      <ActionSection module="notifications" title="اعلان‌های نخوانده" params={{read:'unread'}} destination="/notifications?read=unread" />
      {can('projects.view') && <ActionSection module="projects" title="پروژه‌های تحت مدیریت من با سررسید گذشته" params={{project_manager_id:currentUser.id,due:'overdue',sort:'deadline',direction:'asc'}} destination={`/projects?project_manager_id=${currentUser.id}&due=overdue`} />}
    </div>
  </div>;
}
