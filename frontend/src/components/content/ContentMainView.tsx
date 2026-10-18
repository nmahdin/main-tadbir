import { useContents } from '../../queries/resources';
import { useUrlFilter } from '../../routing/useUrlFilter';
import { ContentStatusBadge, contentStatusColor, contentStatusLabel, contentTypeBadgeStyle } from '../../utils/statusBadges';
import React, { useState } from 'react';
import { PublicationDateChip } from '../common/PublicationDateChip';
import { PublishingCalendar } from './PublishingCalendar';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { toPersianDigits } from '../../utils/jalali';
import { isPublishedContent, sortByPublicationMoment } from '../../utils/publicationTiming';
import { useApp } from '../../context/AppContext';
import { CreateContentModal } from './CreateContentModal';
import { EditContentModal } from './EditContentModal';
import { Content, ContentStatus } from '../../types';
import { ModuleErrorBanner } from '../common/Feedback';
import { Button } from '../common/Primitives';
import {
  Plus,
  Filter,
  FileText,
  Video,
  Image as ImageIcon,
  Mic,
  Layout,
  Clock,
  CheckCircle2,
  Edit3,
  Archive,
  LayoutGrid,
  List,
  Calendar as CalendarIcon,
  Flame,
  Copy,
  Sparkles,
  Layers,
  Inbox,
  Trash2
} from 'lucide-react';

type ContentViewMode = 'table' | 'kanban' | 'calendar';
type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'overdue';

/** هندسهٔ یکسان اکشن‌های سربرگ صفحه؛ در همهٔ دکمه‌های این ردیف استفاده می‌شود. */
const HEADER_ACTION_CLASS = 'min-h-7 !min-h-7 flex-1 justify-center !px-2.5 !py-1 text-[11px] sm:flex-none sm:w-36 whitespace-nowrap inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50';

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: 'all', label: 'همه بازه‌ها' },
  { id: 'today', label: 'مهلت امروز' },
  { id: 'week', label: 'این هفته' },
  { id: 'month', label: 'این ماه' },
  { id: 'overdue', label: 'عقب‌افتاده' },
];

