import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, Bell, Building2, CheckSquare2, FolderKanban, LayoutGrid,
  MailPlus, PenTool, Plus, Settings2, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../app/providers/AuthContext';
import { useApp } from '../../app/providers/AppContext';
import { useEnvironment } from '../../app/providers/EnvironmentContext';
import { runtime } from '../../shared/config/runtime';
import { canUsePermission } from '../../shared/lib/permissions';
import { formatPersianDate } from '../../shared/lib/date';
import { useWorkspacePage } from '../../shared/queries/workspacePages';
import { notificationDestination } from '../../app/router/listQuery';
import { dashboardApi } from './dashboardApi';
import {
  DashboardHeader, KpiCard, WidgetCard, WidgetEmpty, WidgetError, WidgetSkeleton, faNum,
} from './widgets';

interface Row { id: string | number; title: string; meta?: string; date?: string; to?: string | null }

function RowList({ rows, emptyText }: { rows: Row[]; emptyText: string }) {
  if (rows.length === 0) return <WidgetEmpty text={emptyText} />;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map(row => (
        <li key={row.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            {row.to
              ? <Link to={row.to} className="truncate text-sm font-extrabold text-slate-800 hover:underline" style={{ color: 'var(--color-primary)' }}>{row.title}</Link>
              : <strong className="truncate text-sm font-extrabold text-slate-800">{row.title}</strong>}
            {row.date && <time className="shrink-0 text-[10px] text-slate-400">{formatPersianDate(row.date)}</time>}
          </div>
          {row.meta && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.meta}</p>}
        </li>
      ))}
    </ul>
  );
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50" style={{ color: 'var(--color-primary)' }}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate text-slate-700">{label}</span>
    </Link>
  );
}

/**
 * UX-02-2 personal / organization-workspace dashboard. One shared
 * layout; organization workspaces add management extras strictly
 * when the server summary returns those sections (UX-02-1 K2: the
 * underlying lists still follow the existing access rules — this
 * dashboard never claims workspace-level data isolation).
 */
