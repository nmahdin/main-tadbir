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
import { TeamsView } from './components/teams/TeamsView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { ActivityView } from './components/activity/ActivityView';
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
import { DepartmentsView } from './components/departments/DepartmentsView';

// Modals & Drawers
import { TaskDetailDrawer } from './components/tasks/TaskDetailDrawer';
import { CreateTaskModal } from './components/tasks/CreateTaskModal';
import { CreateProjectModal } from './components/projects/CreateProjectModal';
import { EditProjectModal } from './components/projects/EditProjectModal';
import { CreateTeamModal } from './components/teams/CreateTeamModal';
import { MemberDetailModal } from './components/teams/MemberDetailModal';
import { TemplatesModal } from './components/templates/TemplatesModal';
import { TemplateEditorModal } from './components/templates/TemplateEditorModal';
import { UserModal } from './components/users/UserModal';
import { RoleModal } from './components/roles/RoleModal';
import { AssetPreviewModal } from './components/dam/AssetPreviewModal';
import { AssetUploadModal } from './components/dam/AssetUploadModal';
import { AssetVersionModal } from './components/dam/AssetVersionModal';
import { AssetShareModal } from './components/dam/AssetShareModal';
import { AssetCreateFolderModal } from './components/dam/AssetCreateFolderModal';
import { AssetEditModal } from './components/dam/AssetEditModal';
import { FolderEditModal } from './components/dam/FolderEditModal';
import { AssetDetailsDrawer } from './components/dam/AssetDetailsDrawer';

const MainLayout: React.FC = () => {
  const { activeView, currentUser } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

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
      case 'departments':
        return <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto"><DepartmentsView /></div>;
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
      case 'teams':
        return <TeamsView />;
      case 'calendar':
        return <ProjectCalendarView />;
      case 'analytics':
      case 'reports':
        return <AnalyticsView />;
      case 'activity':
        return <ActivityView />;
      case 'settings':
        return currentUser.role === 'admin' ? <SettingsView /> : <DashboardView />;
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
          {renderActiveView()}
        </main>
      </div>

      {/* Modals & Overlays */}
      <GlobalSearchModal />
      <AuthModal />
      <TaskDetailDrawer />
      <CreateTaskModal />
      <CreateProjectModal />
      <EditProjectModal />
      <CreateTeamModal />
      <MemberDetailModal />
      <TemplatesModal />
      <TemplateEditorModal />
      <UserModal />
      <RoleModal />
      <CreateContentModal />
      {/* DAM Modals */}
      <AssetPreviewModal />
      <AssetUploadModal />
      <AssetVersionModal />
      <AssetShareModal />
      <AssetCreateFolderModal />
      <AssetEditModal />
      <FolderEditModal />
      <AssetDetailsDrawer />
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
