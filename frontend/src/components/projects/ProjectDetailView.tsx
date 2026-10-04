import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Archive,
  Calendar,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  Clock3,
  FileText,
  FolderKanban,
  Image,
  Layers3,
  Lightbulb,
  ListChecks,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { projectOperationsApi } from '../../api/projectOperations';
import { parseApiError } from '../../api/errors';
import type { ProjectContentPlan } from '../../types';
import { formatPersianDate } from '../../utils/date';
import { Avatar, AvatarGroup, ProgressBar } from '../common/Avatar';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Select,
  Textarea,
} from '../common/Primitives';
import { DataTable, FilterBar, Pagination } from '../common/WorkspacePatterns';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { PriorityPill, ProjectStatusBadge } from '../common/PriorityPill';
import { DamLibrary } from '../dam/DamLibrary';
import { CreateIdeaModal } from '../thought-room/CreateIdeaModal';
import { CreateMeetingModal } from '../thought-room/CreateMeetingModal';

type TabId = 'overview' | 'tasks' | 'contents' | 'series' | 'assets' | 'activities' | 'ideas' | 'meetings' | 'plan';
type DomainTab = Exclude<TabId, 'overview' | 'plan' | 'assets'>;
type PlanInput = Pick<ProjectContentPlan, 'contentType' | 'plannedCount'> & Partial<Pick<ProjectContentPlan, 'notes' | 'defaultSeriesId' | 'deadline'>>;

const tabs: Array<{ id: TabId; label: string; permission?: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'نمای کلی', icon: <FolderKanban /> },
  { id: 'tasks', label: 'تسک‌ها', permission: 'tasks.view', icon: <CheckSquare /> },
  { id: 'contents', label: 'محتواها', permission: 'content.view', icon: <FileText /> },
  { id: 'series', label: 'مجموعه‌ها', permission: 'content.view', icon: <Layers3 /> },
  { id: 'assets', label: 'دارایی‌ها', permission: 'assets.view', icon: <Image /> },
  { id: 'activities', label: 'فعالیت‌ها', permission: 'reports.view', icon: <Activity /> },
  { id: 'ideas', label: 'ایده‌ها', permission: 'thinktank.view', icon: <Lightbulb /> },
  { id: 'meetings', label: 'جلسات', permission: 'meetings.view', icon: <CalendarDays /> },
  { id: 'plan', label: 'برنامه محتوا', permission: 'content.view', icon: <ListChecks /> },
];

const domainTitles: Record<DomainTab, string> = {
  tasks: 'تسک‌ها',
  contents: 'محتواها',
  series: 'مجموعه‌های محتوا',
  activities: 'رویدادهای پروژه',
  ideas: 'ایده‌های مرتبط',
  meetings: 'جلسات پروژه',
};

const domainStatuses: Partial<Record<DomainTab, Array<[string, string]>>> = {
  contents: [['planning', 'برنامه‌ریزی'], ['producing', 'در تولید'], ['reviewing', 'بازبینی'], ['ready_to_publish', 'آماده انتشار'], ['published', 'منتشرشده'], ['archived', 'بایگانی']],
  series: [['active', 'فعال'], ['paused', 'متوقف'], ['archived', 'بایگانی']],
  tasks: [['backlog', 'صف کار'], ['in_progress', 'در حال انجام'], ['review', 'بازبینی'], ['completed', 'تکمیل‌شده'], ['archived', 'بایگانی']],
  ideas: [['submitted', 'ثبت‌شده'], ['reviewing', 'در بررسی'], ['approved', 'تأییدشده'], ['converted', 'تبدیل‌شده'], ['rejected', 'ردشده']],
  meetings: [['scheduled', 'برنامه‌ریزی‌شده'], ['completed', 'برگزارشده'], ['cancelled', 'لغوشده']],
};

