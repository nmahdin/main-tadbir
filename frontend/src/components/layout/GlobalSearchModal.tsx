import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckSquare,
  FileText,
  FolderKanban,
  Layers3,
  LoaderCircle,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { request } from '../../api/client';
import { useApp } from '../../context/AppContext';
import type { Priority, ProjectStatus, TaskStatus } from '../../types';
import { PriorityPill, ProjectStatusBadge, TaskStatusBadge } from '../common/PriorityPill';

type SearchProject = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  color?: string;
};
type SearchTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  deadline: string;
  projectId: string;
  project?: { id: string; name: string; color?: string } | null;
};
type SearchContent = { id: string; title: string; type: string; status: string; topic?: string };
type SearchSeries = { id: string; name: string; codePrefix?: string; contentType: string; status: string; recurrenceType: string };
type GlobalSearchResponse = {
  data: { projects: SearchProject[]; tasks: SearchTask[]; contents: SearchContent[]; series: SearchSeries[] };
  meta: { query: string; limit: number };
};

export const GlobalSearchModal: React.FC = () => {
  const {
    isSearchOpen,
    setIsSearchOpen,
    setSelectedTaskId,
    setSelectedProjectId,
    setSelectedContentId,
    setActiveView,
    currentUser,
  } = useApp();
  const [, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSearchOpen) {
      setQuery('');
      setDebouncedQuery('');
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isSearchOpen]);

  useEffect(() => {
    const normalized = query.trim();
    const timer = window.setTimeout(() => setDebouncedQuery(normalized), 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const search = useQuery<GlobalSearchResponse>({
    queryKey: ['global-search', currentUser.id, debouncedQuery],
    queryFn: ({ signal }) => request(`/search?${new URLSearchParams({ query: debouncedQuery, limit: '5' })}`, { signal }),
    enabled: isSearchOpen && debouncedQuery.length >= 2,
    staleTime: 20_000,
  });

  if (!isSearchOpen) return null;

  const projects = search.data?.data.projects ?? [];
  const tasks = search.data?.data.tasks ?? [];
  const contents = search.data?.data.contents ?? [];
  const series = search.data?.data.series ?? [];
  const resultCount = projects.length + tasks.length + contents.length + series.length;
  const waitingForQuery = query.trim().length < 2;

  const selectProject = (id: string) => {
    setSelectedProjectId(id);
    setActiveView('project-detail');
    setIsSearchOpen(false);
  };
  const selectTask = (id: string) => {
    // A task opens over the current page instead of discarding the user's context.
    setSelectedTaskId(id);
    setIsSearchOpen(false);
  };
  const selectContent = (id: string) => {
    setSelectedContentId(id);
    setActiveView('content-detail');
    setIsSearchOpen(false);
  };
  const selectSeries = (id: string) => {
    setSearchParams({ series: id });
    setActiveView('content-series');
    setIsSearchOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 px-4 pt-16 backdrop-blur-xs sm:pt-24" onMouseDown={event => {
      if (event.currentTarget === event.target) setIsSearchOpen(false);
    }}>
      <section role="dialog" aria-modal="true" aria-label="جست‌وجوی سراسری" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white text-right shadow-2xl" dir="rtl">
        <div className="flex items-center gap-3 border-b border-slate-200 p-4">
          {search.isFetching ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-indigo-600" /> : <Search className="h-5 w-5 shrink-0 text-slate-600" />}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="جستجو در پروژه‌ها، وظایف، محتواها و مجموعه‌ها…"
            className="w-full appearance-none border-0 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none ring-0 placeholder:text-slate-500 focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0"
          />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="پاک‌کردن جست‌وجو" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><X className="h-4 w-4" /></button>}
          <button type="button" onClick={() => setIsSearchOpen(false)} aria-label="بستن جست‌وجو" className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">ESC</button>
        </div>

        <div className="max-h-[65vh] min-h-48 space-y-5 overflow-y-auto p-4" aria-live="polite">
          {waitingForQuery && <div className="py-12 text-center"><Search className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="text-sm font-bold text-slate-700">حداقل دو حرف وارد کنید</p><p className="mt-1 text-xs text-slate-500">نتایج کامل و مجاز مستقیماً از سرور دریافت می‌شوند.</p></div>}
          {!waitingForQuery && (search.isPending || query.trim() !== debouncedQuery) && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin" />در حال جست‌وجو…</div>}
          {!waitingForQuery && search.isError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><div className="flex items-center gap-2 font-bold"><AlertCircle className="h-5 w-5" />جست‌وجو انجام نشد</div><button type="button" onClick={() => void search.refetch()} className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold">تلاش دوباره</button></div>}

          {!waitingForQuery && !search.isPending && !search.isError && <>
            {projects.length > 0 && <ResultSection icon={<FolderKanban className="h-4 w-4 text-indigo-600" />} title={`پروژه‌ها (${projects.length.toLocaleString('fa-IR')})`}>
              {projects.map(project => <button key={project.id} type="button" onClick={() => selectProject(project.id)} className="group flex w-full items-center justify-between rounded-xl border border-transparent p-2.5 text-right hover:border-indigo-200 hover:bg-indigo-50/60">
                <div className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: project.color || '#6366f1' }} /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{project.name}</p><p className="truncate text-[11px] text-slate-500">{project.description}</p></div></div>
                <div className="flex shrink-0 items-center gap-2"><ProjectStatusBadge status={project.status} size="sm" /><ArrowLeft className="h-4 w-4 text-slate-400 group-hover:text-indigo-600" /></div>
              </button>)}
            </ResultSection>}

            {tasks.length > 0 && <ResultSection icon={<CheckSquare className="h-4 w-4 text-sky-600" />} title={`وظایف (${tasks.length.toLocaleString('fa-IR')})`}>
              {tasks.map(task => <button key={task.id} type="button" onClick={() => selectTask(task.id)} className="group flex w-full items-center justify-between rounded-xl border border-transparent p-2.5 text-right hover:border-sky-200 hover:bg-sky-50/60">
                <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{task.title}</p><p className="mt-0.5 text-[11px] text-slate-500">{task.project?.name || 'بدون پروژه'}{task.deadline ? ` • مهلت: ${task.deadline}` : ''}</p></div>
                <div className="flex shrink-0 items-center gap-2"><PriorityPill priority={task.priority} size="sm" /><TaskStatusBadge status={task.status} size="sm" /><ArrowLeft className="h-4 w-4 text-slate-400 group-hover:text-sky-600" /></div>
              </button>)}
            </ResultSection>}

            {series.length > 0 && <ResultSection icon={<Layers3 className="h-4 w-4 text-fuchsia-600" />} title={`مجموعه‌های محتوا (${series.length.toLocaleString('fa-IR')})`}>
              {series.map(item => <button key={item.id} type="button" onClick={() => selectSeries(item.id)} className="group flex w-full items-center justify-between rounded-xl border border-transparent p-2.5 text-right hover:border-fuchsia-200 hover:bg-fuchsia-50/60"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{item.name}</p><p className="truncate text-[11px] text-slate-500">{item.codePrefix || 'بدون شناسه'} · {item.contentType}</p></div><ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-fuchsia-600" /></button>)}
            </ResultSection>}

            {contents.length > 0 && <ResultSection icon={<FileText className="h-4 w-4 text-violet-600" />} title={`محتواها (${contents.length.toLocaleString('fa-IR')})`}>
              {contents.map(content => <button key={content.id} type="button" onClick={() => selectContent(content.id)} className="group flex w-full items-center justify-between rounded-xl border border-transparent p-2.5 text-right hover:border-violet-200 hover:bg-violet-50/60"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{content.title}</p><p className="truncate text-[11px] text-slate-500">{content.topic || content.type}</p></div><ArrowLeft className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-violet-600" /></button>)}
            </ResultSection>}

            {resultCount === 0 && <div className="py-12 text-center"><Sparkles className="mx-auto mb-2 h-8 w-8 text-slate-300" /><p className="text-sm font-semibold text-slate-700">نتیجه‌ای یافت نشد</p><p className="mt-1 text-xs text-slate-500">عبارت دقیق‌تر یا کوتاه‌تری را امتحان کنید.</p></div>}
          </>}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-500"><span>جست‌وجوی سروری و محدود به دسترسی‌های شما</span><span>میانبر: Ctrl / ⌘ + K</span></footer>
      </section>
    </div>
  );
};

const ResultSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => <section><h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold text-slate-600">{icon}{title}</h2><div className="space-y-1">{children}</div></section>;
