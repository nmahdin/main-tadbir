import { useNotifications } from '../../queries/resources';
import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Inbox,
  MessageSquare,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppNotification } from '../../types';

type StatusFilter = 'all' | 'unread' | 'read';
type CategoryFilter = 'all' | 'tasks' | 'meetings' | 'comments' | 'content' | 'system';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'همه' },
  { key: 'unread', label: 'خوانده‌نشده' },
  { key: 'read', label: 'خوانده‌شده' },
];

const CATEGORIES: { key: CategoryFilter; label: string; icon: React.ElementType; tone: string }[] = [
  { key: 'all', label: 'همه اعلان‌ها', icon: Bell, tone: 'text-slate-600' },
  { key: 'tasks', label: 'وظایف', icon: UserCheck, tone: 'text-indigo-600' },
  { key: 'meetings', label: 'جلسه‌ها', icon: CalendarDays, tone: 'text-sky-600' },
  { key: 'comments', label: 'دیدگاه‌ها', icon: MessageSquare, tone: 'text-amber-600' },
  { key: 'content', label: 'محتوا', icon: FileText, tone: 'text-violet-600' },
  { key: 'system', label: 'سامانه', icon: Bell, tone: 'text-slate-500' },
];

const categoryOf = (notification: AppNotification): Exclude<CategoryFilter, 'all'> => {
  const explicit = notification.notificationCategory;
  if (explicit === 'tasks') return 'tasks';
  if (explicit === 'meetings') return 'meetings';
  if (explicit === 'collaboration') return 'comments';
  if (explicit === 'content') return 'content';
  if (notification.type === 'comment' || notification.type === 'mention' || notification.type === 'reply') return 'comments';
  if (notification.linkMeetingId) return 'meetings';
  if (notification.linkTaskId || ['assignment', 'deadline', 'overdue', 'status_change'].includes(notification.type)) return 'tasks';
  if (notification.linkContentId) return 'content';
  return 'system';
};

const notificationIcon = (notification: AppNotification) => {
  const category = categoryOf(notification);
  if (notification.type === 'overdue') return <AlertTriangle className="h-5 w-5 text-rose-600" />;
  if (notification.type === 'deadline') return <Clock className="h-5 w-5 text-purple-600" />;
  if (category === 'tasks') return <UserCheck className="h-5 w-5 text-indigo-600" />;
  if (category === 'meetings') return <CalendarDays className="h-5 w-5 text-sky-600" />;
  if (category === 'comments') return <MessageSquare className="h-5 w-5 text-amber-600" />;
  if (category === 'content') return <FileText className="h-5 w-5 text-violet-600" />;
  if (notification.type === 'status_change') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  return <Bell className="h-5 w-5 text-slate-600" />;
};

