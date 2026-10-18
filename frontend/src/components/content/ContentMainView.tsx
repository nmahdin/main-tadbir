import { useContents } from '../../queries/resources';
import { useUrlFilter } from '../../routing/useUrlFilter';
import { ContentStatusBadge, contentStatusColor, contentStatusLabel, contentTypeBadgeStyle } from '../../utils/statusBadges';
import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
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
  AlertCircle,
  Edit3,
  Archive,
  LayoutGrid,
  List,
  Calendar as CalendarIcon,
  Flame,
  Copy
} from 'lucide-react';

type ContentViewMode = 'table' | 'kanban' | 'calendar';
type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'overdue';

/** هندسهٔ یکسان اکشن‌های سربرگ صفحه؛ در همهٔ دکمه‌های این ردیف استفاده می‌شود. */
const HEADER_ACTION_CLASS = 'min-h-8 flex-1 justify-center px-3 py-1.5 text-xs sm:flex-none';

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
    archiveItem
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
      case 'motion': return <Video className="h-4 w-4 text-current" />;
      case 'photo':
      case 'poster': return <ImageIcon className="h-4 w-4 text-current" />;
      case 'podcast':
      case 'interview': return <Mic className="h-4 w-4 text-current" />;
      case 'article':
      case 'news':
      case 'report': return <FileText className="h-4 w-4 text-current" />;
      default: return <Layout className="h-4 w-4 text-current" />;
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
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


  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      <ModuleErrorBanner modules={['contents', 'departments']} label="مدیریت محتوا" />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">مدیریت و تولید محتوا</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">چرخه ایده‌پردازی، تولید رسانه‌ای، بازبینی و آماده‌سازی انتشار</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          {/* View switcher */}
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-2xs">
            <button
              onClick={() => setViewMode('table')}
              title="نمای جدول"
              className={`p-2 rounded-lg transition-colors cursor-pointer ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="نمای کانبان"
              className={`p-2 rounded-lg transition-colors cursor-pointer ${viewMode === 'kanban' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              title="نمای تقویم"
              className={`p-2 rounded-lg transition-colors cursor-pointer ${viewMode === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <CalendarIcon className="w-4 h-4" />
            </button>
          </div>
          {hasPermission('content.create') && <Button
            variant="secondary"
            onClick={() => setActiveView('content-publishing')}
            className={HEADER_ACTION_CLASS}
          >
            <Clock className="w-4 h-4" />
            میز انتشار
          </Button>}
          <Button
            variant="secondary"
            onClick={() => setActiveView('content-published')}
            className="min-h-7 flex-1 justify-center px-2.5 py-1 text-[11px] sm:flex-none"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            محتوای منتشرشده
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
            className={HEADER_ACTION_CLASS}
          >
            <Plus className="w-4 h-4" />
            محتوای جدید
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="وضعیت محتوا">
        <button type="button" role="tab" aria-selected={statusFilter === 'all'} onClick={() => setStatusFilter('all')} className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold ${statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>همه محتواها</button>
        {statusColumns.map(status => <button key={status.id} type="button" role="tab" aria-selected={statusFilter === status.id} onClick={() => setStatusFilter(status.id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${statusFilter === status.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><span className={`h-2 w-2 rounded-full ${statusFilter === status.id ? 'ring-2 ring-white/40' : ''}`} style={{ backgroundColor: status.color }} />{status.label}</button>)}
      </div>

      <div className="flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="border-b border-slate-100 bg-slate-50/60 p-3 sm:p-4 space-y-3">
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)} className={`ui-button ui-button-secondary text-xs ${activeFilterCount > 0 ? '!border-indigo-300 !text-indigo-700' : ''}`}>
            <Filter className="w-4 h-4" />فیلترها
            {activeFilterCount > 0 && <span className="min-w-5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">{toPersianDigits(activeFilterCount)}</span>}
          </button>
          {filtersOpen && <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <label className="text-[11px] font-bold text-slate-600">نوع محتوا
              <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="mt-1.5 block min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">
                <option value="all">همه انواع</option>
                {contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-600">بازه زمانی
              <select value={timeFilter} onChange={event => setTimeFilter(event.target.value as TimeFilter)} className="mt-1.5 block min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">
                {TIME_FILTERS.map(filter => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
              </select>
            </label>
            <PersianDatePicker
              label="مهلت از تاریخ"
              value={deadlineFrom}
              onChange={value => { setDeadlineFrom(value); if (value && deadlineTo && value > deadlineTo) setDeadlineTo(value); }}
              placeholder="بدون محدودیت"
              className="min-w-40"
              portal
            />
            <PersianDatePicker
              label="مهلت تا تاریخ"
              value={deadlineTo}
              onChange={value => { setDeadlineTo(value); if (value && deadlineFrom && value < deadlineFrom) setDeadlineFrom(value); }}
              placeholder="بدون محدودیت"
              className="min-w-40"
              portal
            />
            {activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="ui-button ui-button-ghost text-xs">پاک‌کردن فیلترها</button>}
          </div>}
          {(activeFilterCount > 0 || statusFilter !== 'all') && (
            <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
              <span className="text-[10px] font-bold text-slate-500">فیلترهای فعال:</span>
              {statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                  وضعیت: {statusColumns.find(s => s.id === statusFilter)?.label || statusFilter}
                  <button type="button" onClick={() => setStatusFilter('all')} className="ml-1 rounded-full p-0.5 hover:bg-indigo-100">×</button>
                </span>
              )}
              {typeFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 border border-slate-200">
                  نوع: {contentTypes.find(t => t.id === typeFilter)?.name || typeFilter}
                  <button type="button" onClick={() => setTypeFilter('all')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
                </span>
              )}
              {timeFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 border border-slate-200">
                  بازه: {TIME_FILTERS.find(f => f.id === timeFilter)?.label || timeFilter}
                  <button type="button" onClick={() => setTimeFilter('all')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
                </span>
              )}
              {deadlineFrom && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 border border-slate-200">
                  از: {deadlineFrom}
                  <button type="button" onClick={() => setDeadlineFrom('')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
                </span>
              )}
              {deadlineTo && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 border border-slate-200">
                  تا: {deadlineTo}
                  <button type="button" onClick={() => setDeadlineTo('')} className="ml-1 rounded-full p-0.5 hover:bg-slate-200">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Table view ── */}
        {viewMode === 'table' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-4 whitespace-nowrap">عنوان محتوا</th>
                  <th className="p-4 whitespace-nowrap">نوع</th>
                  <th className="p-4 whitespace-nowrap">وضعیت</th>
                  <th className="p-4 whitespace-nowrap">منتشرکننده</th>
                  <th className="p-4 whitespace-nowrap">تاریخ انتشار</th>
                  <th className="p-4 w-64 whitespace-nowrap">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderedContents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-sm text-slate-500">
                      هیچ محتوایی یافت نشد.
                    </td>
                  </tr>
                ) : (
                  orderedContents.map(content => {
                    const publisher = publisherOf(content);
                    const progress = workflowProgress(content);
                    return (
                      <tr
                        key={content.id}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        onClick={() => handleOpenContent(content.id)}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={typeBadgeStyle(content.type)}>
                              {getTypeIcon(content.type)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2"><h4 className="truncate text-sm font-bold text-slate-900 transition-colors group-hover:text-indigo-600">{content.title}</h4><span dir="ltr" className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-600">{content.code || 'کد عمومی'}</span></div>
                              <p className={`mt-1 max-w-[280px] truncate text-[10px] font-bold ${content.seriesName ? 'text-indigo-600' : 'text-slate-400'}`}>{content.seriesName || 'عمومی'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-bold" style={typeBadgeStyle(content.type)}>{typeName(content.type)}</span>
                        </td>
                        <td className="min-w-44 p-4">
                          <ContentStatusBadge status={content.status} />
                          <div className="mt-2 w-40 max-w-full"><div className="mb-1 flex items-center justify-between text-[9px] font-bold text-slate-500"><span>مرحله {toPersianDigits(progress.current)} از {toPersianDigits(progress.total)}</span><span>{toPersianDigits(progress.percentage)}٪</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage} aria-label={`پیشرفت جریان محتوا ${progress.percentage} درصد`}><span className="block h-full rounded-full transition-[width]" style={{ width: `${progress.percentage}%`, backgroundColor: contentStatuses.find(status => status.id === content.status)?.color || '#4f46e5' }} /></div></div>
                        </td>
                        <td className="p-4">
                          {publisher ? (
                            <div className="flex items-center gap-2">
                              <img src={publisher.avatar} alt={publisher.name} className="w-6 h-6 rounded-full object-cover" />
                              <span className="text-xs font-medium text-slate-700">{publisher.name}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">ناشر تعیین نشده</span>
                          )}
                        </td>
                        <td className="p-4"><PublicationDateChip content={content} /></td>
                        <td className="p-4 text-left">
                          <div className="flex items-center justify-end gap-2">
                            {hasPermission('content.create') && <button
                              type="button"
                              disabled={pendingMutationKeys.includes('contents:create')}
                              onClick={(event) => {
                                event.stopPropagation();
                                void duplicateContent(content.id);
                              }}
                              title="ساخت یک کپی از محتوا"
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              <Copy className="h-4 w-4 text-slate-500" />
                              <span>کپی</span>
                            </button>}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setContentToEdit(content);
                              }}
                              title="ویرایش محتوا"
                              className="px-3 py-2 rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                            >
                              <Edit3 className="w-4 h-4" />
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
                              className="px-3 py-2 rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold"
                            >
                              <Archive className="w-4 h-4" />
                              <span>بایگانی</span>
                            </button>
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
          <div className="p-4 overflow-x-auto">
            <div className="flex gap-3 min-w-max">
              {statusColumns.map(col => {
                const colItems = orderedContents.filter(c => c.status === col.id);
                return (
                  <div key={col.id} className="w-72 shrink-0 bg-slate-50 rounded-2xl border border-slate-200/70 flex flex-col max-h-[70vh]">
                    <div className="p-3 border-b border-slate-200/70 flex items-center justify-between sticky top-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                        <h3 className="text-xs font-extrabold text-slate-800">{col.label}</h3>
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">
                        {toPersianDigits(colItems.length)}
                      </span>
                    </div>
                    <div className="p-2.5 space-y-2.5 overflow-y-auto">
                      {colItems.map(content => {
                        const publisher = publisherOf(content);
                        return (
                          <div
                            key={content.id}
                            onClick={() => handleOpenContent(content.id)}
                            className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0"><div className="flex items-start gap-1.5"><h4 className="text-xs font-extrabold leading-relaxed text-slate-900">{content.title}</h4><span dir="ltr" className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-500">{content.code || 'کد عمومی'}</span></div><p className={`mt-1 truncate text-[10px] font-bold ${content.seriesName ? 'text-indigo-600' : 'text-slate-400'}`}>{content.seriesName || 'عمومی'}</p></div>
                              <div className="flex shrink-0 items-center gap-1">{hasPermission('content.create') && <button type="button" aria-label={`کپی ${content.title}`} title="ساخت کپی" disabled={pendingMutationKeys.includes('contents:create')} onClick={event => { event.stopPropagation(); void duplicateContent(content.id); }} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" /></button>}{getTypeIcon(content.type)}</div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="rounded-lg border px-2 py-0.5 text-[10px] font-bold" style={typeBadgeStyle(content.type)}>{typeName(content.type)}</span>
                              {!isTerminal(content.status) && <OverdueBadge deadline={content.deadline} />}
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <div className="flex items-center gap-1.5">
                                {publisher && (
                                  <img src={publisher.avatar} alt={publisher.name} className="w-5 h-5 rounded-full object-cover" />
                                )}
                                <span className="text-[10px] font-medium text-slate-500">
                                  {publisher?.name || 'ناشر تعیین نشده'}
                                </span>
                              </div>
                              <div className="text-left">
                                <PublicationDateChip content={content} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {colItems.length === 0 && (
                        <p className="text-[11px] text-slate-400 text-center py-6 font-medium">
                          موردی در این ستون نیست
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Calendar view: تقویم انتشار مشترک سامانه (ماهانه/هفتگی/سه‌هفتگی) ── */}
        {viewMode === 'calendar' && (
          <div className="p-4">
            <PublishingCalendar
              contents={orderedContents}
              title="تقویم انتشار محتوا (شمسی)"
              onSelectContent={handleOpenContent}
            />
            {orderedContents.length === 0 && <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-[11px] font-bold text-slate-500">با فیلترهای فعلی محتوایی برای نمایش در تقویم نیست.</p>}
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