export function WorkspaceDashboard() {
  const { currentUser } = useAuth();
  const { current, payload } = useEnvironment();
  const can = (permission: string) => canUsePermission(currentUser, [], permission);

  const todayQuery = useWorkspacePage('tasks', { assignee: 'me', due: 'today', sort: 'deadline', direction: 'asc', per_page: 5 });
  const overdueQuery = useWorkspacePage('tasks', { assignee: 'me', due: 'overdue', sort: 'deadline', direction: 'asc', per_page: 5 });
  const projectsQuery = useWorkspacePage('projects', { project_manager_id: currentUser.id, sort: 'deadline', direction: 'asc', per_page: 5 });
  const notificationsQuery = useWorkspacePage('notifications', { read: 'unread', per_page: 5 });
  const approvalsQuery = useWorkspacePage('approvals', { per_page: 5 }, can('content.approve') && can('content.view'));

  // Demo mode: the page queries stay disabled by design, so the
  // same layout is rendered from the demo fixture context instead.
  if (runtime.demoMode) return <DemoWorkspaceDashboard />;

  const organizationId = current?.kind === 'workspace' && current.id !== null
    ? payload?.workspaces.find(item => item.id === current.id)?.organization_id ?? null
    : null;

  const toRows = (query: typeof todayQuery, kind: 'tasks' | 'projects' | 'notifications' | 'approvals'): Row[] =>
    (query.data?.data ?? []).map((row: any) => ({
      id: row.id,
      title: row.name || row.title || 'بدون عنوان',
      meta: kind === 'notifications' ? row.message : undefined,
      date: row.deadline || row.timestamp || row.created_at,
      to: kind === 'notifications' ? notificationDestination(row) : kind === 'approvals' ? `/approvals?item=${row.id}` : `/${kind}/${row.id}`,
    }));

  const total = (query: typeof todayQuery) => query.data?.meta?.total ?? query.data?.data?.length ?? null;

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8" dir="rtl">
      <DashboardHeader
        eyebrow={current?.organizationName ? `فضای کاری سازمانی · ${current.organizationName}` : 'فضای کاری شخصی'}
        title="کارتابل من"
        description="کارهای امروز، موارد عقب‌افتاده و قدم بعدی شما بر پایهٔ داده‌های زنده و دسترسی‌های فعلی‌تان."
      >
        <Link to="/select-environment" className="flex shrink-0 items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-black text-white backdrop-blur-sm transition hover:bg-white/25">
          <LayoutGrid className="h-4 w-4" aria-hidden />
          تغییر محیط
        </Link>
      </DashboardHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={CheckSquare2} label="کارهای امروز" value={todayQuery.isPending ? '…' : faNum(total(todayQuery))} hint="تسک‌هایی با موعد امروز" to="/tasks?assignee=me&due=today" />
        <KpiCard icon={AlertTriangle} label="عقب‌افتاده" value={overdueQuery.isPending ? '…' : faNum(total(overdueQuery))} hint="عبورکرده از موعد تعیین‌شده" to="/tasks?assignee=me&due=overdue" />
        <KpiCard icon={FolderKanban} label="پروژه‌های تحت مدیریت من" value={projectsQuery.isPending ? '…' : faNum(total(projectsQuery))} hint="پروژه‌هایی که مدیر آن‌ها هستید" to={`/projects?project_manager_id=${currentUser.id}`} />
        <KpiCard icon={Bell} label="اعلان‌های نخوانده" value={notificationsQuery.isPending ? '…' : faNum(notificationsQuery.data?.meta?.unread_count ?? total(notificationsQuery))} hint="رویدادهای تازهٔ سامانه" to="/notifications?read=unread" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="کارهای امروز من" description="تسک‌هایی که موعد انجامشان امروز است" icon={CheckSquare2} to="/tasks?assignee=me&due=today" linkLabel="مشاهدهٔ فهرست کامل">
          {todayQuery.isPending ? <WidgetSkeleton /> : todayQuery.isError ? <WidgetError onRetry={() => void todayQuery.refetch()} /> : <RowList rows={toRows(todayQuery, 'tasks')} emptyText="برای امروز کاری در انتظار شما نیست." />}
        </WidgetCard>

        <WidgetCard title="تسک‌های عقب‌افتاده" description="مواردی که از موعد تعیین‌شده عبور کرده‌اند" icon={AlertTriangle} to="/tasks?assignee=me&due=overdue" linkLabel="مشاهدهٔ فهرست کامل">
          {overdueQuery.isPending ? <WidgetSkeleton /> : overdueQuery.isError ? <WidgetError onRetry={() => void overdueQuery.refetch()} /> : <RowList rows={toRows(overdueQuery, 'tasks')} emptyText="مورد عقب‌افتاده‌ای ندارید." />}
        </WidgetCard>

        <WidgetCard title="پروژه‌های من" description="پروژه‌های تحت مدیریت شما، بر اساس نزدیک‌ترین موعد" icon={FolderKanban} to={`/projects?project_manager_id=${currentUser.id}`} linkLabel="همهٔ پروژه‌ها">
          {projectsQuery.isPending ? <WidgetSkeleton /> : projectsQuery.isError ? <WidgetError onRetry={() => void projectsQuery.refetch()} /> : <RowList rows={toRows(projectsQuery, 'projects')} emptyText="پروژه‌ای تحت مدیریت شما نیست." />}
        </WidgetCard>

        <WidgetCard title="اعلان‌های نخوانده" description="رویدادهای تازه‌ای که هنوز مشاهده نکرده‌اید" icon={Bell} to="/notifications?read=unread" linkLabel="همهٔ اعلان‌ها">
          {notificationsQuery.isPending ? <WidgetSkeleton /> : notificationsQuery.isError ? <WidgetError onRetry={() => void notificationsQuery.refetch()} /> : <RowList rows={toRows(notificationsQuery, 'notifications')} emptyText="اعلان نخوانده‌ای ندارید." />}
        </WidgetCard>

        {can('content.approve') && can('content.view') && (
          <WidgetCard title="منتظر بررسی من" description="مراحل محتوایی که به تصمیم شما نیاز دارند" icon={ShieldCheck} to="/approvals" linkLabel="مرکز تأییدها">
            {approvalsQuery.isPending ? <WidgetSkeleton /> : approvalsQuery.isError ? <WidgetError onRetry={() => void approvalsQuery.refetch()} /> : <RowList rows={toRows(approvalsQuery, 'approvals')} emptyText="موردی در انتظار بررسی شما نیست." />}
          </WidgetCard>
        )}

        <WidgetCard title="دسترسی سریع" description="میانبرهای پرکاربرد بر اساس دسترسی‌های شما" icon={Plus}>
          <div className="grid grid-cols-2 gap-2">
            {can('tasks.view') && <QuickAction to="/tasks?assignee=me" icon={CheckSquare2} label="تسک‌های من" />}
            {can('projects.view') && <QuickAction to="/projects" icon={FolderKanban} label="پروژه‌ها" />}
            {can('content.view') && <QuickAction to="/contents" icon={PenTool} label="محتواها" />}
            <QuickAction to="/notifications" icon={Bell} label="اعلان‌ها" />
            {can('settings.manage') && <QuickAction to="/scoped-settings" icon={Settings2} label="تنظیمات" />}
            <QuickAction to="/select-environment" icon={LayoutGrid} label="انتخاب محیط" />
          </div>
          <p className="mt-4 flex items-start gap-1.5 text-[10px] leading-5 text-slate-400">
            <ArrowLeft className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            فهرست‌ها طبق قوانین دسترسی موجود سامانه نمایش داده می‌شوند و انتخاب محیط، دامنهٔ داده‌ها را تغییر نمی‌دهد.
          </p>
        </WidgetCard>
      </div>

      {organizationId !== null && <OrganizationExtras organizationId={organizationId} />}
    </section>
  );
}