export const NotificationsView: React.FC = () => {
  const { data: notifications = [] } = useNotifications();
  const {
    tasks, projects, ideas, contents,
    markNotificationAsRead, markAllNotificationsAsRead, clearNotification,
    setSelectedTaskId, setSelectedProjectId, setSelectedIdeaId, setSelectedContentId,
    setActiveView, notify,
  } = useApp();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const unreadCount = notifications.filter(notification => !notification.read).length;
  const filtered = notifications.filter(notification => {
    const statusMatches = status === 'all' || (status === 'unread' ? !notification.read : notification.read);
    const categoryMatches = category === 'all' || categoryOf(notification) === category;
    return statusMatches && categoryMatches;
  });

  const hasLink = (notification: AppNotification) => Boolean(notification.linkTaskId || notification.linkProjectId || notification.linkIdeaId || notification.linkContentId || notification.linkMeetingId);
  const openNotification = (notification: AppNotification) => {
    markNotificationAsRead(notification.id);
    if (notification.linkTaskId) {
      if (tasks.some(task => task.id === notification.linkTaskId)) setSelectedTaskId(notification.linkTaskId);
      else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این وظیفه حذف شده یا در دسترس نیست.' });
    } else if (notification.linkProjectId) {
      if (projects.some(project => project.id === notification.linkProjectId)) { setSelectedProjectId(notification.linkProjectId); setActiveView('project-detail'); }
      else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این پروژه حذف شده یا در دسترس نیست.' });
    } else if (notification.linkIdeaId) {
      if (ideas.some(idea => idea.id === notification.linkIdeaId)) { setSelectedIdeaId(notification.linkIdeaId); setActiveView('thought-room'); }
      else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این ایده حذف شده یا در دسترس نیست.' });
    } else if (notification.linkContentId) {
      if (contents.some(content => content.id === notification.linkContentId)) { setSelectedContentId(notification.linkContentId); setActiveView('content-detail'); }
      else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این محتوا حذف شده یا در دسترس نیست.' });
    } else if (notification.linkMeetingId) setActiveView('thought-room');
  };

  return <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8" dir="rtl">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Bell className="h-5 w-5" /></span><div><h1 className="text-xl font-black text-slate-900">مرکز اعلان‌ها</h1><p className="mt-0.5 text-xs text-slate-500">{unreadCount ? `${unreadCount.toLocaleString('fa-IR')} اعلان خوانده‌نشده دارید` : 'همه اعلان‌ها خوانده شده‌اند'}</p></div></div>
      {unreadCount > 0 && <button onClick={markAllNotificationsAsRead} className="ui-button ui-button-secondary w-fit text-xs"><CheckCheck className="h-4 w-4" />خواندن همه</button>}
    </header>

    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-black text-slate-500">وضعیت اعلان‌ها</span><div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">{STATUS_FILTERS.map(item => <button key={item.key} type="button" onClick={() => setStatus(item.key)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${status === item.key ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}{item.key === 'unread' && unreadCount > 0 ? ` (${unreadCount.toLocaleString('fa-IR')})` : ''}</button>)}</div></div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">{CATEGORIES.map(item => { const Icon = item.icon; const count = item.key === 'all' ? notifications.length : notifications.filter(notification => categoryOf(notification) === item.key).length; return <button key={item.key} type="button" onClick={() => setCategory(item.key)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition ${category === item.key ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent bg-slate-50 text-slate-600 hover:border-slate-200'}`}><Icon className={`h-3.5 w-3.5 ${category === item.key ? 'text-indigo-600' : item.tone}`} />{item.label}<span className="text-[9px] opacity-70">{count.toLocaleString('fa-IR')}</span></button>; })}</div>
    </section>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
      {!filtered.length ? <div className="p-12 text-center"><Inbox className="mx-auto mb-2 h-10 w-10 text-slate-300" /><p className="text-sm font-bold text-slate-500">اعلانی در این دسته وجود ندارد.</p></div> : filtered.map(notification => {
        const notificationCategory = categoryOf(notification);
        const categoryConfig = CATEGORIES.find(item => item.key === notificationCategory)!;
        return <article key={notification.id} className={`flex items-start gap-3.5 p-4 transition-colors ${notification.read ? 'hover:bg-slate-50' : 'bg-indigo-50/40'}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">{notificationIcon(notification)}</span>
          <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-slate-900">{notification.title}</p>{!notification.read && <span className="h-2 w-2 rounded-full bg-indigo-600" />}<span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{categoryConfig.label}</span></div><p className="whitespace-pre-line text-xs leading-6 text-slate-600">{notification.message}</p><time className="mt-1.5 block text-[10px] text-slate-400">{new Date(notification.timestamp).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>
          <div className="flex shrink-0 items-center gap-1">
            {hasLink(notification) && <button onClick={() => openNotification(notification)} className="ui-button ui-button-ghost !min-h-8 !px-2 text-[10px]" title="مشاهده مورد مرتبط"><ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">مشاهده</span></button>}
            {!notification.read && <button onClick={() => markNotificationAsRead(notification.id)} className="ui-button ui-button-ghost ui-icon-button text-emerald-600" title="خوانده‌شده" aria-label="علامت‌گذاری به‌عنوان خوانده‌شده"><CheckCircle2 className="h-4 w-4" /></button>}
            <button onClick={() => clearNotification(notification.id)} className="ui-button ui-button-ghost ui-icon-button text-slate-400 hover:text-rose-600" title="حذف اعلان" aria-label="حذف اعلان"><Trash2 className="h-4 w-4" /></button>
          </div>
        </article>;
      })}
    </div>
  </div>;
};
