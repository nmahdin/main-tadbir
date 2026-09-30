import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  CheckSquare2,
  ChevronLeft,
  CircleDot,
  Clock3,
  Eye,
  FileText,
  FolderKanban,
  LayoutGrid,
  Layers3,
  List,
  ListFilter,
  PenTool,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspacePage } from '../../queries/workspacePages';
import { parseListQuery, listStatuses } from '../../routing/listQuery';
import { usePageCorrection } from '../../routing/usePageCorrection';
import { useApp } from '../../context/AppContext';
import { Button, EmptyState, ErrorState, LoadingState, Select } from '../common/Primitives';
import { Pagination } from '../common/WorkspacePatterns';
import { EntityPreview } from './details';
import { formatPersianDate } from '../../utils/date';
import { ContentStatusBadge } from '../../utils/statusBadges';
import { PriorityPill, ProjectStatusBadge, TaskStatusBadge } from '../common/PriorityPill';
import type { ContentStatus, Priority, ProjectStatus, TaskStatus } from '../../types';

const filterNames: Record<string, string> = {
  status: 'وضعیت', search: 'جستجو', due: 'سررسید', assignee: 'مسئول', owner: 'مالک',
  project_id: 'پروژه', project_manager_id: 'مدیر پروژه', priority: 'اولویت', type: 'نوع محتوا',
  sort: 'مرتب‌سازی', direction: 'ترتیب',
};
const filterValues: Record<string, string> = {
  me: 'من', today: 'امروز', overdue: 'عقب‌افتاده', asc: 'صعودی', desc: 'نزولی',
  created_at: 'تاریخ ایجاد', updated_at: 'آخرین تغییر', deadline: 'سررسید',
  low: 'کم', medium: 'متوسط', high: 'بالا', urgent: 'فوری',
};

type MainModule = 'projects' | 'tasks' | 'contents';
type ModuleConfig = {
  title: string;
  description: string;
  createLabel: string;
  icon: LucideIcon;
  iconBox: string;
  activeTab: string;
  activePill: string;
};

const MODULE_CONFIG: Record<MainModule, ModuleConfig> = {
  projects: {
    title: 'مدیریت و سبد پروژه‌ها',
    description: 'نظارت بر پیشرفت، اولویت‌ها، مسئولان و موعد تحویل پروژه‌ها',
    createLabel: 'ایجاد پروژه جدید',
    icon: FolderKanban,
    iconBox: 'bg-indigo-600 shadow-indigo-200',
    activeTab: 'bg-indigo-600 text-white shadow-indigo-200',
    activePill: 'bg-indigo-600 border-indigo-600 text-white',
  },
  tasks: {
    title: 'وظایف و پیگیری کارها',
    description: 'مدیریت وظایف محول‌شده، موعدها و اولویت‌بندی فعالیت‌ها',
    createLabel: 'وظیفه جدید',
    icon: CheckSquare2,
    iconBox: 'bg-sky-600 shadow-sky-200',
    activeTab: 'bg-sky-600 text-white shadow-sky-200',
    activePill: 'bg-sky-600 border-sky-600 text-white',
  },
  contents: {
    title: 'مدیریت و تولید محتوا',
    description: 'چرخه ایده‌پردازی، تولید، بازبینی و آماده‌سازی انتشار محتوا',
    createLabel: 'محتوای جدید',
    icon: PenTool,
    iconBox: 'bg-violet-600 shadow-violet-200',
    activeTab: 'bg-violet-600 text-white shadow-violet-200',
    activePill: 'bg-violet-600 border-violet-600 text-white',
  },
};

const MAIN_TABS: { id: MainModule | 'archive'; label: string; path: string; icon: LucideIcon }[] = [
  { id: 'projects', label: 'پروژه‌ها', path: '/projects', icon: FolderKanban },
  { id: 'tasks', label: 'تسک‌ها', path: '/tasks', icon: CheckSquare2 },
  { id: 'contents', label: 'محتواها', path: '/contents', icon: PenTool },
  { id: 'archive', label: 'بایگانی', path: '/archive', icon: Archive },
];

