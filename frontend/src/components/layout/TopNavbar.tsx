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
  Layers
} from 'lucide-react';

export const TopNavbar: React.FC<{ onOpenSidebar?: () => void }> = ({ onOpenSidebar }) => {
  const {
    activeView,
    currentUser,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    setIsSearchOpen,
    setIsCreateTaskOpen,
    setIsCreateProjectOpen,
    setIsCreateContentOpen,
    setIsCreateTeamOpen,
    setIsTemplatesModalOpen,
    setSelectedTaskId,
    setSelectedProjectId,
    setActiveView,
    setUserProfileId,
    hasPermission
  } = useApp();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const quickAddRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

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
    if (notif.linkTaskId) {
      setSelectedTaskId(notif.linkTaskId);
    }
    if (notif.linkProjectId) {
      setSelectedProjectId(notif.linkProjectId);
      setActiveView('project-detail');
    }
    setIsNotifOpen(false);
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
                  setIsCreateTaskOpen(true);
                  setIsQuickAddOpen(false);
                }}
                className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4 text-indigo-600" />
                <span>تسک جدید</span>
              </button>
              
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
                  <Zap className="w-4 h-4 text-amber-500" />
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
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span>ایده جدید</span>
                </button>
              )}

              {currentUser.role === 'admin' && (
                <button
                  onClick={() => {
                    setIsCreateTeamOpen(true);
                    setIsQuickAddOpen(false);
                  }}
                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>تیم جدید</span>
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

            </div>
          )}
        </div>

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
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900">{currentUser.name}</p>
                <p className="text-[11px] text-slate-600 truncate">{currentUser.email}</p>
                <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold">
                  {currentUser.role === 'admin' && <ShieldCheck className="w-3 h-3 text-purple-600" />}
                  {currentUser.role === 'project_manager' && <Briefcase className="w-3 h-3 text-blue-600" />}
                  {currentUser.role === 'team_member' && <UserCheck className="w-3 h-3 text-emerald-600" />}
                  <span>
                    {currentUser.role === 'admin' ? 'مدیر ارشد سازمان' : currentUser.role === 'project_manager' ? 'مدیر پروژه' : 'عضو تیم'}
                  </span>
                </div>
              </div>

              <div className="pt-1 px-2 space-y-0.5">
                <button
                  onClick={() => {
                    setUserProfileId(currentUser.id);
                    setActiveView('user-profile');
                    setIsUserDropdownOpen(false);
                  }}
                  className="w-full text-right px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  مشاهده پروفایل من
                </button>
                <button
                  onClick={() => {
                    setActiveView('user-management');
                    setIsUserDropdownOpen(false);
                  }}
                  className="w-full text-right px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded-lg font-bold transition-colors cursor-pointer"
                >
                  مدیریت کاربران و دسترسی‌ها
                </button>
                {currentUser.role === 'admin' && <button
                  onClick={() => {
                    setActiveView('settings');
                    setIsUserDropdownOpen(false);
                  }}
                  className="w-full text-right px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  تنظیمات سامانه
                </button>
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
