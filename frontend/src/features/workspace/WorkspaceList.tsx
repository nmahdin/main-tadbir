import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowDown,
  ArrowUpDown,
  ArrowUp,
  CalendarClock,
  CheckCircle2,
  CheckSquare2,
  Columns3,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ChevronLeft,
  CircleDot,
  Download,
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
import { useWorkspacePage } from '../../shared/queries/workspacePages';
import { parseListQuery, listStatuses, parseSortSpec, serializeSortSpec, cycleSortField, SORTABLE_FIELDS, type SortCriterion } from '../../app/router/listQuery';
import { usePageCorrection } from '../../app/router/usePageCorrection';
import { useApp } from '../../app/providers/AppContext';
import { Button, ConfirmDialog, EmptyState, ErrorState, Input, LoadingState, Select } from '../../shared/ui/Primitives';
import { Pagination } from '../../shared/ui/WorkspacePatterns';
import { PageSurface } from '../../shared/ui/PageSurface';
import { readTableDensity, writeTableDensity, type TableDensity } from '../../shared/api/preferences';
import { toast } from '../../shared/ui/Notifications';
import { readListColumnPreferences, writeListColumnPreferences, applyColumnOrder, moveInOrder, type ListColumnPreferences, type ModuleColumnPreference } from '../../shared/api/preferences';
import { request, type ApiResponse } from '../../shared/api/client';
import { downloadRequest } from '../../shared/api/client';
import { formatPersianDate } from '../../shared/lib/date';
import { ContentStatusBadge } from '../../shared/lib/statusBadges';
import { PriorityPill, ProjectStatusBadge, TaskStatusBadge } from '../../shared/ui/PriorityPill';
import type { ContentStatus, Priority, ProjectStatus, Task, TaskStatus } from '../../shared/types';
import { addMonths, format, getDay, getDaysInMonth, isSameDay, startOfMonth, subMonths } from 'date-fns-jalali';
import { EditTaskModal } from '../tasks/EditTaskModal';

