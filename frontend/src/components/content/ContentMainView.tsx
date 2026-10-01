import { useContents } from '../../queries/resources';
import { useUrlFilter } from '../../routing/useUrlFilter';
import { ContentStatusBadge } from '../../utils/statusBadges';
import React, { useState } from 'react';
import { formatPersianDate } from '../../utils/date';
import { parseToJalali, jalaliToGregorian, getDaysInJalaliMonth, PERSIAN_MONTH_NAMES, PERSIAN_DAY_NAMES_SHORT, toPersianDigits } from '../../utils/jalali';
import { useApp } from '../../context/AppContext';
import { CreateContentModal } from './CreateContentModal';
import { EditContentModal } from './EditContentModal';
import { Content, ContentStatus } from '../../types';
import { ModuleErrorBanner } from '../common/Feedback';
import { CalendarEventKindIcon } from '../calendar/CalendarKindIcon';
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
  ChevronLeft,
  ChevronRight,
  Flame
} from 'lucide-react';

type ContentViewMode = 'table' | 'kanban' | 'calendar';
type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'overdue';

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

    departments,
    users,
    contentTypes,
    contentStatuses,
    setActiveView,
    setSelectedContentId,
    hasPermission,
    archiveItem
  } = useApp();
  const [statusFilter, setStatusFilter] = useUrlFilter<ContentStatus | 'all'>('status', 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [viewMode, setViewMode] = useUrlFilter<ContentViewMode>('view', 'table');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [contentToEdit, setContentToEdit] = useState<Content | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
      case 'motion': return <Video className="w-4 h-4 text-rose-500" />;
      case 'photo':
      case 'poster': return <ImageIcon className="w-4 h-4 text-emerald-500" />;
      case 'podcast':
      case 'interview': return <Mic className="w-4 h-4 text-purple-500" />;
      case 'article':
      case 'news':
      case 'report': return <FileText className="w-4 h-4 text-blue-500" />;
      default: return <Layout className="w-4 h-4 text-slate-500" />;
    }
  };

  const typeName = (typeId: string) =>
    contentTypes.find(ct => ct.id === typeId)?.name || typeId;

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

  const kanbanColumns = [...contentStatuses]
    .sort((a, b) => a.order - b.order)
    .filter(st => st.id !== 'archived' && st.id !== 'published');

  const handleOpenContent = (id: string) => {
    setSelectedContentId(id);
    setActiveView('content-detail');
  };

  const publisherOf = (content: Content) => users.find(u => u.id === content.publisherId);

  // ── Calendar cells (Jalali month grid) ──
  const jCursor = parseToJalali(calendarCursor);
  const jy = jCursor.jy;
  const jm = jCursor.jm;
  const daysInMonth = getDaysInJalaliMonth(jy, jm);
  const { gy: gy1, gm: gm1, gd: gd1 } = jalaliToGregorian(jy, jm, 1);
  const iranOffset = (new Date(gy1, gm1 - 1, gd1).getDay() + 1) % 7;
  const totalCells = Math.ceil((daysInMonth + iranOffset) / 7) * 7;
  const calendarCells: { dateStr: string; dayNumber: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - iranOffset + 1;
    let cellJy = jy;
    let cellJm = jm;
    let cellJd = dayNumber;
    let isCurrentMonth = true;
    if (dayNumber < 1) {
      isCurrentMonth = false;
      if (jm === 1) { cellJy = jy - 1; cellJm = 12; } else { cellJm = jm - 1; }
      cellJd = getDaysInJalaliMonth(cellJy, cellJm) + dayNumber;
    } else if (dayNumber > daysInMonth) {
      isCurrentMonth = false;
      if (jm === 12) { cellJy = jy + 1; cellJm = 1; } else { cellJm = jm + 1; }
      cellJd = dayNumber - daysInMonth;
    }
    const { gy, gm, gd } = jalaliToGregorian(cellJy, cellJm, cellJd);
    const dateObj = new Date(gy, gm - 1, gd);
    const dateStr = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
    calendarCells.push({
      dateStr,
      dayNumber: cellJd,
      isCurrentMonth,
      isToday: dateStr === todayStr
    });
  }
  const moveCalendarMonth = (delta: number) => {
    const next = new Date(calendarCursor);
    next.setDate(1);
    next.setMonth(next.getMonth() + delta);
    setCalendarCursor(next);
  };

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
            className="flex-1 sm:flex-none text-sm"
          >
            <Clock className="w-4 h-4 text-indigo-600" />
            تقویم و میز انتشار
          </Button>}
          <Button
            variant="success"
            onClick={() => setActiveView('content-published')}
            className="flex-1 sm:flex-none text-sm"
          >
            <CheckCircle2 className="w-4 h-4" />
            محتوای منتشرشده
          </Button>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex-1 sm:flex-none text-sm"
          >
            <Plus className="w-5 h-5" />
            محتوای جدید
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="وضعیت محتوا">
        <button type="button" role="tab" aria-selected={statusFilter === 'all'} onClick={() => setStatusFilter('all')} className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold ${statusFilter === 'all' ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>همه محتواها</button>
        {kanbanColumns.map(status => <button key={status.id} type="button" role="tab" aria-selected={statusFilter === status.id} onClick={() => setStatusFilter(status.id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-bold ${statusFilter === status.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />{status.label}</button>)}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
        <div className="border-b border-slate-100 bg-slate-50/60 p-3 sm:p-4 space-y-3">
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)} className={`ui-button ui-button-secondary text-xs ${filtersOpen || typeFilter !== 'all' || timeFilter !== 'all' ? '!border-violet-300 !text-violet-700' : ''}`}>
            <Filter className="w-4 h-4" />فیلترها
            {(Number(typeFilter !== 'all') + Number(timeFilter !== 'all')) > 0 && <span className="min-w-5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] text-white">{toPersianDigits(Number(typeFilter !== 'all') + Number(timeFilter !== 'all'))}</span>}
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
            {(typeFilter !== 'all' || timeFilter !== 'all') && <button type="button" onClick={() => { setTypeFilter('all'); setTimeFilter('all'); }} className="ui-button ui-button-ghost text-xs">پاک‌کردن فیلترها</button>}
          </div>}
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
                  <th className="p-4 whitespace-nowrap">مسئول اصلی</th>
                  <th className="p-4 whitespace-nowrap">ناشر</th>
                  <th className="p-4 whitespace-nowrap">مهلت / انتشار</th>
                  <th className="p-4 w-40 whitespace-nowrap">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 text-sm">
                      هیچ محتوایی یافت نشد.
                    </td>
                  </tr>
                ) : (
                  filteredContents.map(content => {
                    const dept = departments.find(d => d.id === content.departmentId);
                    const owner = users.find(u => u.id === content.ownerId);
                    const publisher = publisherOf(content);
                    return (
                      <tr
                        key={content.id}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        onClick={() => handleOpenContent(content.id)}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                              {getTypeIcon(content.type)}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                {content.title}
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">
                                {content.topic || dept?.name || 'بدون موضوع اختصاصی'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg whitespace-nowrap">
                            <span aria-hidden className="inline-block w-2 h-2 rounded-full ml-1.5" style={{ backgroundColor: contentTypes.find(ct => ct.id === content.type)?.color || '#6366f1' }}/>{typeName(content.type)}
                          </span>
                        </td>
                        <td className="p-4">
                          <ContentStatusBadge status={content.status} />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            {owner ? (
                              <>
                                <img src={owner.avatar} alt={owner.name} className="w-6 h-6 rounded-full object-cover" />
                                <span className="text-xs font-medium text-slate-700">{owner.name}</span>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">نامشخص</span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          {publisher ? (
                            <div className="flex items-center gap-2">
                              <img src={publisher.avatar} alt={publisher.name} className="w-6 h-6 rounded-full object-cover" />
                              <span className="text-xs font-medium text-slate-700">{publisher.name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1 items-start">
                            {content.deadline && (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                مهلت: {formatPersianDate(content.deadline)}
                              </div>
                            )}
                            {content.publishInfo?.date && (
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                انتشار: {formatPersianDate(content.publishInfo.date)} {content.publishInfo.time ? `(${content.publishInfo.time})` : ''}
                              </div>
                            )}
                            {!isTerminal(content.status) && <OverdueBadge deadline={content.deadline} />}
                          </div>
                        </td>
                        <td className="p-4 text-left">
                          <div className="flex items-center justify-end gap-2">
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
              {kanbanColumns.map(col => {
                const colItems = filteredContents.filter(c => c.status === col.id);
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
                        const owner = users.find(u => u.id === content.ownerId);
                        return (
                          <div
                            key={content.id}
                            onClick={() => handleOpenContent(content.id)}
                            className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-xs font-extrabold text-slate-900 leading-relaxed">
                                {content.title}
                              </h4>
                              {getTypeIcon(content.type)}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg">
                                <span aria-hidden className="inline-block w-2 h-2 rounded-full ml-1.5" style={{ backgroundColor: contentTypes.find(ct => ct.id === content.type)?.color || '#6366f1' }}/>{typeName(content.type)}
                              </span>
                              {!isTerminal(content.status) && <OverdueBadge deadline={content.deadline} />}
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <div className="flex items-center gap-1.5">
                                {owner && (
                                  <img src={owner.avatar} alt={owner.name} className="w-5 h-5 rounded-full object-cover" />
                                )}
                                <span className="text-[10px] font-medium text-slate-500">
                                  {owner?.name || 'نامشخص'}
                                </span>
                              </div>
                              {content.deadline && (
                                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatPersianDate(content.deadline)}
                                </span>
                              )}
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

        {/* ── Calendar view ── */}
        {viewMode === 'calendar' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">
                {PERSIAN_MONTH_NAMES[jm - 1]} {toPersianDigits(jy)}
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => moveCalendarMonth(-1)}
                  className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCalendarCursor(new Date())}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  امروز
                </button>
                <button
                  onClick={() => moveCalendarMonth(1)}
                  className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {PERSIAN_DAY_NAMES_SHORT.map(day => (
                <div key={day} className="text-center text-[11px] font-bold text-slate-400 py-1.5">
                  {day}
                </div>
              ))}
              {calendarCells.map(cell => {
                const dayContents = filteredContents.filter(c => c.deadline === cell.dateStr);
                return (
                  <div
                    key={cell.dateStr}
                    className={`min-h-[76px] rounded-xl border p-1.5 flex flex-col gap-1 transition-colors ${
                      cell.isToday
                        ? 'border-indigo-400 bg-indigo-50/60'
                        : cell.isCurrentMonth
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-100 bg-slate-50/60'
                    }`}
                  >
                    <span className={`text-[11px] font-bold ${cell.isToday ? 'text-indigo-700' : cell.isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                      {toPersianDigits(cell.dayNumber)}
                    </span>
                    <div className="space-y-1 overflow-hidden">
                      {dayContents.slice(0, 3).map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleOpenContent(c.id)}
                          title={c.title}
                          className={`w-full text-right text-[10px] font-bold px-1.5 py-1 rounded-lg cursor-pointer border transition-colors flex items-center gap-1 min-w-0 ${
                            !isTerminal(c.status) && daysOverdue(c.deadline) > 0
                              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700'
                          }`}
                        >
                          <CalendarEventKindIcon kind="content" />
                          <span className="truncate">{c.title}</span>
                        </button>
                      ))}
                      {dayContents.length > 3 && (
                        <span className="text-[10px] font-bold text-slate-400 px-1">
                          +{toPersianDigits(dayContents.length - 3)} مورد دیگر
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
