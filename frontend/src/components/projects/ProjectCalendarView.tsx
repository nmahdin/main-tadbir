import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CalendarEventKindIcon, CalendarKindLegend } from '../calendar/CalendarKindIcon';
import { IconButton } from '../common/Primitives';
import { X, ExternalLink, User, Flag, FolderKanban, ListChecks, Tag, Clock } from 'lucide-react';
import { CalendarEventCard, type CalendarEventStatus } from '../calendar/CalendarEventCard';
import { CalendarDayModal } from '../calendar/CalendarDayModal';
import { contentStatusColor, contentStatusLabel } from '../../utils/statusBadges';
import { calendarTimeLabel, calendarDueInfo, calendarDueRelative, sortCalendarEventsByTime, type CalendarDueInfo } from '../../utils/calendarTone';
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
  subtitle: string;
  color: string;
  time?: string;
  status: CalendarEventStatus;
  due: CalendarDueInfo;
  meta?: string;
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

export const ProjectCalendarView: React.FC<{ projectId?: string; filterAssignee?: string }> = ({ projectId, filterAssignee = 'all' }) => {
  const { tasks, projects, contents, users, taskStatuses, taskPriorities, setSelectedTaskId, setSelectedProjectId, setSelectedContentId, setActiveView } = useApp();
  const [anchor, setAnchor] = useState(new Date());
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>('month');
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);

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
      subtitle: `پروژه • ${project.progress}٪ پیشرفت`,
      color: project.color || '#4f46e5',
      status: projectStatus[String(project.status)] || { label: String(project.status || ''), color: '#64748b' },
      due: calendarDueInfo(project.deadline, { settled: ['completed', 'cancelled', 'archived'].includes(String(project.status)) }),
      meta: `${project.progress}٪ پیشرفت`,
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
      subtitle: 'تسک',
      color: projects.find(project => project.id === task.projectId)?.color || '#0ea5e9',
      time: task.deadline,
      status: taskStatusOf(task.status),
      due: calendarDueInfo(task.deadline, { settled: SETTLED_TASK_STATUSES.includes(String(task.status)) }),
      meta: projects.find(project => project.id === task.projectId)?.name,
    }))
    .filter(event => event.date);
  const contentEvents: CalendarEvent[] = contents.filter(content => !projectId || content.projectId === projectId).flatMap(content => {
    const rows: CalendarEvent[] = [];
    if (content.deadline) {
      rows.push({
        id: `content-deadline-${content.id}`, entityId: content.id, kind: 'content', title: content.title, date: content.deadline,
        subtitle: 'موعد تحویل محتوا', color: '#e11d48', status: contentStatusOf(content.status),
        due: calendarDueInfo(content.deadline, { settled: SETTLED_CONTENT_STATUSES.includes(String(content.status)) }),
        meta: content.seriesName,
      });
    }
    if (content.publishInfo?.date) {
      rows.push({
        id: `content-publish-${content.id}`, entityId: content.id, kind: 'content', title: content.title, date: content.publishInfo.date,
        time: content.publishInfo.time, subtitle: 'زمان انتشار محتوا', color: '#7c3aed',
        status: content.status === 'published'
          ? { label: 'منتشرشده', color: '#059669' }
          : { label: 'زمان‌بندی‌شده', color: '#4f46e5' },
        due: calendarDueInfo(content.publishInfo.date, { settled: content.status === 'published' }),
        meta: content.publishInfo.channels?.length ? `کانال: ${content.publishInfo.channels.join('، ')}` : undefined,
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

  const showFull = () => {
    if (!selectedEvent) return;
    if (selectedEvent.kind === 'task') setSelectedTaskId(selectedEvent.entityId);
    if (selectedEvent.kind === 'project') { setSelectedProjectId(selectedEvent.entityId); setActiveView('project-detail'); }
    if (selectedEvent.kind === 'content') { setSelectedContentId(selectedEvent.entityId); setActiveView('content-detail'); }
    setSelectedEvent(null);
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
        agendaHint="روزها به ترتیب زمان؛ زیر عنوان هر روز، کارت‌ها با ساعت از کم به زیاد می‌آیند."
        emptyDayLabel="رویدادی ثبت نشده است."
        eventCount={day => eventsOfDay(day.iso).length}
        renderEvents={day => eventsOfDay(day.iso).map(event => (
          <CalendarEventCard
            key={event.id}
            kind={event.kind === 'content' ? 'content' : event.kind}
            title={event.title}
            tone={event.due.tone}
            status={event.status}
            timeLabel={calendarTimeLabel(event.time) || 'تمام روز'}
            dueLabel={calendarDueRelative(event.due)}
            meta={[event.subtitle, event.meta].filter(Boolean).join(' · ')}
            onOpen={() => setSelectedEvent(event)}
          />
        ))}
      />
    </div>

    <CalendarDayModal
      day={selectedDay}
      count={selectedDay ? eventsOfDay(selectedDay.iso).length : 0}
      onClose={() => setSelectedDay(null)}
      emptyText="برای این روز رویدادی ثبت نشده است."
      hint="تقویم سازمانی"
    >
      {selectedDay && eventsOfDay(selectedDay.iso).map(event => (
        <CalendarEventCard
          key={`modal-${event.id}`}
          kind={event.kind}
          title={event.title}
          tone={event.due.tone}
          status={event.status}
          timeLabel={calendarTimeLabel(event.time) || 'تمام روز'}
          dueLabel={calendarDueRelative(event.due)}
          meta={[event.subtitle, event.meta].filter(Boolean).join(' · ')}
          onOpen={() => setSelectedEvent(event)}
          actions={<button type="button" onClick={() => setSelectedEvent(event)} className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[10px] font-black text-indigo-700 hover:bg-indigo-50">جزئیات کامل</button>}
        />
      ))}
    </CalendarDayModal>

    {selectedEvent && <EventDetailsPopup event={selectedEvent} tasks={tasks} projects={projects} contents={contents} users={users} taskStatuses={taskStatuses} taskPriorities={taskPriorities} onClose={() => setSelectedEvent(null)} onShowFull={showFull} />}
  </div>;
};

const EventDetailsPopup: React.FC<any> = ({ event, tasks, projects, contents, users, taskStatuses, taskPriorities, onClose, onShowFull }) => {
  const task = event.kind === 'task' ? tasks.find((t: any) => t.id === event.entityId) : null;
  const project = event.kind === 'project' ? projects.find((p: any) => p.id === event.entityId) : tasks && event.kind === 'task' ? projects.find((p: any) => p.id === task?.projectId) : null;
  const content = event.kind === 'content' ? contents.find((c: any) => c.id === event.entityId) : null;
  const assignee = task ? users.find((u: any) => u.id === task.assigneeId) : null;
  const statusLabel = event.status?.label
    || (task ? (taskStatuses.find((st: any) => st.id === task.status)?.label || task.status) : project ? (project.status === 'completed' ? 'تکمیل‌شده' : project.status === 'on_hold' ? 'متوقف' : 'فعال') : null);
  const priorityLabel = task ? (taskPriorities.find((pr: any) => pr.id === task.priority)?.label || task.priority) : null;
  const daysLeft = Math.ceil((new Date(event.date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const subtasks = task?.subtasks || [];
  const doneSubtasks = subtasks.filter((st: any) => st.completed).length;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1.5">
              <CalendarEventKindIcon kind={event.kind} className="w-4 h-4" />
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: event.color }} />
              {event.subtitle}
            </span>
            <h3 className="font-black text-slate-900 mt-1 leading-snug whitespace-normal break-words">{event.title}</h3>
          </div>
          <IconButton label="بستن جزئیات رویداد" purpose="close" variant="ghost" onClick={onClose} className="shrink-0"><X className="w-4 h-4" /></IconButton>
        </div>
        {(task?.description || project?.description || content?.description) && (
          <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-2xl p-3 line-clamp-4">
            {task?.description || project?.description || content?.description}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
            <div><div className="text-[10px] text-slate-500">موعد</div><div className="font-bold text-slate-800">{new Date(event.date).toLocaleDateString('fa-IR')}</div></div>
          </div>
          <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${daysLeft < 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
            <Flag className={`w-4 h-4 shrink-0 ${daysLeft < 0 ? 'text-rose-600' : 'text-slate-400'}`} />
            <div>
              <div className="text-[10px] text-slate-500">وضعیت زمانی</div>
              <div className={`font-bold ${daysLeft < 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)} روز تأخیر` : daysLeft === 0 ? 'امروز موعد است' : `${daysLeft} روز مانده`}
              </div>
            </div>
          </div>
          {statusLabel && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] text-slate-500 mb-0.5">وضعیت</div>
              <div className="font-bold text-slate-800">{statusLabel}</div>
            </div>
          )}
          {priorityLabel && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] text-slate-500 mb-0.5">اولویت</div>
              <div className="font-bold text-slate-800">{priorityLabel}</div>
            </div>
          )}
          {assignee && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2 col-span-2">
              <User className="w-4 h-4 text-indigo-600 shrink-0" />
              <div><div className="text-[10px] text-slate-500">مجری</div><div className="font-bold text-slate-800">{assignee.name} {assignee.family || ''}</div></div>
            </div>
          )}
          {project && event.kind === 'task' && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2 col-span-2">
              <FolderKanban className="w-4 h-4 text-indigo-600 shrink-0" />
              <div><div className="text-[10px] text-slate-500">پروژه</div><div className="font-bold text-slate-800">{project.name} • {project.progress}٪ پیشرفت</div></div>
            </div>
          )}
          {event.kind === 'project' && project && (
            <div className="col-span-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500"><span>پیشرفت پروژه</span><span className="font-bold text-slate-800">{project.progress}٪</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${project.progress}%`, backgroundColor: event.color }} /></div>
            </div>
          )}
          {content && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 col-span-2">
              <div className="text-[10px] text-slate-500 mb-0.5">نوع محتوا</div>
              <div className="font-bold text-slate-800">{content.contentTypeName || content.type || '—'}</div>
            </div>
          )}
          {subtasks.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2 col-span-2">
              <ListChecks className="w-4 h-4 text-indigo-600 shrink-0" />
              <div><div className="text-[10px] text-slate-500">زیرتسک‌ها</div><div className="font-bold text-slate-800">{doneSubtasks} از {subtasks.length} انجام‌شده</div></div>
            </div>
          )}
          {task?.tags && task.tags.length > 0 && (
            <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              {task.tags.map((tag: string) => <span key={tag} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{tag}</span>)}
            </div>
          )}
        </div>
        <button onClick={onShowFull} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"><ExternalLink className="w-4 h-4" />مشاهده کامل</button>
      </div>
    </div>
  );
};
