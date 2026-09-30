import { ArchiveWorkspace } from './components/workspace/ArchiveWorkspace';
import { ApprovalCenter } from './components/workspace/ApprovalCenter';
import { ActionDashboard } from './components/workspace/ActionDashboard';
import { WorkspaceList } from './components/workspace/WorkspaceList';
import { NotificationInbox } from './components/workspace/NotificationInbox';
import { DetailContext } from './components/workspace/details';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './queries/queryClient';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIProvider } from './context/UIContext';
import { ProtectedRoute } from './routing/ProtectedRoute';
import { RouteEntity } from './routing/RouteEntity';
import { readTaskLink } from './utils/taskDeepLink';
import { runtime } from './config/runtime';
import { LoadingState, ErrorState, Button } from './components/common/Primitives';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { GlobalSearchModal } from './components/layout/GlobalSearchModal';
import { AuthModal } from './components/auth/AuthModal';

// Views
const DashboardView = React.lazy(() => import('./components/dashboard/DashboardView').then(m => ({default:m.DashboardView})));
const ProjectsView = React.lazy(() => import('./components/projects/ProjectsView').then(m => ({default:m.ProjectsView})));
import { ProjectDetailView } from './components/projects/ProjectDetailView';
const MyTasksView = React.lazy(() => import('./components/tasks/MyTasksView').then(m => ({default:m.MyTasksView})));
const DepartmentsView = React.lazy(() => import('./components/departments/DepartmentsView').then(m => ({default:m.DepartmentsView})));
const AnalyticsView = React.lazy(() => import('./components/analytics/AnalyticsView').then(m => ({default:m.AnalyticsView})));
const ActivityView = React.lazy(() => import('./components/activity/ActivityView').then(m => ({default:m.ActivityView})));
const NotificationsView = React.lazy(() => import('./components/notifications/NotificationsView').then(m => ({default:m.NotificationsView})));
const SettingsView = React.lazy(() => import('./components/settings/SettingsView').then(m => ({default:m.SettingsView})));
const ProjectCalendarView = React.lazy(() => import('./components/projects/ProjectCalendarView').then(m => ({default:m.ProjectCalendarView})));
const UserManagementView = React.lazy(() => import('./components/users/UserManagementView').then(m => ({default:m.UserManagementView})));
const RoleManagementView = React.lazy(() => import('./components/roles/RoleManagementView').then(m => ({default:m.RoleManagementView})));
const UserProfileView = React.lazy(() => import('./components/users/UserProfileView').then(m => ({default:m.UserProfileView})));
const DamMainView = React.lazy(() => import('./components/dam/DamMainView').then(m => ({default:m.DamMainView})));
const ChatView = React.lazy(() => import('./components/chat/ChatView').then(m => ({default:m.ChatView})));
const ThoughtRoomMainView = React.lazy(() => import('./components/thought-room/ThoughtRoomMainView').then(m => ({default:m.ThoughtRoomMainView})));
const SecretariatMainView = React.lazy(() => import('./components/secretariat/SecretariatMainView').then(m => ({default:m.SecretariatMainView})));
const ContentMainView = React.lazy(() => import('./components/content/ContentMainView').then(m => ({default:m.ContentMainView})));
import { CreateContentModal } from './components/content/CreateContentModal';
const ContentDetailView = React.lazy(() => import('./components/content/ContentDetailView').then(m => ({default:m.ContentDetailView})));
const ContentPublishingView = React.lazy(() => import('./components/content/ContentPublishingView').then(m => ({default:m.ContentPublishingView})));
const ContentPublishedView = React.lazy(() => import('./components/content/ContentPublishedView').then(m => ({default:m.ContentPublishedView})));
const ArchiveView = React.lazy(() => import('./components/archive/ArchiveView').then(m => ({default:m.ArchiveView})));

// Modals & Drawers
import { TaskDetailDrawer } from './components/tasks/TaskDetailDrawer';
import { CreateTaskModal } from './components/tasks/CreateTaskModal';
import { CreateProjectModal } from './components/projects/CreateProjectModal';
import { MemberDetailModal } from './components/users/MemberDetailModal';
import { TemplatesModal } from './components/templates/TemplatesModal';
import { TemplateEditorModal } from './components/templates/TemplateEditorModal';
import { UserModal } from './components/users/UserModal';
import { RoleModal } from './components/roles/RoleModal';
import { ErrorBoundary, ToastViewport, WorkspaceLoader } from './components/common/Feedback';