type Preset = { label: string; icon: LucideIcon; values: Record<string, string> };
const PRESETS: Record<MainModule, Preset[]> = {
  projects: [
    { label: 'همه پروژه‌ها', icon: Layers3, values: {} },
    { label: 'پروژه‌های جاری', icon: CircleDot, values: { status: 'open' } },
    { label: 'برنامه‌ریزی', icon: Sparkles, values: { status: 'planning' } },
    { label: 'تکمیل‌شده', icon: CheckCircle2, values: { status: 'completed' } },
    { label: 'بایگانی‌شده', icon: Archive, values: { status: 'archived' } },
  ],
  tasks: [
    { label: 'همه وظایف', icon: List, values: {} },
    { label: 'وظایف من', icon: UserRound, values: { assignee: 'me' } },
    { label: 'امروز', icon: CalendarClock, values: { due: 'today' } },
    { label: 'تأخیردار', icon: Clock3, values: { due: 'overdue' } },
    { label: 'تکمیل‌شده', icon: CheckCircle2, values: { status: 'completed' } },
  ],
  contents: [
    { label: 'همه محتواها', icon: FileText, values: {} },
    { label: 'نیازمند اقدام', icon: CircleDot, values: { status: 'open' } },
    { label: 'در حال تولید', icon: PenTool, values: { status: 'in_progress' } },
    { label: 'در حال بررسی', icon: Eye, values: { status: 'reviewing' } },
    { label: 'منتشرشده', icon: CheckCircle2, values: { status: 'published' } },
    { label: 'بایگانی‌شده', icon: Archive, values: { status: 'archived' } },
  ],
};

const SCOPE_FILTERS: Record<MainModule, string[]> = {
  projects: ['status', 'due'],
  tasks: ['status', 'due', 'assignee'],
  contents: ['status', 'owner'],
};

function statusBadge(module: MainModule, row: any, labels: Record<string, string>) {
  if (module === 'projects') return <ProjectStatusBadge status={row.status as ProjectStatus} size="sm" />;
  if (module === 'tasks') return <TaskStatusBadge status={row.status as TaskStatus} size="sm" />;
  if (module === 'contents') return <ContentStatusBadge status={row.status as ContentStatus} />;
  return <span>{labels[row.status] || row.status}</span>;
}

