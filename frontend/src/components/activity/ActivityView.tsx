import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import { ActivityType } from '../../types';
import {
  Activity,
  Search,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  MessageSquare,
  Clock,
  Paperclip,
  PlusCircle,
  Layers,
  Users
} from 'lucide-react';

export const ActivityView: React.FC = () => {
  const { 
    activities, 
    users, 
    projects, 
    setSelectedTaskId, 
    setSelectedProjectId, 
    setActiveView
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterUserId, setFilterUserId] = useState<string>('all');

  const filteredActivities = activities.filter(act => {
    const user = users.find(u => u.id === act.userId);
    const matchesSearch =
      !searchTerm ||
      act.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.taskTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user?.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = filterType === 'all' || act.type === filterType;
    const matchesUser = filterUserId === 'all' || act.userId === filterUserId;

    return matchesSearch && matchesType && matchesUser;
  });

  const getActionBadge = (type?: ActivityType) => {
    switch (type) {
      case 'status_change':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
          label: 'تغییر وضعیت',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
      case 'comment':
        return {
          icon: <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />,
          label: 'دیدگاه',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200'
        };
      case 'blocker':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />,
          label: 'مانع / بلاکر',
          bg: 'bg-rose-50 text-rose-700 border-rose-200'
        };
      case 'attachment':
        return {
          icon: <Paperclip className="w-3.5 h-3.5 text-sky-600" />,
          label: 'فایل پیوست',
          bg: 'bg-sky-50 text-sky-700 border-sky-200'
        };
      case 'task_created':
        return {
          icon: <PlusCircle className="w-3.5 h-3.5 text-blue-600" />,
          label: 'ایجاد تسک',
          bg: 'bg-blue-50 text-blue-700 border-blue-200'
        };
      case 'template_created':
      case 'template_applied':
        return {
          icon: <Layers className="w-3.5 h-3.5 text-purple-600" />,
          label: 'الگوی پروژه',
          bg: 'bg-purple-50 text-purple-700 border-purple-200'
        };
      case 'team_update':
      case 'member_assigned':
        return {
          icon: <Users className="w-3.5 h-3.5 text-amber-600" />,
          label: 'تیم و اعضا',
          bg: 'bg-amber-50 text-amber-700 border-amber-200'
        };
      default:
        return {
          icon: <Activity className="w-3.5 h-3.5 text-slate-600" />,
          label: 'رویداد سیستم',
          bg: 'bg-slate-50 text-slate-700 border-slate-200'
        };
    }
  };

  const formatPersianTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
      if (diffMinutes < 1) return 'هم‌اکنون';
      if (diffMinutes < 60) return `${diffMinutes} دقیقه پیش`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} ساعت پیش`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'دیروز';
      if (diffDays < 7) return `${diffDays} روز پیش`;
      return date.toLocaleDateString('fa-IR');
    } catch {
      return 'اخیراً';
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-right">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                فید زنده فعالیت‌ها و رویدادهای سازمان
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                گزارش بلادرنگ اقدامات اعضای تیم، تغییر وضعیت وظایف، ثبت دیدگاه‌ها و نشانه‌های پیشرفت پروژه‌ها
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-600 absolute right-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجو در رویدادها، عناوین تسک‌ها، پروژه‌ها و کاربران..."
            className="w-full pr-9 pl-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="all">همه انواع رویدادها</option>
            <option value="status_change">تغییر وضعیت تسک</option>
            <option value="comment">دیدگاه‌ها</option>
            <option value="blocker">موانع و بلاکرها</option>
            <option value="attachment">فایل‌های پیوست</option>
            <option value="task_created">ایجاد تسک</option>
            <option value="template_applied">الگوهای پروژه</option>
            <option value="team_update">به‌روزرسانی تیم</option>
          </select>

          <select
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-hidden"
          >
            <option value="all">همه کاربران</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Activity Timeline Feed */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-6 sm:p-8">
        {filteredActivities.length === 0 ? (
          <div className="text-center py-16">
            <Activity className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">هیچ رویدادی مطابق با فیلترها یافت نشد</p>
            <p className="text-xs text-slate-600 mt-1">فعالیت‌های ثبت‌شده سامانه در این بخش نمایش داده می‌شوند.</p>
          </div>
        ) : (
          <div className="relative border-r-2 border-indigo-100 mr-4 pr-6 space-y-6">
            {filteredActivities.map((act) => {
              const user = users.find(u => u.id === act.userId);
              const project = act.projectId ? projects.find(p => p.id === act.projectId) : null;
              const badge = getActionBadge(act.type);

              return (
                <div key={act.id} className="relative group">
                  {/* Timeline Marker Dot */}
                  <div className="absolute -right-[33px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center shadow-xs group-hover:scale-125 transition-transform">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  </div>

                  <div className="bg-slate-50/70 group-hover:bg-indigo-50/20 border border-slate-200/70 group-hover:border-indigo-200 rounded-2xl p-4 sm:p-5 transition-all space-y-2.5">
                    {/* Top Row: User, Action, Type Badge, Time */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <Avatar user={user} size="sm" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{user?.name || 'کاربر سیستم'}</span>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.bg}`}>
                              {badge.icon}
                              <span>{badge.label}</span>
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 font-medium mt-0.5">{act.action}</p>
                        </div>
                      </div>

                      <span className="text-[11px] text-slate-600 font-medium flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                        <Clock className="w-3 h-3 text-slate-600" />
                        {formatPersianTime(act.timestamp)}
                      </span>
                    </div>

                    {/* Details Box */}
                    {act.details && (
                      <div className="pr-10 text-xs text-slate-700 bg-white/80 p-3 rounded-xl border border-slate-100 leading-relaxed font-normal">
                        {act.details}
                      </div>
                    )}

                    {/* Context Links: Project, Task */}
                    <div className="flex items-center gap-2 pr-10 pt-1 flex-wrap">
                      {project && (
                        <button
                          onClick={() => {
                            setSelectedProjectId(project.id);
                            setActiveView('project-detail');
                          }}
                          className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
                          style={{ backgroundColor: project.color }}
                        >
                          <FolderKanban className="w-3 h-3" />
                          <span>{project.name}</span>
                        </button>
                      )}

                      {act.taskId && (
                        <button
                          onClick={() => setSelectedTaskId(act.taskId!)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          مشاهده تسک ({act.taskTitle || act.taskId})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