const filterNames: Record<string, string> = {
  status: 'وضعیت', search: 'جستجو', due: 'سررسید', assignee: 'مسئول', owner: 'مالک',
  project_id: 'پروژه', content_id: 'محتوا', project_manager_id: 'مدیر پروژه', priority: 'اولویت', type: 'نوع محتوا',
  target_audience: 'مخاطب هدف', sort: 'مرتب‌سازی', direction: 'ترتیب',
};
const filterValues: Record<string, string> = {
  me: 'من', near: 'نزدیک موعد', today: 'امروز', overdue: 'عقب‌افتاده', asc: 'صعودی', desc: 'نزولی',
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
    iconBox: '',
    activePill: 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white',
  },
  tasks: {
    title: 'وظایف و پیگیری کارها',
    description: 'مدیریت وظایف محول‌شده، موعدها و اولویت‌بندی فعالیت‌ها',
    createLabel: 'وظیفه جدید',
    icon: CheckSquare2,
    iconBox: '',
    activePill: 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white',
  },
  contents: {
    title: 'مدیریت و تولید محتوا',
    description: 'چرخه ایده‌پردازی، تولید، بازبینی و آماده‌سازی انتشار محتوا',
    createLabel: 'محتوای جدید',
    icon: PenTool,
    iconBox: '',
    activePill: 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white',
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
    { label: 'نزدیک موعد', icon: CalendarClock, values: { due: 'near' } },
    { label: 'تأخیردار', icon: Clock3, values: { due: 'overdue' } },
    { label: 'در صف بررسی', icon: Eye, values: { status: 'review' } },
  ],
  contents: [
    { label: 'همه محتواها', icon: FileText, values: {} },
    { label: 'نیازمند اقدام', icon: CircleDot, values: { status: 'open' } },
    { label: 'در حال تولید', icon: PenTool, values: { status: 'producing' } },
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

/** Hideable list columns; title + actions are mandatory and always
 * shown (visibility is presentation only — it grants no access). */
const COLUMN_DEFS: Record<MainModule, { key: string; label: string; mandatory?: boolean }[]> = {
  projects: [
    { key: 'title', label: 'عنوان', mandatory: true },
    { key: 'status', label: 'وضعیت' },
    { key: 'priority', label: 'اولویت' },
    { key: 'person', label: 'مدیر پروژه' },
    { key: 'deadline', label: 'سررسید' },
    { key: 'actions', label: 'عملیات', mandatory: true },
  ],
  tasks: [
    { key: 'title', label: 'عنوان', mandatory: true },
    { key: 'status', label: 'وضعیت' },
    { key: 'priority', label: 'اولویت' },
    { key: 'deadline', label: 'سررسید' },
    { key: 'actions', label: 'عملیات', mandatory: true },
  ],
  contents: [
    { key: 'title', label: 'عنوان', mandatory: true },
    { key: 'status', label: 'وضعیت' },
    { key: 'type', label: 'نوع' },
    { key: 'person', label: 'مالک محتوا' },
    { key: 'deadline', label: 'سررسید' },
    { key: 'actions', label: 'عملیات', mandatory: true },
  ],
};

const SORT_LABELS: Record<string, string> = {
  created_at: 'تاریخ ایجاد', updated_at: 'آخرین تغییر', deadline: 'سررسید', priority: 'اولویت',
};

const FILTER_KEYS = ['status', 'search', 'due', 'assignee', 'owner', 'project_id', 'content_id', 'project_manager_id', 'priority', 'type', 'target_audience', 'sort', 'direction'];

/** Projects CSV export columns (backend allowlist mirror). */
const EXPORT_COLUMNS: { api: string; label: string; uiKey?: string }[] = [
  { api: 'name', label: 'نام پروژه' },
  { api: 'status', label: 'وضعیت', uiKey: 'status' },
  { api: 'priority', label: 'اولویت', uiKey: 'priority' },
  { api: 'deadline', label: 'سررسید', uiKey: 'deadline' },
  { api: 'project_manager', label: 'مدیر پروژه', uiKey: 'person' },
  { api: 'progress', label: 'پیشرفت' },
  { api: 'created_at', label: 'تاریخ ایجاد' },
  { api: 'updated_at', label: 'آخرین تغییر' },
];

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
  const [filterDraft, setFilterDraft] = useState<Record<string, string> | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columnPref, setColumnPref] = useState<ModuleColumnPreference>({ hidden: [], order: [] });
  const [dragColumnKey, setDragColumnKey] = useState<string | null>(null);
  // UX-02-3-FINAL bulk selection (tasks only, current page only).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkReport, setBulkReport] = useState<{ updated: number; failed: { id: number; code: number; reason: string }[] } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [density, setDensityState] = useState<TableDensity>('normal');
  const densityVersionRef = useRef<number | null>(null);
  useEffect(() => { let cancelled = false; readTableDensity().then(({ value, version }) => { if (!cancelled) { setDensityState(value); densityVersionRef.current = version; } }).catch(() => undefined); return () => { cancelled = true; }; }, []);
  const applyDensity = (next: TableDensity) => { setDensityState(next); writeTableDensity(next, densityVersionRef.current).then(response => { densityVersionRef.current = response.data.explicit.version; }).catch(() => undefined); };
  const [exportSelection, setExportSelection] = useState<string[]>(['name', 'status', 'priority', 'deadline', 'project_manager']);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('csv');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const prefVersionRef = React.useRef<number | null>(null);
  const allColumnPrefsRef = React.useRef<ListColumnPreferences>({});
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<string | null>(null);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Column visibility persists as the actor's own C7 preference so
  // it follows the user across devices; failures keep local state.
  React.useEffect(() => {
    let cancelled = false;
    readListColumnPreferences()
      .then(({ value, version }) => {
        if (cancelled) return;
        allColumnPrefsRef.current = value;
        prefVersionRef.current = version;
        const pref = value[module] ?? { hidden: [], order: [] };
        const allowed = new Set(COLUMN_DEFS[module].filter(column => !column.mandatory).map(column => column.key));
        setColumnPref({
          hidden: pref.hidden.filter(key => allowed.has(key)),
          order: pref.order.filter(key => allowed.has(key)),
        });
      })
      .catch(() => { /* preferences unavailable → all columns visible */ });
    return () => { cancelled = true; };
  }, [module]);

  React.useEffect(() => {
    setSelectedIds([]);
    setBulkReport(null);
  }, [location.search, view, module]);

  React.useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFiltersOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtersOpen]);

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

  // UX-02-3 multi-sort: URL spec is the single source of truth.
  const sortSpec: SortCriterion[] = parseSortSpec(filters.sort, module)
    ?? (filters.sort ? [{ field: filters.sort, direction: filters.direction === 'asc' ? 'asc' : 'desc' }] : []);
  const toggleHeaderSort = (field: string) => {
    const next = cycleSortField(sortSpec, field);
    const params = paramsFromFilters();
    if (next.length) params.set('sort', serializeSortSpec(next)); else params.delete('sort');
    params.delete('direction');
    params.delete('page');
    if (view !== 'list') params.set('view', view);
    setSearch(params);
  };
  const sortLabel = (spec: SortCriterion[]) => spec
    .map((criterion, index) => `${index + 1}. ${SORT_LABELS[criterion.field] || criterion.field} ${criterion.direction === 'asc' ? 'صعودی' : 'نزولی'}`)
    .join(' ← ');

  const columnVisible = (key: string) => !columnPref.hidden.includes(key);
  const orderedColumnDefs = React.useMemo(
    () => applyColumnOrder(COLUMN_DEFS[module], columnPref.order),
    [module, columnPref.order],
  );
  const visibleColumnDefs = orderedColumnDefs.filter(definition => definition.mandatory || columnVisible(definition.key));
  const freeColumnOrder = orderedColumnDefs.filter(definition => !definition.mandatory).map(definition => definition.key);
  const persistColumns = (pref: ModuleColumnPreference) => {
    allColumnPrefsRef.current = { ...allColumnPrefsRef.current, [module]: pref };
    writeListColumnPreferences(allColumnPrefsRef.current, prefVersionRef.current)
      .then(response => { prefVersionRef.current = response.data.explicit.version; })
      .catch(() => { /* local visibility kept; server value unchanged */ });
  };
  const saveColumnPref = (pref: ModuleColumnPreference) => {
    setColumnPref(pref);
    persistColumns(pref);
  };
  const toggleColumn = (key: string) => {
    const hidden = columnPref.hidden.includes(key)
      ? columnPref.hidden.filter(column => column !== key)
      : [...columnPref.hidden, key];
    saveColumnPref({ ...columnPref, hidden });
  };
  const reorderColumn = (key: string, direction: -1 | 1) => {
    saveColumnPref({ ...columnPref, order: moveInOrder(freeColumnOrder, key, direction) });
  };
  const dropColumnOn = (key: string) => {
    if (!dragColumnKey || dragColumnKey === key) return;
    const without = freeColumnOrder.filter(item => item !== dragColumnKey);
    const at = without.indexOf(key);
    const next = [...without.slice(0, at), dragColumnKey, ...without.slice(at)];
    saveColumnPref({ ...columnPref, order: next });
    setDragColumnKey(null);
  };

  const openExport = () => {
    setExportSelection(EXPORT_COLUMNS.filter(column => !column.uiKey || columnVisible(column.uiKey)).map(column => column.api));
    setExportMessage(null);
    setExportOpen(true);
  };
  const runExport = async () => {
    setExportBusy(true);
    setExportMessage(null);
    try {
      const params = new URLSearchParams(filters);
      params.delete('page');
      params.delete('per_page');
      if (sortSpec.length) params.set('sort', serializeSortSpec(sortSpec));
      params.set('columns', exportSelection.join(','));
      const isXlsx = exportFormat === 'xlsx';
      const blob = await downloadRequest(isXlsx ? `/projects/export.xlsx?${params.toString()}` : `/projects/export?${params.toString()}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = isXlsx ? 'projects-export.xlsx' : 'projects-export.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      setExportMessage(`فایل خروجی ${isXlsx ? 'Excel' : 'CSV'} آماده و دانلود شد. خروجی شامل همهٔ رکوردهای مطابق فیلترهای فعال است (حداکثر ۵٬۰۰۰ ردیف).`);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'دریافت خروجی ناموفق بود.');
    } finally {
      setExportBusy(false);
    }
  };

  // Filter drawer: edits live in a draft until Apply writes the URL,
  // so reopening preserves exactly what the user last chose.
  const openFilters = () => {
    setFilterDraft(Object.fromEntries(FILTER_KEYS.filter(key => filters[key]).map(key => [key, filters[key]])));
    setFiltersOpen(true);
  };
  const applyFilters = () => {
    if (!filterDraft) return;
    const next = paramsFromFilters();
    FILTER_KEYS.forEach(key => next.delete(key));
    (Object.entries(filterDraft) as [string, string][]).forEach(([key, value]) => { if (value) next.set(key, value); });
    next.delete('page');
    if (view !== 'list') next.set('view', view);
    setSearch(next);
    setFiltersOpen(false);
  };
  const draftSortSpec: SortCriterion[] = filterDraft ? (parseSortSpec(filterDraft.sort, module) ?? []) : [];
  const cycleDraftSort = (field: string) => {
    if (!filterDraft) return;
    const next = cycleSortField(draftSortSpec, field);
    const updated = { ...filterDraft };
    if (next.length) updated.sort = serializeSortSpec(next); else delete updated.sort;
    delete updated.direction;
    setFilterDraft(updated);
  };

  const create = module === 'projects'
    ? () => app.setIsCreateProjectOpen(true)
    : module === 'tasks'
      ? () => app.setIsCreateTaskOpen(true)
      : () => app.setIsCreateContentOpen(true);
  const canCreate = app.hasPermission(`${module === 'contents' ? 'content' : module}.create`);
  const detail = (id: string) => {
    const back = new URLSearchParams(search);
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
    if (task?.kind === 'content_review' && (status !== 'completed' || task.status === 'completed' || !app.hasPermission('content.approve'))) {
      setDraggedTaskId(null); setDropTargetStatus(null); return;
    }
    if (task && task.status !== status) void app.moveTaskStatus(task.id, status as TaskStatus);
    setDraggedTaskId(null);
    setDropTargetStatus(null);
  };
  const cardColor = (row: any) => {
    if (module === 'projects' && /^#[0-9a-f]{6}$/i.test(row.color || '')) return row.color;
    if (module === 'contents') return app.contentStatuses.find(status => status.id === row.status)?.color || '#39677c';
    return app.taskStatuses.find(status => status.id === row.status)?.color || '#39677c';
  };
  const total = query.data?.meta?.total ?? rows.length;
  const orderedTaskStatuses = [...app.taskStatuses].sort((left, right) => left.order - right.order).filter(status => status.id !== 'archived');
  const Icon = config.icon;
  const activeFilterEntries = Object.entries(filters).filter(([key]) => !['page', 'per_page'].includes(key) && !(key === 'direction' && (filters.sort || '').includes(':')));
  const sortHeader = (field: string, label: string) => {
    const index = sortSpec.findIndex(criterion => criterion.field === field);
    const criterion = index >= 0 ? sortSpec[index] : null;
    return (
      <button type="button" onClick={() => toggleHeaderSort(field)} aria-label={`مرتب‌سازی بر اساس ${label}${criterion ? ` (معیار ${(index + 1).toLocaleString('fa-IR')}، ${criterion.direction === 'asc' ? 'صعودی' : 'نزولی'})` : ''}`} className="inline-flex items-center gap-1 font-bold text-slate-500 hover:text-[var(--color-primary)]">
        {label}
        {criterion
          ? (criterion.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-[var(--color-primary)]" /> : <ArrowDown className="h-3.5 w-3.5 text-[var(--color-primary)]" />)
          : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
        {criterion && sortSpec.length > 1 && <span className="min-w-4 rounded-full bg-[var(--color-primary)] px-1 text-center text-[9px] text-white">{(index + 1).toLocaleString('fa-IR')}</span>}
      </button>
    );
  };
  const projectAdvancedFilterCount = ['status', 'priority', 'due', 'sort', 'direction'].filter(key => filters[key]).length;
  const taskAdvancedFilterCount = ['priority', 'project_id', 'content_id', 'sort', 'direction'].filter(key => filters[key]).length;
  const contentAdvancedFilterCount = ['type', 'owner', 'target_audience', 'sort', 'direction'].filter(key => filters[key]).length;
  const advancedFilterCount = module === 'projects' ? projectAdvancedFilterCount : module === 'tasks' ? taskAdvancedFilterCount : contentAdvancedFilterCount;


  // Column rendering in persisted order (UX-02-3-FINAL DEC-08).
  const headerFor = (key: string) => {
    if (key === 'title') return 'عنوان';
    if (key === 'status') return 'وضعیت';
    if (key === 'priority') return sortHeader('priority', 'اولویت');
    if (key === 'type') return 'نوع';
    if (key === 'person') return module === 'projects' ? 'مدیر پروژه' : 'مالک محتوا';
    if (key === 'deadline') return sortHeader('deadline', 'سررسید');
    return 'عملیات';
  };
  const renderCell = (key: string, row: any): React.ReactNode => {
    if (key === 'title') return <td key={key} className="p-4 max-w-sm">{recordTitle(row, 'font-extrabold text-slate-900 hover:text-[var(--color-primary)] break-words')}<p className="text-xs text-slate-500 mt-1 truncate">{subtitleOf(row)}</p></td>;
    if (key === 'status') return <td key={key} className="p-4">{module === 'tasks' ? <div className="relative inline-block">
      <button type="button" aria-haspopup="menu" aria-expanded={statusMenuTaskId === row.id} disabled={row.kind === 'content_review' && (row.status === 'completed' || !app.hasPermission('content.approve'))} onClick={() => setStatusMenuTaskId(current => current === row.id ? null : row.id)} className="rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[var(--color-primary)] disabled:cursor-default" title={row.kind === 'content_review' ? 'تأیید مرحله محتوا و تکمیل وظیفه' : 'تغییر وضعیت'}>{statusBadge(module, row, labels)}</button>
      {statusMenuTaskId === row.id && <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-40 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
        {(row.kind === 'content_review' ? orderedTaskStatuses.filter(status => status.id === 'completed') : orderedTaskStatuses).map(status => <button key={status.id} type="button" role="menuitem" disabled={status.id === row.status} onClick={() => { setStatusMenuTaskId(null); if (status.id !== row.status) { const previous = row.status as TaskStatus; void app.moveTaskStatus(row.id, status.id as TaskStatus).then(ok => { if (ok) toast.success('وضعیت وظیفه به‌روزرسانی شد', { dedupeKey: `status-${row.id}`, action: { label: 'بازگردانی', onClick: () => { void app.moveTaskStatus(row.id, previous); } } }); }); } }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-right text-xs font-bold ${status.id === row.status ? 'bg-[var(--color-surface-muted)] text-[var(--color-primary)]' : 'text-slate-700 hover:bg-slate-50'}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: status.color }} />{row.kind === 'content_review' ? 'تأیید و تکمیل' : status.label}</button>)}
      </div>}
    </div> : statusBadge(module, row, labels)}</td>;
    if (key === 'priority') return <td key={key} className="p-4">{row.priority ? <PriorityPill priority={row.priority as Priority} size="sm" /> : '—'}</td>;
    if (key === 'type') return <td key={key} className="p-4"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-primary)] text-xs font-bold"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: app.contentTypes.find(type => type.id === row.type)?.color || '#39677c' }} />{subtitleOf(row)}</span></td>;
    if (key === 'person') return <td key={key} className="p-4 text-xs font-medium text-slate-700">{personOf(row)}</td>;
    if (key === 'deadline') return <td key={key} className="p-4 text-xs text-slate-500 whitespace-nowrap">{row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</td>;
    return <td key={key} className="p-4"><div className="flex items-center justify-end gap-1.5">
      {module === 'tasks' ? <>
        <button type="button" onClick={() => app.setSelectedTaskId(row.id)} aria-label={`جزئیات ${titleOf(row)}`} title="جزئیات" className="p-2 rounded-xl text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"><Eye className="w-4 h-4" /></button>
        {(row.assigneeId === app.currentUser.id || app.hasPermission('tasks.edit')) && <button type="button" onClick={() => setEditingTask(row as Task)} aria-label={`ویرایش ${titleOf(row)}`} title="ویرایش" className="p-2 rounded-xl text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"><Pencil className="w-4 h-4" /></button>}
      </> : <Link to={detail(row.id)} aria-label={`باز کردن ${titleOf(row)}`} className="p-2 rounded-xl text-slate-400 hover:text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]"><ChevronLeft className="w-4 h-4" /></Link>}
    </div></td>;
  };

  // Bulk selection scope: only tasks, only the current page (DEC-09).
  const pageRowIds = rows.map((row: any) => String(row.id));
  const allPageSelected = pageRowIds.length > 0 && pageRowIds.every(id => selectedIds.includes(id));
  const toggleSelectPage = () => setSelectedIds(allPageSelected ? selectedIds.filter(id => !pageRowIds.includes(id)) : [...new Set([...selectedIds, ...pageRowIds])]);
  const runBulkStatus = async () => {
    setBulkBusy(true);
    try {
      const response = await request<ApiResponse<{ updated: number[]; failed: { id: number; code: number; reason: string }[] }>>('/tasks/bulk-status', {
        method: 'POST',
        body: { task_ids: selectedIds.map(id => Number(id)), status: bulkStatus },
      });
      setBulkReport({ updated: response.data.updated.length, failed: response.data.failed });
      // UX-02-4 §14: Undo offered only when the inverse is exact —
      // every updated task shared one previous status.
      const priorStatuses = [...new Set((rows.filter(row => response.data.updated.includes(Number(row.id))) as { status?: string }[]).map(row => row.status).filter(Boolean))];
      if (response.data.updated.length > 0 && priorStatuses.length === 1) {
        const previous = priorStatuses[0] as string;
        const updatedIds = [...response.data.updated];
        toast.success('وضعیت وظیفه‌ها به‌روزرسانی شد', {
          dedupeKey: `bulk-status-${updatedIds.join(',')}`,
          action: {
            label: 'بازگردانی',
            onClick: () => {
              void request('/tasks/bulk-status', { method: 'POST', body: { task_ids: updatedIds, status: previous } }).then(() => query.refetch()).catch(() => undefined);
            },
          },
        });
      }
      setSelectedIds([]);
      setBulkConfirmOpen(false);
      void query.refetch();
    } catch (error) {
      setBulkReport({ updated: 0, failed: selectedIds.map(id => ({ id: Number(id), code: 0, reason: error instanceof Error ? error.message : 'خطای شبکه' })) });
      setBulkConfirmOpen(false);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <section className={`text-right min-w-0 animate-in fade-in duration-300${density === 'compact' ? ' density-compact' : ''}`} dir="rtl">
     <PageSurface className="space-y-5">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0" style={{ background: 'var(--color-primary)' }}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{config.title}</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">{config.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-0.5" role="group" aria-label="تراکم نمایش فهرست">
              {(['normal','compact'] as const).map(value => <button key={value} type="button" aria-pressed={density === value} onClick={() => applyDensity(value)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${density === value ? 'bg-white text-[var(--color-primary)]' : 'text-slate-500'}`}>{value === 'normal' ? 'عادی' : 'فشرده'}</button>)}
            </div>
          {module === 'projects' && (
            <button type="button" onClick={openExport} className="px-3.5 py-2.5 rounded-xl bg-[var(--color-surface-muted)] hover:bg-slate-100 text-[var(--color-primary)] font-bold text-xs border border-[var(--color-border)] flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />خروجی CSV
            </button>
          )}
          {module === 'projects' && canCreate && (
            <button type="button" onClick={() => app.setIsTemplatesModalOpen(true)} className="px-3.5 py-2.5 rounded-xl bg-[var(--color-surface-muted)] hover:bg-slate-100 text-[var(--color-primary)] font-bold text-xs border border-[var(--color-border)] flex items-center gap-2 transition-colors">
              <Layers3 className="w-4 h-4" />الگوهای پروژه
            </button>
          )}
          {module === 'contents' && (
            <>
              <Button variant="secondary" onClick={() => app.setActiveView('content-publishing')} className="text-xs sm:text-sm">
                <CalendarClock className="w-4 h-4 text-[var(--color-primary)]" />میز انتشار
              </Button>
              <Button variant="success" onClick={() => app.setActiveView('content-published')} className="text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4" />محتواهای منتشرشده
              </Button>
            </>
          )}
          {canCreate && (
            <button data-button-action="create" type="button" onClick={create} className={`ui-form-action px-4 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 transition-all ${module === 'contents' ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]' : module === 'tasks' ? 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]' : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]'}`}>
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
            return <button key={preset.label} type="button" role="tab" aria-selected={active} onClick={() => applyPreset(preset)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 ${active ? 'bg-[var(--color-primary)] text-white' : 'text-slate-600 hover:bg-slate-100'}`}><PresetIcon className="w-3.5 h-3.5" />{preset.label}</button>;
          })}
        </div>
      )}

      {module === 'contents' && (
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="وضعیت محتوا">
          {PRESETS.contents.map(preset => {
            const PresetIcon = preset.icon;
            const active = presetActive(preset);
            return <button key={preset.label} type="button" role="tab" aria-selected={active} onClick={() => applyPreset(preset)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold ${active ? 'bg-[var(--color-primary)] text-white' : 'text-slate-600 hover:bg-slate-100'}`}><PresetIcon className="h-3.5 w-3.5" />{preset.label}</button>;
          })}
        </div>
      )}

      <div className="rounded-3xl border border-[var(--color-border)] bg-white overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50/60 space-y-3" aria-label="کنترل‌های فهرست">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button type="button" aria-expanded={filtersOpen} aria-haspopup="dialog" onClick={openFilters} className={`ui-button ui-button-secondary text-xs ${filtersOpen || advancedFilterCount ? '!border-[var(--color-primary)] !text-[var(--color-primary)]' : ''}`}>
                <SlidersHorizontal className="w-4 h-4" />فیلترها
                {advancedFilterCount > 0 && <span className="min-w-5 rounded-full px-1.5 py-0.5 text-[10px] text-white bg-[var(--color-primary)]">{advancedFilterCount.toLocaleString('fa-IR')}</span>}
              </button>
              {view === 'list' && (
                <div className="relative">
                  <button type="button" aria-expanded={columnsOpen} aria-haspopup="menu" onClick={() => setColumnsOpen(open => !open)} className="ui-button ui-button-secondary text-xs">
                    <Columns3 className="w-4 h-4" />ستون‌ها
                  </button>
                  {columnsOpen && (
                    <div role="menu" aria-label="نمایش ستون‌ها" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                      {orderedColumnDefs.map(column => (
                        <div
                          key={column.key}
                          draggable={!column.mandatory}
                          onDragStart={() => setDragColumnKey(column.key)}
                          onDragOver={event => event.preventDefault()}
                          onDrop={() => dropColumnOn(column.key)}
                          className={`flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-bold ${column.mandatory ? 'text-slate-400' : 'text-slate-700 hover:bg-slate-50'} ${dragColumnKey === column.key ? 'opacity-50' : ''}`}
                        >
                          {!column.mandatory && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300" aria-hidden />}
                          <label className={`flex flex-1 items-center gap-2 ${column.mandatory ? '' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={column.mandatory || columnVisible(column.key)}
                              disabled={column.mandatory}
                              onChange={() => toggleColumn(column.key)}
                              aria-label={`نمایش ستون ${column.label}`}
                            />
                            {column.label}
                          </label>
                          {column.mandatory
                            ? <span className="text-[10px] font-medium">همیشگی</span>
                            : <span className="flex shrink-0 items-center">
                                <button type="button" onClick={() => reorderColumn(column.key, -1)} aria-label={`انتقال ستون ${column.label} به قبل`} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronUp className="h-3.5 w-3.5" /></button>
                                <button type="button" onClick={() => reorderColumn(column.key, 1)} aria-label={`انتقال ستون ${column.label} به بعد`} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronDown className="h-3.5 w-3.5" /></button>
                              </span>}
                        </div>
                      ))}
                      <p className="px-2 pt-1 text-[10px] leading-4 text-slate-400">برای جابه‌جایی، ستون را بکشید یا از پیکان‌ها استفاده کنید؛ ترتیب در همهٔ دستگاه‌های شما ذخیره می‌شود.</p>
                      <button type="button" onClick={() => saveColumnPref({ hidden: [], order: [] })} className="mt-1 w-full rounded-xl px-2.5 py-2 text-right text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]">
                        بازگردانی پیش‌فرض ستون‌ها
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {module === 'tasks' ? (
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="نمای وظایف">
                {([['list', 'فهرست', List], ['kanban', 'کانبان', LayoutGrid], ['calendar', 'تقویم', CalendarClock]] as const).map(([value, label, ViewIcon]) => <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => update('view', value)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${view === value ? 'bg-[var(--color-primary)] text-white' : 'text-slate-500 hover:bg-slate-50'}`}><ViewIcon className="w-3.5 h-3.5" />{label}</button>)}
              </div>
            ) : (
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="نمای فهرست">
                <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => update('view', 'list')} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${view === 'list' ? 'bg-[var(--color-primary)] text-white' : 'text-slate-500'}`}><List className="w-3.5 h-3.5" />فهرست</button>
                <button type="button" role="tab" aria-selected={view === 'cards'} onClick={() => update('view', 'cards')} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${view === 'cards' ? 'bg-[var(--color-primary)] text-white' : 'text-slate-500'}`}><LayoutGrid className="w-3.5 h-3.5" />کارت</button>
              </div>
            )}
          </div>

        </div>

        {activeFilterEntries.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap text-xs" aria-label="فیلترهای فعال">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            {activeFilterEntries.map(([key, value]) => (
              <button key={key} type="button" onClick={() => update(key, '')} aria-label={`حذف فیلتر ${filterNames[key] || key}`} className="px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-primary)] border border-[var(--color-border)] font-bold flex items-center gap-1">
                {filterNames[key] || key}: {key === 'sort' ? sortLabel(sortSpec) : (labels[value] || filterValues[value] || value)}<X className="w-3 h-3" />
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
              <>
              <ul className="divide-y divide-slate-100 md:hidden" aria-label="فهرست کارت‌ها">
                {rows.map((row: any) => (
                  <li key={row.id} className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        {module === 'tasks' && <input type="checkbox" aria-label={`انتخاب ${titleOf(row)}`} checked={selectedIds.includes(String(row.id))} onChange={() => setSelectedIds(selectedIds.includes(String(row.id)) ? selectedIds.filter(id => id !== String(row.id)) : [...selectedIds, String(row.id)])} className="mt-1 shrink-0" />}
                        <div className="min-w-0">{recordTitle(row, 'font-extrabold text-slate-900 break-words')}<p className="mt-0.5 truncate text-xs text-slate-500">{subtitleOf(row)}</p></div>
                      </div>
                      {statusBadge(module, row, labels)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                      {module !== 'contents' && row.priority && <PriorityPill priority={row.priority as Priority} size="sm" />}
                      {module !== 'tasks' && <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{personOf(row)}</span>}
                      <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</span>
                    </div>
                    <div className="flex justify-end">
                      {module === 'tasks' ? (
                        <button type="button" onClick={() => app.setSelectedTaskId(row.id)} className="rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]">مشاهده جزئیات</button>
                      ) : (
                        <Link to={detail(row.id)} className="rounded-xl px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-surface-muted)]">مشاهده جزئیات</Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className={`w-full text-right text-sm ${module === 'tasks' ? 'min-w-[680px]' : 'min-w-[760px]'}`}>
                  <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500">
                    {module === 'tasks' && <th className="w-10 p-4"><input type="checkbox" aria-label="انتخاب همهٔ وظیفه‌های این صفحه" checked={allPageSelected} onChange={toggleSelectPage} /></th>}
                    {visibleColumnDefs.map(definition => (
                      <th key={definition.key} className={definition.key === 'actions' ? 'p-4 text-left' : 'p-4'}>{headerFor(definition.key)}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        {module === 'tasks' && <td className="p-4"><input type="checkbox" aria-label={`انتخاب ${titleOf(row)}`} checked={selectedIds.includes(String(row.id))} onChange={() => setSelectedIds(selectedIds.includes(String(row.id)) ? selectedIds.filter(id => id !== String(row.id)) : [...selectedIds, String(row.id)])} /></td>}
                        {visibleColumnDefs.map(definition => renderCell(definition.key, row))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            ) : module === 'tasks' && view === 'kanban' ? (
              <div className="flex items-start gap-4 overflow-x-auto p-4 pb-6">
                {[...app.taskStatuses].sort((a, b) => a.order - b.order).filter(status => status.id !== 'archived').map(status => {
                  const statusTasks = rows.filter((row: any) => row.status === status.id);
                  return <section key={status.id} onDragOver={event => { event.preventDefault(); setDropTargetStatus(status.id); }} onDragLeave={() => setDropTargetStatus(current => current === status.id ? null : current)} onDrop={event => { event.preventDefault(); handleTaskDrop(status.id); }} className={`w-72 shrink-0 rounded-2xl border p-3 ${dropTargetStatus === status.id ? 'border-[var(--color-primary)] bg-[var(--color-surface-muted)]' : 'border-slate-200 bg-slate-50/70'}`}>
                    <header className="mb-3 flex items-center justify-between border-r-4 pr-2" style={{ borderColor: status.color }}><h2 className="text-xs font-black text-slate-800">{status.label}</h2><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{statusTasks.length.toLocaleString('fa-IR')}</span></header>
                    <div className="space-y-2.5">{statusTasks.map((task: any) => <article key={task.id} draggable={task.kind !== 'content_review' || (task.status !== 'completed' && app.hasPermission('content.approve'))} onDragStart={() => setDraggedTaskId(task.id)} onDragEnd={() => { setDraggedTaskId(null); setDropTargetStatus(null); }} onClick={() => app.setSelectedTaskId(task.id)} className={`cursor-grab rounded-2xl border border-slate-200 bg-white p-3.5 ${draggedTaskId === task.id ? 'opacity-50' : 'hover:border-[var(--color-primary)]'}`}><div className="flex items-start justify-between gap-2"><PriorityPill priority={task.priority as Priority} size="sm" /><span className="text-[10px] text-slate-400">{subtitleOf(task)}</span></div><h3 className="mt-2 text-sm font-extrabold leading-6 text-slate-900">{task.title}</h3><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-muted)] px-2 py-1 text-[10px] font-bold text-[var(--color-primary)]"><Clock3 className="w-3 h-3" />{Number(task.estimatedHours || 0).toLocaleString('fa-IR')} ساعت</span><span className="text-[10px] text-slate-500">{task.deadline ? formatPersianDate(task.deadline) : 'بدون سررسید'}</span></div></article>)}</div>
                    {!statusTasks.length && <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-[11px] text-slate-400">تسکی در این ستون نیست</div>}
                  </section>;
                })}
              </div>
            ) : module === 'tasks' && view === 'calendar' ? (
              <TaskWorkspaceCalendar tasks={rows as Task[]} projects={app.projects} currentDate={calendarDate} onDateChange={setCalendarDate} onSelectTask={app.setSelectedTaskId} />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-5">
                {rows.map((row: any) => (
                  <article key={row.id} className="bg-white rounded-3xl border border-slate-200 hover:border-[var(--color-primary)] transition-all p-5 flex flex-col justify-between relative overflow-hidden min-w-0">
                    <div className="absolute top-0 inset-x-0 h-1.5" style={{ backgroundColor: cardColor(row) }} />
                    <div className="space-y-4 pt-1">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0">{recordTitle(row, 'font-black text-slate-900 hover:text-[var(--color-primary)] break-words')}<p className="text-xs text-slate-500 mt-1 truncate">{subtitleOf(row)}</p></div>{statusBadge(module, row, labels)}</div>
                      {row.description && <p className="text-xs leading-6 text-slate-500 line-clamp-2">{row.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">{module !== 'contents' && row.priority && <PriorityPill priority={row.priority as Priority} size="sm" />}<span className="text-[11px] text-slate-500 flex items-center gap-1"><UserRound className="w-3.5 h-3.5" />{personOf(row)}</span></div>
                    </div>
                    <footer className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2"><span className="text-[11px] text-slate-500 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</span>{module === 'projects' && <Link to={detail(row.id)} aria-label={`باز کردن ${titleOf(row)}`} title="باز کردن پروژه" className="rounded-xl p-2 text-slate-400 hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-primary)]"><ChevronLeft className="h-4 w-4" /></Link>}</footer>
                  </article>
                ))}
              </div>
            )}
            {module === 'tasks' && selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-[var(--color-surface-muted)] px-4 py-3 text-xs" role="region" aria-label="اقدام گروهی وظیفه‌ها">
                <span className="font-black text-slate-700">{selectedIds.length.toLocaleString('fa-IR')} وظیفه از این صفحه انتخاب شده است</span>
                <Select aria-label="وضعیت مقصد برای اقدام گروهی" value={bulkStatus} onChange={event => setBulkStatus(event.target.value)} className="min-w-36 text-xs">
                  <option value="">انتخاب وضعیت مقصد…</option>
                  {orderedTaskStatuses.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
                </Select>
                <Button disabled={!bulkStatus || bulkBusy} onClick={() => setBulkConfirmOpen(true)}>تغییر وضعیت گروهی</Button>
                <Button variant="secondary" onClick={() => setSelectedIds([])}>لغو انتخاب</Button>
              </div>
            )}
            {module === 'tasks' && bulkReport && (
              <div className="border-t border-slate-100 px-4 py-3 text-xs" role="status">
                <p className="font-black text-slate-700">نتیجهٔ اقدام گروهی: {bulkReport.updated.toLocaleString('fa-IR')} وظیفه به‌روزرسانی شد، {bulkReport.failed.length.toLocaleString('fa-IR')} مورد انجام نشد.</p>
                {bulkReport.failed.length > 0 && (
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-slate-500">
                    {bulkReport.failed.slice(0, 8).map(failure => <li key={failure.id}>وظیفهٔ #{failure.id.toLocaleString('fa-IR')}: {failure.reason}</li>)}
                  </ul>
                )}
                <button type="button" onClick={() => setBulkReport(null)} className="mt-1.5 font-bold text-[var(--color-primary)]">بستن گزارش</button>
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



      {exportOpen && module === 'projects' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="خروجی پروژه‌ها">
          <button type="button" aria-label="بستن خروجی" onClick={() => setExportOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40" />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="text-base font-black text-slate-900">خروجی پروژه‌ها</h2>
              <button type="button" onClick={() => setExportOpen(false)} aria-label="بستن" className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-xs leading-6 text-slate-500">خروجی از همهٔ پروژه‌های مطابق فیلترهای فعال با همان مرتب‌سازی گرفته می‌شود — نه فقط صفحهٔ جاری. مقادیر، مقادیر خام سامانه‌اند و فایل برای Excel فارسی آماده است. این انتخاب، تنظیم ستون‌های ذخیره‌شدهٔ شما را تغییر نمی‌دهد.</p>
            <div className="mt-4 flex items-center gap-4 text-xs font-bold text-slate-700" role="radiogroup" aria-label="قالب فایل خروجی">
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="export-format" value="csv" checked={exportFormat === 'csv'} onChange={() => setExportFormat('csv')} />CSV</label>
              <label className="flex cursor-pointer items-center gap-2"><input type="radio" name="export-format" value="xlsx" checked={exportFormat === 'xlsx'} onChange={() => setExportFormat('xlsx')} />Excel (XLSX)</label>
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-400">مقادیر به‌صورت متن ذخیره می‌شوند و در Excel به‌عنوان فرمول اجرا نمی‌شوند.</p>
            <div className="mt-4 space-y-1.5">
              {EXPORT_COLUMNS.map(column => (
                <label key={column.api} className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={exportSelection.includes(column.api)}
                    onChange={() => setExportSelection(selection => selection.includes(column.api) ? selection.filter(item => item !== column.api) : [...selection, column.api])}
                    aria-label={`ستون خروجی ${column.label}`}
                  />
                  {column.label}
                </label>
              ))}
            </div>
            {exportMessage && <p role="status" className="mt-3 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-[11px] font-bold leading-5 text-[var(--color-primary)]">{exportMessage}</p>}
            <div className="mt-5 flex items-center gap-2">
              <Button onClick={() => void runExport()} disabled={exportBusy || exportSelection.length === 0} className="flex-1">{exportBusy ? 'در حال آماده‌سازی…' : exportFormat === 'xlsx' ? 'دریافت فایل Excel' : 'دریافت فایل CSV'}</Button>
              <Button variant="secondary" onClick={() => setExportOpen(false)}>بستن</Button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirmOpen && module === 'tasks' && (
        <ConfirmDialog
          open
          onClose={() => setBulkConfirmOpen(false)}
          onConfirm={() => void runBulkStatus()}
          busy={bulkBusy}
          title={`وضعیت ${selectedIds.length.toLocaleString('fa-IR')} وظیفهٔ انتخاب‌شده از همین صفحه به «${orderedTaskStatuses.find(status => status.id === bulkStatus)?.label || bulkStatus}» تغییر کند؟ هر وظیفه جداگانه بررسی و در سوابق ثبت می‌شود؛ موارد بدون مجوز بدون تغییر می‌مانند و در گزارش اعلام می‌شوند.`}
        />
      )}

      {filtersOpen && filterDraft && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="فیلترهای پیشرفته">
          <button type="button" aria-label="بستن فیلترها" onClick={() => setFiltersOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40" />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="text-base font-black text-slate-900">فیلترهای پیشرفته</h2>
              <button type="button" onClick={() => setFiltersOpen(false)} aria-label="بستن فیلترها" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <label className="block text-[11px] font-bold text-slate-600">جستجو
                <Input aria-label="جستجو در فهرست" value={filterDraft.search || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, search: event.target.value }))} className="mt-1.5 w-full text-xs" placeholder="جستجو…" />
              </label>
              {module === 'projects' && <label className="block text-[11px] font-bold text-slate-600">وضعیت
                <Select aria-label="فیلتر وضعیت" value={filterDraft.status || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, status: event.target.value }))} className="mt-1.5 w-full text-xs">
                  <option value="">همه وضعیت‌ها</option>
                  {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              </label>}
              {module === 'contents' && <label className="block text-[11px] font-bold text-slate-600">نوع محتوا
                <Select aria-label="فیلتر نوع محتوا" value={filterDraft.type || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, type: event.target.value }))} className="mt-1.5 w-full text-xs"><option value="">همه انواع</option>{app.contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
              </label>}
              {(module === 'tasks' || module === 'projects') && <label className="block text-[11px] font-bold text-slate-600">اولویت
                <Select aria-label="فیلتر اولویت" value={filterDraft.priority || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, priority: event.target.value }))} className="mt-1.5 w-full text-xs">
                  <option value="">همه</option><option value="urgent">فوری</option><option value="high">بالا</option><option value="medium">متوسط</option><option value="low">کم</option>
                </Select>
              </label>}
              {module === 'projects' && <label className="block text-[11px] font-bold text-slate-600">سررسید
                <Select aria-label="فیلتر سررسید" value={filterDraft.due || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, due: event.target.value }))} className="mt-1.5 w-full text-xs"><option value="">همه موعدها</option><option value="today">امروز</option><option value="overdue">عقب‌افتاده</option></Select>
              </label>}
              {module === 'tasks' && <label className="block text-[11px] font-bold text-slate-600">پروژه
                <Select aria-label="فیلتر پروژه" value={filterDraft.project_id || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, project_id: event.target.value }))} className="mt-1.5 w-full text-xs"><option value="">همه پروژه‌ها</option>{app.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</Select>
              </label>}
              {module === 'tasks' && <label className="block text-[11px] font-bold text-slate-600">محتوا
                <Select aria-label="فیلتر محتوا" value={filterDraft.content_id || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, content_id: event.target.value }))} className="mt-1.5 w-full text-xs"><option value="">همه محتواها</option>{app.contents.map(content => <option key={content.id} value={content.id}>{content.title}</option>)}</Select>
              </label>}
              {module === 'contents' && <label className="block text-[11px] font-bold text-slate-600">مالک
                <Select aria-label="مالک" value={filterDraft.owner || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, owner: event.target.value }))} className="mt-1.5 w-full text-xs"><option value="">همهٔ مجاز</option><option value="me">من</option></Select>
              </label>}
              {module === 'contents' && app.targetAudiences.length > 0 && <label className="block text-[11px] font-bold text-slate-600">مخاطب هدف
                <Select aria-label="فیلتر مخاطب هدف" value={filterDraft.target_audience || ''} onChange={event => setFilterDraft(draft => ({ ...draft!, target_audience: event.target.value }))} className="mt-1.5 w-full text-xs"><option value="">همه مخاطبان</option>{app.targetAudiences.map(audience => <option key={audience} value={audience}>{audience}</option>)}</Select>
              </label>}
              <fieldset className="rounded-2xl border border-slate-200 p-3.5">
                <legend className="px-1 text-[11px] font-bold text-slate-600">مرتب‌سازی چندستونه</legend>
                <p className="mb-3 text-[11px] leading-5 text-slate-500">با هر کلیک روی یک معیار: صعودی، سپس نزولی، سپس حذف. ترتیب افزودن معیارها، اولویت مرتب‌سازی است (حداکثر سه معیار).</p>
                <div className="space-y-1.5">
                  {SORTABLE_FIELDS[module].map(field => {
                    const index = draftSortSpec.findIndex(criterion => criterion.field === field);
                    const criterion = index >= 0 ? draftSortSpec[index] : null;
                    return (
                      <button key={field} type="button" onClick={() => cycleDraftSort(field)} aria-pressed={Boolean(criterion)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-bold ${criterion ? 'border-[var(--color-primary)] bg-[var(--color-surface-muted)] text-[var(--color-primary)]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        <span>{SORT_LABELS[field]}</span>
                        <span className="flex items-center gap-1.5 text-[11px]">
                          {criterion ? <>{(index + 1).toLocaleString('fa-IR')} · {criterion.direction === 'asc' ? 'صعودی' : 'نزولی'}{criterion.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}</> : 'بدون مرتب‌سازی'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {draftSortSpec.length > 0 && <p className="mt-3 text-[11px] font-bold text-slate-600" aria-live="polite">{sortLabel(draftSortSpec)}</p>}
              </fieldset>
            </div>
            <footer className="flex items-center gap-2 border-t border-slate-100 p-5">
              <Button onClick={applyFilters} className="flex-1">اعمال فیلترها</Button>
              <Button variant="secondary" onClick={() => setFilterDraft({})}>پاک‌کردن همه</Button>
            </footer>
          </aside>
        </div>
      )}

      {editingTask && <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />}
     </PageSurface>
    </section>
  );
};


const TaskWorkspaceCalendar: React.FC<{
  tasks: Task[];
  projects: Array<{ id: string; name: string; color?: string }>;
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onSelectTask: (id: string) => void;
}> = ({ tasks, currentDate, onDateChange, onSelectTask }) => {
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
        return <div key={day} className={`min-h-24 rounded-xl border p-2 ${today ? 'border-[var(--color-primary)] bg-[var(--color-surface-muted)]' : 'border-slate-200 bg-white'}`}><span className={`text-xs font-bold ${today ? 'text-[var(--color-primary)]' : 'text-slate-600'}`}>{day.toLocaleString('fa-IR')}</span><div className="mt-1.5 space-y-1">{dayTasks.map(task => {
          const priorityColor = ({ low: '#94a3b8', medium: '#0ea5e9', high: '#f59e0b', urgent: '#ef4444' } as const)[task.priority] || '#94a3b8';
          const statusColor = ({ backlog: '#64748b', in_progress: '#2563eb', review: '#39677c', completed: '#10b981', archived: '#94a3b8' } as const)[task.status] || '#64748b';
          return <button type="button" key={task.id} onClick={() => onSelectTask(task.id)} className="flex w-full min-w-0 items-center gap-1 rounded-md border-2 bg-slate-50 px-1.5 py-1 text-right text-[9px] font-bold text-slate-700" style={{ borderColor: priorityColor }}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor }} /><span className="truncate">{task.title}</span></button>;
        })}</div></div>;
      })}</div>
    </div>
  </div>;
};