function OrganizationExtras({ organizationId }: { organizationId: number }) {
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', 'organization', organizationId],
    queryFn: () => dashboardApi.organizationSummary(organizationId),
  });
  const summary = summaryQuery.data?.data;
  if (summaryQuery.isPending) return null;
  if (!summary || (summary.members === null && summary.invitations === null)) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {summary.members !== null && (
        <KpiCard icon={Building2} label={`اعضای سازمان`} value={faNum(summary.members.active)} hint="اعضای فعال سازمان جاری" to="/scoped-settings" />
      )}
      {summary.invitations !== null && (
        <WidgetCard title="دعوت‌های سازمان" description="وضعیت دعوت‌های مدیریتی این سازمان" icon={MailPlus} to="/invitations/manage" linkLabel="مدیریت دعوت‌ها">
          <p className="text-xs leading-6 text-slate-600">
            <strong className="text-base font-black text-slate-900">{faNum(summary.invitations.pending)}</strong> دعوت در انتظار پذیرش است.
          </p>
        </WidgetCard>
      )}
    </div>
  );
}

/** Demo-mode rendering from the fixture context (development only). */
function DemoWorkspaceDashboard() {
  const { currentUser, tasks, projects } = useApp();
  const today = new Date().toISOString().split('T')[0];
  const mine = tasks.filter(task => task.assigneeId === currentUser.id && task.status !== 'completed');
  const todayRows: Row[] = mine.filter(task => task.deadline === today).slice(0, 5).map(task => ({ id: task.id, title: task.title, date: task.deadline, to: '/tasks' }));
  const overdueRows: Row[] = mine.filter(task => task.deadline < today).slice(0, 5).map(task => ({ id: task.id, title: task.title, date: task.deadline, to: '/tasks' }));
  const projectRows: Row[] = projects.slice(0, 5).map(project => ({ id: project.id, title: project.name, date: project.deadline, to: '/projects' }));

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8" dir="rtl">
      <DashboardHeader
        eyebrow="محیط نمایشی"
        title="کارتابل من"
        description="نمای نمایشی داشبورد فضای کاری؛ در محیط واقعی همین چیدمان با داده‌های زندهٔ سامانه پر می‌شود."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={CheckSquare2} label="کارهای امروز" value={faNum(todayRows.length)} to="/tasks" />
        <KpiCard icon={AlertTriangle} label="عقب‌افتاده" value={faNum(overdueRows.length)} to="/tasks" />
        <KpiCard icon={FolderKanban} label="پروژه‌ها" value={faNum(projects.length)} to="/projects" />
        <KpiCard icon={Bell} label="اعلان‌های نخوانده" value="—" hint="در حالت نمایشی محاسبه نمی‌شود" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="کارهای امروز من" icon={CheckSquare2} to="/tasks" linkLabel="مشاهدهٔ فهرست کامل">
          <RowList rows={todayRows} emptyText="برای امروز کاری در انتظار شما نیست." />
        </WidgetCard>
        <WidgetCard title="تسک‌های عقب‌افتاده" icon={AlertTriangle} to="/tasks" linkLabel="مشاهدهٔ فهرست کامل">
          <RowList rows={overdueRows} emptyText="مورد عقب‌افتاده‌ای ندارید." />
        </WidgetCard>
        <WidgetCard title="پروژه‌های من" icon={FolderKanban} to="/projects" linkLabel="همهٔ پروژه‌ها">
          <RowList rows={projectRows} emptyText="پروژه‌ای برای نمایش وجود ندارد." />
        </WidgetCard>
        <WidgetCard title="دسترسی سریع" icon={Plus}>
          <div className="grid grid-cols-2 gap-2">
            <QuickAction to="/tasks" icon={CheckSquare2} label="تسک‌های من" />
            <QuickAction to="/projects" icon={FolderKanban} label="پروژه‌ها" />
            <QuickAction to="/contents" icon={PenTool} label="محتواها" />
            <QuickAction to="/select-environment" icon={LayoutGrid} label="انتخاب محیط" />
          </div>
        </WidgetCard>
      </div>
    </section>
  );
}
