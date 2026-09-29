import { safeReturnTo } from '../routing/listQuery';
import React, { createContext, useContext, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ActiveView, DamSubView, DigitalAsset, AssetFolder, Project, User, SystemRole } from '../types';
import { resolveRoute, viewPaths } from '../routing/routes';
import { runtime } from '../config/runtime';
function useUIState() {
  const location = useLocation(); const navigate = useNavigate();
  const route = resolveRoute(location.pathname, runtime.demoMode);
  const activeView = route.view;
  const project = useRef<string | null>(null); const content = useRef<string | null>(null);
  const selectedProjectId = route.module === 'projects' ? route.id! : null;
  const selectedContentId = route.module === 'contents' ? route.id! : null;
  const selectedTaskId = route.module === 'tasks' ? route.id! : null;
  const setSelectedProjectId: React.Dispatch<React.SetStateAction<string | null>> = value => { project.current = typeof value === 'function' ? value(selectedProjectId ?? project.current) : value; };
  const setSelectedContentId: React.Dispatch<React.SetStateAction<string | null>> = value => { content.current = typeof value === 'function' ? value(selectedContentId ?? content.current) : value; };
  const setSelectedTaskId: React.Dispatch<React.SetStateAction<string | null>> = value => {
    const id = typeof value === 'function' ? value(selectedTaskId) : value;
    if (id === selectedTaskId) return;
    if (id) navigate(`/tasks/${encodeURIComponent(id)}${location.search}`);
    else if (route.module === 'tasks') {
      const params = new URLSearchParams(location.search);
      const back = params.get('returnTo'); if (back) { navigate(safeReturnTo(back, '/tasks')); return; }
      params.delete('display'); params.delete('task'); params.delete('asset');
      navigate(`/tasks${params.size ? `?${params}` : ''}`);
    }
  };
  const setActiveView = (view: ActiveView) => {
    if (view === 'project-detail' && project.current) navigate(`/projects/${encodeURIComponent(project.current)}`);
    else if (view === 'content-detail' && content.current) navigate(`/contents/${encodeURIComponent(content.current)}`);
    else navigate(viewPaths[view] || '/dashboard');
  };
  const [damSubView, setDamSubView] = useState<DamSubView>('all');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [versionModalAssetId, setVersionModalAssetId] = useState<string | null>(null);
  const [shareTargetAssetId, setShareTargetAssetId] = useState<string | null>(null);
  const [shareTargetFolderId, setShareTargetFolderId] = useState<string | null>(null);
  const [isUploadAssetOpen, setIsUploadAssetOpen] = useState(false);
  const [isEditAssetOpen, setIsEditAssetOpen] = useState(false);
  const [assetToEdit, setAssetToEdit] = useState<DigitalAsset | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isEditFolderOpen, setIsEditFolderOpen] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<AssetFolder | null>(null);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userProfileId, setUserProfileId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateContentOpen, setIsCreateContentOpen] = useState(false);
  const [contentCreateProjectId, setContentCreateProjectId] = useState<string | null>(null);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [meetingModalRequest, setMeetingModalRequest] = useState(0);
  const requestMeetingModal = () => setMeetingModalRequest(value => value + 1);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [roleToEdit, setRoleToEdit] = useState<SystemRole | null>(null);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  return { damSubView, setDamSubView, currentFolderId, setCurrentFolderId, previewAssetId, setPreviewAssetId, detailAssetId, setDetailAssetId, versionModalAssetId, setVersionModalAssetId, shareTargetAssetId, setShareTargetAssetId, shareTargetFolderId, setShareTargetFolderId, isUploadAssetOpen, setIsUploadAssetOpen, isEditAssetOpen, setIsEditAssetOpen, assetToEdit, setAssetToEdit, isCreateFolderOpen, setIsCreateFolderOpen, isEditFolderOpen, setIsEditFolderOpen, folderToEdit, setFolderToEdit, selectedMemberId, setSelectedMemberId, selectedTemplateId, setSelectedTemplateId, selectedUserId, setSelectedUserId, userProfileId, setUserProfileId, searchQuery, setSearchQuery, isSearchOpen, setIsSearchOpen, isCreateTaskOpen, setIsCreateTaskOpen, isCreateProjectOpen, setIsCreateProjectOpen, isCreateContentOpen, setIsCreateContentOpen, contentCreateProjectId, setContentCreateProjectId, isEditProjectOpen, setIsEditProjectOpen, projectToEdit, setProjectToEdit, meetingModalRequest, setMeetingModalRequest, isCreateUserOpen, setIsCreateUserOpen, isEditUserOpen, setIsEditUserOpen, userToEdit, setUserToEdit, isCreateRoleOpen, setIsCreateRoleOpen, isEditRoleOpen, setIsEditRoleOpen, roleToEdit, setRoleToEdit, isTemplatesModalOpen, setIsTemplatesModalOpen, isTemplateEditorOpen, setIsTemplateEditorOpen, isAuthModalOpen, setIsAuthModalOpen, authNotice, setAuthNotice, requestMeetingModal, activeView, setActiveView, selectedContentId, setSelectedContentId, selectedProjectId, setSelectedProjectId, selectedTaskId, setSelectedTaskId };
}
const UIContext = createContext<ReturnType<typeof useUIState> | null>(null);
export function UIProvider({ children }: { children: React.ReactNode }) { return <UIContext.Provider value={useUIState()}>{children}</UIContext.Provider>; }
export function useUI() { const value = useContext(UIContext); if (!value) throw new Error('UIProvider required'); return value; }
