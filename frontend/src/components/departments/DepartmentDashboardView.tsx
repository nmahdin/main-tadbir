import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2,
  CalendarClock,
  CheckSquare2,
  ChevronLeft,
  FileText,
  FolderKanban,
  Layers3,
  UsersRound,
} from 'lucide-react';
import { departmentsApi } from '../../api/departments';
import { useApp } from '../../context/AppContext';
import type { Content, Project, Task } from '../../types';
import { formatPersianDate } from '../../utils/date';
import { ContentStatusBadge } from '../../utils/statusBadges';
import { PriorityPill, ProjectStatusBadge, TaskStatusBadge } from '../common/PriorityPill';
import { EmptyState, ErrorState, LoadingState, Select } from '../common/Primitives';

type Tab = 'projects' | 'contents' | 'tasks';

export const DepartmentDashboardView: React.FC = () => {
  const { currentUser, departments, hasPermission, users, setSelectedTaskId } = useApp();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const manageable = useMemo(() => {
    if (currentUser.role === 'admin' || hasPermission('departments.view')) return departments;
    return departments.filter(department => department.managedByMe || department.managerId === currentUser.id);
  }, [currentUser.id, currentUser.role, departments, hasPermission]);
  const requested = search.get('department');
  const departmentId = manageable.some(department => department.id === requested) ? requested! : manageable[0]?.id || '';
  const [tab, setTab] = useState<Tab>('projects');
  const query = useQuery({
    queryKey: ['department-dashboard', currentUser.id, departmentId],
    queryFn: () => departmentsApi.dashboard(departmentId),
    enabled: Boolean(departmentId),
  });
  const data = query.data?.data;
  const person = (id?: string | null) => users.find(user => user.id === id)?.name || data?.members.find(member => member.id === id)?.name || 'تعیین نشده';

  if (!manageable.length) {
    return <section className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8" dir="rtl"><div className="rounded-3xl border border-slate-200 bg-white"><ErrorState title="داشبورد دپارتمان در دسترس نیست" error="شما به‌عنوان مدیر هیچ دپارتمانی ثبت نشده‌اید." /></div></section>;
  }

  const setDepartment = (id: string) => {
    const next = new URLSearchParams(search);
    next.set('department', id);
    setSearch(next);
  };

  return <section className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8 space-y-5" dir="rtl">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Building2 className="h-6 w-6" /></span><div><h1 className="text-xl sm:text-2xl font-black text-slate-900">داشبورد دپارتمان</h1><p className="mt-1 text-xs sm:text-sm text-slate-500">نمای یکپارچه پروژه‌ها، محتواها و تسک‌های مرتبط با دپارتمان</p></div></div>
        {manageable.length > 1 && <label className="text-[11px] font-bold text-slate-600">انتخاب دپارتمان<Select value={departmentId} onChange={event => setDepartment(event.target.value)} className="mt-1.5 min-w-52 text-xs">{manageable.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></label>}
      </div>
    </header>

    {query.isPending ? <div className="rounded-3xl border border-slate-200 bg-white"><LoadingState label="در حال دریافت داشبورد دپارتمان…" /></div>
      : query.isError ? <div className="rounded-3xl border border-slate-200 bg-white"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
      : data && <>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-black text-indigo-950">{data.department.name}</h2><p className="mt-1 text-xs leading-6 text-indigo-800">{data.department.description || 'برای این دپارتمان توضیحی ثبت نشده است.'}</p></div><span className="inline-flex items-center gap-1.5 self-start rounded-xl bg-white px-3 py-2 text-xs font-bold text-indigo-700"><UsersRound className="h-4 w-4" />{data.members.length.toLocaleString('fa-IR')} عضو</span></div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { tab: 'projects' as const, label: 'پروژه مرتبط', value: data.projects.length, icon: FolderKanban, color: 'bg-indigo-50 text-indigo-600' },
            { tab: 'contents' as const, label: 'محتوای دپارتمان', value: data.contents.length, icon: FileText, color: 'bg-violet-50 text-violet-600' },
            { tab: 'tasks' as const, label: 'تسک مرتبط', value: data.tasks.length, icon: CheckSquare2, color: 'bg-sky-50 text-sky-600' },
          ].map(item => <button key={item.tab} type="button" onClick={() => setTab(item.tab)} className={`rounded-2xl border bg-white p-4 text-right flex items-center gap-3 shadow-2xs ${tab === item.tab ? 'border-indigo-300 ring-1 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'}`}><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color}`}><item.icon className="h-5 w-5" /></span><div><strong className="block text-lg font-black text-slate-900">{item.value.toLocaleString('fa-IR')}</strong><span className="text-[11px] text-slate-500">{item.label}</span></div></button>)}
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 p-2" role="tablist">
            {([['projects', 'پروژه‌ها', Layers3], ['contents', 'محتواها', FileText], ['tasks', 'تسک‌ها', CheckSquare2]] as const).map(([value, label, Icon]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black ${tab === value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-white'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </div>
          {tab === 'projects' ? <ProjectRows projects={data.projects} person={person} onOpen={id => navigate(`/projects/${id}`)} /> : tab === 'contents' ? <ContentRows contents={data.contents} person={person} onOpen={id => navigate(`/contents/${id}`)} /> : <TaskRows tasks={data.tasks} person={person} onOpen={setSelectedTaskId} />}
        </div>
      </>}
  </section>;
};

function ProjectRows({ projects, person, onOpen }: { projects: Project[]; person: (id?: string | null) => string; onOpen: (id: string) => void }) {
  if (!projects.length) return <EmptyState title="پروژه مرتبطی برای این دپارتمان پیدا نشد." />;
  return <div className="divide-y divide-slate-100">{projects.map(project => <button key={project.id} type="button" onClick={() => onOpen(project.id)} className="flex w-full flex-col gap-3 p-4 text-right hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{project.name}</strong><span className="mt-1 block text-[11px] text-slate-500">مدیر: {person(project.projectManagerId)}</span></div><div className="flex items-center gap-3"><ProjectStatusBadge status={project.status} size="sm" />{project.priority && <PriorityPill priority={project.priority} size="sm" />}<ChevronLeft className="h-4 w-4 text-slate-400" /></div></button>)}</div>;
}

function ContentRows({ contents, person, onOpen }: { contents: Content[]; person: (id?: string | null) => string; onOpen: (id: string) => void }) {
  if (!contents.length) return <EmptyState title="محتوای مرتبطی برای این دپارتمان پیدا نشد." />;
  return <div className="divide-y divide-slate-100">{contents.map(content => <button key={content.id} type="button" onClick={() => onOpen(content.id)} className="flex w-full flex-col gap-3 p-4 text-right hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{content.title}</strong><span className="mt-1 block text-[11px] text-slate-500">مالک: {person(content.ownerId)}</span></div><div className="flex items-center gap-3"><ContentStatusBadge status={content.status} />{content.deadline && <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><CalendarClock className="h-3.5 w-3.5" />{formatPersianDate(content.deadline)}</span>}<ChevronLeft className="h-4 w-4 text-slate-400" /></div></button>)}</div>;
}

function TaskRows({ tasks, person, onOpen }: { tasks: Task[]; person: (id?: string | null) => string; onOpen: (id: string) => void }) {
  if (!tasks.length) return <EmptyState title="تسک مرتبطی برای این دپارتمان پیدا نشد." />;
  return <div className="divide-y divide-slate-100">{tasks.map(task => <button key={task.id} type="button" onClick={() => onOpen(task.id)} className="flex w-full flex-col gap-3 p-4 text-right hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{task.title}</strong><span className="mt-1 block text-[11px] text-slate-500">مسئول: {person(task.assigneeId)}</span></div><div className="flex items-center gap-3"><TaskStatusBadge status={task.status} size="sm" />{task.priority && <PriorityPill priority={task.priority} size="sm" />}<ChevronLeft className="h-4 w-4 text-slate-400" /></div></button>)}</div>;
}