export const WorkspaceList: React.FC<{ module: MainModule }> = ({ module }) => {
  const app = useApp();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const config = MODULE_CONFIG[module];
  const customStatuses = module === 'contents' ? app.contentStatuses.map(status => status.id) : [];
  const contentTypeIds = module === 'contents' ? app.contentTypes.map(type => type.id) : [];
  const filters = parseListQuery(location.search, module, customStatuses, contentTypeIds);
  const [draft, setDraft] = useState(filters.search || '');
  useEffect(() => setDraft(filters.search || ''), [filters.search]);
  const view = search.get('view') === 'cards' ? 'cards' : 'list';
  const perPage = Number(filters.per_page || 20);
  const query = useWorkspacePage(module, { ...filters, per_page: perPage });
  usePageCorrection(query);
  const rows = query.data?.data ?? [];
  const labels = {
    ...listStatuses[module],
    ...(module === 'contents' ? Object.fromEntries(app.contentStatuses.map(status => [status.id, status.label])) : {}),
    ...(module === 'contents' ? Object.fromEntries(app.contentTypes.map(type => [type.id, type.name])) : {}),
  };

  const paramsFromFilters = () => {
    const next = new URLSearchParams(filters);
    if (view === 'cards') next.set('view', 'cards');
    return next;
  };
  const update = (key: string, value: string) => {
    const next = paramsFromFilters();
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'view' && value === 'list') next.delete('view');
    setSearch(next);
  };
  const applyPreset = (preset: Preset) => {
    const next = paramsFromFilters();
    SCOPE_FILTERS[module].forEach(key => next.delete(key));
    Object.entries(preset.values).forEach(([key, value]) => next.set(key, value));
    next.delete('page');
    setSearch(next);
  };
  const presetActive = (preset: Preset) => {
    const scope = SCOPE_FILTERS[module];
    return scope.every(key => (filters[key] || '') === (preset.values[key] || ''));
  };

  const create = module === 'projects'
    ? () => app.setIsCreateProjectOpen(true)
    : module === 'tasks'
      ? () => app.setIsCreateTaskOpen(true)
      : () => app.setIsCreateContentOpen(true);
  const canCreate = app.hasPermission(`${module === 'contents' ? 'content' : module}.create`);
  const detail = (id: string) => {
    const back = new URLSearchParams(search);
    back.delete('preview');
    const context = new URLSearchParams({
      returnTo: `/${module}${back.size ? `?${back}` : ''}`,
    });
    return `/${module}/${id}?${context}`;
  };
  const titleOf = (row: any) => row.name || row.title || 'بدون عنوان';
  const subtitleOf = (row: any) => {
    if (module === 'projects') return row.key || row.category || 'پروژه سازمانی';
    if (module === 'tasks') return app.projects.find(project => project.id === row.projectId)?.name || 'بدون پروژه';
    return app.contentTypes.find(type => type.id === row.type)?.name || row.type || 'محتوا';
  };
  const personOf = (row: any) => {
    const id = module === 'projects' ? row.projectManagerId : module === 'tasks' ? row.assigneeId : row.ownerId;
    return app.users.find(user => user.id === id)?.name || (id ? `کاربر #${id}` : 'تعیین نشده');
  };
  const cardColor = (row: any) => {
    if (module === 'projects' && /^#[0-9a-f]{6}$/i.test(row.color || '')) return row.color;
    if (module === 'contents') return app.contentStatuses.find(status => status.id === row.status)?.color || '#7c3aed';
    return app.taskStatuses.find(status => status.id === row.status)?.color || '#0284c7';
  };
  const total = query.data?.meta?.total ?? rows.length;
  const Icon = config.icon;
  const activeFilterEntries = Object.entries(filters).filter(([key]) => !['page', 'per_page'].includes(key));

  return (
    <section className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5 text-right min-w-0 animate-in fade-in duration-300" dir="rtl">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0 ${config.iconBox}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{config.title}</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {module === 'projects' && canCreate && (
            <button type="button" onClick={() => app.setIsTemplatesModalOpen(true)} className="px-3.5 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs border border-purple-200 flex items-center gap-2 transition-colors">
              <Layers3 className="w-4 h-4" />الگوهای پروژه
            </button>
          )}
          {module === 'contents' && (
            <>
              <Button variant="secondary" onClick={() => app.setActiveView('content-publishing')} className="text-xs sm:text-sm">
                <CalendarClock className="w-4 h-4 text-violet-600" />میز انتشار
              </Button>
              <Button variant="success" onClick={() => app.setActiveView('content-published')} className="text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4" />محتواهای منتشرشده
              </Button>
            </>
          )}
          {canCreate && (
            <button type="button" onClick={create} className={`px-4 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 transition-all ${module === 'contents' ? 'bg-violet-600 hover:bg-violet-700 shadow-violet-200' : module === 'tasks' ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
              <Plus className="w-4 h-4" />{config.createLabel}
            </button>
          )}
        </div>
      </header>

      <nav className="flex items-center gap-2 flex-wrap p-1.5 bg-white rounded-2xl border border-slate-200 shadow-2xs w-fit max-w-full" aria-label="ماژول‌های کاری">
        {MAIN_TABS.map(tab => {
          const TabIcon = tab.icon;
          const active = tab.id === module;
          return (
            <Link key={tab.id} to={tab.path} aria-current={active ? 'page' : undefined} className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${active ? `${config.activeTab} shadow-md` : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <TabIcon className="w-4 h-4" />
              <span>{tab.label}</span>
              {active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">{total.toLocaleString('fa-IR')}</span>}
            </Link>
          );
        })}
      </nav>

      {module === 'contents' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="میانبرهای فیلتر محتوا">
          {PRESETS.contents.map(preset => {
            const PresetIcon = preset.icon;
            const active = presetActive(preset);
            return (
              <button key={preset.label} type="button" onClick={() => applyPreset(preset)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border flex items-center gap-1.5 transition-all ${active ? `${config.activePill} shadow-sm` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <PresetIcon className="w-3.5 h-3.5" />{preset.label}
              </button>
            );
          })}
        </div>
      )}

      {module === 'contents' && app.contentTypes.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="نوع محتوا">
          <button type="button" onClick={() => update('type', '')} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border ${!filters.type ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>همه انواع</button>
          {app.contentTypes.map(type => (
            <button key={type.id} type="button" onClick={() => update('type', type.id)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border flex items-center gap-1.5 ${filters.type === type.id ? 'bg-violet-600 border-violet-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'}`}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: type.color || '#7c3aed' }} />{type.name}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-col xl:flex-row xl:items-end gap-3" role="search" aria-label="فیلترهای صفحه">
          <form className="relative flex-1 min-w-0" onSubmit={event => { event.preventDefault(); update('search', draft); }}>
            <label htmlFor={`${module}-search`} className="text-[11px] font-bold text-slate-600 block mb-1.5">جستجو</label>
            <Search className="w-4 h-4 text-slate-400 absolute right-3 bottom-3" />
            <input id={`${module}-search`} value={draft} maxLength={120} onChange={event => setDraft(event.target.value)} aria-label="جستجوی صفحه" placeholder="جستجو در عنوان و توضیحات..." className="w-full pr-9 pl-20 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:border-indigo-500" />
            <button type="submit" className="absolute left-1.5 bottom-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-900">جستجو</button>
          </form>

          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-[11px] font-bold text-slate-600">وضعیت
              <Select aria-label="فیلتر وضعیت" value={filters.status || ''} onChange={event => update('status', event.target.value)} className="mt-1.5 min-w-36 text-xs">
                <option value="">همه وضعیت‌ها</option>
                {Object.entries(labels).filter(([key]) => !(module === 'contents' && contentTypeIds.includes(key))).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </label>
            {(module === 'tasks' || module === 'projects') && (
              <label className="text-[11px] font-bold text-slate-600">اولویت
                <Select aria-label="فیلتر اولویت" value={filters.priority || ''} onChange={event => update('priority', event.target.value)} className="mt-1.5 min-w-28 text-xs">
                  <option value="">همه</option><option value="urgent">فوری</option><option value="high">بالا</option><option value="medium">متوسط</option><option value="low">کم</option>
                </Select>
              </label>
            )}
            {(module === 'tasks' || module === 'projects') && (
              <label className="text-[11px] font-bold text-slate-600">سررسید
                <Select aria-label="فیلتر سررسید" value={filters.due || ''} onChange={event => update('due', event.target.value)} className="mt-1.5 min-w-28 text-xs">
                  <option value="">همه موعدها</option><option value="today">امروز</option><option value="overdue">عقب‌افتاده</option>
                </Select>
              </label>
            )}
            {module === 'tasks' && (
              <label className="text-[11px] font-bold text-slate-600">مسئول
                <Select aria-label="مسئول" value={filters.assignee || ''} onChange={event => update('assignee', event.target.value)} className="mt-1.5 min-w-28 text-xs">
                  <option value="">همهٔ مجاز</option><option value="me">من</option>
                </Select>
              </label>
            )}
            {module === 'contents' && (
              <label className="text-[11px] font-bold text-slate-600">مالک
                <Select aria-label="مالک" value={filters.owner || ''} onChange={event => update('owner', event.target.value)} className="mt-1.5 min-w-28 text-xs">
                  <option value="">همهٔ مجاز</option><option value="me">من</option>
                </Select>
              </label>
            )}
            <label className="text-[11px] font-bold text-slate-600">مرتب‌سازی
              <Select aria-label="مرتب‌سازی" value={filters.sort || 'created_at'} onChange={event => update('sort', event.target.value)} className="mt-1.5 min-w-28 text-xs">
                <option value="created_at">تاریخ ایجاد</option><option value="updated_at">آخرین تغییر</option><option value="deadline">سررسید</option>
              </Select>
            </label>
            <label className="text-[11px] font-bold text-slate-600">ترتیب
              <Select aria-label="ترتیب" value={filters.direction || 'desc'} onChange={event => update('direction', event.target.value)} className="mt-1.5 min-w-24 text-xs">
                <option value="desc">نزولی</option><option value="asc">صعودی</option>
              </Select>
            </label>
            <label className="text-[11px] font-bold text-slate-600">نما
              <Select aria-label="نما" value={view} onChange={event => update('view', event.target.value)} className="mt-1.5 min-w-24 text-xs">
                <option value="list">جدول</option><option value="cards">کارت</option>
              </Select>
            </label>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 mb-0.5" aria-hidden="true">
              <button type="button" tabIndex={-1} onClick={() => update('view', 'list')} className={`p-1.5 rounded-lg ${view === 'list' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'}`}><List className="w-4 h-4" /></button>
              <button type="button" tabIndex={-1} onClick={() => update('view', 'cards')} className={`p-1.5 rounded-lg ${view === 'cards' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500'}`}><LayoutGrid className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {activeFilterEntries.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap text-xs" aria-label="فیلترهای فعال">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            {activeFilterEntries.map(([key, value]) => (
              <button key={key} type="button" onClick={() => update(key, '')} aria-label={`حذف فیلتر ${filterNames[key] || key}`} className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold flex items-center gap-1">
                {filterNames[key] || key}: {labels[value] || filterValues[value] || value}<X className="w-3 h-3" />
              </button>
            ))}
            <button type="button" onClick={() => setSearch(view === 'cards' ? { view } : {})} className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-bold">پاک‌کردن فیلترها</button>
          </div>
        )}

        {query.isPending ? <LoadingState label="در حال دریافت فهرست از سرور…" /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
          <div aria-busy={query.isFetching} className="relative">
            {query.isFetching && <div role="status" className="absolute top-2 left-3 z-10 px-2.5 py-1 rounded-lg bg-white/95 border border-slate-200 text-[11px] text-slate-500 shadow-xs">در حال تازه‌سازی…</div>}
            {!rows.length ? (
              <EmptyState title="موردی مطابق فیلترها یافت نشد.">
                <ListFilter className="w-10 h-10 text-slate-300 mx-auto mt-3" />
              </EmptyState>
            ) : view === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-right text-sm">
                  <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500">
                    <th className="p-4">عنوان</th><th className="p-4">وضعیت</th><th className="p-4">{module === 'contents' ? 'نوع' : 'اولویت'}</th><th className="p-4">{module === 'projects' ? 'مدیر پروژه' : module === 'tasks' ? 'مسئول' : 'مالک محتوا'}</th><th className="p-4">سررسید</th><th className="p-4 text-left">عملیات</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 max-w-sm"><Link className="font-extrabold text-slate-900 hover:text-indigo-700 break-words" to={detail(row.id)}>{titleOf(row)}</Link><p className="text-xs text-slate-500 mt-1 truncate">{subtitleOf(row)}</p></td>
                        <td className="p-4">{statusBadge(module, row, labels)}</td>
                        <td className="p-4">{module === 'contents' ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: app.contentTypes.find(type => type.id === row.type)?.color || '#7c3aed' }} />{subtitleOf(row)}</span> : row.priority ? <PriorityPill priority={row.priority as Priority} size="sm" /> : '—'}</td>
                        <td className="p-4 text-xs font-medium text-slate-700">{personOf(row)}</td>
                        <td className="p-4 text-xs text-slate-500 whitespace-nowrap">{row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</td>
                        <td className="p-4"><div className="flex items-center justify-end gap-1.5"><button type="button" onClick={() => { const next = paramsFromFilters(); next.set('preview', row.id); setSearch(next); }} className="px-2.5 py-2 rounded-xl text-indigo-700 hover:bg-indigo-50 text-xs font-bold flex items-center gap-1"><Eye className="w-4 h-4" />پیش‌نمایش</button><Link to={detail(row.id)} aria-label={`باز کردن ${titleOf(row)}`} className="p-2 rounded-xl text-slate-400 hover:text-indigo-700 hover:bg-indigo-50"><ChevronLeft className="w-4 h-4" /></Link></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-5">
                {rows.map((row: any) => (
                  <article key={row.id} className="bg-white rounded-3xl border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all p-5 flex flex-col justify-between relative overflow-hidden min-w-0">
                    <div className="absolute top-0 inset-x-0 h-1.5" style={{ backgroundColor: cardColor(row) }} />
                    <div className="space-y-4 pt-1">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link className="font-black text-slate-900 hover:text-indigo-700 break-words" to={detail(row.id)}>{titleOf(row)}</Link><p className="text-xs text-slate-500 mt-1 truncate">{subtitleOf(row)}</p></div>{statusBadge(module, row, labels)}</div>
                      {row.description && <p className="text-xs leading-6 text-slate-500 line-clamp-2">{row.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">{module !== 'contents' && row.priority && <PriorityPill priority={row.priority as Priority} size="sm" />}<span className="text-[11px] text-slate-500 flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{personOf(row)}</span></div>
                    </div>
                    <footer className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</span><button type="button" onClick={() => { const next = paramsFromFilters(); next.set('preview', row.id); setSearch(next); }} className="text-xs font-bold text-indigo-700 flex items-center gap-1"><Eye className="w-4 h-4" />پیش‌نمایش</button></footer>
                  </article>
                ))}
              </div>
            )}
            <div className="px-4 border-t border-slate-100"><Pagination
              meta={query.data?.meta}
              busy={query.isFetching}
              onPage={page => update('page', String(page))}
              onPerPage={value => update('per_page', value === 20 ? '' : String(value))}
            /></div>
          </div>
        )}
      </div>

      <EntityPreview module={module} id={search.get('preview')} fullLink={detail} onClose={() => { const next = paramsFromFilters(); next.delete('preview'); setSearch(next, { replace: true }); }} />
    </section>
  );
};
