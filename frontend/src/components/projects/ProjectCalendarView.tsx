import React, { useState } from 'react';
import { CheckSquare, FileText, FolderKanban, LayoutGrid, User, type LucideIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CalendarKindLegend } from '../calendar/CalendarKindIcon';
import { CalendarEventCard, type CalendarEventStatus } from '../calendar/CalendarEventCard';
import { CalendarDayModal } from '../calendar/CalendarDayModal';
import { contentStatusColor, contentStatusLabel } from '../../utils/statusBadges';
import { publicationDisplayStatus } from '../../utils/publicationReadiness';
import { calendarTimeLabel, calendarDueInfo, sortCalendarEventsByTime, type CalendarDueInfo } from '../../utils/calendarTone';
import {
  CALENDAR_RANGE_MODES,
  CalendarGrid,
  CalendarRangeToolbar,
  buildCalendarDays,
  calendarRangeLabel,
  defaultCalendarRangeMode,
  shiftCalendarAnchor,
  type CalendarDay,
  type CalendarRangeMode,
} from '../calendar/CalendarViews';
import { useSlidingTabs } from '../common/SlidingTabs';

type CalendarFilter = 'task' | 'project' | 'content' | 'all';
type CalendarEvent = {
  id: string;
  entityId: string;
  kind: 'project' | 'task' | 'content';
  title: string;
  date: string;
  color: string;
  time?: string;
  status: CalendarEventStatus;
  due: CalendarDueInfo;
  meta?: string;
  /** نام مسئول همان رکورد (مدیر پروژه، مجری تسک یا مالک محتوا) برای مدال روز. */
  ownerName?: string;
};

/** برچسب و رنگ وضعیت پروژه؛ همان معنای نشانگر وضعیت پروژه در فهرست‌ها. */
const projectStatus: Record<string, CalendarEventStatus> = {
  planning: { label: 'برنامه‌ریزی', color: '#0284c7' },
  active: { label: 'فعال', color: '#059669' },
  on_hold: { label: 'متوقف', color: '#d97706' },
  completed: { label: 'تکمیل‌شده', color: '#4f46e5' },
  cancelled: { label: 'لغوشده', color: '#64748b' },
  archived: { label: 'بایگانی‌شده', color: '#94a3b8' },
};

const SETTLED_TASK_STATUSES = ['completed', 'archived'];
const SETTLED_CONTENT_STATUSES = ['published', 'archived', 'cancelled'];

/**
 * تقویم سازمانی پروژه/تسک/محتوا.
 *
 * روزها همهٔ رویدادها را نگه می‌دارند و بدون جمع‌شدن نمایش داده می‌شوند. کلیک روی هر رویداد دیگر مدال تودرتو
 * باز نمی‌کند: تسک در همان پنجرهٔ جزئیات تسک باز می‌شود و محتوا/پروژه به صفحهٔ
 * خودشان می‌روند.
 */
