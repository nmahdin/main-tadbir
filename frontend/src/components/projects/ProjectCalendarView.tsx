import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, ExternalLink } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, getDaysInMonth, getDay, isSameDay } from 'date-fns-jalali';

type CalendarFilter = 'work' | 'content' | 'all';
type CalendarEvent = { id: string; entityId: string; kind: 'project' | 'task' | 'content'; title: string; date: string; subtitle: string; color: string };

export const ProjectCalendarView: React.FC<{ projectId?: string; filterAssignee?: string }> = ({ projectId, filterAssignee = 'all' }) => {
  const { tasks, projects, contents, setSelectedTaskId, setSelectedProjectId, setSelectedContentId, setActiveView } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filter, setFilter] = useState<CalendarFilter>(projectId ? 'work' : 'all');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const workEvents: CalendarEvent[] = [
    ...projects.filter(project => !projectId || project.id === projectId).map(project => ({ id: `project-${project.id}`, entityId: project.id, kind: 'project' as const, title: project.name, date: project.deadline, subtitle: `پروژه • ${project.progress}٪ پیشرفت`, color: project.color || '#4f46e5' })),
    ...tasks.filter(task => (!projectId || task.projectId === projectId) && (filterAssignee === 'all' || task.assigneeId === filterAssignee)).map(task => ({ id: `task-${task.id}`, entityId: task.id, kind: 'task' as const, title: task.title, date: task.deadline, subtitle: 'تسک', color: projects.find(project => project.id === task.projectId)?.color || '#0ea5e9' }))
  ].filter(event => event.date);
  const contentEvents: CalendarEvent[] = contents.filter(content => content.deadline).map(content => ({ id: `content-${content.id}`, entityId: content.id, kind: 'content' as const, title: content.title, date: content.deadline!, subtitle: `محتوا • ${content.status}`, color: '#e11d48' }));
  const events = filter === 'work' ? workEvents : filter === 'content' ? contentEvents : [...workEvents, ...contentEvents];
  const daysInMonth = getDaysInMonth(currentDate);
  let firstDayIndex = getDay(startOfMonth(currentDate)) + 1;
  if (firstDayIndex === 7) firstDayIndex = 0;

  const showFull = () => {
    if (!selectedEvent) return;
    if (selectedEvent.kind === 'task') setSelectedTaskId(selectedEvent.entityId);
    if (selectedEvent.kind === 'project') { setSelectedProjectId(selectedEvent.entityId); setActiveView('project-detail'); }
    if (selectedEvent.kind === 'content') { setSelectedContentId(selectedEvent.entityId); setActiveView('content-detail'); }
    setSelectedEvent(null);
  };

  return <div className="space-y-4" dir="rtl">
    {!projectId && <div className="bg-white rounded-2xl border border-slate-200 p-2 flex flex-wrap gap-2">{([['work', 'پروژه‌ها و تسک‌ها'], ['content', 'محتواها'], ['all', 'ترکیب همه موعدها']] as const).map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${filter === value ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}</div>}
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap"><div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><CalendarIcon className="w-5 h-5" /></div><div><h3 className="text-base sm:text-lg font-bold text-slate-900">{format(currentDate, 'MMMM yyyy')}</h3><p className="text-xs text-slate-600">نمای زمان‌بندی و سررسیدها</p></div></div><div className="flex items-center gap-2" dir="ltr"><button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-lg border border-slate-200 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button><button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 cursor-pointer">امروز</button><button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-lg border border-slate-200 cursor-pointer"><ChevronRight className="w-4 h-4" /></button></div></div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-600 py-2 border-b border-slate-100">{['شنبه','یک‌شنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'].map(day => <div key={day}>{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-2 auto-rows-fr">{Array.from({ length: firstDayIndex }).map((_, index) => <div key={`empty-${index}`} className="min-h-[105px] rounded-xl bg-slate-50/40 border border-slate-100/60" />)}{Array.from({ length: daysInMonth }).map((_, index) => { const day = index + 1; const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - Number(format(currentDate, 'd')) + day); const dayEvents = events.filter(event => isSameDay(new Date(event.date), dayDate)); const today = isSameDay(dayDate, new Date()); return <div key={day} className={`min-h-[105px] p-2 rounded-xl border ${today ? 'bg-indigo-50/40 border-indigo-300' : 'bg-white border-slate-200'}`}><div className={`text-xs font-bold mb-2 ${today ? 'text-indigo-700' : 'text-slate-700'}`}>{day}</div><div className="space-y-1 max-h-20 overflow-y-auto">{dayEvents.map(event => <button key={event.id} onClick={() => setSelectedEvent(event)} className="w-full px-1.5 py-1 rounded-md text-[10px] font-bold text-right truncate bg-slate-50 hover:bg-indigo-50 border border-slate-200 cursor-pointer"><span className="inline-block w-1.5 h-1.5 rounded-full ml-1" style={{ backgroundColor: event.color }} />{event.title}</button>)}</div></div>; })}</div>
    </div>
    {selectedEvent && <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"><div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-5 space-y-4"><div className="flex items-start justify-between"><div><span className="text-[11px] font-bold text-indigo-600">{selectedEvent.subtitle}</span><h3 className="font-black text-slate-900 mt-1">{selectedEvent.title}</h3></div><button onClick={() => setSelectedEvent(null)} className="p-2 rounded-xl hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button></div><div className="p-3 rounded-2xl bg-slate-50 text-xs text-slate-600">موعد: {new Date(selectedEvent.date).toLocaleDateString('fa-IR')}</div><button onClick={showFull} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"><ExternalLink className="w-4 h-4" />مشاهده کامل</button></div></div>}
  </div>;
};
