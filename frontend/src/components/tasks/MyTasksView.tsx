import { useUrlFilter } from '../../routing/useUrlFilter';
import React, { useState } from 'react';
import { formatToJalaliLong } from '../../utils/jalali';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { ModuleErrorBanner } from '../common/Feedback';
import { CalendarEventKindIcon } from '../calendar/CalendarKindIcon';
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
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, getDaysInMonth, getDay, isSameDay } from 'date-fns-jalali';

type ViewMode = 'list' | 'kanban' | 'calendar';

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
  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'today' | 'overdue' | 'week'>('all');
  const [viewMode, setViewMode] = useUrlFilter<ViewMode>('view', 'list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetCol, setDropTargetCol] = useState<string | null>(null);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // My tasks
  const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);

  const filteredTasks = myTasks.filter(t => {
    const matchesStatus = statusFilter === 'overdue' ? !['completed', 'archived'].includes(t.status) && !!t.deadline && t.deadline < todayStr
      : statusFilter === 'all' ? t.status !== 'archived' : t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;

    let matchesTimeframe = true;
    if (timeframeFilter === 'today') {
      matchesTimeframe = t.deadline === todayStr;
    } else if (timeframeFilter === 'overdue') {
      matchesTimeframe = t.status !== 'completed' && t.deadline < todayStr;
    } else if (timeframeFilter === 'week') {
      const taskDate = new Date(t.deadline).getTime();
      const now = new Date().getTime();
      matchesTimeframe = taskDate >= now && taskDate <= now + 7 * 86400000;
    }

    return matchesStatus && matchesPriority && matchesTimeframe;
  });

  const overdueCount = myTasks.filter(t => t.status !== 'completed' && t.deadline < todayStr).length;
  const inProgressCount = myTasks.filter(t => t.status === 'in_progress').length;
  const completedCount = myTasks.filter(t => t.status === 'completed').length;

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
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right pb-20" dir="rtl">
      {/* نمایش خطای بارگذاری این بخش برای دیباگ آسان */}
      <ModuleErrorBanner modules={['tasks']} label="وظایف" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-indigo-600" />
            <span>وظایف من</span>
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            مدیریت وظایف محول شده، پیگیری موعدهای مقرر و اولویت‌بندی کارها
          </p>
        </div>
        <button
          onClick={() => setIsCreateTaskOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>وظیفه جدید</span>
        </button>
      </div>

      {/* Stats KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => { setTimeframeFilter('all'); setStatusFilter('all'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            timeframeFilter === 'all' && statusFilter === 'all'
              ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-slate-600">کل وظایف</span>
            <ListTodo className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-2xl font-black text-slate-900">{myTasks.length}</span>
        </button>

        <button
          onClick={() => { setTimeframeFilter('all'); setStatusFilter('in_progress'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            statusFilter === 'in_progress'
              ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-indigo-700">در حال انجام</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-2xl font-black text-indigo-700">{inProgressCount}</span>
        </button>

        <button
          onClick={() => { setTimeframeFilter('overdue'); setStatusFilter('all'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            timeframeFilter === 'overdue'
              ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-rose-700">تأخیردار</span>
            {overdueCount > 0 && <AlertTriangle className="w-4 h-4 text-rose-600" />}
          </div>
          <span className="text-2xl font-black text-rose-600">{overdueCount}</span>
        </button>

        <button
          onClick={() => { setTimeframeFilter('all'); setStatusFilter('completed'); }}
          className={`p-5 rounded-2xl border text-right transition-all cursor-pointer flex flex-col justify-between h-[100px] ${
            statusFilter === 'completed'
              ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-200'
              : 'bg-white border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-xs font-bold text-emerald-700">تکمیل‌شده</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <span className="text-2xl font-black text-emerald-600">{completedCount}</span>
        </button>
      </div>

      {/* Filter and view controls */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
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
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">همه اولویت‌ها</option>
              {[...taskPriorities].sort((a, b) => a.order - b.order).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}
              title="نمایش لیستی"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}
              title="نمایش کانبان"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'calendar' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}
              title="نمایش تقویمی"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Task Content Area */}
      {filteredTasks.length === 0 && viewMode !== 'calendar' ? (
        <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 border-dashed">
          <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-900 mb-1">وظیفه‌ای یافت نشد</h3>
          <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
            هیچ وظیفه‌ای با فیلترهای فعلی شما مطابقت ندارد یا تمام کارهای خود را انجام داده‌اید!
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right text-slate-600">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-6 py-4 font-bold rounded-tr-3xl">عنوان وظیفه</th>
                  <th scope="col" className="px-6 py-4 font-bold">پروژه مرتبط</th>
                  <th scope="col" className="px-6 py-4 font-bold">وضعیت</th>
                  <th scope="col" className="px-6 py-4 font-bold">اولویت</th>
                  <th scope="col" className="px-6 py-4 font-bold">سررسید</th>
                  <th scope="col" className="px-6 py-4 font-bold rounded-tl-3xl text-center">عملیات</th>
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
                      className={`hover:bg-slate-50 transition-colors cursor-pointer group ${isCompleted ? 'bg-slate-50/50' : ''}`}
                    >
                      <td className="px-6 py-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!(task.kind === 'content_review' && isCompleted)) moveTaskStatus(task.id, isCompleted ? 'todo' : 'completed');
                            }}
                            disabled={task.kind === 'content_review' && (isCompleted || !hasPermission('content.approve'))}
                            title={task.kind === 'content_review' && !isCompleted ? 'تکمیل این وظیفه، مرحله محتوا را نیز تأیید می‌کند' : undefined}
                            className={`w-5 h-5 rounded-md border-2 transition-colors flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-default ${
                              isCompleted
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'border-slate-300 hover:border-emerald-500 bg-white'
                            }`}
                          >
                            {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </button>
                          <span className={`${isCompleted ? 'line-through text-slate-500 font-medium' : ''}`}>
                            {task.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {proj ? (
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: proj.color }}></span>
                            <span className="font-bold">{proj.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <button
                            onClick={() => setStatusMenuTaskId(statusMenuTaskId === task.id ? null : task.id)}
                            disabled={task.kind === 'content_review' && (task.status === 'completed' || !hasPermission('content.approve'))}
                            title={task.kind === 'content_review' ? 'تأیید مرحله محتوا و تکمیل وظیفه' : 'تغییر وضعیت'}
                            className="cursor-pointer rounded-lg hover:ring-2 hover:ring-indigo-200 transition-all"
                          >
                            <TaskStatusBadge status={task.status} size="sm" />
                          </button>
                          {statusMenuTaskId === task.id && (
                            <>
                              <div
                                className="fixed inset-0 z-40 cursor-default"
                                onClick={() => setStatusMenuTaskId(null)}
                              />
                              <div className="absolute top-full right-0 mt-1.5 z-50 min-w-[170px] bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 animate-in fade-in zoom-in-95 duration-100">
                                <p className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400">تغییر وضعیت به:</p>
                                {(task.kind === 'content_review' ? statusMenuOptions.filter(status => status.id === 'completed') : statusMenuOptions).map(s => (
                                  <button
                                    key={s.id}
                                    onClick={() => {
                                      if (task.status !== s.id) {
                                        moveTaskStatus(task.id, s.id as typeof task.status);
                                      }
                                      setStatusMenuTaskId(null);
                                    }}
                                    className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                                      task.status === s.id
                                        ? 'bg-indigo-50 text-indigo-700'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                    <span>{s.label}</span>
                                    {task.status === s.id && <CheckCircle2 className="w-3.5 h-3.5 mr-auto" />}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <PriorityPill priority={task.priority} size="sm" />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 font-bold text-xs ${
                          isPastDue ? 'text-rose-600 bg-rose-50 px-2 py-1 rounded-lg' : 'text-slate-600'
                        }`}>
                          <Calendar className="w-4 h-4" />
                          <span>{formatToJalaliLong(task.deadline)}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer">
                          <MoreVertical className="w-4 h-4" />
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
        /* KANBAN VIEW */
        <div className="flex items-start gap-4 overflow-x-auto pb-4 snap-x">
          {orderedStatuses.map((col) => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setDropTargetCol(col.id); }}
                onDragLeave={() => setDropTargetCol(prev => prev === col.id ? null : prev)}
                onDrop={(e) => { e.preventDefault(); handleKanbanDrop(col.id); }}
                className={`min-w-[280px] sm:min-w-[320px] w-full max-w-sm flex flex-col shrink-0 snap-center rounded-3xl p-3 border transition-all ${
                  dropTargetCol === col.id
                    ? 'bg-indigo-50/70 border-indigo-300 ring-2 ring-indigo-200'
                    : 'bg-slate-50/50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-4 px-2 border-r-4" style={{ borderColor: col.color }}>
                  <h3 className="text-sm font-extrabold text-slate-800 pr-2">{col.label}</h3>
                  <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>

                <div className="flex flex-col gap-3">
                  {colTasks.map(task => {
                    const proj = projects.find(p => p.id === task.projectId);
                    return (
                      <div
                        key={task.id}
                        draggable={task.kind !== 'content_review' || (task.status !== 'completed' && hasPermission('content.approve'))}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDraggedTaskId(task.id); }}
                        onDragEnd={() => { setDraggedTaskId(null); setDropTargetCol(null); }}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group ${
                          draggedTaskId === task.id ? 'opacity-40 shadow-lg' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <PriorityPill priority={task.priority} size="sm" />
                          {proj && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {proj.name}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-extrabold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors leading-tight">
                          {task.title}
                        </h4>
                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                          <span className={`text-[10px] font-bold flex items-center gap-1 ${task.deadline < todayStr && task.status !== 'completed' ? 'text-rose-600' : 'text-slate-500'}`}>
                            <Calendar className="w-3.5 h-3.5" />
                            {formatToJalaliLong(task.deadline)}
                          </span>
                          {task.estimatedHours && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                              {task.estimatedHours}h
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className={`p-4 border-2 border-dashed rounded-2xl text-center transition-colors ${
                      dropTargetCol === col.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'
                    }`}>
                      <span className="text-xs font-medium text-slate-400">
                        {dropTargetCol === col.id ? 'رها کنید تا منتقل شود' : 'خالی — تسک را اینجا بکشید'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* CALENDAR VIEW */
        <MyTasksCalendar
          tasks={filteredTasks}
          projects={projects}
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
  projects: { id: string; name: string; color: string }[];
  currentDate: Date;
  onDateChange: (d: Date) => void;
  onSelectTask: (id: string) => void;
}> = ({ tasks, projects, currentDate, onDateChange, onSelectTask }) => {
  const daysInMonth = getDaysInMonth(currentDate);
  let firstDayIndex = getDay(startOfMonth(currentDate)) + 1;
  if (firstDayIndex === 7) firstDayIndex = 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">{format(currentDate, 'MMMM yyyy')}</h3>
            <p className="text-xs text-slate-600">سررسید وظایف من در نمای ماهانه</p>
          </div>
        </div>
        <div className="flex items-center gap-2" dir="ltr">
          <button onClick={() => onDateChange(subMonths(currentDate, 1))} className="p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => onDateChange(new Date())} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 cursor-pointer hover:bg-slate-200">
            امروز
          </button>
          <button onClick={() => onDateChange(addMonths(currentDate, 1))} className="p-2 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-600 py-2 border-b border-slate-100">
        {['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'].map(day => <div key={day}>{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2 auto-rows-fr">
        {Array.from({ length: firstDayIndex }).map((_, index) => (
          <div key={`empty-${index}`} className="min-h-[95px] rounded-xl bg-slate-50/40 border border-slate-100/60" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - Number(format(currentDate, 'd')) + day);
          const dayTasks = tasks.filter(t => t.deadline && isSameDay(new Date(t.deadline), dayDate));
          const today = isSameDay(dayDate, new Date());
          return (
            <div key={day} className={`min-h-[95px] p-2 rounded-xl border ${today ? 'bg-indigo-50/40 border-indigo-300' : 'bg-white border-slate-200'}`}>
              <div className={`text-xs font-bold mb-2 ${today ? 'text-indigo-700' : 'text-slate-700'}`}>{day}</div>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {dayTasks.map(task => {
                  const color = projects.find(p => p.id === task.projectId)?.color || '#0ea5e9';
                  return (
                    <button
                      key={task.id}
                      onClick={() => onSelectTask(task.id)}
                      className="w-full px-1.5 py-1 rounded-md text-[10px] font-bold text-right bg-slate-50 hover:bg-indigo-50 border border-slate-200 cursor-pointer flex items-center gap-1 min-w-0"
                    >
                      <span className="inline-flex items-center gap-1 shrink-0"><CalendarEventKindIcon kind="task" /><span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} /></span>
                      <span className="truncate">{task.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