export const ProjectCalendarView: React.FC<{ projectId?: string; filterAssignee?: string }> = ({ projectId, filterAssignee = 'all' }) => {
  const { tasks, projects, contents, users, taskStatuses, setSelectedTaskId, setSelectedProjectId, setSelectedContentId, setActiveView } = useApp();
  const [anchor, setAnchor] = useState(new Date());
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>(defaultCalendarRangeMode);
  const [filter, setFilter] = useState<CalendarFilter>('all');
  // نشانگر متحرک تب‌ها (دور ۹۵).
  const eventTabs = useSlidingTabs(filter);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

  const userName = (id?: string | null) => {
    const user = users.find(item => item.id === id);
    return user ? `${user.name} ${user.family || ''}`.trim() : '';
  };

  const taskStatusOf = (status: string): CalendarEventStatus => {
    const setting = taskStatuses.find(item => item.id === status);
    return { label: setting?.label || String(status), color: setting?.color || '#64748b' };
  };
  const contentStatusOf = (status?: string | null): CalendarEventStatus => ({
    label: contentStatusLabel(String(status || '')),
    color: contentStatusColor(String(status || '')),
  });

  const projectEvents: CalendarEvent[] = projects
    .filter(project => !projectId || project.id === projectId)
    .map(project => ({
      id: `project-${project.id}`,
      entityId: project.id,
      kind: 'project' as const,
      title: project.name,
      date: project.deadline,
      color: project.color || '#4f46e5',
      status: projectStatus[String(project.status)] || { label: String(project.status || ''), color: '#64748b' },
      due: calendarDueInfo(project.deadline, { settled: ['completed', 'cancelled', 'archived'].includes(String(project.status)) }),
      meta: `${project.progress}٪ پیشرفت`,
      ownerName: userName(project.projectManagerId),
    }))
    .filter(event => event.date);
  const taskEvents: CalendarEvent[] = tasks
    .filter(task => (!projectId || task.projectId === projectId) && (filterAssignee === 'all' || task.assigneeId === filterAssignee))
    .map(task => ({
      id: `task-${task.id}`,
      entityId: task.id,
      kind: 'task' as const,
      title: task.title,
      date: task.deadline,
      color: projects.find(project => project.id === task.projectId)?.color || '#0ea5e9',
      time: task.deadline,
      status: taskStatusOf(task.status),
      due: calendarDueInfo(task.deadline, { settled: SETTLED_TASK_STATUSES.includes(String(task.status)) }),
      meta: projects.find(project => project.id === task.projectId)?.name,
      ownerName: userName(task.assigneeId),
    }))
    .filter(event => event.date);
  /**
   * هر محتوا **یک** رویداد در تقویم دارد (دور ۸۲) و هیچ محتوایی — حتی
   * منتشرشده — از تقویم بیرون نمی‌افتد (اصلاح دور ۸۴).
   *
   * تاریخِ کارت به ترتیب اولویت:
   *  ۱) تاریخ انتشار (زمان‌بندی‌شده یا واقعی) — معنادارترین نقطهٔ تقویم انتشار،
   *  ۲) تاریخ برنامه‌ریزی‌شدهٔ پیش از انتشار (`scheduledDate`)،
   *  ۳) مهلت تولید،
   *  ۴) و اگر هیچ‌کدام نبود، آخرین به‌روزرسانی پرونده تا محتوای منتشرشدهٔ بی‌تاریخ
   *     هم گم نشود.
   *
   * پیش‌تر مهلت تولید بر تاریخ انتشار اولویت داشت؛ نتیجه این بود که محتوای
   * منتشرشده با مهلت قدیمی، از ماه جاری تقویم بیرون می‌رفت و کاربر فکر می‌کرد
   * محتواهای منتشرشده دیگر نمایش داده نمی‌شوند. حالا کارت روی روز انتشار
   * می‌نشیند و مهلت تولید در توضیح همان کارت می‌آید.
   */
  const contentEvents: CalendarEvent[] = contents
    .filter(content => !projectId || content.projectId === projectId)
    .flatMap(content => {
      const pick = (value?: string | null) => (value ? String(value).slice(0, 10) : '');
      const publishDate = pick(content.publishInfo?.date);
      const scheduledDate = pick((content.publishInfo as { scheduledDate?: string } | undefined)?.scheduledDate);
      const deadline = pick(content.deadline);
      const fallback = pick(content.updatedAt || content.createdAt);
      const date = publishDate || scheduledDate || deadline || fallback;
      if (!date) return [];
      const detail = [
        content.seriesName,
        deadline && deadline !== date ? `مهلت تولید: ${deadline}` : '',
      ].filter(Boolean).join(' · ');
      return [{
        id: `content-${content.id}`,
        entityId: content.id,
        kind: 'content' as const,
        title: content.title,
        date,
        time: publishDate ? content.publishInfo?.time : undefined,
        color: publishDate ? '#7c3aed' : '#e11d48',
        // برچسب از همان قرارداد «آماده انتشار» می‌آید؛ پرونده‌ای که همهٔ
        // مرحله‌هایش تمام شده، حتی اگر وضعیت خامش هنوز عوض نشده باشد، در تقویم
        // «آماده انتشار» دیده می‌شود.
        status: contentStatusOf(publicationDisplayStatus(content)),
        due: calendarDueInfo(date, { settled: SETTLED_CONTENT_STATUSES.includes(String(content.status)) }),
        meta: detail || undefined,
        ownerName: userName(content.ownerId),
      }];
    });
  const allEvents = [...taskEvents, ...projectEvents, ...contentEvents];
  const events = filter === 'task' ? taskEvents : filter === 'project' ? projectEvents : filter === 'content' ? contentEvents : allEvents;
  // رویدادهای هر روز با تاریخ تقویمی (`YYYY-MM-DD`) تطبیق داده می‌شوند تا
  // اختلاف منطقهٔ زمانی، رویداد را به روز کناری نبرد؛ سپس به ترتیب ساعت می‌آیند.
  const eventsOfDay = (iso: string) => sortCalendarEventsByTime(
    events.filter(event => String(event.date).slice(0, 10) === iso),
    event => event.time,
  );
  const days = buildCalendarDays(anchor, rangeMode);
  const rangeLabel = calendarRangeLabel(anchor, rangeMode);
  const rangeModeHint = CALENDAR_RANGE_MODES.find(item => item.id === rangeMode)?.hint;
  const visibleEvents = days.reduce((total, day) => total + eventsOfDay(day.iso).length, 0);

  /** بردن کاربر به مقصد واقعی هر رویداد؛ هیچ مدال تودرتویی باز نمی‌شود. */
  const openEvent = (event: CalendarEvent) => {
    setSelectedDay(null);
    if (event.kind === 'task') setSelectedTaskId(event.entityId);
    if (event.kind === 'project') { setSelectedProjectId(event.entityId); setActiveView('project-detail'); }
    if (event.kind === 'content') { setSelectedContentId(event.entityId); setActiveView('content-detail'); }
  };

  const eventCard = (event: CalendarEvent) => (
    <CalendarEventCard
      key={event.id}
      kind={event.kind}
      title={event.title}
      tone={event.due.tone}
      status={event.status}
      timeLabel={calendarTimeLabel(event.time) || 'تمام روز'}
      meta={event.meta}
      onOpen={() => openEvent(event)}
    />
  );

  /** هر روز: همهٔ رویدادها بدون جمع‌شدن موارد تکمیل‌شده. */
  const renderDay = (iso: string) => {
    const rows = eventsOfDay(iso);
    return <>{rows.map(row => eventCard(row))}</>;
  };

  /** در مدال روز، نام مسئول ارتباط با همان محتوا/پروژه/تسک هم نمایش داده می‌شود. */
  const modalCard = (event: CalendarEvent) => (
    <div key={`modal-${event.id}`} className="space-y-1">
      {eventCard(event)}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
          <User className="h-3.5 w-3.5 text-indigo-600" aria-hidden />
          مسئول: {event.ownerName || 'ثبت نشده'}
        </span>
        <button
          type="button"
          onClick={() => openEvent(event)}
          className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-700 hover:bg-indigo-50"
        >
          {event.kind === 'task' ? 'باز کردن وظیفه' : event.kind === 'project' ? 'رفتن به پروژه' : 'رفتن به محتوا'}
        </button>
      </div>
    </div>
  );

  const renderDayForModal = (iso: string) => {
    const rows = eventsOfDay(iso);
    return <>{rows.map(row => modalCard(row))}</>;
  };

  // تب‌های نوع رویداد بدون شمارنده: کاربر فقط می‌خواهد بین «همه/تسک‌ها/پروژه‌ها/
  // محتواها» جابه‌جا شود؛ عددِ کنار هر تب نه تصمیمی می‌ساخت و نه خوانا بود.
  const tabs: Array<{ value: CalendarFilter; label: string; icon: LucideIcon }> = [
    { value: 'all', label: 'همه', icon: LayoutGrid },
    { value: 'task', label: 'تسک‌ها', icon: CheckSquare },
    { value: 'project', label: 'پروژه‌ها', icon: FolderKanban },
    { value: 'content', label: 'محتواها', icon: FileText },
  ];

  return <div className="space-y-4" dir="rtl">
    {/* تب‌های نوع رویداد: هر تب آیکون خودش را دارد؛ تب انتخاب‌نشده سفید و تب
        انتخاب‌شده با رنگ اصلی سامانه پر می‌شود (اصلاح دور ۷۷ — این درخواست
        مربوط به همین تب‌ها بود، نه تب‌های بازهٔ ماهانه/هفتگی). */}
    {/* تب‌های نوع رویداد (دور ۸۴): پس‌زمینهٔ کل نوار سفید است، تب فعال با رنگ
        اصلی سامانه پر می‌شود و تب‌های غیرفعال بدون پس‌زمینه/حاشیه‌اند؛ در هاور
        فقط یک پس‌زمینهٔ کم‌رنگ می‌آید. */}
    <div ref={eventTabs.stripRef} className="relative flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs" role="tablist" aria-label="نوع رویدادهای تقویم">
      {eventTabs.pill}
      {tabs.map(tab => {
        const Icon = tab.icon;
        const active = filter === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-tab-active={active}
            onClick={() => setFilter(tab.value)}
            className={`relative z-10 flex cursor-pointer items-center gap-2 rounded-xl border-0 px-3 py-1.5 text-[11px] font-bold transition-colors ${
              active
                ? 'text-white'
                : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} aria-hidden />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>

    <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:p-6">
      <CalendarRangeToolbar
        mode={rangeMode}
        onModeChange={setRangeMode}
        label={rangeLabel}
        title="تقویم سازمانی"
        hint={`${rangeModeHint} · ${visibleEvents.toLocaleString('fa-IR')} رویداد در این بازه`}
        onShift={direction => setAnchor(previous => shiftCalendarAnchor(previous, rangeMode, direction))}
        onToday={() => setAnchor(new Date())}
      />
      <CalendarKindLegend kinds={filter === 'task' ? ['task'] : filter === 'project' ? ['project'] : filter === 'content' ? ['content'] : ['project', 'task', 'content']} />
      <CalendarGrid
        days={days}
        mode={rangeMode}
        onSelectDay={setSelectedDay}
        agendaHint="روزها به ترتیب زمان؛ زیر عنوان هر روز، کارت‌ها با ساعت از کم به زیاد می‌آیند و موارد انجام‌شده جمع می‌شوند."
        emptyDayLabel="رویدادی ثبت نشده است."
        eventCount={day => eventsOfDay(day.iso).length}
        renderEvents={day => renderDay(day.iso)}
      />
    </div>

    <CalendarDayModal
      day={selectedDay}
      count={selectedDay ? eventsOfDay(selectedDay.iso).length : 0}
      onClose={() => setSelectedDay(null)}
      emptyText="برای این روز رویدادی ثبت نشده است."
      hint="تقویم سازمانی"
    >
      {selectedDay && renderDayForModal(selectedDay.iso)}
    </CalendarDayModal>
  </div>;
};
