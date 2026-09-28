/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { AuthModal } from './components/auth/AuthModal';

// Views
import { DashboardView } from './components/dashboard/DashboardView';
import { ProjectsView } from './components/projects/ProjectsView';
import { ProjectDetailView } from './components/projects/ProjectDetailView';
import { MyTasksView } from './components/tasks/MyTasksView';
import { DepartmentsView } from './components/departments/DepartmentsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { ActivityView } from './components/activity/ActivityView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { SettingsView } from './components/settings/SettingsView';
import { ProjectCalendarView } from './components/projects/ProjectCalendarView';
import { UserManagementView } from './components/users/UserManagementView';
import { RoleManagementView } from './components/roles/RoleManagementView';
import { UserProfileView } from './components/users/UserProfileView';
import { DamMainView } from './components/dam/DamMainView';
import { ChatView } from './components/chat/ChatView';
import { ThoughtRoomMainView } from './components/thought-room/ThoughtRoomMainView';
import { SecretariatMainView } from './components/secretariat/SecretariatMainView';
import { ContentMainView } from './components/content/ContentMainView';
import { CreateContentModal } from './components/content/CreateContentModal';
import { ContentDetailView } from './components/content/ContentDetailView';
import { ContentPublishingView } from './components/content/ContentPublishingView';
import { ContentPublishedView } from './components/content/ContentPublishedView';
import { ArchiveView } from './components/archive/ArchiveView';

// Modals & Drawers
import { TaskDetailDrawer } from './components/tasks/TaskDetailDrawer';
import { CreateTaskModal } from './components/tasks/CreateTaskModal';
import { CreateProjectModal } from './components/projects/CreateProjectModal';
import { EditProjectModal } from './components/projects/EditProjectModal';
import { MemberDetailModal } from './components/users/MemberDetailModal';
import { TemplatesModal } from './components/templates/TemplatesModal';
import { TemplateEditorModal } from './components/templates/TemplateEditorModal';
import { UserModal } from './components/users/UserModal';
import { RoleModal } from './components/roles/RoleModal';
import { ErrorBoundary, ToastViewport, WorkspaceLoader } from './components/common/Feedback';

const shade = (hex: string, amount: number) => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return hex;
  const num = parseInt(normalized, 16);
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

