import { useUrlFilter } from '../../routing/useUrlFilter';
import React, { useState } from 'react';
import { formatToJalaliLong } from '../../utils/jalali';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { ModuleErrorBanner } from '../common/Feedback';
import {
  CheckSquare,
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ListTodo,
  CheckCircle,
  LayoutGrid,
  List,
  MoreVertical,
  Clock,
  CalendarDays,
} from 'lucide-react';
import {
  CalendarGrid,
  CalendarRangeToolbar,
  buildCalendarDays,
  calendarRangeLabel,
  shiftCalendarAnchor,
  type CalendarDay,
  type CalendarRangeMode,
} from '../calendar/CalendarViews';
import { CalendarEventCard } from '../calendar/CalendarEventCard';
import { CalendarDayModal } from '../calendar/CalendarDayModal';
import { calendarDueInfo, calendarTimeLabel, sortCalendarEventsByTime } from '../../utils/calendarTone';

type ViewMode = 'list' | 'kanban' | 'calendar';
type TaskScope = 'near' | 'all';

const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const MyTasksView: React.FC = () => {
  const {
    currentUser,
    tasks,
    projects,
    taskStatuses,
    taskPriorities,
    setSelectedTaskId,
    moveTaskStatus,
    setIsCreateTaskOpen,
    hasPermission
  } = useApp();

  const [statusFilter, setStatusFilter] = useUrlFilter<string>('status', 'all');
  const [priorityFilter, setPriorityFilter] = useUrlFilter<string>('priority', 'all');
  const [taskScope, setTaskScope] = useUrlFilter<TaskScope>('scope', 'near');
  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'today' | 'overdue' | 'week'>('all');
  const [viewMode, setViewMode] = useUrlFilter<ViewMode>('view', 'list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<string | null>(null);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  const today = new Date();
  const todayStr = localDateKey(today);
  const nearEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
  const nearEndStr = localDateKey(nearEnd);

  // My tasks
  const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);
  const isNearDue = (task: Task) => !['completed', 'archived'].includes(task.status) && !!task.deadline && task.deadline.slice(0, 10) <= nearEndStr;
  const nearDueCount = myTasks.filter(isNearDue).length;

  const filteredTasks = myTasks.filter(t => {
    const matchesStatus = statusFilter === 'overdue' ? !['completed', 'archived'].includes(t.status) && !!t.deadline && t.deadline < todayStr
      : statusFilter === 'all' ? t.status !== 'archived' : t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesScope = taskScope === 'all' || isNearDue(t);

    let matchesTimeframe = true;
    if (timeframeFilter === 'today') {
      matchesTimeframe = t.deadline === todayStr;
    } else if (timeframeFilter === 'overdue') {
      matchesTimeframe = !['completed', 'archived'].includes(t.status) && !!t.deadline && t.deadline < todayStr;
    } else if (timeframeFilter === 'week') {
      const taskDate = new Date(t.deadline).getTime();
      const now = new Date().getTime();
      matchesTimeframe = taskDate >= now && taskDate <= now + 7 * 86400000;
    }

    return matchesStatus && matchesPriority && matchesScope && matchesTimeframe;
  });

  const overdueCount = myTasks.filter(t => !['completed', 'archived'].includes(t.status) && !!t.deadline && t.deadline < todayStr).length;
  const inProgressCount = myTasks.filter(t => t.status === 'in_progress').length;
  const reviewCount = myTasks.filter(t => t.status === 'review').length;

  const orderedStatuses = [...taskStatuses].sort((a, b) => a.order - b.order);
  const statusMenuOptions = orderedStatuses.filter(s => s.id !== 'archived');

  const handleKanbanDrop = (targetStatusId: string) => {
    if (!draggedTaskId) return;
    const dragged = tasks.find(t => t.id === draggedTaskId);
    if (dragged?.kind === 'content_review' && (targetStatusId !== 'completed' || dragged.status === 'completed' || !hasPermission('content.approve'))) {
      setDraggedTaskId(null); setDropTargetCol(null); return;
    }
    if (dragged && dragged.status !== targetStatusId) {
      moveTaskStatus(draggedTaskId, targetStatusId as typeof dragged.status);
    }
    setDraggedTaskId(null);
    setDropTargetCol(null);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300" dir="rtl">
      <ModuleErrorBanner modules={['tasks']} label="وظایف" />

      {/* ── Header: کارت اصلی خلوت ── */}
      

      {/* ── Scope tabs: کوچک و یکپارچه ── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xs" role="tablist" aria-label="دامنه زمانی کارتابل">
        <button
          type="button"
          role="tab"
          aria-selected={taskScope === 'near'}
          onClick={() => { setTaskScope('near'); setTimeframeFilter('all'); }}
          className={`inline-flex !min-h-7 flex-1 items-center justify-center gap-1.5 rounded-xl !px-3 !py-1 text-[11px] font-bold transition-colors sm:flex-none ${taskScope === 'near' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          موعد نزدیک
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${taskScope === 'near' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-700'}`}>{nearDueCount.toLocaleString('fa-IR')}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={taskScope === 'all'}
          onClick={() => { setTaskScope('all'); setTimeframeFilter('all'); }}
          className={`inline-flex !min-h-7 flex-1 items-center justify-center gap-1.5 rounded-xl !px-3 !py-1 text-[11px] font-bold transition-colors sm:flex-none ${taskScope === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <ListTodo className="h-3.5 w-3.5" />
          همه
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${taskScope === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{myTasks.filter(task => task.status !== 'archived').length.toLocaleString('fa-IR')}</span>
        </button>
        <p className="mr-auto hidden px-2 text-[10px] font-medium text-slate-500 md:block">موعد نزدیک شامل عقب‌افتاده‌ها و هفت روز آینده است.</p>
      </div>

      {/* ── Filter + view: فشرده و خلوت ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
          <div className="flex items-center gap-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 !px-2.5 !py-1 text-[11px] font-bold text-slate-700 shadow-2xs focus:border-indigo-300 focus:outline-none"
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="overdue">سررسید گذشته</option>
              {orderedStatuses.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 !px-2.5 !py-1 text-[11px] font-bold text-slate-700 shadow-2xs focus:border-indigo-300 focus:outline-none"
            >
              <option value="all">همه اولویت‌ها</option>
              {[...taskPriorities].sort((a, b) => a.order - b.order).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`!min-h-7 !min-w-7 flex items-center justify-center rounded-lg !p-1.5 transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              title="نمایش لیستی"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`!min-h-7 !min-w-7 flex items-center justify-center rounded-lg !p-1.5 transition-all ${viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              title="نمایش کانبان"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`!min-h-7 !min-w-7 flex items-center justify-center rounded-lg !p-1.5 transition-all ${viewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              title="نمایش تقویمی"
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Task Content ── */}
      {filteredTasks.length === 0 && viewMode !== 'calendar' ? (
        <div className="rounded-[18px] border border-dashed border-slate-200 bg-white py-16 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-700">وظیفه‌ای یافت نشد</h3>
          <p className="mx-auto mt-1 max-w-sm text-[11px] font-medium text-slate-500">
            فیلترها را تغییر دهید یا وظیفه جدید بسازید.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm text-slate-600">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-black text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">عنوان وظیفه</th>
                  <th scope="col" className="px-4 py-3 font-bold">پروژه</th>
                  <th scope="col" className="px-4 py-3 font-bold">وضعیت</th>
                  <th scope="col" className="px-4 py-3 font-bold">اولویت</th>
                  <th scope="col" className="px-4 py-3 font-bold">سررسید</th>
                  <th scope="col" className="px-4 py-3 font-bold text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map(task => {
                  const proj = projects.find(p => p.id === task.projectId);
                  const isPastDue = task.status !== 'completed' && task.deadline < todayStr;
                  const isCompleted = task.status === 'completed';
                  return (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50/80 ${isCompleted ? 'bg-slate-50/50' : ''}`}
                    >
                      <td className="px-4 py-3 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!(task.kind === 'content_review' && isCompleted)) moveTaskStatus(task.id, isCompleted ? 'backlog' : 'completed');
                            }}
                            disabled={task.kind === 'content_review' && (isCompleted || !hasPermission('content.approve'))}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${isCompleted ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white hover:border-emerald-500'}`}
                          >
                            {isCompleted && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </button>
                          <span className={`truncate text-[13px] ${isCompleted ? 'font-medium text-slate-500 line-through' : ''}`}>{task.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {proj ? (
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: proj.color }}></span>
                            <span className="text-[12px] font-bold">{proj.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <button
                            onClick={() => setStatusMenuTaskId(statusMenuTaskId === task.id ? null : task.id)}
                            disabled={task.kind === 'content_review' && (task.status === 'completed' || !hasPermission('content.approve'))}
                            className="cursor-pointer rounded-lg transition-all hover:ring-2 hover:ring-indigo-200"
                          >
                            <TaskStatusBadge status={task.status} size="sm" />
                          </button>
                          {statusMenuTaskId === task.id && (
                            <>
                              <div className="fixed inset-0 z-40 cursor-default" onClick={() => setStatusMenuTaskId(null)} />
                              <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[170px] animate-in fade-in zoom-in-95 rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl">
                                <p className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400">تغییر وضعیت به:</p>
                                {(task.kind === 'content_review' ? statusMenuOptions.filter(status => status.id === 'completed') : statusMenuOptions).map(s => (
                                  <button
                                    key={s.id}
                                    onClick={() => {
                                      if (task.status !== s.id) moveTaskStatus(task.id, s.id as typeof task.status);
                                      setStatusMenuTaskId(null);
                                    }}
                                    className={`flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold transition-colors ${task.status === s.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                                  >
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                                    <span>{s.label}</span>
                                    {task.status === s.id && <CheckCircle2 className="mr-auto h-3.5 w-3.5" />}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><PriorityPill priority={task.priority} size="sm" /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${isPastDue ? 'rounded-lg bg-rose-50 px-2 py-0.5 text-rose-600' : 'text-slate-600'}`}>
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{formatToJalaliLong(task.deadline)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'kanban' ? (
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {orderedStatuses.map((col) => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setDropTargetCol(col.id); }}
                onDragLeave={() => setDropTargetCol(prev => prev === col.id ? null : prev)}
                onDrop={(e) => { e.preventDefault(); handleKanbanDrop(col.id); }}
                className={`flex w-[280px] shrink-0 flex-col rounded-2xl border bg-white p-2.5 shadow-sm transition-all ${dropTargetCol === col.id ? 'border-indigo-300 bg-indigo-50/50 ring-2 ring-indigo-200' : 'border-slate-200'}`}
              >
                <div className="mb-3 flex items-center justify-between border-r-4 px-2" style={{ borderColor: col.color }}>
                  <h3 className="pr-2 text-xs font-extrabold text-slate-800">{col.label}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{colTasks.length.toLocaleString('fa-IR')}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {colTasks.map(task => {
                    const proj = projects.find(p => p.id === task.projectId);
                    return (
                      <div
                        key={task.id}
                        draggable={task.kind !== 'content_review' || (task.status !== 'completed' && hasPermission('content.approve'))}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDraggedTaskId(task.id); }}
                        onDragEnd={() => { setDraggedTaskId(null); setDropTargetCol(null); }}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-2xs transition-all hover:border-indigo-200 hover:shadow-sm active:cursor-grabbing ${draggedTaskId === task.id ? 'opacity-40 shadow-lg' : ''}`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <PriorityPill priority={task.priority} size="sm" />
                          {proj && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{proj.name}</span>}
                        </div>
                        <h4 className="mb-3 line-clamp-2 text-[12px] font-bold leading-5 text-slate-900">{task.title}</h4>
                        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                          <span className={`flex items-center gap-1 text-[10px] font-bold ${task.deadline < todayStr && task.status !== 'completed' ? 'text-rose-600' : 'text-slate-500'}`}>
                            <Calendar className="h-3 w-3" />
                            {formatToJalaliLong(task.deadline)}
                          </span>
                          {task.estimatedHours && <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{task.estimatedHours.toLocaleString('fa-IR')} ساعت</span>}
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className={`rounded-xl border-2 border-dashed p-3 text-center ${dropTargetCol === col.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                      <span className="text-[11px] font-medium text-slate-400">{dropTargetCol === col.id ? 'رها کنید' : 'خالی'}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <MyTasksCalendar
          tasks={filteredTasks}
          projects={projects}
          taskStatuses={taskStatuses}
          currentDate={calendarDate}
          onDateChange={setCalendarDate}
          onSelectTask={setSelectedTaskId}
        />
      )}
    </div>
  );
};

const MyTasksCalendar: React.FC<{
  tasks: Task[];
  projects: { id: string; name: string; color?: string }[];
  taskStatuses: { id: string; label: string; color: string; order: number }[];
  currentDate: Date;
  onDateChange: (d: Date) => void;
  onSelectTask: (id: string) => void;
}> = ({ tasks, projects, taskStatuses, currentDate, onDateChange, onSelectTask }) => {
  const [rangeMode, setRangeMode] = useState<CalendarRangeMode>('month');
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const days = buildCalendarDays(currentDate, rangeMode);
  const tasksOfDay = (iso: string) => sortCalendarEventsByTime<Task>(
    tasks.filter(task => String(task.deadline || '').slice(0, 10) === iso),
    task => task.deadline,
  );
  const inRange = days.reduce((total, day) => total + tasksOfDay(day.iso).length, 0);

  const isSettledTask = (task: Task) => ['completed', 'archived'].includes(String(task.status));
  const taskCard = (task: Task, compact = false, onOpen?: () => void) => {
    const status = taskStatuses.find(item => item.id === task.status);
    const due = calendarDueInfo(task.deadline, { settled: isSettledTask(task) });
    return (
      <CalendarEventCard
        key={task.id}
        kind="task"
        title={task.title}
        tone={due.tone}
        status={{ label: status?.label || String(task.status), color: status?.color || '#64748b' }}
        timeLabel={calendarTimeLabel(task.deadline) || 'تمام روز'}
        meta={projects.find(project => project.id === task.projectId)?.name}
        compact={compact}
        onOpen={onOpen || (() => onSelectTask(task.id))}
      />
    );
  };
  const renderDay = (iso: string) => {
    const rows = tasksOfDay(iso);
    return <>{rows.map(task => taskCard(task))}</>;
  };

  return (
    <section className="space-y-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4" dir="rtl" aria-label="تقویم وظایف من">
      <CalendarRangeToolbar
        mode={rangeMode}
        onModeChange={setRangeMode}
        label={calendarRangeLabel(currentDate, rangeMode)}
        title="تقویم وظایف من"
        hint={`${inRange.toLocaleString('fa-IR')} وظیفه در این بازه · سررسیدها رنگی‌اند`}
        onShift={direction => onDateChange(shiftCalendarAnchor(currentDate, rangeMode, direction))}
        onToday={() => onDateChange(new Date())}
      />
      <CalendarGrid
        days={days}
        mode={rangeMode}
        onSelectDay={setSelectedDay}
        agendaHint="در نمای هفتگی، زیر عنوان هر روز کارت‌ها به ترتیب ساعت می‌آیند."
        eventCount={day => tasksOfDay(day.iso).length}
        renderEvents={day => renderDay(day.iso)}
        emptyDayLabel="وظیفه‌ای با این سررسید ندارید."
      />
      <CalendarDayModal
        day={selectedDay}
        count={selectedDay ? tasksOfDay(selectedDay.iso).length : 0}
        onClose={() => setSelectedDay(null)}
        emptyText="برای این روز وظیفه‌ای با این سررسید ندارید."
        hint="وظایف من"
      >
        {selectedDay && (() => {
          const rows = tasksOfDay(selectedDay.iso);
          const card = (task: Task) => (
            <div key={`modal-${task.id}`} className="space-y-1">
              {taskCard(task, false, () => { setSelectedDay(null); onSelectTask(task.id); })}
              {task.estimatedHours ? <div className="px-1 text-[10px] font-bold text-slate-500">برآورد {task.estimatedHours.toLocaleString('fa-IR')} ساعت</div> : null}
            </div>
          );
          return <>{rows.map(card)}</>;
        })()}
      </CalendarDayModal>
    </section>
  );
};
