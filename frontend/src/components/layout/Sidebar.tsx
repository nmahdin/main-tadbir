import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ActiveView } from '../../types';
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Users2,
  BarChart3,
  Settings,
  Plus,
  LogOut,
  ChevronLeft,
  ShieldCheck,
  Briefcase,
  UserCheck,
  Layers,
  Users,
  Shield,
  Building2,
  FolderOpen,
  MessageSquare,
  User as UserIcon,
  Lightbulb,
  PenTool,
  Share2,
  Network,
  ChevronDown,
  CalendarPlus,
  Zap,
  Archive
} from 'lucide-react';

export const Sidebar: React.FC<{ isOpen?: boolean; onClose?: () => void }> = ({
  isOpen = false,
  onClose = () => {}
}) => {
  const {
    activeView,
    setActiveView,
    currentUser,
    tasks,
    projects,
    notifications,
    templates,
    conversations,
    ideas,
    contents,
    setSelectedProjectId,
    setIsCreateTaskOpen,
    setIsCreateProjectOpen,
    setIsCreateContentOpen,
    setIsTemplatesModalOpen,
    requestMeetingModal,
    logout,
    users,
    roles,
    hasPermission
  } = useApp();

  const myTasksCount = tasks.filter(
    t => t.assigneeId === currentUser.id && t.status !== 'completed' && t.status !== 'archived'
  ).length;

  const unreadMessagesCount = (conversations || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  // فقط ایده‌های پایان‌نیافته شمرده می‌شوند (پایان‌یافته/پیاده‌سازی‌شده/ردشده حساب نمی‌شوند)
  const activeIdeasCount = (ideas || []).filter(i => !['implemented', 'completed', 'rejected'].includes(i.status)).length;
  // فقط پروژه‌های خاتمه‌نیافته شمرده می‌شوند
  const activeProjectsCount = (projects || []).filter(p => !['completed', 'cancelled', 'archived'].includes(p.status)).length;

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const quickAddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setIsQuickAddOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canManageUsers = hasPermission('users.view') || currentUser.role === 'admin';
  const canManageRoles = hasPermission('roles.view') || hasPermission('users.roles') || currentUser.role === 'admin';
  const canViewSettings = currentUser.role === 'admin';

  const rawNavItems = [
    {
      id: 'dashboard' as ActiveView,
      label: 'داشبورد',
      icon: <LayoutDashboard className="w-4 h-4" />,
      permission: 'projects.view'
    },
    {
      id: 'thought-room' as ActiveView,
      label: 'اتاق فکر و ایده‌ها',
      icon: <Lightbulb className="w-4 h-4" />,
      badge: activeIdeasCount > 0 ? activeIdeasCount : null,
      badgeColor: 'bg-amber-100 text-amber-800',
      permission: 'thinktank.view'
    },
    {
      id: 'my-tasks' as ActiveView,
      label: 'وظایف من',
      icon: <CheckSquare className="w-4 h-4" />,
      badge: myTasksCount > 0 ? myTasksCount : null,
      badgeColor: 'bg-indigo-100 text-indigo-700',
      permission: 'tasks.view'
    },
    {
      id: 'messages' as ActiveView,
      label: 'پیام‌ها و گفتگوها',
      icon: <MessageSquare className="w-4 h-4" />,
      badge: unreadMessagesCount > 0 ? unreadMessagesCount : null,
      badgeColor: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'projects' as ActiveView,
      label: 'پروژه‌ها',
      icon: <FolderKanban className="w-4 h-4" />,
      badge: activeProjectsCount,
      badgeColor: 'bg-slate-100 text-slate-700',
      permission: 'projects.view'
    },
    {
      id: 'assets' as ActiveView,
      label: 'دارایی‌های دیجیتال (DAM)',
      icon: <FolderOpen className="w-4 h-4" />,
      permission: 'assets.view'
    },
    {
      id: 'content' as ActiveView,
      label: 'مدیریت و تولید محتوا',
      icon: <PenTool className="w-4 h-4" />,
      badge: contents.length > 0 ? contents.length : null,
      badgeColor: 'bg-emerald-100 text-emerald-700',
      permission: 'content.view'
    },
    {
      id: 'content-publishing' as ActiveView,
      label: 'انتشار محتوا',
      icon: <Share2 className="w-4 h-4" />,
      permission: 'content.view'
    },
    {
      id: 'content-published' as ActiveView,
      label: 'محتوای منتشرشده',
      icon: <CheckSquare className="w-4 h-4" />,
      permission: 'content.view'
    },
    {
      id: 'archive' as ActiveView,
      label: 'بایگانی',
      icon: <Archive className="w-4 h-4" />,
      permission: 'projects.view'
    },
    {
      id: 'departments' as ActiveView,
      label: 'ساختار سازمانی',
      icon: <Network className="w-4 h-4" />
    },
    {
      id: 'teams' as ActiveView,
      label: 'تیم‌ها و ساختار',
      icon: <Users2 className="w-4 h-4" />
    },
    {
      id: 'analytics' as ActiveView,
      label: 'گزارش و تحلیل‌ها',
      icon: <BarChart3 className="w-4 h-4" />,
      permission: 'reports.view'
    }
  ];

  const mainNavItems = rawNavItems.filter(item => {
    if (!item.permission) return true;
    return hasPermission(item.permission as any) || currentUser.role === 'admin';
  });

  const handleNavClick = (viewId: ActiveView) => {
    if (viewId === 'templates') {
      setIsTemplatesModalOpen(true);
      return;
    }
    setActiveView(viewId);
    if (viewId !== 'project-detail') {
      setSelectedProjectId(null);
    }
    onClose();
  };

  const handleProjectClick = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveView('project-detail');
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          id="sidebar-backdrop"
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 right-0 z-40 w-64 bg-white border-l border-slate-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Workspace Brand Header */}
        <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 text-base tracking-tight">
                سامانه تدبیر
              </span>
            </div>
          </div>
        </div>

        {/* Quick Add Dropdown */}
        <div className="px-4 py-3 space-y-2">
          <div className="relative" ref={quickAddRef}>
            <button
              id="sidebar-quick-add-btn"
              onClick={() => setIsQuickAddOpen(value => !value)}
              className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs transition-all shadow-md shadow-indigo-200 cursor-pointer group"
            >
              <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
              <span>ایجاد جدید</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            </button>
            {isQuickAddOpen && (
              <div className="absolute top-full right-0 left-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-right">
                <button
                  onClick={() => { setIsCreateTaskOpen(true); setIsQuickAddOpen(false); }}
                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                  <span>تسک جدید</span>
                </button>
                <button
                  onClick={() => { setIsTemplatesModalOpen(true); setIsQuickAddOpen(false); }}
                  className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>استفاده از الگوی پروژه</span>
                </button>
                {(currentUser.role === 'admin' || currentUser.role === 'project_manager') && (
                  <button
                    onClick={() => { setIsCreateProjectOpen(true); setIsQuickAddOpen(false); }}
                    className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <FolderKanban className="w-4 h-4 text-indigo-600" />
                    <span>پروژه جدید</span>
                  </button>
                )}
                {hasPermission('content.create') && (
                  <button
                    onClick={() => { setIsCreateContentOpen(true); setIsQuickAddOpen(false); }}
                    className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <PenTool className="w-4 h-4 text-rose-600" />
                    <span>محتوای جدید</span>
                  </button>
                )}
                {hasPermission('thinktank.create_idea') && (
                  <button
                    onClick={() => { setActiveView('thought-room'); setIsQuickAddOpen(false); }}
                    className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    <span>ایده جدید</span>
                  </button>
                )}
                {hasPermission('thinktank.manage_meetings') && (
                  <button
                    onClick={() => { setActiveView('thought-room'); requestMeetingModal(); setIsQuickAddOpen(false); }}
                    className="w-full px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <CalendarPlus className="w-4 h-4 text-emerald-600" />
                    <span>جلسه جدید</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          {/* Main Workspaces */}
          <nav className="space-y-1">
            {mainNavItems.map(item => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-50/80 text-indigo-700 font-extrabold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isActive ? 'text-indigo-600' : 'text-slate-500'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== null && item.badge !== undefined && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${item.badgeColor}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Management & Access Control Section (RBAC) */}
          {(canManageUsers || canManageRoles) && (
            <div>
              <div className="px-3 mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  مدیریت و دسترسی‌ها
                </span>

              </div>
              <div className="space-y-1">
                {canManageUsers && (
                  <button
                    id="nav-item-user-management"
                    onClick={() => handleNavClick('user-management')}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeView === 'user-management'
                        ? 'bg-indigo-50 text-indigo-700 font-extrabold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className={`w-4 h-4 ${activeView === 'user-management' ? 'text-indigo-600' : 'text-slate-500'}`} />
                      <span>مدیریت کاربران</span>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                      {users.length}
                    </span>
                  </button>
                )}

                {canManageRoles && (
                  <button
                    id="nav-item-roles-management"
                    onClick={() => handleNavClick('roles-management')}
                    className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activeView === 'roles-management'
                        ? 'bg-indigo-50 text-indigo-700 font-extrabold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldCheck className={`w-4 h-4 ${activeView === 'roles-management' ? 'text-indigo-600' : 'text-slate-500'}`} />
                      <span>نقش‌ها و دسترسی‌ها</span>
                    </div>
                  </button>
                )}

                {canViewSettings && <button
                  id="nav-item-settings"
                  onClick={() => handleNavClick('settings')}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeView === 'settings'
                      ? 'bg-indigo-50 text-indigo-700 font-extrabold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Settings className={`w-4 h-4 ${activeView === 'settings' ? 'text-indigo-600' : 'text-slate-500'}`} />
                    <span>تنظیمات سامانه</span>
                  </div>
                </button>}
              </div>
            </div>
          )}

          {/* Quick Projects List removed from sidebar */}
          {false && <div>
            <div className="flex items-center justify-between px-3 mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                پروژه‌های فعال
              </span>
              <button
                id="sidebar-quick-add-project"
                onClick={() => setIsCreateProjectOpen(true)}
                title="ایجاد پروژه"
                className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {projects.slice(0, 5).map(proj => {
                return (
                  <button
                    key={proj.id}
                    id={`sidebar-project-${proj.id}`}
                    onClick={() => handleProjectClick(proj.id)}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors group cursor-pointer text-right"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: proj.color }}
                      />
                      <span className="truncate">{proj.name}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      {proj.progress}٪
                    </span>
                  </button>
                );
              })}
            </div>
          </div>}

        </div>

        {/* Footer Logout */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <button
            id="sidebar-logout-btn"
            onClick={logout}
            title="خروج از حساب"
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-2xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer text-xs font-bold"
          >
            <LogOut className="w-4 h-4" />
            <span>خروج از حساب</span>
          </button>
        </div>
      </aside>
    </>
  );
};
