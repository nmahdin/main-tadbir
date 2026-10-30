import React, { useState } from 'react';
import { User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CalendarKindLegend } from '../calendar/CalendarKindIcon';
import { CalendarEventCard, type CalendarEventStatus } from '../calendar/CalendarEventCard';
import { CalendarDayModal } from '../calendar/CalendarDayModal';
import { contentStatusColor, contentStatusLabel } from '../../utils/statusBadges';
import { calendarTimeLabel, calendarDueInfo, sortCalendarEventsByTime, type CalendarDueInfo } from '../../utils/calendarTone';
import {
  CALENDAR_RANGE_MODES,
  CalendarGrid,
  CalendarRangeToolbar,
  buildCalendarDays,
  calendarRangeLabel,
  shiftCalendarAnchor,
  type CalendarDay,
  type CalendarRangeMode,
} from '../calendar/CalendarViews';

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
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>('month');
  const [filter, setFilter] = useState<CalendarFilter>('all');
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
  const contentEvents: CalendarEvent[] = contents.filter(content => !projectId || content.projectId === projectId).flatMap(content => {
    const rows: CalendarEvent[] = [];
    if (content.deadline) {
      rows.push({
        id: `content-deadline-${content.id}`, entityId: content.id, kind: 'content', title: content.title, date: content.deadline,
        color: '#e11d48', status: contentStatusOf(content.status),
        due: calendarDueInfo(content.deadline, { settled: SETTLED_CONTENT_STATUSES.includes(String(content.status)) }),
        meta: content.seriesName,
        ownerName: userName(content.ownerId),
      });
    }
    if (content.publishInfo?.date) {
      rows.push({
        id: `content-publish-${content.id}`, entityId: content.id, kind: 'content', title: content.title, date: content.publishInfo.date,
        time: content.publishInfo.time, color: '#7c3aed',
        status: content.status === 'published'
          ? { label: 'منتشرشده', color: '#059669' }
          : { label: 'زمان‌بندی‌شده', color: '#4f46e5' },
        due: calendarDueInfo(content.publishInfo.date, { settled: content.status === 'published' }),
        meta: content.publishInfo.channels?.length ? `کانال: ${content.publishInfo.channels.join('، ')}` : undefined,
        ownerName: userName(content.ownerId),
      });
    }
    return rows;
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

  const tabs: Array<{ value: CalendarFilter; label: string; count: number }> = [
    { value: 'all', label: 'همه', count: allEvents.length },
    { value: 'task', label: 'تسک‌ها', count: taskEvents.length },
    { value: 'project', label: 'پروژه‌ها', count: projectEvents.length },
    { value: 'content', label: 'محتواها', count: contentEvents.length },
  ];

  return <div className="space-y-4" dir="rtl">
    <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="نوع رویدادهای تقویم">
      {tabs.map(tab => <button key={tab.value} type="button" role="tab" aria-selected={filter === tab.value} onClick={() => setFilter(tab.value)} className={`flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold ${filter === tab.value ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}><span>{tab.label}</span><span className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] ${filter === tab.value ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>{tab.count.toLocaleString('fa-IR')}</span></button>)}
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