const statusLabels: Record<string, string> = {
  active: 'فعال',
  completed: 'تکمیل‌شده',
  archived: 'بایگانی',
  on_hold: 'متوقف',
  todo: 'برای انجام',
  in_progress: 'در حال انجام',
  review: 'بازبینی',
  approved: 'تأییدشده',
  published: 'منتشرشده',
  draft: 'پیش‌نویس',
  planned: 'برنامه‌ریزی‌شده',
  open: 'باز',
  closed: 'بسته',
  paused: 'متوقف',
};

const statusColors: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  in_progress: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  review: 'border-violet-200 bg-violet-50 text-violet-700',
  planned: 'border-sky-200 bg-sky-50 text-sky-700',
  paused: 'border-amber-200 bg-amber-50 text-amber-700',
  on_hold: 'border-amber-200 bg-amber-50 text-amber-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-600',
};

export const ProjectDetailView: React.FC = () => {
  const {
    selectedProjectId,
    projects,
    users,
    hasPermission,
    notify,
    setActiveView,
    setSelectedProjectId,
    setSelectedTaskId,
    setSelectedContentId,
    setSelectedIdeaId,
    setIsCreateTaskOpen,
    setIsCreateContentOpen,
    setContentCreateProjectId,
    openEditProject,
    deleteProject,
    openProjectChannel,
  } = useApp();
  const project = projects.find(item => item.id === selectedProjectId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') as TabId | null;
  const tab: TabId = tabs.some(item => item.id === requestedTab) ? requestedTab! : 'overview';
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({ search: '', status: '' });
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<ProjectContentPlan | null>(null);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);

  const commonParams = useMemo(() => ({
    page,
    per_page: 20,
    search: filters.search,
    status: filters.status,
  }), [page, filters]);

  const summary = useQuery({
    queryKey: ['project-operations', selectedProjectId, 'summary'],
    queryFn: () => projectOperationsApi.summary(selectedProjectId!),
    enabled: Boolean(project && !/^tmp-/.test(project.id)),
  });
  const tasks = useQuery({ queryKey: ['project-operations', selectedProjectId, 'tasks', commonParams], queryFn: () => projectOperationsApi.tasks(selectedProjectId!, commonParams), enabled: tab === 'tasks' && hasPermission('tasks.view') });
  const contents = useQuery({ queryKey: ['project-operations', selectedProjectId, 'contents', commonParams], queryFn: () => projectOperationsApi.contents(selectedProjectId!, commonParams), enabled: tab === 'contents' && hasPermission('content.view') });
  const series = useQuery({ queryKey: ['project-operations', selectedProjectId, 'series', commonParams], queryFn: () => projectOperationsApi.series(selectedProjectId!, commonParams), enabled: tab === 'series' && hasPermission('content.view') });
  const planSeries = useQuery({ queryKey: ['project-operations', selectedProjectId, 'series-plan'], queryFn: () => projectOperationsApi.series(selectedProjectId!, { per_page: 100 }), enabled: tab === 'plan' && hasPermission('content.view') });
  const activities = useQuery({ queryKey: ['project-operations', selectedProjectId, 'activities', commonParams], queryFn: () => projectOperationsApi.activities(selectedProjectId!, commonParams), enabled: tab === 'activities' && hasPermission('reports.view') });
  const ideas = useQuery({ queryKey: ['project-operations', selectedProjectId, 'ideas', commonParams], queryFn: () => projectOperationsApi.ideas(selectedProjectId!, commonParams), enabled: tab === 'ideas' && hasPermission('thinktank.view') });
  const meetings = useQuery({ queryKey: ['project-operations', selectedProjectId, 'meetings', commonParams], queryFn: () => projectOperationsApi.meetings(selectedProjectId!, commonParams), enabled: tab === 'meetings' && hasPermission('meetings.view') });
  const plans = useQuery({ queryKey: ['project-plans', selectedProjectId], queryFn: () => projectOperationsApi.plans(selectedProjectId!), enabled: tab === 'plan' && hasPermission('content.view') });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['project-operations', selectedProjectId] }),
      queryClient.invalidateQueries({ queryKey: ['project-plans', selectedProjectId] }),
    ]);
  };
  const archiveProject = useMutation({
    mutationFn: () => deleteProject(selectedProjectId!),
    onSuccess: archived => {
      if (!archived) return;
      notify({ type: 'success', title: 'پروژه بایگانی شد', message: 'رکوردهای مرتبط و تاریخچه پروژه حفظ شدند.' });
      setArchiveConfirmationOpen(false);
      setSelectedProjectId(null);
      setActiveView('projects');
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });
  const deletePlan = useMutation({
    mutationFn: (id: string) => projectOperationsApi.deletePlan(selectedProjectId!, id),
    onSuccess: async () => {
      notify({ type: 'success', title: 'ردیف برنامه حذف شد' });
      setPlanToDelete(null);
      await invalidate();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });

  if (!project || !selectedProjectId) {
    return (
      <div className="p-8">
        <EmptyState title="پروژه‌ای انتخاب نشده است.">
          <Button variant="secondary" onClick={() => setActiveView('projects')}>بازگشت به پروژه‌ها</Button>
        </EmptyState>
      </div>
    );
  }

  const memberUsers = users.filter(user => project.memberIds.includes(user.id));
  const manager = users.find(user => user.id === project.projectManagerId);
  const visibleTabs = tabs.filter(item => !item.permission || hasPermission(item.permission));
  const currentTab = visibleTabs.some(item => item.id === tab) ? tab : 'overview';
  const switchTab = (next: TabId) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', next);
    setSearchParams(nextParams);
    setPage(1);
    setFilters({ search: '', status: '' });
  };
  const openContentCreate = () => {
    setContentCreateProjectId(project.id);
    setIsCreateContentOpen(true);
  };

  const activeQuery = { tasks, contents, series, activities, ideas, meetings };

  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 text-right sm:p-6 lg:p-8">
      <Button variant="ghost" onClick={() => { setSelectedProjectId(null); setActiveView('projects'); }} className="w-fit text-slate-600">
        بازگشت به پروژه‌ها
      </Button>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="h-1.5 bg-gradient-to-l from-indigo-600 via-violet-500 to-purple-400" />
        <div className="p-5 sm:p-7">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <PriorityPill priority={project.priority} />
                {project.category && <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">{project.category}</span>}
              </div>
              <h1 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{project.name}</h1>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600">{project.description || 'برای این پروژه توضیحی ثبت نشده است.'}</p>
              <div className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <HeaderMeta label="مدیر پروژه">
                  {manager ? <><Avatar user={manager} size="sm" /><span className="truncate">{manager.name}</span></> : <span>تعیین نشده</span>}
                </HeaderMeta>
                <HeaderMeta label="اعضای تیم">
                  {memberUsers.length ? <><AvatarGroup users={memberUsers} max={4} size="sm" /><span>{memberUsers.length.toLocaleString('fa-IR')} نفر</span></> : <span>بدون عضو</span>}
                </HeaderMeta>
                <HeaderMeta label="بازه پروژه">
                  <Calendar className="h-4 w-4 text-indigo-500" />
                  <span>{formatPersianDate(project.startDate)} تا {formatPersianDate(project.deadline)}</span>
                </HeaderMeta>
              </div>
              {(project.tags?.length || project.budget) && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  {project.budget && <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-bold">بودجه: {project.budget}</span>}
                  {project.tags?.map(tag => <span key={tag} className="rounded-lg bg-slate-100 px-2 py-1">#{tag}</span>)}
                </div>
              )}
            </div>
            <div className="flex max-w-xl flex-wrap gap-2">
              {hasPermission('tasks.create') && (
                <Button variant="secondary" onClick={() => setIsCreateTaskOpen(true)}>
                  <CheckSquare className="h-4 w-4" />تسک جدید
                </Button>
              )}
              {hasPermission('content.create') && (
                <Button onClick={openContentCreate}>
                  <Sparkles className="h-4 w-4" />محتوای جدید
                </Button>
              )}
              {hasPermission('content.create') && (
                <Button variant="secondary" onClick={() => navigate(`/contents/series?project=${project.id}&create=1`)}>
                  <Layers3 className="h-4 w-4" />مجموعه جدید
                </Button>
              )}
              {hasPermission('thinktank.create_idea') && (
                <Button variant="secondary" onClick={() => setIdeaOpen(true)}>
                  <Lightbulb className="h-4 w-4" />ایده جدید
                </Button>
              )}
              {hasPermission('meetings.create') && (
                <Button variant="secondary" onClick={() => setMeetingOpen(true)}>
                  <UsersRound className="h-4 w-4" />جلسه جدید
                </Button>
              )}
              {hasPermission('messaging.view') && (
                <Button variant="secondary" onClick={() => openProjectChannel(project.id)}>
                  <MessageSquare className="h-4 w-4" />گفت‌وگو
                </Button>
              )}
              {hasPermission('projects.edit') && (
                <Button variant="secondary" onClick={() => openEditProject(project)}>
                  <Pencil className="h-4 w-4" />ویرایش
                </Button>
              )}
              {hasPermission('projects.delete') && project.status !== 'archived' && (
                <Button variant="danger" onClick={() => setArchiveConfirmationOpen(true)}>
                  <Archive className="h-4 w-4" />بایگانی
                </Button>
              )}
            </div>
          </div>
          <div className="mt-6 max-w-3xl border-t border-slate-100 pt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-600">
              <span>پیشرفت پروژه</span>
              <span>{(summary.data?.data.progress ?? project.progress).toLocaleString('fa-IR')}٪</span>
            </div>
            <ProgressBar progress={summary.data?.data.progress ?? project.progress} size="sm" />
          </div>
        </div>
      </section>

      <nav aria-label="بخش‌های مرکز عملیات پروژه" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs">
        <div className="flex min-w-max gap-1">
          {visibleTabs.map(item => (
            <button
              key={item.id}
              onClick={() => switchTab(item.id)}
              aria-current={currentTab === item.id ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold transition-colors [&>svg]:h-3.5 [&>svg]:w-3.5 ${
                currentTab === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      </nav>

      {currentTab === 'overview' && <Overview summary={summary} onTab={switchTab} />}
      {currentTab === 'plan' && (
        <ContentPlans
          projectId={project.id}
          plans={plans.data?.data || []}
          series={planSeries.data?.data || []}
          loading={plans.isLoading}
          error={plans.error}
          onRetry={() => plans.refetch()}
          onChanged={invalidate}
          onDelete={setPlanToDelete}
        />
      )}
      {currentTab === 'assets' && (
        /^\d+$/.test(project.id)
          ? <DamLibrary context={{ project_id: Number(project.id) }} />
          : <EmptyState title="ابتدا پروژه را در سرور ذخیره کنید." />
      )}
      {currentTab !== 'overview' && currentTab !== 'plan' && currentTab !== 'assets' && (
        <DomainPanel
          tab={currentTab}
          query={activeQuery[currentTab]}
          filters={filters}
          users={users}
          page={page}
          onPage={setPage}
          onFilters={next => { setFilters(next); setPage(1); }}
          onOpen={record => {
            if (currentTab === 'tasks') setSelectedTaskId(record.id);
            if (currentTab === 'contents') { setSelectedContentId(record.id); setActiveView('content-detail'); }
            if (currentTab === 'series') navigate(`/contents/series?series=${record.id}&project=${project.id}`);
            if (currentTab === 'ideas') { setSelectedIdeaId(record.id); setActiveView('thought-room'); }
            if (currentTab === 'meetings') setActiveView('thought-room');
          }}
        />
      )}

      <CreateIdeaModal isOpen={ideaOpen} onClose={() => setIdeaOpen(false)} projectId={project.id} />
      <CreateMeetingModal isOpen={meetingOpen} onClose={() => setMeetingOpen(false)} projectId={project.id} />
      <ConfirmDialog
        open={archiveConfirmationOpen}
        onClose={() => setArchiveConfirmationOpen(false)}
        onConfirm={() => archiveProject.mutate()}
        busy={archiveProject.isPending}
        title={`پروژه «${project.name}» بایگانی شود؟ رکوردهای مرتبط حذف نمی‌شوند.`}
      />
      <ConfirmDialog
        open={Boolean(planToDelete)}
        onClose={() => setPlanToDelete(null)}
        onConfirm={() => planToDelete && deletePlan.mutate(planToDelete.id)}
        busy={deletePlan.isPending}
        title={`ردیف «${planToDelete?.contentType || ''}» از برنامه محتوا حذف شود؟`}
      />
    </div>
  );
};

function HeaderMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
      <p className="mb-1.5 text-[10px] font-bold text-slate-400">{label}</p>
      <div className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-slate-700">{children}</div>
    </div>
  );
}

function Overview({ summary, onTab }: { summary: ReturnType<typeof useQuery<any>>; onTab: (tab: TabId) => void }) {
  const { hasPermission } = useApp();
  if (summary.isLoading) return <LoadingState label="در حال دریافت خلاصه پروژه…" />;
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} title="خلاصه پروژه دریافت نشد." />;
  const data = summary.data?.data;
  const cards = [
    { id: 'tasks' as TabId, permission: 'tasks.view', label: 'تسک‌ها', icon: <CheckSquare />, value: data?.tasks || 0, helper: `${(data?.completedTasks || 0).toLocaleString('fa-IR')} تکمیل‌شده · ${(data?.overdueTasks || 0).toLocaleString('fa-IR')} عقب‌افتاده`, tone: 'indigo' },
    { id: 'contents' as TabId, permission: 'content.view', label: 'محتواها', icon: <FileText />, value: data?.contents || 0, helper: `${(data?.publishedContents || 0).toLocaleString('fa-IR')} منتشرشده`, tone: 'violet' },
    { id: 'series' as TabId, permission: 'content.view', label: 'مجموعه‌ها', icon: <Layers3 />, value: data?.series || 0, helper: 'مرتبط با پروژه', tone: 'sky' },
    { id: 'assets' as TabId, permission: 'assets.view', label: 'دارایی‌ها', icon: <Package />, value: data?.assets || 0, helper: 'با رابطه مستقیم پروژه', tone: 'amber' },
  ].filter(card => hasPermission(card.permission));
  const operationRows = [
    ['محتواهای فعال', data?.activeContents || 0],
    ['تسک‌های باز', data?.openTasks || 0],
    ['تسک‌های عقب‌افتاده', data?.overdueTasks || 0],
    ['محتوای آماده انتشار', data?.readyPublish || 0],
    ['ایده‌ها', data?.ideas || 0],
    ['جلسات', data?.meetings || 0],
  ] as Array<[string, number]>;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(card => (
          <button key={card.id} onClick={() => onTab(card.id)} className="group rounded-3xl border border-slate-200 bg-white p-5 text-right shadow-2xs transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl [&>svg]:h-5 [&>svg]:w-5 ${metricTone(card.tone)}`}>{card.icon}</div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{card.value.toLocaleString('fa-IR')}</p>
              </div>
              <ChevronLeft className="h-4 w-4 text-slate-300 transition-transform group-hover:-translate-x-1 group-hover:text-indigo-500" />
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] text-slate-500">{card.helper}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-slate-900">عملیات جاری</h2>
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">پیشرفت {Number(data?.progress || 0).toLocaleString('fa-IR')}٪</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {operationRows.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <p className="text-[10px] font-bold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-900">{value.toLocaleString('fa-IR')}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-2xs">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-indigo-950">آخرین فعالیت‌ها</h2>
            <Activity className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="space-y-2">
            {(data?.latestActivities || []).map((item: any) => (
              <div key={item.id} className="rounded-2xl border border-white bg-white/90 p-3">
                <p className="text-xs font-bold text-slate-800">{item.action}</p>
                <p className="mt-1 text-[10px] text-slate-500">{formatPersianDate(item.timestamp)}</p>
              </div>
            ))}
            {!data?.latestActivities?.length && <EmptyState title="هنوز فعالیتی برای این پروژه ثبت نشده است." />}
          </div>
        </section>
      </div>
    </div>
  );
}

function DomainPanel({
  tab,
  query,
  filters,
  users,
  onPage,
  onFilters,
  onOpen,
}: {
  tab: DomainTab;
  query: ReturnType<typeof useQuery<any>>;
  filters: Record<string, string>;
  users: Array<{ id: string; name: string }>;
  page: number;
  onPage: (page: number) => void;
  onFilters: (filters: Record<string, string>) => void;
  onOpen: (record: any) => void;
}) {
  const data = query.data;
  const supportsStatus = Boolean(domainStatuses[tab]);
  const filterCount = Object.values(filters).filter(Boolean).length;
  const rows = data?.data || [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">{domainTitles[tab]}</h2>
          <p className="mt-1 text-[11px] text-slate-500">رکوردهای مرتبط مستقیم با این پروژه</p>
        </div>
        {data?.meta?.total !== undefined && <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{data.meta.total.toLocaleString('fa-IR')} مورد</span>}
      </div>
      <FilterBar>
        <div className="min-w-52 flex-1">
          <label htmlFor={`project-${tab}-search`} className="sr-only">جستجو</label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id={`project-${tab}-search`}
              value={filters.search}
              onChange={event => onFilters({ ...filters, search: event.target.value })}
              placeholder="جستجوی عنوان…"
              className="pr-9"
            />
          </div>
        </div>
        {supportsStatus && (
          <Select aria-label="فیلتر وضعیت" value={filters.status} onChange={event => onFilters({ ...filters, status: event.target.value })} className="min-w-36">
            <option value="">همه وضعیت‌ها</option>
            {domainStatuses[tab]?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        )}
        {filterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onFilters({ search: '', status: '' })}>پاک‌کردن فیلترها</Button>
        )}
      </FilterBar>

      {query.isLoading && <LoadingState label="در حال دریافت رکوردها…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} title="رکوردهای پروژه دریافت نشد." />}
      {!query.isLoading && !query.isError && (
        <DataTable label={`فهرست ${domainTitles[tab]}`}>
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
            <tr>
              <th className="text-right">عنوان</th>
              <th className="w-32 text-right">وضعیت</th>
              <th className="w-40 text-right">مسئول</th>
              <th className="w-36 text-right">تاریخ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record: any) => {
              const owner = users.find(user => user.id === (record.assigneeId || record.ownerId || record.createdBy));
              const clickable = tab !== 'activities';
              return (
                <tr key={record.id} className="last:border-b-0 hover:bg-slate-50/70">
                  <td>
                    {clickable ? (
                      <button type="button" onClick={() => onOpen(record)} className="max-w-xl text-right font-extrabold text-slate-900 hover:text-indigo-700">
                        {record.title || record.name || record.action || 'بدون عنوان'}
                      </button>
                    ) : (
                      <p className="max-w-xl font-extrabold text-slate-900">{record.title || record.name || record.action || 'بدون عنوان'}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      {record.code && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">{record.code}</span>}
                      {record.description && <span className="max-w-md truncate">{record.description}</span>}
                      {record.priority && <PriorityPill priority={record.priority} size="sm" />}
                    </div>
                    {tab === 'activities' && record.metadata?.changes?.length > 0 && (
                      <p className="mt-1 max-w-2xl truncate text-[10px] text-indigo-600">
                        {record.metadata.changes.map((change: any) => `${change.field}: ${change.from ?? '—'} ← ${change.to ?? '—'}`).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td>{record.status ? <RecordStatus value={record.status} /> : <span className="text-slate-400">—</span>}</td>
                  <td>{owner ? <span className="font-bold text-slate-700">{owner.name}</span> : <span className="text-slate-400">—</span>}</td>
                  <td>
                    <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-600">
                      <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                      {formatPersianDate(record.deadline || record.endDate || record.date || record.createdAt || record.timestamp)}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <EmptyState title={filterCount ? 'رکوردی مطابق فیلترها پیدا نشد.' : `هنوز موردی در بخش ${domainTitles[tab]} ثبت نشده است.`} />
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      )}
      <Pagination meta={data?.meta} busy={query.isFetching} onPage={onPage} />
    </section>
  );
}

function ContentPlans({
  projectId,
  plans,
  series,
  loading,
  error,
  onRetry,
  onChanged,
  onDelete,
}: {
  projectId: string;
  plans: ProjectContentPlan[];
  series: any[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onChanged: () => Promise<void>;
  onDelete: (plan: ProjectContentPlan) => void;
}) {
  const { contentTypes, notify, hasPermission } = useApp();
  const [editing, setEditing] = useState<ProjectContentPlan | null>(null);
  const [newMode, setNewMode] = useState(false);
  const canEdit = hasPermission('projects.edit');

  if (loading) return <LoadingState label="در حال دریافت برنامه محتوا…" />;
  if (error) return <ErrorState error={error} onRetry={onRetry} title="برنامه محتوای پروژه دریافت نشد." />;

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">برنامه محتوای پروژه</h2>
          <p className="mt-1 text-[11px] text-slate-500">تعداد ایجاد و انتشار مستقیماً از محتواهای واقعی پروژه محاسبه می‌شود.</p>
        </div>
        {canEdit && (
          <Button onClick={() => { setEditing(null); setNewMode(true); }}>
            <Plus className="h-4 w-4" />افزودن ردیف برنامه
          </Button>
        )}
      </div>

      {(newMode || editing) && (
        <PlanForm
          key={editing?.id || 'new'}
          projectId={projectId}
          initial={editing}
          series={series}
          onClose={() => { setEditing(null); setNewMode(false); }}
          onChanged={onChanged}
          notify={notify}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map(plan => {
          const completion = plan.plannedCount ? Math.min(100, Math.round((plan.publishedCount / plan.plannedCount) * 100)) : 0;
          return (
            <article key={plan.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold text-slate-900">{contentTypes.find(type => type.id === plan.contentType)?.name || plan.contentType}</h3>
                  <p className="mt-1 text-[10px] text-slate-500">مهلت: {formatPersianDate(plan.deadline)}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(plan); setNewMode(false); }}>ویرایش</Button>
                    <button
                      type="button"
                      aria-label={`حذف ${plan.contentType}`}
                      onClick={() => onDelete(plan)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <PlanMetric label="هدف" value={plan.plannedCount} />
                <PlanMetric label="ایجادشده" value={plan.createdCount} />
                <PlanMetric label="منتشرشده" value={plan.publishedCount} />
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[10px] font-bold text-slate-500">
                  <span>تحقق انتشار</span><span>{completion.toLocaleString('fa-IR')}٪</span>
                </div>
                <ProgressBar progress={completion} size="sm" />
              </div>
              {plan.defaultSeriesId && (
                <p className="mt-3 rounded-xl bg-indigo-50 px-3 py-2 text-[10px] font-semibold text-indigo-700">
                  مجموعه پیش‌فرض: {series.find(item => item.id === plan.defaultSeriesId)?.name || plan.defaultSeriesId}
                </p>
              )}
              {plan.notes && <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-600">{plan.notes}</p>}
            </article>
          );
        })}
        {!plans.length && !newMode && (
          <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white py-14">
            <EmptyState title="هنوز ردیفی برای برنامه محتوای این پروژه ثبت نشده است." />
          </div>
        )}
      </div>
    </section>
  );
}

function PlanForm({ projectId, initial, series, onClose, onChanged, notify }: any) {
  const { contentTypes } = useApp();
  const [form, setForm] = useState<PlanInput>({
    contentType: initial?.contentType || contentTypes[0]?.id || '',
    plannedCount: initial?.plannedCount ?? 1,
    notes: initial?.notes || '',
    defaultSeriesId: initial?.defaultSeriesId || null,
    deadline: initial?.deadline || null,
  });
  const mutation = useMutation({
    mutationFn: () => initial ? projectOperationsApi.updatePlan(projectId, initial.id, form) : projectOperationsApi.savePlan(projectId, form),
    onSuccess: async () => {
      notify({ type: 'success', title: initial ? 'ردیف برنامه به‌روزرسانی شد' : 'ردیف برنامه ایجاد شد' });
      await onChanged();
      onClose();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });

  return (
    <form onSubmit={event => { event.preventDefault(); mutation.mutate(); }} className="rounded-3xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-2xs">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">{initial ? 'ویرایش ردیف برنامه' : 'ردیف جدید برنامه محتوا'}</h3>
          <p className="mt-1 text-[10px] text-slate-500">فقط هدف برنامه ثبت می‌شود؛ آمار واقعی قابل ویرایش نیست.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>بستن</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FormField label="نوع محتوا" htmlFor="plan-content-type">
          <Select id="plan-content-type" required value={form.contentType} onChange={event => setForm({ ...form, contentType: event.target.value })}>
            {contentTypes.map((type: any) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </Select>
        </FormField>
        <FormField label="تعداد هدف" htmlFor="plan-count">
          <Input id="plan-count" type="number" required min={0} value={form.plannedCount} onChange={event => setForm({ ...form, plannedCount: Number(event.target.value) })} />
        </FormField>
        <FormField label="مجموعه پیش‌فرض" htmlFor="plan-series">
          <Select id="plan-series" value={form.defaultSeriesId || ''} onChange={event => setForm({ ...form, defaultSeriesId: event.target.value || null })}>
            <option value="">بدون مجموعه</option>
            {series.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </FormField>
        <div>
          <PersianDatePicker label="مهلت" value={form.deadline || ''} onChange={value => setForm({ ...form, deadline: value || null })} portal />
        </div>
        <div className="md:col-span-2 xl:col-span-4">
          <FormField label="یادداشت" htmlFor="plan-notes">
            <Textarea id="plan-notes" rows={2} value={form.notes || ''} onChange={event => setForm({ ...form, notes: event.target.value })} />
          </FormField>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-indigo-100 pt-4">
        <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>انصراف</Button>
        <Button type="submit" loading={mutation.isPending}>ذخیره ردیف</Button>
      </div>
    </form>
  );
}

function PlanMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-2 py-3 text-center">
      <p className="text-[9px] font-bold text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-800">{value.toLocaleString('fa-IR')}</p>
    </div>
  );
}

function RecordStatus({ value }: { value: string }) {
  return (
    <span className={`inline-flex w-fit rounded-lg border px-2 py-1 text-[10px] font-bold ${statusColors[value] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {statusLabels[value] || value}
    </span>
  );
}

function metricTone(tone: string) {
  if (tone === 'violet') return 'bg-violet-50 text-violet-600';
  if (tone === 'sky') return 'bg-sky-50 text-sky-600';
  if (tone === 'amber') return 'bg-amber-50 text-amber-600';
  return 'bg-indigo-50 text-indigo-600';
}

export default ProjectDetailView;
