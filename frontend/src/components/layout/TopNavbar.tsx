import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Avatar } from '../common/Avatar';
import {
  Menu,
  Search,
  Plus,
  Bell,
  Check,
  ChevronDown,
  Zap,
  Clock,
  ShieldCheck,
  Briefcase,
  UserCheck,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  Calendar,
  CalendarPlus,
  FolderKanban,
  Layers,
  Lightbulb,
  LogOut,
  Building2,
  X,
  AlarmClock,
  ExternalLink
} from 'lucide-react';

export const TopNavbar: React.FC<{ onOpenSidebar?: () => void }> = ({ onOpenSidebar }) => {
  const {
    activeView,
    currentUser,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    tasks,
    setIsSearchOpen,
    setIsCreateTaskOpen,
    setIsCreateProjectOpen,
    setIsCreateContentOpen,
    setIsCreateTeamOpen,
    setIsTemplatesModalOpen,
    setSelectedTaskId,
    setSelectedProjectId,
    requestMeetingModal,
    setActiveView,
    setUserProfileId,
    hasPermission,
    roles,
    logout
  } = useApp();

  const currentRoleName = roles.find(r => r.id === currentUser.roleId || r.key === currentUser.role)?.name
    || (currentUser.role === 'admin' ? 'مدیر سیستم' : currentUser.role === 'project_manager' ? 'مدیر پروژه' : 'عضو تیم');

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);
  const [focusedNotif, setFocusedNotif] = useState<typeof notifications[0] | null>(null);

  const notifRef = useRef<HTMLDivElement>(null);

  const quickAddRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const nowStart = new Date();
  nowStart.setHours(0, 0, 0, 0);
  const dueSoonTasks = tasks
    .filter(t => t.assigneeId === currentUser.id && t.deadline && t.status !== 'completed' && t.status !== 'cancelled')
    .map(t => ({ task: t, daysLeft: Math.ceil((new Date(t.deadline as string).getTime() - nowStart.getTime()) / 86400000) }))
    .filter(({ daysLeft }) => daysLeft <= 3)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const overdueCount = dueSoonTasks.filter(({ daysLeft }) => daysLeft < 0).length;
  const tickerItem = dueSoonTasks.length ? dueSoonTasks[tickerIndex % dueSoonTasks.length] : null;

  useEffect(() => { setTickerIndex(0); }, [dueSoonTasks.length]);

  // چرخش خودکار تیکر تسک‌های نزدیک به موعد (هر ۲.۵ ثانیه، بدون مودال)
  useEffect(() => {
    if (tickerPaused || dueSoonTasks.length < 2) return;
    const timer = window.setInterval(() => setTickerIndex(value => (value + 1) % dueSoonTasks.length), 2500);
    return () => window.clearInterval(timer);
  }, [tickerPaused, dueSoonTasks.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setIsQuickAddOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getViewTitle = () => {
    switch (activeView) {
      case 'dashboard':
        return 'داشبورد کلی سازمان';
      case 'my-tasks':
        return 'وظایف و اولویت‌های من';
      case 'projects':
        return 'مدیریت و سبد پروژه‌ها';
      case 'project-detail':
        return 'فضای کاری پروژه';
      case 'teams':
        return 'تیم‌ها، اعضا و بار کاری';
      case 'calendar':
        return 'تقویم سررسیدها و رویدادها';
      case 'activity':
        return 'فید زنده فعالیت کاربران';
      case 'analytics':
      case 'reports':
        return 'تحلیل، عملکرد و گزارش‌ها';
      case 'notifications':
        return 'مرکز اعلانات و هشدارها';
      case 'settings':
        return 'تنظیمات فضای کاری';
      case 'user-management':
        return 'مدیریت کاربران و دسترسی‌ها';
      case 'roles-management':
        return 'مدیریت نقش‌ها و مجوزها';
      case 'user-profile':
        return 'پروفایل کاربری';
      default:
        return 'سامانه تدبیر';
    }
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'assignment':
        return <UserCheck className="w-4 h-4 text-indigo-600" />;
      case 'overdue':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      case 'status_change':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'comment':
        return <MessageSquare className="w-4 h-4 text-amber-600" />;
      case 'deadline':
        return <Clock className="w-4 h-4 text-purple-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-600" />;
    }
  };

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    markNotificationAsRead(notif.id);
    setIsNotifOpen(false);
    setFocusedNotif(notif);
  };

  const openFocusedNotifTarget = () => {
    if (!focusedNotif) return;
    if (focusedNotif.linkTaskId) {
      setSelectedTaskId(focusedNotif.linkTaskId);
    }
    if (focusedNotif.linkProjectId) {
      setSelectedProjectId(focusedNotif.linkProjectId);
      setActiveView('project-detail');
    }
    setFocusedNotif(null);
  };

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between text-right">
      {/* Right section: Hamburger & View title in RTL */}
      <div className="flex items-center gap-3">
        {onOpenSidebar && (
          <button
            id="mobile-sidebar-toggle"
            onClick={onOpenSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="باز کردن منو"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="hidden sm:block">
          <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
            {getViewTitle()}
          </h1>
          <p className="text-[11px] text-slate-600">
            خوش‌آمدید، <span className="font-bold text-slate-800">{currentUser.name}</span>
          </p>
        </div>
      </div>

      {/* Middle: Global Search trigger */}
      <div className="flex-1 max-w-md mx-2 sm:mx-4 hidden sm:block">
        <button
          id="top-search-bar"
          onClick={() => setIsSearchOpen(true)}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-sm text-slate-600 transition-all shadow-2xs group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-4 h-4 text-slate-600 group-hover:text-indigo-600 transition-colors" />
            <span className="text-xs font-normal truncate">جستجوی سیستم...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-md shadow-2xs">
            <span>⌘</span>K
          </kbd>
        </button>
      </div>
      <div className="flex-1 sm:hidden flex justify-end mx-2">
         <button
            onClick={() => setIsSearchOpen(true)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
         >
            <Search className="w-5 h-5" />
         </button>
      </div>

      {/* Left Action Icons in RTL */}
      <div className="flex items-center gap-2">
        {/* Calendar shortcut */}
        <button
          id="top-calendar-btn"
          onClick={() => setActiveView('calendar')}
          title="تقویم زمان‌بندی"
          className={`p-2 rounded-xl transition-colors cursor-pointer ${activeView === 'calendar' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          aria-label="تقویم"
        >
          <Calendar className="w-4 h-4" />
        </button>
        {/* Quick Add Button */}
        <div className="relative" ref={quickAddRef}>
          <button
            id="top-quick-add-btn"
            onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">ایجاد جدید</span>
            <ChevronDown className="w-3 h-3 text-indigo-500" />
          </button>

          {isQuickAddOpen && (
            <div className="absolute left-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-right">
              <button
                onClick={() => {
                  setIsTemplatesModalOpen(true);
                  setIsQuickAddOpen(false);
                }}
                className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Layers className="w-4 h-4 text-purple-600" />
                <span>استفاده از الگوی پروژه</span>
              </button>

              {(currentUser.role === 'admin' || currentUser.role === 'project_manager') && (
                <button
                  onClick={() => {
                    setIsCreateProjectOpen(true);
                    setIsQuickAddOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <FolderKanban className="w-4 h-4 text-indigo-600" />
                  <span>پروژه جدید</span>
                </button>
              )}

              {hasPermission('content.create') && (
                <button
                  onClick={() => {
                    setIsCreateContentOpen(true);
                    setIsQuickAddOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-rose-600" />
                  <span>محتوای جدید</span>
                </button>
              )}

              {hasPermission('thinktank.create_idea') && (
                <button
                  onClick={() => {
                    setActiveView('thought-room');
                    setIsQuickAddOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span>ایده جدید</span>
                </button>
              )}

              {hasPermission('thinktank.manage_meetings') && (
                <button
                  onClick={() => {
                    setActiveView('thought-room');
                    requestMeetingModal();
                    setIsQuickAddOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <CalendarPlus className="w-4 h-4 text-emerald-600" />
                  <span>جلسه جدید</span>
                </button>
              )}

            </div>
          )}
        </div>

        {/* Notifications Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            id="top-notifications-bell"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="اعلان‌ها"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute left-0 mt-2 w-[calc(100vw-2rem)] sm:w-96 max-w-[320px] sm:max-w-none bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 text-right">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">مرکز اعلان‌ها</span>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700">
                      {unreadCount} جدید
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllNotificationsAsRead}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                  >
                    علامت‌گذاری همه به عنوان خوانده‌شده
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600">
                    در حال حاضر اعلانی وجود ندارد.
                  </div>
                ) : (
                  notifications.slice(0, 6).map(notif => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors flex items-start gap-3 ${
                        !notif.read ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <div className="p-2 rounded-xl bg-slate-100 shrink-0 mt-0.5">
                        {getNotifIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <span className="text-[10px] text-slate-600 mt-1 block">
                          {new Date(notif.timestamp).toLocaleTimeString('fa-IR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => {
                  setIsNotifOpen(false);
                  setActiveView('notifications');
                }}
                className="w-full mt-1 px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 border-t border-slate-100 transition-colors cursor-pointer"
              >
                مشاهده همه اعلان‌ها در مرکز اعلان‌ها
              </button>
            </div>
          )}
        </div>

        {/* Due-tasks ticker: چرخش خودکار بدون مودال؛ کلیک مستقیم به تسک می‌رود */}
        {tickerItem && (
          <button
            id="top-due-tasks-ticker"
            onClick={() => setSelectedTaskId(tickerItem.task.id)}
            onMouseEnter={() => setTickerPaused(true)}
            onMouseLeave={() => setTickerPaused(false)}
            title={`${tickerItem.task.title} — مشاهده تسک`}
            className={`hidden md:flex min-w-0 max-w-60 items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors cursor-pointer ${tickerItem.daysLeft < 0 ? 'border-rose-200 bg-rose-50 hover:bg-rose-100' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'}`}
          >
            <span className="relative shrink-0">
              <AlarmClock className={`w-4 h-4 ${tickerItem.daysLeft < 0 ? 'text-rose-600' : 'text-amber-600'}`} />
              {dueSoonTasks.length > 1 && (
                <span className="absolute -top-1.5 -left-1.5 min-w-4 h-4 px-0.5 rounded-full bg-slate-900 text-[9px] font-black text-white flex items-center justify-center">
                  {dueSoonTasks.length}
                </span>
              )}
            </span>
            <span key={`${tickerItem.task.id}-${tickerIndex}`} className="min-w-0 flex-1 truncate text-right text-[11px] font-bold text-slate-800 animate-in fade-in duration-300">
              {tickerItem.task.title}
            </span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black ${tickerItem.daysLeft < 0 ? 'bg-rose-500 text-white' : tickerItem.daysLeft === 0 ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
              {tickerItem.daysLeft < 0 ? `${Math.abs(tickerItem.daysLeft)} روز تأخیر` : tickerItem.daysLeft === 0 ? 'امروز' : `${tickerItem.daysLeft} روز`}
            </span>
          </button>
        )}

{/* User Persona Picker Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            id="top-user-avatar-btn"
            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
            className="flex items-center gap-2 p-1 pr-1.5 rounded-full hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
          >
            <Avatar user={currentUser} size="sm" />
            <span className="hidden md:inline-block text-xs font-bold text-slate-800 max-w-[100px] truncate">
              {currentUser.name}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-600 hidden md:inline-block" />
          </button>

          {isUserDropdownOpen && (
            <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-right">
              <div className="px-4 py-3 border-b border-slate-100 space-y-1">
                <div className="flex items-center gap-2.5">
                  <Avatar user={currentUser} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900 truncate">{currentUser.name}</p>
                    <p className="text-[11px] text-indigo-600 font-mono font-bold truncate" dir="ltr">
                      @{currentUser.username || currentUser.email.split('@')[0]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{currentRoleName}</span>
                  </span>
                  {currentUser.department && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                      <Building2 className="w-3 h-3 text-slate-500" />
                      <span className="truncate max-w-[140px]">{currentUser.department}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-1 px-2 space-y-0.5">
                <button
                  onClick={() => {
                    setUserProfileId(currentUser.id);
                    setActiveView('user-profile');
                    setIsUserDropdownOpen(false);
                  }}
                  className="w-full text-right px-3 py-2 text-xs text-indigo-700 hover:bg-indigo-50 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  مشاهده پروفایل
                </button>
                <button
                  onClick={() => {
                    setIsUserDropdownOpen(false);
                    void logout();
                  }}
                  className="w-full text-right px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج از حساب</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification mini-modal */}
      {focusedNotif && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setFocusedNotif(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-100 shrink-0">
                  {getNotifIcon(focusedNotif.type)}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">{focusedNotif.title}</h4>
                  <span className="text-[10px] text-slate-400">
                    {new Date(focusedNotif.timestamp).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              </div>
              <button onClick={() => setFocusedNotif(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 rounded-xl p-3">
              {focusedNotif.message}
            </p>
            <div className="flex items-center gap-2">
              {(focusedNotif.linkTaskId || focusedNotif.linkProjectId) && (
                <button
                  onClick={openFocusedNotifTarget}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  مشاهده مورد مرتبط
                </button>
              )}
              <button
                onClick={() => setFocusedNotif(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
