import { useNotifications } from '../../queries/resources';
import React, { useState } from 'react';
import {
  Bell,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Clock,
  Trash2,
  CheckCheck,
  ExternalLink,
  Inbox
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppNotification } from '../../types';

type FilterKey = 'all' | 'unread' | 'assignment' | 'deadline' | 'overdue' | 'comment' | 'status_change' | 'system';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'همه' },
  { key: 'unread', label: 'خوانده‌نشده' },
  { key: 'assignment', label: 'تخصیص‌ها' },
  { key: 'deadline', label: 'سررسیدها' },
  { key: 'overdue', label: 'تأخیرها' },
  { key: 'comment', label: 'دیدگاه‌ها' },
  { key: 'status_change', label: 'تغییر وضعیت' },
  { key: 'system', label: 'سیستمی' },
];

const getNotifIcon = (type: string) => {
  switch (type) {
    case 'assignment':
      return <UserCheck className="w-5 h-5 text-indigo-600" />;
    case 'overdue':
      return <AlertTriangle className="w-5 h-5 text-rose-600" />;
    case 'status_change':
      return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
    case 'comment':
      return <MessageSquare className="w-5 h-5 text-amber-600" />;
    case 'deadline':
      return <Clock className="w-5 h-5 text-purple-600" />;
    default:
      return <Bell className="w-5 h-5 text-slate-600" />;
  }
};

export const NotificationsView: React.FC = () => {
  const { data: notifications = [] } = useNotifications();
  const {

    tasks,
    projects,
    ideas,
    contents,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearNotification,
    setSelectedTaskId,
    setSelectedProjectId,
    setSelectedIdeaId,
    setSelectedContentId,
    setActiveView,
    notify,
  } = useApp();
  const [filter, setFilter] = useState<FilterKey>('all');

  const unreadCount = notifications.filter(n => !n.read).length;

  const filtered = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const hasLink = (notif: AppNotification) =>
    Boolean(notif.linkTaskId || notif.linkProjectId || notif.linkIdeaId || notif.linkContentId || notif.linkMeetingId);

  const openNotification = (notif: AppNotification) => {
    markNotificationAsRead(notif.id);
    if (notif.linkTaskId) {
      if (tasks.some(t => t.id === notif.linkTaskId)) setSelectedTaskId(notif.linkTaskId);
      else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این تسک حذف شده یا در دسترس نیست.' });
    } else if (notif.linkProjectId) {
      if (projects.some(pr => pr.id === notif.linkProjectId)) {
        setSelectedProjectId(notif.linkProjectId);
        setActiveView('project-detail');
      } else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این پروژه حذف شده یا در دسترس نیست.' });
    } else if (notif.linkIdeaId) {
      if (ideas.some(i => i.id === notif.linkIdeaId)) {
        setSelectedIdeaId(notif.linkIdeaId);
        setActiveView('thought-room');
      } else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این ایده حذف شده یا در دسترس نیست.' });
    } else if (notif.linkContentId) {
      if (contents.some(c => c.id === notif.linkContentId)) {
        setSelectedContentId(notif.linkContentId);
        setActiveView('content-detail');
      } else notify({ type: 'error', title: 'مورد مرتبط یافت نشد', message: 'این محتوا حذف شده یا در دسترس نیست.' });
    } else if (notif.linkMeetingId) {
      setActiveView('thought-room');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-5 animate-in fade-in duration-300" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">مرکز اعلان‌ها</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} اعلان خوانده‌نشده دارید` : 'همه اعلان‌ها خوانده شده‌اند'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsAsRead}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer w-fit"
          >
            <CheckCheck className="w-4 h-4" />
            علامت‌گذاری همه به‌عنوان خوانده‌شده
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-2 flex gap-2 overflow-x-auto">
        {FILTERS.map(f => {
          const count = f.key === 'all'
            ? notifications.length
            : f.key === 'unread'
              ? unreadCount
              : notifications.filter(n => n.type === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                filter === f.key ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-500">اعلانی در این دسته وجود ندارد.</p>
          </div>
        ) : (
          filtered.map(notif => (
            <div
              key={notif.id}
              className={`p-4 flex items-start gap-3.5 transition-colors ${!notif.read ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}
            >
              <div className="p-2.5 rounded-xl bg-slate-100 shrink-0">
                {getNotifIcon(notif.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-bold text-slate-900">{notif.title}</p>
                  {!notif.read && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{notif.message}</p>
                <span className="text-[11px] text-slate-400 mt-1.5 block">
                  {new Date(notif.timestamp).toLocaleString('fa-IR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {hasLink(notif) && (
                  <button
                    onClick={() => openNotification(notif)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold cursor-pointer"
                    title="مشاهده مورد مرتبط"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    مشاهده
                  </button>
                )}
                {!notif.read && (
                  <button
                    onClick={() => markNotificationAsRead(notif.id)}
                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                    title="علامت‌گذاری به‌عنوان خوانده‌شده"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => clearNotification(notif.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title="حذف اعلان"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