const MainLayout: React.FC = () => {
  const { activeView, currentUser, isWorkspaceLoading, hasPermission, generalSettings } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  // اعمال سراسری رنگ سامانه: کلاس‌های اصلی indigo با رنگ انتخاب‌شده در تنظیمات بازنویسی می‌شوند.
  React.useEffect(() => {
    const theme = (generalSettings.themeColor || '#4f46e5').trim() || '#4f46e5';
    const styleId = 'tadbir-theme-overrides';
    document.getElementById(styleId)?.remove();
    if (theme.toLowerCase() === '#4f46e5') {
      document.documentElement.style.removeProperty('--app-primary');
      return;
    }
    document.documentElement.style.setProperty('--app-primary', theme);
    const dark = shade(theme, -28);
    const darker = shade(theme, -52);
    const darkest = shade(theme, -80);
    const light = `${theme}1a`;
    const lightHover = `${theme}2e`;
    const pale = `${theme}0d`;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .bg-indigo-600 { background-color: ${theme} !important; }
      .bg-indigo-500 { background-color: ${theme} !important; }
      .bg-indigo-700 { background-color: ${dark} !important; }
      .bg-indigo-800 { background-color: ${darker} !important; }
      .bg-indigo-900 { background-color: ${darkest} !important; }
      .bg-indigo-50 { background-color: ${light} !important; }
      .bg-indigo-100 { background-color: ${lightHover} !important; }
      .hover\:bg-indigo-50:hover { background-color: ${light} !important; }
      .hover\:bg-indigo-100:hover { background-color: ${lightHover} !important; }
      .hover\:bg-indigo-600:hover { background-color: ${theme} !important; }
      .hover\:bg-indigo-700:hover { background-color: ${dark} !important; }
      .active\:bg-indigo-700:active { background-color: ${dark} !important; }
      .active\:bg-indigo-800:active { background-color: ${darker} !important; }
      .group-hover\:bg-indigo-600:where(.group:hover *) { background-color: ${theme} !important; }
      .group-hover\:bg-indigo-50:where(.group:hover *) { background-color: ${light} !important; }
      .text-indigo-500, .text-indigo-600, .text-indigo-700 { color: ${theme} !important; }
      .text-indigo-800, .text-indigo-900 { color: ${darker} !important; }
      .hover\:text-indigo-600:hover, .hover\:text-indigo-700:hover, .hover\:text-indigo-800:hover { color: ${dark} !important; }
      .group-hover\:text-indigo-600:where(.group:hover *) { color: ${theme} !important; }
      .border-indigo-100, .border-indigo-200 { border-color: ${theme}44 !important; }
      .border-indigo-300, .border-indigo-400 { border-color: ${theme}88 !important; }
      .border-indigo-500, .border-indigo-600 { border-color: ${theme} !important; }
      .hover\:border-indigo-200:hover, .hover\:border-indigo-300:hover { border-color: ${theme}88 !important; }
      .focus\:border-indigo-400:focus, .focus\:border-indigo-500:focus { border-color: ${theme} !important; }
      .focus\:ring-indigo-100:focus, .focus\:ring-indigo-200:focus, .focus\:ring-indigo-400:focus, .focus\:ring-indigo-500:focus { --tw-ring-color: ${theme}66 !important; }
      .ring-indigo-200, .ring-indigo-400, .ring-indigo-500 { --tw-ring-color: ${theme}88 !important; }
      .shadow-indigo-100, .shadow-indigo-200 { --tw-shadow-color: ${theme}33 !important; }
      .from-indigo-500, .from-indigo-600 { --tw-gradient-from: ${theme} !important; }
      .from-indigo-900, .from-indigo-950 { --tw-gradient-from: ${darker} !important; }
      .to-indigo-500, .to-indigo-600 { --tw-gradient-to: ${theme} !important; }
      .via-indigo-100, .via-indigo-200 { --tw-gradient-via: ${light} !important; }
      .divide-indigo-100 > * + *, .divide-indigo-200 > * + * { border-color: ${theme}44 !important; }
      .accent-indigo-600 { accent-color: ${theme} !important; }
      .decoration-indigo-500, .decoration-indigo-600 { text-decoration-color: ${theme} !important; }
      ::selection { background-color: ${theme}44; }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById(styleId)?.remove(); };
  }, [generalSettings.themeColor]);

  // دسترسی مدیریت تنظیمات: مدیر سیستم یا دارندگان مجوزهای مرتبط
  const canManageSettings = hasPermission('settings.manage')
    || hasPermission('content.manage_process')
    || hasPermission('workflows.manage');

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'projects':
        return <ProjectsView />;
      case 'project-detail':
        return <ProjectDetailView />;
      case 'thought-room':
        return (
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <ThoughtRoomMainView />
          </div>
        );
      case 'content':
        return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><ContentMainView /></div>;
      case 'content-detail':
        return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><ContentDetailView /></div>;
      case 'content-publishing':
        return <ContentPublishingView />;
      case 'content-published':
        return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><ContentPublishedView /></div>;
      case 'archive':
        return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><ArchiveView /></div>;
      case 'departments':
        return <DepartmentsView/>;
      case 'secretariat':
        return (
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <SecretariatMainView />
          </div>
        );
      case 'assets':
        return (
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <DamMainView />
          </div>
        );
      case 'my-tasks':
        return <MyTasksView />;
      case 'messages':
        return <ChatView />;

      case 'calendar':
        return <ProjectCalendarView />;
      case 'analytics':
      case 'reports':
        return <AnalyticsView />;
      case 'activity':
        return <ActivityView />;
      case 'notifications':
        return <NotificationsView />;
      case 'settings':
        return canManageSettings ? <SettingsView /> : <DashboardView />;
      case 'user-management':
        return <UserManagementView />;
      case 'roles-management':
        return <RoleManagementView />;
      case 'user-profile':
        return <UserProfileView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans antialiased text-right" dir="rtl">
      {/* Navigation Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Navbar */}
        <TopNavbar onOpenSidebar={() => setIsSidebarOpen(true)} />

        {/* Scrollable View Canvas */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden focus:outline-hidden p-2 sm:p-3">
          {/* مرز خطای هر نما: کرش یک بخش، کل سامانه را از کار نمی‌اندازد. */}
          <ErrorBoundary resetKey={activeView}>
            {renderActiveView()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Modals & Overlays */}
      <GlobalSearchModal />
      <AuthModal />
      <TaskDetailDrawer />
      <CreateTaskModal />
      <CreateProjectModal />
      <EditProjectModal />
      <MemberDetailModal />
      <TemplatesModal />
      <TemplateEditorModal />
      <UserModal />
      <RoleModal />
      <CreateContentModal />

      {/* توست‌های بازخورد عملیات (موفق/خطا) */}
      <ToastViewport />

      {/* لودر تمام‌صفحه هنگام بارگذاری اولیه فضای کاری */}
      {isWorkspaceLoading && <WorkspaceLoader />}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
