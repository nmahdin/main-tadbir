import React, { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowDown,
  ArrowUp,
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
  Pencil,
  Plus,
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
import type { ContentStatus, Priority, ProjectStatus, Task, TaskStatus } from '../../types';
import { addMonths, format, getDay, getDaysInMonth, isSameDay, startOfMonth, subMonths } from 'date-fns-jalali';
import { EditTaskModal } from '../tasks/EditTaskModal';

const filterNames: Record<string, string> = {
  status: 'وضعیت', search: 'جستجو', due: 'سررسید', assignee: 'مسئول', owner: 'مالک',
  project_id: 'پروژه', content_id: 'محتوا', project_manager_id: 'مدیر پروژه', priority: 'اولویت', type: 'نوع محتوا',
  target_audience: 'مخاطب هدف', sort: 'مرتب‌سازی', direction: 'ترتیب',
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
  activePill: string;
};

const MODULE_CONFIG: Record<MainModule, ModuleConfig> = {
  projects: {
    title: 'مدیریت و سبد پروژه‌ها',
    description: 'نظارت بر پیشرفت، اولویت‌ها، مسئولان و موعد تحویل پروژه‌ها',
    createLabel: 'ایجاد پروژه جدید',
    icon: FolderKanban,
    iconBox: 'bg-indigo-600 shadow-indigo-200',
    activePill: 'bg-indigo-600 border-indigo-600 text-white',
  },
  tasks: {
    title: 'وظایف و پیگیری کارها',
    description: 'مدیریت وظایف محول‌شده، موعدها و اولویت‌بندی فعالیت‌ها',
    createLabel: 'وظیفه جدید',
    icon: CheckSquare2,
    iconBox: 'bg-sky-600 shadow-sky-200',
    activePill: 'bg-sky-600 border-sky-600 text-white',
  },
  contents: {
    title: 'مدیریت و تولید محتوا',
    description: 'چرخه ایده‌پردازی، تولید، بازبینی و آماده‌سازی انتشار محتوا',
    createLabel: 'محتوای جدید',
    icon: PenTool,
    iconBox: 'bg-violet-600 shadow-violet-200',
    activePill: 'bg-violet-600 border-violet-600 text-white',
  },
};

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
    { label: 'همه وظایف من', icon: List, values: {} },
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
  tasks: ['status', 'due'],
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
  const filters = parseListQuery(location.search, module, customStatuses, contentTypeIds, module === 'contents' ? app.targetAudiences : []);
  const requestedView = search.get('view');
  const view = module === 'tasks'
    ? (requestedView === 'kanban' || requestedView === 'calendar' ? requestedView : 'list')
    : requestedView === 'cards' ? 'cards' : 'list';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<string | null>(null);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const perPage = module === 'tasks' && view !== 'list' ? 100 : Number(filters.per_page || 20);
  // Personal task scope is evaluated on the server; other users' tasks never reach this page.
  const query = useWorkspacePage(module, { ...filters, ...(module === 'tasks' ? { assignee: 'me' } : {}), per_page: perPage });
  usePageCorrection(query);
  const rows = query.data?.data ?? [];
  const labels = {
    ...listStatuses[module],
    ...(module === 'contents' ? Object.fromEntries(app.contentStatuses.map(status => [status.id, status.label])) : {}),
    ...(module === 'contents' ? Object.fromEntries(app.contentTypes.map(type => [type.id, type.name])) : {}),
  };

  const paramsFromFilters = () => {
    const next = new URLSearchParams(filters);
    if (view !== 'list') next.set('view', view);
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
    if (module === 'projects') return row.category || 'پروژه سازمانی';
    if (module === 'tasks') return app.projects.find(project => project.id === row.projectId)?.name || 'بدون پروژه';
    return app.contentTypes.find(type => type.id === row.type)?.name || row.type || 'محتوا';
  };
  const personOf = (row: any) => {
    const id = module === 'projects' ? row.projectManagerId : module === 'tasks' ? row.assigneeId : row.ownerId;
    return app.users.find(user => user.id === id)?.name || (id ? `کاربر #${id}` : 'تعیین نشده');
  };
  const recordTitle = (row: any, className: string) => module === 'tasks'
    ? <button type="button" className={`${className} text-right`} onClick={() => app.setSelectedTaskId(row.id)}>{titleOf(row)}</button>
    : <Link className={className} to={detail(row.id)}>{titleOf(row)}</Link>;
  const handleTaskDrop = (status: string) => {
    if (!draggedTaskId) return;
    const task = rows.find((row: any) => row.id === draggedTaskId);
    if (task && task.status !== status) void app.moveTaskStatus(task.id, status as TaskStatus);
    setDraggedTaskId(null);
    setDropTargetStatus(null);
  };
  const cardColor = (row: any) => {
    if (module === 'projects' && /^#[0-9a-f]{6}$/i.test(row.color || '')) return row.color;
    if (module === 'contents') return app.contentStatuses.find(status => status.id === row.status)?.color || '#7c3aed';
    return app.taskStatuses.find(status => status.id === row.status)?.color || '#0284c7';
  };
  const total = query.data?.meta?.total ?? rows.length;
  const orderedTaskStatuses = [...app.taskStatuses].sort((left, right) => left.order - right.order).filter(status => status.id !== 'archived');
  const Icon = config.icon;
  const activeFilterEntries = Object.entries(filters).filter(([key]) => !['page', 'per_page'].includes(key));
  const taskAdvancedFilterCount = ['priority', 'project_id', 'content_id', 'sort', 'direction'].filter(key => filters[key]).length;
  const contentAdvancedFilterCount = ['type', 'owner', 'target_audience', 'sort', 'direction'].filter(key => filters[key]).length;

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

      {module === 'tasks' && (
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="دسته‌بندی وظایف">
          {PRESETS.tasks.map(preset => {
            const PresetIcon = preset.icon;
            const active = presetActive(preset);
            return <button key={preset.label} type="button" role="tab" aria-selected={active} onClick={() => applyPreset(preset)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 ${active ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><PresetIcon className="w-3.5 h-3.5" />{preset.label}</button>;
          })}
        </div>
      )}

      {module === 'contents' && (
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="وضعیت محتوا">
          {PRESETS.contents.map(preset => {
            const PresetIcon = preset.icon;
            const active = presetActive(preset);
            return <button key={preset.label} type="button" role="tab" aria-selected={active} onClick={() => applyPreset(preset)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold ${active ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><PresetIcon className="h-3.5 w-3.5" />{preset.label}</button>;
          })}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50/60 space-y-3" aria-label="کنترل‌های فهرست">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {module === 'tasks' || module === 'contents' ? (
              <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)} className={`ui-button ui-button-secondary text-xs ${filtersOpen || (module === 'tasks' ? taskAdvancedFilterCount : contentAdvancedFilterCount) ? module === 'tasks' ? '!border-sky-300 !text-sky-700' : '!border-violet-300 !text-violet-700' : ''}`}>
                <SlidersHorizontal className="w-4 h-4" />فیلترها
                {(module === 'tasks' ? taskAdvancedFilterCount : contentAdvancedFilterCount) > 0 && <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] text-white ${module === 'tasks' ? 'bg-sky-600' : 'bg-violet-600'}`}>{(module === 'tasks' ? taskAdvancedFilterCount : contentAdvancedFilterCount).toLocaleString('fa-IR')}</span>}
              </button>
            ) : <span className="text-xs font-bold text-slate-500">فیلترها و مرتب‌سازی</span>}

            {module === 'tasks' ? (
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="نمای وظایف">
                {([['list', 'فهرست', List], ['kanban', 'کانبان', LayoutGrid], ['calendar', 'تقویم', CalendarClock]] as const).map(([value, label, ViewIcon]) => <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => update('view', value)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${view === value ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ViewIcon className="w-3.5 h-3.5" />{label}</button>)}
              </div>
            ) : (
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="نمای فهرست">
                <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => update('view', 'list')} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><List className="w-3.5 h-3.5" />فهرست</button>
                <button type="button" role="tab" aria-selected={view === 'cards'} onClick={() => update('view', 'cards')} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${view === 'cards' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><LayoutGrid className="w-3.5 h-3.5" />کارت</button>
              </div>
            )}
          </div>

          {(module === 'projects' || filtersOpen) && <div className="flex items-end gap-2 flex-wrap rounded-2xl border border-slate-200 bg-white p-3">
            {module === 'projects' && <label className="text-[11px] font-bold text-slate-600">وضعیت
              <Select aria-label="فیلتر وضعیت" value={filters.status || ''} onChange={event => update('status', event.target.value)} className="mt-1.5 min-w-36 text-xs">
                <option value="">همه وضعیت‌ها</option>
                {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </label>}
            {module === 'contents' && <label className="text-[11px] font-bold text-slate-600">نوع محتوا
              <Select aria-label="فیلتر نوع محتوا" value={filters.type || ''} onChange={event => update('type', event.target.value)} className="mt-1.5 min-w-36 text-xs"><option value="">همه انواع</option>{app.contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
            </label>}
            {(module === 'tasks' || module === 'projects') && <label className="text-[11px] font-bold text-slate-600">اولویت
              <Select aria-label="فیلتر اولویت" value={filters.priority || ''} onChange={event => update('priority', event.target.value)} className="mt-1.5 min-w-28 text-xs">
                <option value="">همه</option><option value="urgent">فوری</option><option value="high">بالا</option><option value="medium">متوسط</option><option value="low">کم</option>
              </Select>
            </label>}
            {module === 'projects' && <label className="text-[11px] font-bold text-slate-600">سررسید
              <Select aria-label="فیلتر سررسید" value={filters.due || ''} onChange={event => update('due', event.target.value)} className="mt-1.5 min-w-28 text-xs"><option value="">همه موعدها</option><option value="today">امروز</option><option value="overdue">عقب‌افتاده</option></Select>
            </label>}
            {module === 'tasks' && <label className="text-[11px] font-bold text-slate-600">پروژه
              <Select aria-label="فیلتر پروژه" value={filters.project_id || ''} onChange={event => update('project_id', event.target.value)} className="mt-1.5 min-w-36 text-xs"><option value="">همه پروژه‌ها</option>{app.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</Select>
            </label>}
            {module === 'tasks' && <label className="text-[11px] font-bold text-slate-600">محتوا
              <Select aria-label="فیلتر محتوا" value={filters.content_id || ''} onChange={event => update('content_id', event.target.value)} className="mt-1.5 min-w-40 text-xs"><option value="">همه محتواها</option>{app.contents.map(content => <option key={content.id} value={content.id}>{content.title}</option>)}</Select>
            </label>}
            {module === 'contents' && <label className="text-[11px] font-bold text-slate-600">مالک
              <Select aria-label="مالک" value={filters.owner || ''} onChange={event => update('owner', event.target.value)} className="mt-1.5 min-w-28 text-xs"><option value="">همهٔ مجاز</option><option value="me">من</option></Select>
            </label>}
            {module === 'contents' && app.targetAudiences.length > 0 && <label className="text-[11px] font-bold text-slate-600">مخاطب هدف
              <Select aria-label="فیلتر مخاطب هدف" value={filters.target_audience || ''} onChange={event => update('target_audience', event.target.value)} className="mt-1.5 min-w-36 text-xs"><option value="">همه مخاطبان</option>{app.targetAudiences.map(audience => <option key={audience} value={audience}>{audience}</option>)}</Select>
            </label>}
            <label className="text-[11px] font-bold text-slate-600">مرتب‌سازی
              <Select aria-label="مرتب‌سازی" value={filters.sort || 'created_at'} onChange={event => update('sort', event.target.value)} className="mt-1.5 min-w-28 text-xs"><option value="created_at">تاریخ ایجاد</option><option value="updated_at">آخرین تغییر</option><option value="deadline">سررسید</option></Select>
            </label>
            <div className="text-[11px] font-bold text-slate-600">جهت
              <button
                type="button"
                aria-label={filters.direction === 'asc' ? 'مرتب‌سازی صعودی؛ تغییر به نزولی' : 'مرتب‌سازی نزولی؛ تغییر به صعودی'}
                title={filters.direction === 'asc' ? 'صعودی' : 'نزولی'}
                onClick={() => update('direction', filters.direction === 'asc' ? 'desc' : 'asc')}
                className="mt-1.5 flex h-[var(--control-height)] w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
              >
                {filters.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
            </div>
          </div>}
        </div>

        {activeFilterEntries.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap text-xs" aria-label="فیلترهای فعال">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            {activeFilterEntries.map(([key, value]) => (
              <button key={key} type="button" onClick={() => update(key, '')} aria-label={`حذف فیلتر ${filterNames[key] || key}`} className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold flex items-center gap-1">
                {filterNames[key] || key}: {labels[value] || filterValues[value] || value}<X className="w-3 h-3" />
              </button>
            ))}
            <button type="button" onClick={() => setSearch(view !== 'list' ? { view } : {})} className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-bold">پاک‌کردن فیلترها</button>
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
                <table className={`w-full text-right text-sm ${module === 'tasks' ? 'min-w-[680px]' : 'min-w-[760px]'}`}>
                  <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500">
                    <th className="p-4">عنوان</th><th className="p-4">وضعیت</th><th className="p-4">{module === 'contents' ? 'نوع' : 'اولویت'}</th>{module !== 'tasks' && <th className="p-4">{module === 'projects' ? 'مدیر پروژه' : 'مالک محتوا'}</th>}<th className="p-4">سررسید</th><th className="p-4 text-left">عملیات</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 max-w-sm">{recordTitle(row, 'font-extrabold text-slate-900 hover:text-indigo-700 break-words')}<p className="text-xs text-slate-500 mt-1 truncate">{subtitleOf(row)}</p></td>
                        <td className="p-4">{module === 'tasks' ? <div className="relative inline-block">
                          <button type="button" aria-haspopup="menu" aria-expanded={statusMenuTaskId === row.id} onClick={() => setStatusMenuTaskId(current => current === row.id ? null : row.id)} className="rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-200" title="تغییر وضعیت">{statusBadge(module, row, labels)}</button>
                          {statusMenuTaskId === row.id && <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-40 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                            {orderedTaskStatuses.map(status => <button key={status.id} type="button" role="menuitem" disabled={status.id === row.status} onClick={() => { setStatusMenuTaskId(null); if (status.id !== row.status) void app.moveTaskStatus(row.id, status.id as TaskStatus); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-xs font-bold ${status.id === row.status ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />{status.label}</button>)}
                          </div>}
                        </div> : statusBadge(module, row, labels)}</td>
                        <td className="p-4">{module === 'contents' ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-xs font-bold"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: app.contentTypes.find(type => type.id === row.type)?.color || '#7c3aed' }} />{subtitleOf(row)}</span> : row.priority ? <PriorityPill priority={row.priority as Priority} size="sm" /> : '—'}</td>
                        {module !== 'tasks' && <td className="p-4 text-xs font-medium text-slate-700">{personOf(row)}</td>}
                        <td className="p-4 text-xs text-slate-500 whitespace-nowrap">{row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</td>
                        <td className="p-4"><div className="flex items-center justify-end gap-1.5">
                          {module === 'projects' && <button type="button" onClick={() => { const next = paramsFromFilters(); next.set('preview', row.id); setSearch(next); }} className="px-2.5 py-2 rounded-xl text-indigo-700 hover:bg-indigo-50 text-xs font-bold flex items-center gap-1"><Eye className="w-4 h-4" />پیش‌نمایش</button>}
                          {module === 'tasks' ? <>
                            <button type="button" onClick={() => app.setSelectedTaskId(row.id)} aria-label={`جزئیات ${titleOf(row)}`} title="جزئیات" className="p-2 rounded-xl text-sky-700 hover:bg-sky-50"><Eye className="w-4 h-4" /></button>
                            {(row.assigneeId === app.currentUser.id || app.hasPermission('tasks.edit')) && <button type="button" onClick={() => setEditingTask(row as Task)} aria-label={`ویرایش ${titleOf(row)}`} title="ویرایش" className="p-2 rounded-xl text-indigo-700 hover:bg-indigo-50"><Pencil className="w-4 h-4" /></button>}
                          </> : <Link to={detail(row.id)} aria-label={`باز کردن ${titleOf(row)}`} className="p-2 rounded-xl text-slate-400 hover:text-indigo-700 hover:bg-indigo-50"><ChevronLeft className="w-4 h-4" /></Link>}
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : module === 'tasks' && view === 'kanban' ? (
              <div className="flex items-start gap-4 overflow-x-auto p-4 pb-6">
                {[...app.taskStatuses].sort((a, b) => a.order - b.order).filter(status => status.id !== 'archived').map(status => {
                  const statusTasks = rows.filter((row: any) => row.status === status.id);
                  return <section key={status.id} onDragOver={event => { event.preventDefault(); setDropTargetStatus(status.id); }} onDragLeave={() => setDropTargetStatus(current => current === status.id ? null : current)} onDrop={event => { event.preventDefault(); handleTaskDrop(status.id); }} className={`w-72 shrink-0 rounded-2xl border p-3 ${dropTargetStatus === status.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50/70'}`}>
                    <header className="mb-3 flex items-center justify-between border-r-4 pr-2" style={{ borderColor: status.color }}><h2 className="text-xs font-black text-slate-800">{status.label}</h2><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{statusTasks.length.toLocaleString('fa-IR')}</span></header>
                    <div className="space-y-2.5">{statusTasks.map((task: any) => <article key={task.id} draggable onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => { setDraggedTaskId(null); setDropTargetStatus(null); }} onClick={() => app.setSelectedTaskId(task.id)} className={`cursor-grab rounded-2xl border border-slate-200 bg-white p-3.5 ${draggedTaskId === task.id ? 'opacity-50' : 'hover:border-sky-300'}`}><div className="flex items-start justify-between gap-2"><PriorityPill priority={task.priority as Priority} size="sm" /><span className="text-[10px] text-slate-400">{subtitleOf(task)}</span></div><h3 className="mt-2 text-sm font-extrabold leading-6 text-slate-900">{task.title}</h3><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-700"><UserRound className="w-3 h-3" />{personOf(task)}</span><span className="text-[10px] text-slate-500">{task.deadline ? formatPersianDate(task.deadline) : 'بدون سررسید'}</span></div></article>)}</div>
                    {!statusTasks.length && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-[11px] text-slate-400">تسکی در این ستون نیست</div>}
                  </section>;
                })}
              </div>
            ) : module === 'tasks' && view === 'calendar' ? (
              <TaskWorkspaceCalendar tasks={rows as Task[]} projects={app.projects} currentDate={calendarDate} onDateChange={setCalendarDate} onSelectTask={app.setSelectedTaskId} />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-5">
                {rows.map((row: any) => (
                  <article key={row.id} className="bg-white rounded-3xl border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all p-5 flex flex-col justify-between relative overflow-hidden min-w-0">
                    <div className="absolute top-0 inset-x-0 h-1.5" style={{ backgroundColor: cardColor(row) }} />
                    <div className="space-y-4 pt-1">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0">{recordTitle(row, 'font-black text-slate-900 hover:text-indigo-700 break-words')}<p className="text-xs text-slate-500 mt-1 truncate">{subtitleOf(row)}</p></div>{statusBadge(module, row, labels)}</div>
                      {row.description && <p className="text-xs leading-6 text-slate-500 line-clamp-2">{row.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">{module !== 'contents' && row.priority && <PriorityPill priority={row.priority as Priority} size="sm" />}<span className="text-[11px] text-slate-500 flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{personOf(row)}</span></div>
                    </div>
                    <footer className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</span>{module === 'projects' && <button type="button" onClick={() => { const next = paramsFromFilters(); next.set('preview', row.id); setSearch(next); }} className="text-xs font-bold text-indigo-700 flex items-center gap-1"><Eye className="w-4 h-4" />پیش‌نمایش</button>}</footer>
                  </article>
                ))}
              </div>
            )}
            {(view === 'list' || view === 'cards') && <div className="px-4 border-t border-slate-100"><Pagination
              meta={query.data?.meta}
              busy={query.isFetching}
              onPage={page => update('page', String(page))}
              onPerPage={value => update('per_page', value === 20 ? '' : String(value))}
            /></div>}
          </div>
        )}
      </div>

      {module === 'projects' && <EntityPreview module={module} id={search.get('preview')} fullLink={detail} onClose={() => { const next = paramsFromFilters(); next.delete('preview'); setSearch(next, { replace: true }); }} />}
      {editingTask && <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />}
    </section>
  );
};


const TaskWorkspaceCalendar: React.FC<{
  tasks: Task[];
  projects: Array<{ id: string; name: string; color?: string }>;
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onSelectTask: (id: string) => void;
}> = ({ tasks, projects, currentDate, onDateChange, onSelectTask }) => {
  const daysInMonth = getDaysInMonth(currentDate);
  let firstDayIndex = getDay(startOfMonth(currentDate)) + 1;
  if (firstDayIndex === 7) firstDayIndex = 0;

  return <div className="p-4 sm:p-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div><h2 className="text-base font-black text-slate-900">{format(currentDate, 'MMMM yyyy')}</h2><p className="mt-1 text-xs text-slate-500">سررسید وظایف مطابق فیلترهای فعال</p></div>
        <div className="flex items-center gap-2" dir="ltr"><button type="button" onClick={() => onDateChange(subMonths(currentDate, 1))} className="p-2 rounded-lg border border-slate-200"><ChevronLeft className="w-4 h-4" /></button><button type="button" onClick={() => onDateChange(new Date())} className="px-3 py-2 rounded-lg bg-slate-100 text-xs font-bold">امروز</button><button type="button" onClick={() => onDateChange(addMonths(currentDate, 1))} className="p-2 rounded-lg border border-slate-200"><ChevronLeft className="w-4 h-4 rotate-180" /></button></div>
      </header>
      <div className="grid grid-cols-7 gap-2 border-b border-slate-100 py-2 text-center text-[11px] font-bold text-slate-500">{['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-2">{Array.from({ length: firstDayIndex }).map((_, index) => <div key={`empty-${index}`} className="min-h-24 rounded-xl border border-slate-100 bg-slate-50/50" />)}{Array.from({ length: daysInMonth }).map((_, index) => {
        const day = index + 1;
        const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - Number(format(currentDate, 'd')) + day);
        const dayTasks = tasks.filter(task => task.deadline && isSameDay(new Date(task.deadline), dayDate));
        const today = isSameDay(dayDate, new Date());
        return <div key={day} className={`min-h-24 rounded-xl border p-2 ${today ? 'border-sky-300 bg-sky-50/60' : 'border-slate-200 bg-white'}`}><span className={`text-xs font-bold ${today ? 'text-sky-700' : 'text-slate-600'}`}>{day.toLocaleString('fa-IR')}</span><div className="mt-1.5 space-y-1">{dayTasks.map(task => <button type="button" key={task.id} onClick={() => onSelectTask(task.id)} className="w-full truncate rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-right text-[9px] font-bold text-slate-700" style={{ borderRightColor: projects.find(project => project.id === task.projectId)?.color || '#0284c7', borderRightWidth: 3 }}>{task.title}</button>)}</div></div>;
      })}</div>
    </div>
  </div>;
};
