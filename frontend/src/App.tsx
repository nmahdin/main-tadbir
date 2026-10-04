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
import { LoadingState, ErrorState } from './components/common/Primitives';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNavbar } from './components/layout/TopNavbar';
const GlobalSearchModal = React.lazy(() => import('./components/layout/GlobalSearchModal').then(m => ({default:m.GlobalSearchModal})));
import { AuthModal } from './components/auth/AuthModal';
import type { ActiveView } from './types';

// Views. Keep every page outside the initial route bundle; the active page is
// downloaded in parallel with its data and all other pages stay off the hot path.
const DashboardView = React.lazy(() => import('./components/dashboard/DashboardView').then(m => ({default:m.DashboardView})));
const ActionDashboard = React.lazy(() => import('./components/workspace/ActionDashboard').then(m => ({default:m.ActionDashboard})));
const WorkspaceList = React.lazy(() => import('./components/workspace/WorkspaceList').then(m => ({default:m.WorkspaceList})));
const ApprovalCenter = React.lazy(() => import('./components/workspace/ApprovalCenter').then(m => ({default:m.ApprovalCenter})));
const NotificationInbox = React.lazy(() => import('./components/workspace/NotificationInbox').then(m => ({default:m.NotificationInbox})));
const ProjectsView = React.lazy(() => import('./components/projects/ProjectsView').then(m => ({default:m.ProjectsView})));
const ProjectDetailView = React.lazy(() => import('./components/projects/ProjectDetailView').then(m => ({default:m.ProjectDetailView})));
const MyTasksView = React.lazy(() => import('./components/tasks/MyTasksView').then(m => ({default:m.MyTasksView})));
const DepartmentsView = React.lazy(() => import('./components/departments/DepartmentsView').then(m => ({default:m.DepartmentsView})));
const DepartmentDashboardView = React.lazy(() => import('./components/departments/DepartmentDashboardView').then(m => ({default:m.DepartmentDashboardView})));
const AnalyticsView = React.lazy(() => import('./components/analytics/AnalyticsView').then(m => ({default:m.AnalyticsView})));
const ActivityView = React.lazy(() => import('./components/activity/ActivityView').then(m => ({default:m.ActivityView})));
const CommentsView = React.lazy(() => import('./components/comments/CommentsView').then(m => ({default:m.CommentsView})));
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
const ContentSeriesView = React.lazy(() => import('./components/content/ContentSeriesView').then(m => ({default:m.ContentSeriesView})));
const IntegrityView = React.lazy(() => import('./components/settings/IntegrityView').then(m => ({default:m.IntegrityView})));
const ContentDetailView = React.lazy(() => import('./components/content/ContentDetailView').then(m => ({default:m.ContentDetailView})));
const ContentPublishingView = React.lazy(() => import('./components/content/ContentPublishingView').then(m => ({default:m.ContentPublishingView})));
const ContentPublishedView = React.lazy(() => import('./components/content/ContentPublishedView').then(m => ({default:m.ContentPublishedView})));
const ArchiveView = React.lazy(() => import('./components/archive/ArchiveView').then(m => ({default:m.ArchiveView})));

// Modals & drawers are mounted only while open. Rendering a lazy component while
// hidden would still download it, so MainLayout guards each one explicitly.
const TaskDetailDrawer = React.lazy(() => import('./components/tasks/TaskDetailDrawer').then(m => ({default:m.TaskDetailDrawer})));
const CreateTaskModal = React.lazy(() => import('./components/tasks/CreateTaskModal').then(m => ({default:m.CreateTaskModal})));
const CreateProjectModal = React.lazy(() => import('./components/projects/CreateProjectModal').then(m => ({default:m.CreateProjectModal})));
const MemberDetailModal = React.lazy(() => import('./components/users/MemberDetailModal').then(m => ({default:m.MemberDetailModal})));
const TemplatesModal = React.lazy(() => import('./components/templates/TemplatesModal').then(m => ({default:m.TemplatesModal})));
const TemplateEditorModal = React.lazy(() => import('./components/templates/TemplateEditorModal').then(m => ({default:m.TemplateEditorModal})));
const UserModal = React.lazy(() => import('./components/users/UserModal').then(m => ({default:m.UserModal})));
const RoleModal = React.lazy(() => import('./components/roles/RoleModal').then(m => ({default:m.RoleModal})));
const CreateContentModal = React.lazy(() => import('./components/content/CreateContentModal').then(m => ({default:m.CreateContentModal})));
import { ErrorBoundary, ToastViewport, WorkspaceLoader } from './components/common/Feedback';

const PageTransitionReady: React.FC<{ view: ActiveView; onReady: (view: ActiveView) => void }> = ({ view, onReady }) => {
  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => onReady(view));
    return () => window.cancelAnimationFrame(frame);
  }, [view, onReady]);
  return null;
};