const MainLayout: React.FC = () => {
  const { activeView, currentUser, isWorkspaceLoading, hasPermission, generalSettings } = useApp();
  const location = useLocation();
  const taskPage = /^\/tasks\/[^/]+$/.test(location.pathname) && new URLSearchParams(location.search).get('display') === 'page';
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    const color = /^#[0-9a-f]{6}$/i.test(generalSettings.themeColor || '') ? generalSettings.themeColor! : '#4f46e5';
    const style = document.documentElement.style;
    style.setProperty('--color-primary', color);
    style.setProperty('--color-primary-hover', `color-mix(in srgb, ${color} 85%, black)`);
    return () => { style.removeProperty('--color-primary'); style.removeProperty('--color-primary-hover'); };
  }, [generalSettings.themeColor]);

  // دسترسی مدیریت تنظیمات: مدیر سیستم یا دارندگان مجوزهای مرتبط
  const canManageSettings = hasPermission('settings.manage')
    || hasPermission('content.manage_process')
    || hasPermission('workflows.manage');

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return runtime.demoMode ? <DashboardView /> : <ActionDashboard />;
      case 'projects':
        return runtime.demoMode ? <ProjectsView /> : <WorkspaceList key="projects" module="projects" />;
      case 'project-detail':
        return <><DetailContext module="projects" /><ProjectDetailView /></>;
      case 'thought-room':
        return (
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <ThoughtRoomMainView />
          </div>
        );
      case 'content':
        return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{runtime.demoMode ? <ContentMainView /> : <WorkspaceList key="contents" module="contents" />}</div>;
      case 'content-detail':
        return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><DetailContext module="contents" /><ContentDetailView /></div>;
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
        return taskPage ? null : runtime.demoMode ? <MyTasksView /> : <WorkspaceList key="tasks" module="tasks" />;
      case 'messages':
        return <ChatView />;

      case 'calendar':
        return <ProjectCalendarView />;
      case 'analytics':
      case 'reports':
        return <AnalyticsView />;
      case 'activity':
        return <ActivityView />;
      case 'approvals': return <ApprovalCenter />;
      case 'notifications':
        return <NotificationInbox />;
      case 'settings':
        return canManageSettings ? <SettingsView /> : <ErrorState title="شما مجوز مشاهدهٔ این صفحه را ندارید." />;
      case 'user-management':
        return <UserManagementView />;
      case 'roles-management':
        return <RoleManagementView />;
      case 'user-profile':
        return <UserProfileView />;
      default:
        return runtime.demoMode ? <DashboardView /> : <ActionDashboard />;
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
        <main tabIndex={-1} className="flex-1 overflow-y-auto overflow-x-hidden focus:outline-hidden p-2 sm:p-3">
          {/* مرز خطای هر نما: کرش یک بخش، کل سامانه را از کار نمی‌اندازد. */}
          <ErrorBoundary resetKey={activeView}><React.Suspense fallback={<LoadingState />}>
            <RouteEntity>{isWorkspaceLoading && !['dashboard','projects','my-tasks','content','notifications','approvals'].includes(activeView) ? <LoadingState /> : renderActiveView()}<TaskDetailDrawer /></RouteEntity>
          </React.Suspense></ErrorBoundary>
        </main>
      </div>

      {/* Modals & Overlays */}
      <GlobalSearchModal />
      <AuthModal />
      <CreateTaskModal />
      <CreateProjectModal />
      <MemberDetailModal />
      <TemplatesModal />
      <TemplateEditorModal />
      <UserModal />
      <RoleModal />
      <CreateContentModal />

      {/* توست‌های بازخورد عملیات (موفق/خطا) */}
      <ToastViewport />

      {/* لودر تمام‌صفحه هنگام بارگذاری اولیه فضای کاری */}
      {runtime.demoMode && <div role="status" className="fixed bottom-0 inset-x-0 bg-amber-100 text-amber-900 text-center p-2 text-xs">محیط نمایشی — داده‌های نمونه، بدون ذخیره در سرور</div>}
    </div>
  );
};

function LoginPage() {
  const { isLoggedIn, isSessionLoading, sessionError, restoreSession } = useAuth();
  const location = useLocation();
  if (isSessionLoading) return <LoadingState label="در حال بررسی نشست…" />;
  const from = location.state?.from;
  const destination = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login') ? from : '/dashboard';
  if (isLoggedIn) return <Navigate replace to={destination} />;
  return <div dir="rtl"><AuthModal /><ToastViewport />{sessionError && <aside className="fixed top-3 left-3 z-[100] w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-right text-xs leading-5 text-slate-700 shadow-sm" role="alert" aria-label="وضعیت اتصال">
    <p>{sessionError}</p>
    <button type="button" onClick={() => void restoreSession()} className="mt-1 rounded px-1 py-0.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">بررسی دوبارهٔ اتصال</button>
  </aside>}</div>;
}
function LegacyLinks() {
  const location = useLocation(); const navigate = useNavigate();
  React.useEffect(() => {
    if (location.pathname === '/login') return;
    const task = readTaskLink(location.search);
    if (task && location.pathname !== `/tasks/${task}`) {
      const params = new URLSearchParams(location.search); // Keep legacy task/asset hints understood by TaskAssetsSection.
      navigate(`/tasks/${task}${params.size ? `?${params}` : ''}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);
  return null;
}
export default function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><UIProvider><AppProvider>
    <LegacyLinks />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Navigate replace to="/dashboard" /></ProtectedRoute>} />
      <Route path="*" element={<ProtectedRoute><MainLayout /></ProtectedRoute>} />
    </Routes>
  </AppProvider></UIProvider></AuthProvider></BrowserRouter></QueryClientProvider>;
}
