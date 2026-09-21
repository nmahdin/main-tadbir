import React from 'react';
import { useApp } from '../../context/AppContext';
import { ActiveView } from '../../types';
import { Avatar } from '../common/Avatar';
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Users2,
  Calendar,
  BarChart3,
  Bell,
  Settings,
  Plus,
  LogOut,
  ChevronLeft,
  ShieldCheck,
  Briefcase,
  UserCheck,
  Layers,
  Activity,
  Users,
  Shield,
  Building2,
  FolderOpen,
  MessageSquare,
  User as UserIcon,
  Lightbulb,
  FileText,
  PenTool,
  Share2,
  Network
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
    assets,
    conversations,
    ideas,
    secretariatLetters,
    contents,
    setSelectedProjectId,
    setIsCreateTaskOpen,
    setIsCreateProjectOpen,
    setIsTemplatesModalOpen,
    logout,
    users,
    roles,
    hasPermission,
    setUserProfileId
  } = useApp();

  const myTasksCount = tasks.filter(
    t => t.assigneeId === currentUser.id && t.status !== 'completed'
  ).length;

  const activeAssetsCount = assets ? assets.filter(a => !a.isTrash).length : 0;
  const unreadMessagesCount = (conversations || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const activeIdeasCount = (ideas || []).length;
  const activeLettersCount = (secretariatLetters || []).length;

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
      id: 'secretariat' as ActiveView,
      label: 'دبیرخانه و مکاتبات',
      icon: <FileText className="w-4 h-4" />,
      badge: activeLettersCount > 0 ? activeLettersCount : null,
      badgeColor: 'bg-blue-100 text-blue-800',
      permission: 'secretariat.view'
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
      badge: projects.length,
      badgeColor: 'bg-slate-100 text-slate-700',
      permission: 'projects.view'
    },
    {
      id: 'assets' as ActiveView,
      label: 'دارایی‌های دیجیتال (DAM)',
      icon: <FolderOpen className="w-4 h-4" />,
      badge: activeAssetsCount > 0 ? activeAssetsCount : null,
      badgeColor: 'bg-amber-100 text-amber-700'
    },
    {
      id: 'content' as ActiveView,
      label: 'مدیریت و تولید محتوا',
      icon: <PenTool className="w-4 h-4" />,
      badge: contents.length > 0 ? contents.length : null,
      badgeColor: 'bg-emerald-100 text-emerald-700'
    },
    {
      id: 'content-publishing' as ActiveView,
      label: 'انتشار محتوا',
      icon: <Share2 className="w-4 h-4" />
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
      id: 'calendar' as ActiveView,
      label: 'تقویم زمان‌بندی',
      icon: <Calendar className="w-4 h-4" />,
      permission: 'projects.view'
    },
    {
      id: 'activity' as ActiveView,
      label: 'فید زنده فعالیت‌ها',
      icon: <Activity className="w-4 h-4" />,
      permission: 'projects.view'
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

  const getRoleBadge = () => {
    if (currentUser.role === 'admin') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold text-purple-700">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
          <span>مدیر ارشد</span>
        </span>
      );
    }
    if (currentUser.role === 'project_manager') {
      return (
        <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700">
          <Briefcase className="w-3.5 h-3.5 text-blue-600" />
          <span>مدیر پروژه</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>عضو تیم</span>
      </span>
    );
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
              <span className="font-extrabold text-slate-900 text-base tracking-tight flex items-center gap-1.5">
                سامانه تدبیر
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm bg-indigo-50 text-indigo-700">
                  سازمانی
                </span>
              </span>
              <p className="text-[11px] text-slate-500">مدیریت پروژه و منابع انسانی</p>
            </div>
          </div>
        </div>

        {/* Quick Action Button */}
        <div className="px-4 py-3 space-y-2">
          <button
            id="sidebar-new-task-btn"
            onClick={() => setIsCreateTaskOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs transition-all shadow-md shadow-indigo-200 cursor-pointer group"
          >
            <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-200" />
            <span>ایجاد تسک جدید</span>
          </button>
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
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
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
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-700">
                      {roles.length}
                    </span>
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

        {/* Footer User Profile & Logout */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-white transition-colors border border-transparent hover:border-slate-200">
            <div 
              onClick={() => {
                setUserProfileId(currentUser.id);
                setActiveView('user-profile');
                onClose();
              }}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
              title="مشاهده پروفایل من"
            >
              <Avatar user={currentUser} size="sm" />
              <div className="min-w-0 text-right">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {currentUser.name}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                  {getRoleBadge()}
                </div>
              </div>
            </div>
            <button
              id="sidebar-logout-btn"
              onClick={logout}
              title="خروج از حساب"
              className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