const MainLayout: React.FC = () => {
  const {
    activeView, isWorkspaceLoading, hasPermission, generalSettings,
    isSearchOpen, setIsSearchOpen, selectedTaskId, selectedMemberId,
    isCreateTaskOpen, isCreateProjectOpen, isCreateContentOpen,
    isTemplatesModalOpen, isTemplateEditorOpen,
    isCreateUserOpen, isEditUserOpen, isCreateRoleOpen, isEditRoleOpen,
  } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [pendingSidebarView, setPendingSidebarView] = React.useState<ActiveView | null>(null);
  React.useEffect(() => {
    const handleGlobalSearchKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(open => !open);
      } else if (event.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalSearchKey);
    return () => window.removeEventListener('keydown', handleGlobalSearchKey);
  }, [setIsSearchOpen]);
  const finishPageTransition = React.useCallback((view: ActiveView) => {
    setPendingSidebarView(pending => pending === view ? null : pending);
  }, []);

  React.useEffect(() => {
    if (!pendingSidebarView) return;
    const timeout = window.setTimeout(() => setPendingSidebarView(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [pendingSidebarView]);

  React.useEffect(() => {
    // Keep the cached color applied during workspace hydration; replacing it
    // with the default here would cause a visible flash before settings load.
    if (isWorkspaceLoading) return;
    const color = /^#[0-9a-f]{6}$/i.test(generalSettings.themeColor || '') ? generalSettings.themeColor! : '#4f46e5';
    const style = document.documentElement.style;
    style.setProperty('--color-primary', color);
    style.setProperty('--color-primary-hover', `color-mix(in srgb, ${color} 85%, black)`);
    try { window.localStorage.setItem('tadbir:theme-color', color); } catch { /* storage may be unavailable */ }
  }, [generalSettings.themeColor, isWorkspaceLoading]);

  // دسترسی مدیریت تنظیمات: مدیر سیستم یا دارندگان مجوزهای مرتبط
  const canManageSettings = hasPermission('settings.manage')
    || hasPermission('content.edit');

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
      case 'content-series':
        return <ContentSeriesView />;
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
      case 'department-dashboard':
        return <DepartmentDashboardView />;
      case 'secretariat':
        return generalSettings.secretariatEnabled === false
          ? <div className="mx-auto max-w-xl p-8 text-center"><div className="rounded-3xl border border-slate-200 bg-white p-10"><h1 className="text-base font-black text-slate-800">ماژول دبیرخانه غیرفعال است</h1><p className="mt-2 text-xs text-slate-500">مدیر سامانه می‌تواند آن را از تنظیمات عمومی فعال کند.</p></div></div>
          : <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><SecretariatMainView /></div>;
      case 'assets':
        return (
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <DamMainView />
          </div>
        );
      case 'my-tasks':
        return runtime.demoMode ? <MyTasksView /> : <WorkspaceList key="tasks" module="tasks" />;
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
      case 'comments':
        return <CommentsView />;
      case 'settings':
        return canManageSettings ? <SettingsView /> : <ErrorState title="شما مجوز مشاهدهٔ این صفحه را ندارید." />;
      case 'integrity':
        return <IntegrityView />;
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
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onNavigateStart={setPendingSidebarView}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Navbar */}
        <TopNavbar onOpenSidebar={() => setIsSidebarOpen(true)} />

        {/* Scrollable View Canvas */}
        <main tabIndex={-1} className={`flex-1 overflow-y-auto overflow-x-hidden focus:outline-hidden ${activeView === 'messages' ? 'p-0' : 'p-2 sm:p-3'}`}>
          {/* مرز خطای هر نما: کرش یک بخش، کل سامانه را از کار نمی‌اندازد. */}
          <ErrorBoundary resetKey={activeView}><React.Suspense fallback={<WorkspaceLoader label="در حال بارگذاری صفحه…" />}>
            <RouteEntity>{isWorkspaceLoading && !['dashboard','projects','my-tasks','content','notifications','approvals'].includes(activeView) ? <LoadingState /> : renderActiveView()}</RouteEntity>
            <PageTransitionReady view={activeView} onReady={finishPageTransition} />
          </React.Suspense></ErrorBoundary>
        </main>
      </div>

      {/* بازخورد فوری و تمام‌صفحه برای جابه‌جایی‌های آغازشده از سایدبار */}
      {pendingSidebarView && <WorkspaceLoader label="در حال بارگذاری صفحه…" />}

      {/* Modals & Overlays — unopened features do not download or render. */}
      <React.Suspense fallback={null}>
        {selectedTaskId && <TaskDetailDrawer />}
        {isSearchOpen && <GlobalSearchModal />}
        {isCreateTaskOpen && <CreateTaskModal />}
        {isCreateProjectOpen && <CreateProjectModal />}
        {selectedMemberId && <MemberDetailModal />}
        {isTemplatesModalOpen && <TemplatesModal />}
        {isTemplateEditorOpen && <TemplateEditorModal />}
        {(isCreateUserOpen || isEditUserOpen) && <UserModal />}
        {(isCreateRoleOpen || isEditRoleOpen) && <RoleModal />}
        {isCreateContentOpen && <CreateContentModal />}
      </React.Suspense>

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