export const ContentMainView: React.FC = () => {
  const { data: contents = [] } = useContents();
  const {
    users,
    contentTypes,
    contentStatuses,
    setActiveView,
    setSelectedContentId,
    hasPermission,
    duplicateContent,
    pendingMutationKeys,
    archiveItem,
    forceDeleteContent
  } = useApp();
  const [statusFilter, setStatusFilter] = useUrlFilter<ContentStatus | 'all'>('status', 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [viewMode, setViewMode] = useUrlFilter<ContentViewMode>('view', 'table');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [contentToEdit, setContentToEdit] = useState<Content | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
      case 'motion': return <Video className="h-3.5 w-3.5 text-current" />;
      case 'photo':
      case 'poster': return <ImageIcon className="h-3.5 w-3.5 text-current" />;
      case 'podcast':
      case 'interview': return <Mic className="h-3.5 w-3.5 text-current" />;
      case 'article':
      case 'news':
      case 'report': return <FileText className="h-3.5 w-3.5 text-current" />;
      default: return <Layout className="h-3.5 w-3.5 text-current" />;
    }
  };

  const typeName = (typeId: string) =>
    contentTypes.find(ct => ct.id === typeId)?.name || typeId;

  // رنگ نشانگر نوع محتوا از خودِ نوع خوانده می‌شود؛ پیاده‌سازی مشترک با فهرست سامانه.
  const typeBadgeStyle = (typeId: string) => contentTypeBadgeStyle(contentTypes.find(type => type.id === typeId)?.color);

  const workflowProgress = (content: Content) => {
    const stages = [...(content.stages || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    const total = stages.length;
    const done = stages.filter(stage => ['completed', 'approved', 'skipped'].includes(stage.status)).length;
    const activeIndex = Math.max(0, stages.findIndex(stage => !['completed', 'approved', 'skipped'].includes(stage.status)));
    const current = total ? (done >= total ? total : activeIndex + 1) : 0;
    const percentage = total ? Math.max(0, Math.min(100, Math.round(content.progress ?? (done / total) * 100))) : 0;
    return { total, current, percentage };
  };

  const daysOverdue = (deadline?: string): number => {
    if (!deadline) return 0;
    const diff = new Date(todayStr).getTime() - new Date(deadline).getTime();
    return Math.floor(diff / 86400000);
  };

  const OverdueBadge: React.FC<{ deadline?: string }> = ({ deadline }) => {
    const overdue = daysOverdue(deadline);
    if (overdue <= 0) return null;
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
        <Flame className="w-3 h-3" />
        {toPersianDigits(overdue)} روز تأخیر
      </span>
    );
  };

  const isTerminal = (status: ContentStatus) =>
    status === 'published' || status === 'cancelled' || status === 'archived';

  const filteredContents = contents.filter(c => {
    if (c.status === 'archived' || c.status === 'published') return false;
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    let matchesTime = true;
    if (deadlineFrom && (!c.deadline || c.deadline < deadlineFrom)) return false;
    if (deadlineTo && (!c.deadline || c.deadline > deadlineTo)) return false;
    if (timeFilter === 'today') {
      matchesTime = c.deadline === todayStr;
    } else if (timeFilter === 'week') {
      if (!c.deadline) return false;
      const d = new Date(c.deadline).getTime();
      const now = new Date(todayStr).getTime();
      matchesTime = d >= now && d <= now + 7 * 86400000;
    } else if (timeFilter === 'month') {
      if (!c.deadline) return false;
      matchesTime = c.deadline.slice(0, 7) === todayStr.slice(0, 7);
    } else if (timeFilter === 'overdue') {
      matchesTime = !!c.deadline && !isTerminal(c.status) && daysOverdue(c.deadline) > 0;
    }
    return matchesStatus && matchesType && matchesTime;
  });

  // ترتیب نمایش از بالا به پایین همیشه بر پایهٔ تاریخ انتشار است و از همان قاعدهٔ
  // ترتیب مشترک صفحهٔ انتشار می‌آید: زمان‌بندی‌شده‌ها از نزدیک‌ترین تاریخ،
  // منتشرشده‌ها از تازه‌ترین و پروندهٔ بدون تاریخ انتشار در پایان فهرست.
  const orderedContents = sortByPublicationMoment(filteredContents, content => ({
    date: content.publishInfo?.date,
    time: content.publishInfo?.time,
    published: isPublishedContent(content),
  }));

  const activeFilterCount = [typeFilter !== 'all', timeFilter !== 'all', Boolean(deadlineFrom), Boolean(deadlineTo)].filter(Boolean).length;
  const clearFilters = () => { setTypeFilter('all'); setTimeFilter('all'); setDeadlineFrom(''); setDeadlineTo(''); };

  const kanbanColumns = [...contentStatuses]
    .sort((a, b) => a.order - b.order)
    .filter(st => st.id !== 'archived' && st.id !== 'published');

  /**
   * وضعیت‌های مشتق (مانند «تأخیر») نباید به دلیل نبودن در تنظیمات سازمان از تخته
   * و پالایه ناپدید شوند؛ هر وضعیتی که در داده هست، ستون و تب خودش را می‌گیرد.
   */
  const unlistedStatusColumns = [...new Set(contents.map(content => content.status))]
    .filter(status => status !== 'archived' && status !== 'published' && !kanbanColumns.some(column => column.id === status))
    .map(status => ({ id: status, label: contentStatusLabel(status), color: contentStatusColor(status), order: kanbanColumns.length + 1 }));
  const statusColumns = [...kanbanColumns, ...unlistedStatusColumns];

  const handleOpenContent = (id: string) => {
    setSelectedContentId(id);
    setActiveView('content-detail');
  };

  const publisherOf = (content: Content) => users.find(u => u.id === content.publisherId);

  const totalCount = contents.filter(c => c.status !== 'archived' && c.status !== 'published').length;
  const overdueCount = contents.filter(c => c.deadline && !isTerminal(c.status) && daysOverdue(c.deadline) > 0).length;
  const todayCount = contents.filter(c => c.deadline === todayStr && !isTerminal(c.status)).length;

  return (
    <div className="space-y-4 animate-in fade-in duration-300" dir="rtl">
      <ModuleErrorBanner modules={['contents', 'departments']} label="مدیریت محتوا" />

      {/* ── Header: کارت اصلی با آمار ── */}
      <div className="relative overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
        {/* decorative gradient */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-indigo-50 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 -bottom-16 h-40 w-40 rounded-full bg-sky-50 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
                <Layers className="h-4 w-4" />
              </span>
              <h1 className="text-[18px] font-black tracking-tight text-slate-900 sm:text-[20px]">مدیریت و تولید محتوا</h1>
              <span className="hidden items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 sm:inline-flex">
                <Sparkles className="h-3 w-3" />
                مرتب‌سازی: نزدیک‌ترین انتشار
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[12px] font-medium leading-6 text-slate-500">چرخهٔ ایده‌پردازی، تولید رسانه‌ای، بازبینی و آماده‌سازی انتشار — همهٔ محتوا بر اساس نزدیک‌ترین زمان انتشار مرتب شده است.</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
                <Inbox className="h-3 w-3" />
                {toPersianDigits(totalCount)} محتوا
              </span>
              {todayCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                  امروز: {toPersianDigits(todayCount)}
                </span>
              )}
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                  <Flame className="h-3 w-3" />
                  {toPersianDigits(overdueCount)} عقب‌افتاده
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                نمایش: {toPersianDigits(orderedContents.length)}
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2.5 lg:w-auto lg:items-end">
            {/* View switcher + actions in one row on mobile, two rows on desktop */}
            <div className="flex items-center gap-2 self-stretch lg:self-auto">
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-2xs">
                <button
                  onClick={() => setViewMode('table')}
                  title="نمای جدول"
                  aria-label="نمای جدول"
                  className={`!min-h-7 !min-w-7 flex items-center justify-center rounded-lg !p-1.5 text-[11px] font-bold transition-all ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  title="نمای کانبان"
                  aria-label="نمای کانبان"
                  className={`!min-h-7 !min-w-7 flex items-center justify-center rounded-lg !p-1.5 text-[11px] font-bold transition-all ${viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  title="نمای تقویم"
                  aria-label="نمای تقویم"
                  className={`!min-h-7 !min-w-7 flex items-center justify-center rounded-lg !p-1.5 text-[11px] font-bold transition-all ${viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <CalendarIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="h-7 w-px bg-slate-200 hidden sm:block" />
              <div className="flex flex-1 items-center gap-1.5 sm:flex-none">
                {hasPermission('content.create') && (
                  <button
                    type="button"
                    onClick={() => setActiveView('content-publishing')}
                    className={HEADER_ACTION_CLASS}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    میز انتشار
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveView('content-published')}
                  className={HEADER_ACTION_CLASS}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  محتوای منتشرشده
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className={HEADER_ACTION_CLASS}
                  style={{ backgroundColor: '#4f46e5', color: 'white', borderColor: '#4f46e5' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  محتوای جدید
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status tabs: چیپ‌های فیلتر وضعیت ── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xs scrollbar-thin" role="tablist" aria-label="وضعیت محتوا">
        <button
          type="button"
          role="tab"
          aria-selected={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${statusFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          همه محتواها
        </button>
        {statusColumns.map(status => <button key={status.id} type="button" role="tab" aria-selected={statusFilter === status.id} onClick={() => setStatusFilter(status.id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-colors ${statusFilter === status.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'} ${statusFilter === status.id ? 'shadow-sm' : ''}`}>

            <span className={`h-2 w-2 rounded-full ${statusFilter === status.id ? 'ring-2 ring-white/40' : ''}`} style={{ backgroundColor: status.color }} />
            {status.label}
          </button>)}
      </div>

      {/* ── Filters ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(open => !open)}
            className={`ui-button ui-button-secondary !min-h-7 !px-2.5 !py-1 text-[11px] ${activeFilterCount > 0 ? '!border-indigo-300 !bg-indigo-50 !text-indigo-700' : ''}`}
          >
            <Filter className="w-3.5 h-3.5" />
            فیلترها
            {activeFilterCount > 0 && <span className="min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">{toPersianDigits(activeFilterCount)}</span>}
          </button>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <span className="hidden sm:inline">مرتب‌سازی:</span>
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">نزدیک‌ترین انتشار → دورترین</span>
          </div>
        </div>

        {filtersOpen && (
          <div className="border-t border-slate-100 bg-slate-50/70 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-[11px] font-bold text-slate-600">
                نوع محتوا
                <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-2xs">
                  <option value="all">همه انواع</option>
                  {contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-bold text-slate-600">
                بازه زمانی
                <select value={timeFilter} onChange={event => setTimeFilter(event.target.value as TimeFilter)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-2xs">
                  {TIME_FILTERS.map(filter => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
                </select>
              </label>
              <PersianDatePicker
                label="مهلت از تاریخ"
                value={deadlineFrom}
                onChange={value => { setDeadlineFrom(value); if (value && deadlineTo && value > deadlineTo) setDeadlineTo(value); }}
                placeholder="بدون محدودیت"
                className="w-full"
                portal
              />
              <PersianDatePicker
                label="مهلت تا تاریخ"
                value={deadlineTo}
                onChange={value => { setDeadlineTo(value); if (value && deadlineFrom && value < deadlineFrom) setDeadlineFrom(value); }}
                placeholder="بدون محدودیت"
                className="w-full"
                portal
              />
            </div>
            {activeFilterCount > 0 && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={clearFilters} className="ui-button ui-button-ghost !min-h-7 !px-2.5 !py-1 text-[11px]">پاک‌کردن فیلترها</button>
              </div>
            )}
          </div>
        )}

        {(activeFilterCount > 0 || statusFilter !== 'all') && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-white px-3 py-2.5">
            <span className="text-[10px] font-bold text-slate-500">فیلترهای فعال:</span>
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">
                وضعیت: {statusColumns.find(s => s.id === statusFilter)?.label || statusFilter}
                <button type="button" onClick={() => setStatusFilter('all')} className="ml-1 rounded-full p-0.5 hover:bg-indigo-100">×</button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">
                نوع: {contentTypes.find(t => t.id === typeFilter)?.name || typeFilter}
                <button type="button" onClick={() => setTypeFilter('all')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
              </span>
            )}
            {timeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">
                بازه: {TIME_FILTERS.find(f => f.id === timeFilter)?.label || timeFilter}
                <button type="button" onClick={() => setTimeFilter('all')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
              </span>
            )}
            {deadlineFrom && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">
                از: {deadlineFrom}
                <button type="button" onClick={() => setDeadlineFrom('')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
              </span>
            )}
            {deadlineTo && (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700">
                تا: {deadlineTo}
                <button type="button" onClick={() => setDeadlineTo('')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Content area ── */}
      <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
        {/* ── Table view ── */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-black tracking-wide text-slate-500">
                  <th className="p-3.5 pr-4 whitespace-nowrap">عنوان محتوا</th>
                  <th className="p-3.5 whitespace-nowrap">نوع</th>
                  <th className="p-3.5 whitespace-nowrap">وضعیت</th>
                  <th className="p-3.5 whitespace-nowrap">منتشرکننده</th>
                  <th className="p-3.5 whitespace-nowrap">تاریخ انتشار</th>
                  <th className="p-3.5 pl-4 w-[200px] whitespace-nowrap text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderedContents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="mx-auto max-w-sm">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                          <Inbox className="h-6 w-6" />
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-600">هیچ محتوایی یافت نشد</p>
                        <p className="mt-1 text-[11px] text-slate-400">فیلترها را تغییر دهید یا محتوای جدید بسازید.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  orderedContents.map(content => {
                    const publisher = publisherOf(content);
                    const progress = workflowProgress(content);
                    return (
                      <tr
                        key={content.id}
                        className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                        onClick={() => handleOpenContent(content.id)}
                      >
                        <td className="p-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[11px] shadow-2xs" style={typeBadgeStyle(content.type)}>
                              {getTypeIcon(content.type)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="truncate text-[13px] font-bold leading-5 text-slate-900 transition-colors group-hover:text-indigo-600">{content.title}</h4>
                                <span dir="ltr" className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-600">{content.code || 'کد عمومی'}</span>
                              </div>
                              <p className={`mt-0.5 max-w-[260px] truncate text-[10px] font-bold ${content.seriesName ? 'text-indigo-600' : 'text-slate-400'}`}>{content.seriesName || 'عمومی'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-bold" style={typeBadgeStyle(content.type)}>{typeName(content.type)}</span>
                        </td>
                        <td className="min-w-44 p-3">
                          <ContentStatusBadge status={content.status} />
                          <div className="mt-2 w-36 max-w-full">
                            <div className="mb-1 flex items-center justify-between text-[9px] font-bold text-slate-500">
                              <span>مرحله {toPersianDigits(progress.current)} از {toPersianDigits(progress.total)}</span>
                              <span>{toPersianDigits(progress.percentage)}٪</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage} aria-label={`پیشرفت جریان محتوا ${progress.percentage} درصد`}>
                              <span className="block h-full rounded-full transition-[width]" style={{ width: `${progress.percentage}%`, backgroundColor: contentStatuses.find(status => status.id === content.status)?.color || '#4f46e5' }} />
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          {publisher ? (
                            <div className="flex items-center gap-2">
                              <img src={publisher.avatar} alt={publisher.name} className="h-6 w-6 rounded-full object-cover ring-1 ring-slate-200" />
                              <span className="text-xs font-medium text-slate-700">{publisher.name}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">ناشر تعیین نشده</span>
                          )}
                        </td>
                        <td className="p-3"><PublicationDateChip content={content} /></td>
                        <td className="p-3 pl-4 text-left">
                          <div className="flex items-center justify-end gap-1">
                            {hasPermission('content.create') && (
                              <button
                                type="button"
                                disabled={pendingMutationKeys.includes('contents:create')}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void duplicateContent(content.id);
                                }}
                                title="ساخت یک کپی از محتوا"
                                className="inline-flex !min-h-7 cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white !px-2.5 !py-1 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
                              >
                                <Copy className="h-3.5 w-3.5 text-slate-500" />
                                <span>کپی</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setContentToEdit(content);
                              }}
                              title="ویرایش محتوا"
                              className="inline-flex !min-h-7 cursor-pointer items-center gap-1 rounded-xl bg-indigo-50 !px-2.5 !py-1 text-[11px] font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>ویرایش</span>
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (confirm(`«${content.title}» بایگانی شود؟`)) {
                                  archiveItem('content', content.id);
                                }
                              }}
                              title="بایگانی محتوا"
                              className="inline-flex !min-h-7 cursor-pointer items-center gap-1 rounded-xl bg-slate-100 !px-2.5 !py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-200"
                            >
                              <Archive className="w-3.5 h-3.5" />
                              <span>بایگانی</span>
                            </button>
                            {hasPermission('content.force_delete') && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (confirm(`«${content.title}» حذف شود؟ فقط تسک‌های مربوط به آن حذف می‌شوند و دارایی‌ها باقی می‌مانند.`)) {
                                    void forceDeleteContent(content.id);
                                  }
                                }}
                                title="حذف محتوا (فقط تسک‌ها حذف می‌شوند)"
                                className="inline-flex !min-h-7 cursor-pointer items-center gap-1 rounded-xl bg-rose-50 !px-2.5 !py-1 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Kanban view ── */}
        {viewMode === 'kanban' && (
          <div className="p-3 overflow-x-auto bg-slate-50/50">
            <div className="flex gap-3 min-w-max">
              {statusColumns.map(col => {
                const colItems = orderedContents.filter(c => c.status === col.id);
                return (
                  <div key={col.id} className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col max-h-[72vh]">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                        <h3 className="text-xs font-extrabold text-slate-800">{col.label}</h3>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {toPersianDigits(colItems.length)}
                      </span>
                    </div>
                    <div className="p-2 space-y-2 overflow-y-auto">
                      {colItems.map(content => {
                        const publisher = publisherOf(content);
                        return (
                          <div
                            key={content.id}
                            onClick={() => handleOpenContent(content.id)}
                            className="group rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-start gap-1.5">
                                  <h4 className="text-[12px] font-extrabold leading-5 text-slate-900 line-clamp-2">{content.title}</h4>
                                  <span dir="ltr" className="shrink-0 rounded-md bg-slate-100 px-1 py-0.5 font-mono text-[8px] font-bold text-slate-500">{content.code || 'کد'}</span>
                                </div>
                                <p className={`mt-1 truncate text-[10px] font-bold ${content.seriesName ? 'text-indigo-600' : 'text-slate-400'}`}>{content.seriesName || 'عمومی'}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {hasPermission('content.create') && (
                                  <button
                                    type="button"
                                    aria-label={`کپی ${content.title}`}
                                    title="ساخت کپی"
                                    disabled={pendingMutationKeys.includes('contents:create')}
                                    onClick={event => { event.stopPropagation(); void duplicateContent(content.id); }}
                                    className="rounded-lg border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                )}
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg border" style={typeBadgeStyle(content.type)}>{getTypeIcon(content.type)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="rounded-lg border px-2 py-0.5 text-[10px] font-bold" style={typeBadgeStyle(content.type)}>{typeName(content.type)}</span>
                              {!isTerminal(content.status) && <OverdueBadge deadline={content.deadline} />}
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {publisher && <img src={publisher.avatar} alt={publisher.name} className="h-5 w-5 rounded-full object-cover ring-1 ring-slate-200" />}
                                <span className="truncate text-[10px] font-medium text-slate-500">{publisher?.name || 'ناشر تعیین نشده'}</span>
                              </div>
                              <div className="shrink-0">
                                <PublicationDateChip content={content} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {colItems.length === 0 && (
                        <p className="text-[11px] text-slate-400 text-center py-8 font-medium">موردی در این ستون نیست</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Calendar view: تقویم انتشار مشترک سامانه ── */}
        {viewMode === 'calendar' && (
          <div className="p-3 sm:p-4 bg-slate-50/30">
            <PublishingCalendar
              contents={orderedContents}
              title="تقویم انتشار محتوا (شمسی)"
              onSelectContent={handleOpenContent}
            />
            {orderedContents.length === 0 && <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center text-[11px] font-bold text-slate-500">با فیلترهای فعلی محتوایی برای نمایش در تقویم نیست.</p>}
          </div>
        )}
      </div>

      <CreateContentModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <EditContentModal
        isOpen={contentToEdit !== null}
        onClose={() => setContentToEdit(null)}
        content={contentToEdit}
      />
    </div>
  );
};
