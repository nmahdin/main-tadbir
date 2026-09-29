import { useConfirmedCommand } from '../queries/useConfirmedCommand';
import { needsServerWrite, rememberServerRecords, snapshotSession } from '../queries/serverSnapshots';
import { readDamEntryLink } from '../utils/damEntryLink';
import { canUsePermission } from '../utils/permissions';
import { request } from '../api/client';
import { followTaskLink, readTaskLink } from '../utils/taskDeepLink';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  User, Project, Task, AppNotification, ActiveView, TaskStatus, ProjectStatus, Priority, ProjectTemplate, ActivityLog, SystemRole, Department, Workflow, Content, ContentStatus, UserStatus,
  ContentStage, ContentStageStatus, ContentProcessTemplate, PublishingPlatform,
  DigitalAsset, AssetFolder, DamSubView, AssetCategory, AssetPermissionLevel, AssetAccessRight, AssetVersion, AssetActivity, AssetComment,
  Conversation, ChatMessage, ChatType, ChatFilterCategory, TaskReference, ProjectReference, ChatAttachment, ConversationRole, ConversationMember, ChatWritePermission, ChatDeletePermission,
  Idea, IdeaVote, IdeaVoteOption, IdeaComment, IdeaActivity, ThinkTankMeeting, MeetingActionItem, MeetingAttachment, ThinkTankMeetingAgendaItem,
  SecretariatLetter, LetterReferral, LetterWorkflowStep, LetterType, LetterClassification, LetterUrgency, LetterStatus, ReferralActionType, SecretariatResolution, ResolutionStatus, ArchiveDossier, ArchiveCategory,
  GeneralSettings, NotificationSettings, SecuritySettings, TaskPrioritySetting, TaskStatusSetting, DamStatusSetting, ContentStatusSetting
} from '../types';
import { demo } from '../demo';
import { SYSTEM_PERMISSIONS } from '../config/permissions';
import { runtime } from '../config/runtime';
import { parseApiError } from '../api/errors';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';
import { useServerState } from '../queries/useServerState';
import { queryClient, fetchWorkspace } from '../queries/queryClient';
import type { PublicationSettings, PublicationTaskInput } from '../api/contents';
import { withPublicationConflictRefresh } from '../utils/publicationCommand';
import { ApiError, activityLogsApi, archiveDossiersApi, authApi, chatApi, contentsApi, damApi, departmentsApi, ideasApi, notificationsApi, projectTemplatesApi, projectsApi, rolesApi, secretariatLettersApi, secretariatResolutionsApi, settingsApi, SystemSettingKey, tasksApi, thinkTankMeetingsApi, usersApi } from '../api';

interface AppContextType {
  pendingMutationKeys: string[];
  currentUser: User;
  users: User[];
  projects: Project[];
  tasks: Task[];
  roles: SystemRole[];
  departments: Department[];
  workflows: Workflow[];
  contents: Content[];
  publishingContentIds: string[];
  publishContentNow: (id: string, expectedVersion?: string) => Promise<boolean>;
  unpublishContent: (id: string) => Promise<boolean>;
  scheduleContentPublication: (id: string, data: Omit<PublicationSettings, 'expectedVersion'>) => Promise<Content>;
  createPublicationTask: (id: string, data: PublicationTaskInput) => Promise<Task>;
  notifications: AppNotification[];
  templates: ProjectTemplate[];
  activities: ActivityLog[];
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedContentId: string | null;
  setSelectedContentId: (id: string | null) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  selectedMemberId: string | null;
  setSelectedMemberId: (id: string | null) => void;
  selectedTemplateId: string | null;
  setSelectedTemplateId: (id: string | null) => void;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  userProfileId: string | null;
  setUserProfileId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  isCreateTaskOpen: boolean;
  setIsCreateTaskOpen: (open: boolean) => void;
  isCreateProjectOpen: boolean;
  setIsCreateProjectOpen: (open: boolean) => void;
  isCreateContentOpen: boolean;
  setIsCreateContentOpen: (open: boolean) => void;
  contentCreateProjectId: string | null;
  setContentCreateProjectId: (id: string | null) => void;
  isEditProjectOpen: boolean;
  setIsEditProjectOpen: (open: boolean) => void;
  projectToEdit: Project | null;
  setProjectToEdit: (proj: Project | null) => void;
  openEditProject: (proj: Project) => void;
  isCreateUserOpen: boolean;
  setIsCreateUserOpen: (open: boolean) => void;
  isEditUserOpen: boolean;
  setIsEditUserOpen: (open: boolean) => void;
  userToEdit: User | null;
  setUserToEdit: (user: User | null) => void;
  isCreateRoleOpen: boolean;
  setIsCreateRoleOpen: (open: boolean) => void;
  isEditRoleOpen: boolean;
  setIsEditRoleOpen: (open: boolean) => void;
  roleToEdit: SystemRole | null;
  setRoleToEdit: (role: SystemRole | null) => void;
  openEditRole: (role: SystemRole) => void;
  isTemplatesModalOpen: boolean;
  setIsTemplatesModalOpen: (open: boolean) => void;
  isTemplateEditorOpen: boolean;
  setIsTemplateEditorOpen: (open: boolean) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  isLoggedIn: boolean;
  logout: () => Promise<void>;
  authNotice: string | null;
  
  // User Management
  addUser: (userData: Partial<User> & { name: string; email: string; avatarFile?: File | null }) => User;
  addUserAsync: (userData: Partial<User> & { name: string; email: string; avatarFile?: File | null }) => Promise<User>;
  updateUser: (userId: string, updates: Partial<User>) => void;
  updateUserAsync: (userId: string, updates: Partial<User> & { avatarFile?: File | null }) => Promise<User>;
  deleteUser: (userId: string) => void;
  changeUserStatus: (userId: string, status: UserStatus) => void;
  bulkChangeUserStatus: (userIds: string[], status: UserStatus) => void;
  bulkDeleteUsers: (userIds: string[]) => void;

  // Role Management
  addRole: (roleData: Partial<SystemRole> & { name: string; key: string }) => Promise<SystemRole | null>;
  updateRole: (roleId: string, updates: Partial<SystemRole>) => Promise<boolean>;
  deleteRole: (roleId: string) => Promise<boolean>;
  toggleRolePermission: (roleId: string, permissionId: string) => Promise<boolean>;
  toggleRoleStatus: (roleId: string) => Promise<boolean>;
  hasPermission: (permissionId: string) => boolean;

  // Workspace loading / error surfaces (برای حالت‌های لودینگ و نمایش خطا)
  isWorkspaceLoading: boolean;
  isReloadingWorkspace: boolean;
  moduleErrors: Record<string, ModuleError>;
  reloadWorkspace: () => Promise<void>;
  toasts: AppToast[];
  notify: (toast: { type?: 'success' | 'error' | 'info'; title: string; message?: string; detail?: string; dedupeKey?: string }) => void;
  dismissToast: (toastId: string) => void;
  notifyApiError: (scope: string, error: unknown, title: string) => void;

  // Dynamic system settings (تنظیمات پویای سامانه)
  generalSettings: GeneralSettings;
  setGeneralSettings: React.Dispatch<React.SetStateAction<GeneralSettings>>;
  notificationSettings: NotificationSettings;
  setNotificationSettings: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  securitySettings: SecuritySettings;
  setSecuritySettings: React.Dispatch<React.SetStateAction<SecuritySettings>>;
  taskPriorities: TaskPrioritySetting[];
  setTaskPriorities: React.Dispatch<React.SetStateAction<TaskPrioritySetting[]>>;
  taskStatuses: TaskStatusSetting[];
  setTaskStatuses: React.Dispatch<React.SetStateAction<TaskStatusSetting[]>>;
  damStatuses: DamStatusSetting[];
  setDamStatuses: React.Dispatch<React.SetStateAction<DamStatusSetting[]>>;
  contentStatuses: ContentStatusSetting[];
  setContentStatuses: React.Dispatch<React.SetStateAction<ContentStatusSetting[]>>;
  settingsSaveState: 'idle' | 'saving' | 'saved' | 'error';
  settingsSaveError: string | null;
  saveSettingsNow: () => Promise<boolean>;

  // Auth Operations
  registerUser: (data: { name: string; username: string; email: string; phone?: string; password?: string; department?: string; title?: string }) => Promise<{ success: boolean; user?: User; message?: string; error?: string }>;
  loginWithCredentials: (usernameOrEmail: string, password?: string, rememberMe?: boolean) => Promise<{ success: boolean; user?: User; requires2FA?: boolean; message?: string; error?: string }>;
  resetPasswordRequest: (email: string) => Promise<{ success: boolean; message: string; error?: string }>;

  // Task Operations
  addTask: (taskData: Partial<Task> & { title: string; projectId?: string }) => Task;
  addTaskAsync: (taskData: Partial<Task> & { title: string; projectId?: string }) => Promise<Task>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  moveTaskStatus: (taskId: string, newStatus: TaskStatus) => Promise<boolean>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<boolean>;
  addSubtask: (taskId: string, title: string) => Promise<boolean>;
  deleteSubtask: (taskId: string, subtaskId: string) => Promise<boolean>;
  addComment: (taskId: string, text: string) => Promise<boolean>;
  addAttachment: (taskId: string, file: { name: string; size: string; type: string; url?: string }) => void;
  deleteAttachment: (taskId: string, attachmentId: string) => Promise<boolean>;

  // Categories Operations
  categories: string[];
  addCategory: (name: string) => void;
  updateCategory: (oldName: string, newName: string) => void;
  deleteCategory: (name: string) => void;
  resetCategories: () => void;
  
  // Content Types
  contentTypes: { id: string; name: string; color?: string }[];
  updateContentType: (id: string, color: string) => void;
  addContentType: (name: string) => void;
  deleteContentType: (id: string) => void;

  // Content Process & Workflow Operations
  processTemplates: ContentProcessTemplate[];
  addProcessTemplate: (templateData: Omit<ContentProcessTemplate, 'id'>) => Promise<ContentProcessTemplate>;
  updateProcessTemplate: (templateId: string, updates: Partial<ContentProcessTemplate>) => void;
  deleteProcessTemplate: (templateId: string) => void;
  publishingPlatforms: PublishingPlatform[];
  updatePublishingPlatforms: (platforms: PublishingPlatform[]) => void;
  addContentAttachment: (contentId: string, file: { name: string; size: string; type?: string; url?: string }) => Promise<boolean>;
  deleteContentAttachment: (contentId: string, attachmentId: string) => Promise<boolean>;
  assignStageResponsibility: (contentId: string, stageId: string, data: { assigneeId?: string; assigneeRole?: string; reviewerId?: string; approverId?: string; deadline?: string }) => Promise<boolean>;
  updateStageStatus: (contentId: string, stageId: string, status: ContentStageStatus, note?: string, reportText?: string) => Promise<boolean>;
  addStageDeliverable: (contentId: string, stageId: string, outputId: string, data: { fileName?: string; fileSize?: string; value?: string; fileType?: string; url?: string; assetId?: string; title?: string }) => Promise<boolean>;
  removeStageDeliverable: (contentId: string, stageId: string, outputId: string) => Promise<boolean>;
  approveStage: (contentId: string, stageId: string, note?: string) => Promise<boolean>;
  rejectStage: (contentId: string, stageId: string, reason: string) => Promise<boolean>;
  
  // Department Operations
  addDepartment: (dept: Omit<Department, 'id' | 'createdAt'>) => Promise<Department>;
  refreshDepartments: () => Promise<void>;
  updateDepartment: (id: string, dept: Partial<Department>) => Promise<Department>;
  deleteDepartment: (id: string) => Promise<void>;
  
  // Project Operations
  addProject: (projectData: Partial<Project> & { name: string }) => Project;
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<boolean>;
  archiveItem: (kind: 'task' | 'project' | 'content', id: string) => Promise<boolean>;
  unarchiveItem: (kind: 'task' | 'project' | 'content', id: string) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<boolean>;

  // Template Operations
  addTemplate: (templateData: Partial<ProjectTemplate> & { name: string }) => Promise<ProjectTemplate | null>;
  updateTemplate: (templateId: string, updates: Partial<ProjectTemplate>) => Promise<boolean>;
  deleteTemplate: (templateId: string) => Promise<boolean>;
  applyTemplate: (templateId: string, customOptions?: { projectName?: string; projectKey?: string; projectManagerId?: string; startDate?: string; description?: string; memberIds?: string[]; deadline?: string; color?: string }) => Promise<Project>;
  saveProjectAsTemplate: (projectId: string, templateName: string, description?: string) => Promise<ProjectTemplate | null>;

  // Member invitations
  inviteMember: (memberData: Omit<User, 'id' | 'activeProjectsCount' | 'completedTasksCount' | 'workloadPercentage'>) => User;

  // Notification Operations
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  clearNotification: (id: string) => void;
  sendNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;

  // Digital Asset Management (DAM) State
  assets: DigitalAsset[];
  folders: AssetFolder[];
  damSubView: DamSubView;
  setDamSubView: (view: DamSubView) => void;
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  previewAssetId: string | null;
  setPreviewAssetId: (id: string | null) => void;
  detailAssetId: string | null;
  setDetailAssetId: (id: string | null) => void;
  versionModalAssetId: string | null;
  setVersionModalAssetId: (id: string | null) => void;
  shareTargetAssetId: string | null;
  setShareTargetAssetId: (id: string | null) => void;
  shareTargetFolderId: string | null;
  setShareTargetFolderId: (id: string | null) => void;
  isUploadAssetOpen: boolean;
  setIsUploadAssetOpen: (open: boolean) => void;
  isEditAssetOpen: boolean;
  setIsEditAssetOpen: (open: boolean) => void;
  assetToEdit: DigitalAsset | null;
  setAssetToEdit: (asset: DigitalAsset | null) => void;
  openEditAsset: (asset: DigitalAsset) => void;
  isCreateFolderOpen: boolean;
  setIsCreateFolderOpen: (open: boolean) => void;
  isEditFolderOpen: boolean;
  setIsEditFolderOpen: (open: boolean) => void;
  folderToEdit: AssetFolder | null;
  setFolderToEdit: (folder: AssetFolder | null) => void;
  openEditFolder: (folder: AssetFolder) => void;

  // Digital Asset Management (DAM) Operations
  uploadAsset: (assetData: Partial<DigitalAsset> & { title: string; fileName: string; size: number }) => DigitalAsset;
  uploadNewVersion: (assetId: string, versionData: { fileName: string; size: number; url?: string; changelog: string }) => void;
  deleteAssetVersion: (assetId: string, versionId: string) => void;
  revertToAssetVersion: (assetId: string, versionId: string) => void;
  updateAsset: (assetId: string, updates: Partial<DigitalAsset>) => void;
  deleteAsset: (assetId: string, permanent?: boolean) => void;
  restoreAsset: (assetId: string) => void;
  emptyTrash: () => void;
  toggleAssetFavorite: (assetId: string) => void;
  addAssetComment: (assetId: string, text: string) => void;
  shareAsset: (
    assetId: string, 
    shareData: { targetId: string; targetType: 'user' | 'team'; access: AssetAccessRight; targetName?: string }, 
    permissionLevel?: AssetPermissionLevel
  ) => void;
  removeAssetShare: (assetId: string, targetId: string) => void;
  hasAssetAccess: (
    asset: DigitalAsset, 
    action: 'view' | 'preview' | 'download' | 'upload' | 'edit_info' | 'rename' | 'move' | 'create_version' | 'delete' | 'restore' | 'share' | 'manage_access'
  ) => boolean;
  batchDeleteAssets: (assetIds: string[], permanent?: boolean) => void;
  batchRestoreAssets: (assetIds: string[]) => void;
  batchMoveAssets: (assetIds: string[], targetFolderId: string | null) => void;
  downloadAsset: (asset: DigitalAsset) => void;

  // Folder Operations
  createFolder: (folderData: Partial<AssetFolder> & { name: string }) => AssetFolder;
  updateFolder: (folderId: string, updates: Partial<AssetFolder>) => void;
  deleteFolder: (folderId: string) => void;
  toggleFolderFavorite: (folderId: string) => void;

  // Messaging & Chat System
  conversations: Conversation[];
  messages: ChatMessage[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  chatFilter: ChatFilterCategory;
  setChatFilter: (filter: ChatFilterCategory) => void;
  chatSearchQuery: string;
  setChatSearchQuery: (query: string) => void;
  sendMessage: (data: {
    conversationId: string;
    text: string;
    replyToMessageId?: string;
    attachments?: ChatAttachment[];
    taskRef?: TaskReference;
    projectRef?: ProjectReference;
  }) => ChatMessage;
  editMessage: (messageId: string, newText: string) => void;
  deleteMessage: (messageId: string) => void;
  togglePinMessage: (messageId: string) => void;
  toggleStarMessage: (messageId: string) => void;
  toggleMessageReaction: (messageId: string, emoji: string) => void;
  createConversation: (data: Partial<Conversation> & { name: string; type: ChatType; memberIds: string[] }) => Conversation;
  updateConversation: (convId: string, updates: Partial<Conversation>) => void;
  addConversationMembers: (convId: string, memberIds: string[]) => void;
  removeConversationMember: (convId: string, userId: string) => void;
  updateMemberRole: (convId: string, userId: string, role: ConversationRole) => void;
  toggleMuteConversation: (convId: string) => void;
  markConversationAsRead: (id: string) => void;
  markConversationAsUnread: (id: string) => void;
  updateConversationPermissions: (convId: string, writePermission: ChatWritePermission, deletePermission: ChatDeletePermission) => void;
  startDirectChatWithUser: (targetUserId: string) => string;
  openProjectChannel: (projectId: string) => string;

  // Think Tank (اتاق فکر)
  ideas: Idea[];
  thinkTankMeetings: ThinkTankMeeting[];
  selectedIdeaId: string | null;
  setSelectedIdeaId: (id: string | null) => void;
  selectedMeetingId: string | null;
  setSelectedMeetingId: (id: string | null) => void;
  addIdea: (ideaData: Partial<Idea> & { title: string; description: string }) => Promise<Idea>;
  updateIdea: (ideaId: string, updates: Partial<Idea>) => Promise<void>;
  addIdeaAttachment: (ideaId: string, file: File) => Promise<void>;
  removeIdeaAttachment: (ideaId: string, attachmentId: string) => void;
  deleteIdea: (ideaId: string) => void;
  voteIdea: (ideaId: string, option: IdeaVoteOption, comment?: string) => void;
  votePollOption: (ideaId: string, optionId: string) => void;
  addIdeaComment: (ideaId: string, text: string, replyToId?: string, assetIds?: string[]) => void;
  toggleIdeaCommentReaction: (ideaId: string, commentId: string, emoji: string) => void;
  createIdeaPoll: (ideaId: string, question: string, options: string[]) => void;
  convertIdeaToProject: (ideaId: string, customData?: { name?: string; key?: string; description?: string }) => Project;
  convertIdeaToTask: (ideaId: string, projectId: string, title?: string) => Task;
  addThinkTankMeeting: (meetingData: Partial<ThinkTankMeeting> & { title: string; date: string; time: string }) => Promise<ThinkTankMeeting>;
  updateThinkTankMeeting: (meetingId: string, updates: Partial<ThinkTankMeeting>) => Promise<ThinkTankMeeting>;
  deleteThinkTankMeeting: (meetingId: string) => void;
  addMeetingMinutes: (meetingId: string, minutes: string, decisions: string[], actionItems?: MeetingActionItem[], presentIds?: string[]) => Promise<void>;
  addMeetingAttachment: (meetingId: string, file: File, folderId?: string) => Promise<void>;
  appendMeetingAttachments: (meetingId: string, attachments: MeetingAttachment[]) => Promise<void>;
  removeMeetingAttachment: (meetingId: string, attachmentId: string) => void;
  convertActionItemToTask: (meetingId: string, actionItemId: string, projectId: string) => Promise<Task>;

  // Secretariat (دبیرخانه)
  secretariatLetters: SecretariatLetter[];
  secretariatResolutions: SecretariatResolution[];
  archiveDossiers: ArchiveDossier[];
  selectedLetterId: string | null;
  setSelectedLetterId: (id: string | null) => void;
  selectedResolutionId: string | null;
  setSelectedResolutionId: (id: string | null) => void;
  addLetter: (letterData: Partial<SecretariatLetter> & { subject: string; content: string; type: LetterType; sender: string; recipient: string }) => SecretariatLetter;
  updateLetter: (letterId: string, updates: Partial<SecretariatLetter>) => void;
  deleteLetter: (letterId: string) => void;
  referLetter: (letterId: string, referralData: { toUserId?: string; toDepartmentId?: string; department?: string; actionType: ReferralActionType; instructions: string; deadline: string }) => void;
  updateReferralStatus: (letterId: string, referralId: string, status: 'pending' | 'in_progress' | 'completed' | 'rejected', responseNotes?: string) => void;
  convertReferralToTask: (letterId: string, referralId: string, projectId: string) => Task;
  addLetterWorkflowStep: (letterId: string, step: { stageName: string; action: string; notes?: string }) => void;
  replyLetter: (originalLetterId: string, replyData: Partial<SecretariatLetter> & { subject: string; content: string }) => SecretariatLetter;
  archiveLetter: (letterId: string, dossierId: string, boxLocation?: string) => void;
  addResolution: (resData: Partial<SecretariatResolution> & { title: string; content: string; deadline: string; responsibleUserId: string }) => SecretariatResolution;
  updateResolution: (resId: string, updates: Partial<SecretariatResolution>) => void;
  deleteResolution: (resId: string) => void;
  convertResolutionToTask: (resolutionId: string, projectId: string) => Task;
  addArchiveDossier: (dossierData: Partial<ArchiveDossier> & { title: string; category: ArchiveCategory; location: string }) => ArchiveDossier;
  updateArchiveDossier: (dossierId: string, updates: Partial<ArchiveDossier>) => void;
  deleteArchiveDossier: (dossierId: string) => void;

  // Activity Feed Operations
  logActivity: (activity: Omit<ActivityLog, 'id' | 'timestamp'> & { timestamp?: string }) => void;

  // Helper & Reset
  triggerCelebration: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY_PREFIX = 'tadbir_persian_state_';

/** توست بازخورد عملیات (موفق/خطا/اطلاع) برای نمایش شناور در گوشه صفحه. */
export interface AppToast {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  detail?: string;
}

/** خطای بارگذاری یک ماژول از بک‌اند — برای بنرهای خطای قابل دیباگ. */
export interface ModuleError {
  message: string;
  detail?: string;
}

/** مقادیر پیش‌فرض تنظیمات پویا؛ پیش از اولین دریافت از سرور استفاده می‌شوند. */
const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  orgName: 'سامانه سازمانی تدبیر',
  workspaceSlug: 'tadbir-corp',
  sprintLength: '2 weeks',
  timezone: 'Asia/Tehran',
  calendar: 'jalali',
  themeColor: '#4f46e5',
};

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailAlerts: true,
  deadlineReminders: true,
  mentionAlerts: true,
  weeklyDigest: false,
};

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  twoFactorEnforced: false,
  passwordMinLength: 8,
  sessionLifetimeMinutes: 480,
  maxLoginAttempts: 5,
};

const DEFAULT_TASK_PRIORITIES: TaskPrioritySetting[] = [
  { id: 'low', label: 'پایین', color: '#94a3b8', order: 1 },
  { id: 'medium', label: 'متوسط', color: '#0ea5e9', order: 2 },
  { id: 'high', label: 'بالا', color: '#f59e0b', order: 3 },
  { id: 'urgent', label: 'فوری', color: '#ef4444', order: 4 },
];

const DEFAULT_TASK_STATUSES: TaskStatusSetting[] = [
  { id: 'backlog', label: 'در صف بررسی', color: '#94a3b8', order: 1 },
  { id: 'todo', label: 'برای انجام', color: '#6366f1', order: 2 },
  { id: 'in_progress', label: 'در حال انجام', color: '#3b82f6', order: 3 },
  { id: 'review', label: 'در حال بررسی', color: '#8b5cf6', order: 4 },
  { id: 'completed', label: 'تکمیل‌شده', color: '#10b981', order: 5 },
  { id: 'archived', label: 'بایگانی‌شده', color: '#64748b', order: 6 },
];

const DEFAULT_DAM_STATUSES: DamStatusSetting[] = [
  { id: 'draft', label: 'پیش‌نویس', color: '#94a3b8', order: 1 },
  { id: 'review', label: 'در حال بررسی', color: '#f59e0b', order: 2 },
  { id: 'approved', label: 'تأییدشده', color: '#10b981', order: 3 },
  { id: 'published', label: 'منتشرشده', color: '#3b82f6', order: 4 },
  { id: 'archived', label: 'بایگانی‌شده', color: '#64748b', order: 5 },
  { id: 'rejected', label: 'ردشده', color: '#ef4444', order: 6 },
];

const DEFAULT_CONTENT_STATUSES: ContentStatusSetting[] = [
  { id: 'idea', label: 'ایده اولیه', color: '#64748b', order: 1 },
  { id: 'planning', label: 'برنامه‌ریزی', color: '#3b82f6', order: 2 },
  { id: 'producing', label: 'در حال تولید', color: '#f59e0b', order: 3 },
  { id: 'in_progress', label: 'در حال انجام', color: '#f59e0b', order: 4 },
  { id: 'reviewing', label: 'در انتظار بازبینی', color: '#a855f7', order: 5 },
  { id: 'revising', label: 'نیازمند اصلاح', color: '#f43f5e', order: 6 },
  { id: 'approving', label: 'در انتظار تأیید', color: '#6366f1', order: 7 },
  { id: 'approved', label: 'تأییدشده', color: '#10b981', order: 8 },
  { id: 'ready_to_publish', label: 'آماده انتشار', color: '#14b8a6', order: 9 },
  { id: 'published', label: 'منتشرشده', color: '#22c55e', order: 10 },
  { id: 'completed', label: 'انجام شده', color: '#10b981', order: 11 },
  { id: 'suspended', label: 'تعلیق', color: '#f97316', order: 12 },
  { id: 'cancelled', label: 'لغو شده', color: '#ef4444', order: 13 },
  { id: 'archived', label: 'آرشیو', color: '#94a3b8', order: 14 },
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Session-scoped server cache; no browser data fallback.
  const [users, setUsers] = useServerState<User[]>('users', demo.users);

  const [roles, setRoles] = useServerState<SystemRole[]>('roles', demo.roles);

  const [departments, setDepartments] = useServerState<Department[]>('departments', []);

  const [workflows, setWorkflows] = useServerState<Workflow[]>('workflows', demo.workflows);

  const publicationInFlight = useRef(new Set<string>());
  const [publishingContentIds, setPublishingContentIds] = useState<string[]>([]);
  const [contents, setContents] = useServerState<Content[]>('contents', demo.contents);

  const { currentUser, setCurrentUser, isLoggedIn, isSessionLoading, login: authenticate, logoutSession } = useAuth();
  const sessionIdRef = useRef(currentUser.id);
  sessionIdRef.current = currentUser.id;

  const [projects, setProjects] = useServerState<Project[]>('projects', demo.projects);

  const [tasks, setTasks] = useServerState<Task[]>('tasks', demo.tasks);



  const [notifications, setNotifications] = useServerState<AppNotification[]>('notifications', demo.notifications);

  const [templates, setTemplates] = useServerState<ProjectTemplate[]>('templates', demo.templates);

  const DEFAULT_CONTENT_TYPES = [
    { id: 'article', name: 'مقاله / یادداشت' },
    { id: 'news', name: 'خبر / گزارش' },
    { id: 'video', name: 'ویدئو' },
    { id: 'motion', name: 'موشن گرافیک' },
    { id: 'poster', name: 'پوستر / طرح گرافیکی' },
    { id: 'podcast', name: 'پادکست' },
    { id: 'social_post', name: 'پست شبکه‌های اجتماعی' }
  ];
  
  const [contentTypes, setContentTypes] = useServerState<{id: string, name: string, color?: string}[]>('contentTypes', DEFAULT_CONTENT_TYPES);


  const addContentType = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || contentTypes.some(c => c.name === trimmed)) return;
    setContentTypes(prev => [...prev, { id: 'ct-' + Date.now(), name: trimmed }]);
  };

  const updateContentType = (id: string, color: string) => setContentTypes(prev => prev.map(t => t.id === id ? { ...t, color } : t));

  const deleteContentType = (id: string) => {
    setContentTypes(prev => prev.filter(c => c.id !== id));
  };

  const [categories, setCategories] = useServerState<string[]>('categories', demo.categories);

  const [activities, setActivities] = useServerState<ActivityLog[]>('activities', demo.activities);

  // DAM State
  const [folders, setFolders] = useServerState<AssetFolder[]>('folders', demo.folders);

  const [assets, setAssets] = useServerState<DigitalAsset[]>('assets', demo.assets);

  const { damSubView, setDamSubView, currentFolderId, setCurrentFolderId, previewAssetId, setPreviewAssetId, detailAssetId, setDetailAssetId, versionModalAssetId, setVersionModalAssetId, shareTargetAssetId, setShareTargetAssetId, shareTargetFolderId, setShareTargetFolderId, isUploadAssetOpen, setIsUploadAssetOpen, isEditAssetOpen, setIsEditAssetOpen, assetToEdit, setAssetToEdit, isCreateFolderOpen, setIsCreateFolderOpen, isEditFolderOpen, setIsEditFolderOpen, folderToEdit, setFolderToEdit, selectedMemberId, setSelectedMemberId, selectedTemplateId, setSelectedTemplateId, selectedUserId, setSelectedUserId, userProfileId, setUserProfileId, searchQuery, setSearchQuery, isSearchOpen, setIsSearchOpen, isCreateTaskOpen, setIsCreateTaskOpen, isCreateProjectOpen, setIsCreateProjectOpen, isCreateContentOpen, setIsCreateContentOpen, contentCreateProjectId, setContentCreateProjectId, isEditProjectOpen, setIsEditProjectOpen, projectToEdit, setProjectToEdit, meetingModalRequest, setMeetingModalRequest, isCreateUserOpen, setIsCreateUserOpen, isEditUserOpen, setIsEditUserOpen, userToEdit, setUserToEdit, isCreateRoleOpen, setIsCreateRoleOpen, isEditRoleOpen, setIsEditRoleOpen, roleToEdit, setRoleToEdit, isTemplatesModalOpen, setIsTemplatesModalOpen, isTemplateEditorOpen, setIsTemplateEditorOpen, isAuthModalOpen, setIsAuthModalOpen, authNotice, setAuthNotice, requestMeetingModal, activeView, setActiveView, selectedContentId, setSelectedContentId, selectedProjectId, setSelectedProjectId, selectedTaskId, setSelectedTaskId } = useUI();
  const pendingProjectCreates = useRef(new Map<string, Promise<Project>>());
  const pendingTaskCreates = useRef(new Map<string, Promise<Task>>());
  const workspaceLoadedRef = useRef(false);
  const settingsBaseline = useRef<Record<string, string> | null>(null);

  // ── وضعیت بارگذاری فضای کاری، خطاهای ماژول‌ها و توست‌های بازخورد ──
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  const [isReloadingWorkspace, setIsReloadingWorkspace] = useState(false);
  const [moduleErrors, setModuleErrors] = useState<Record<string, ModuleError>>({});
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const toastCooldownRef = useRef(new Map<string, number>());

  // ── تنظیمات پویای سامانه (هویت سازمان، اعلان‌ها، امنیت، اولویت‌ها) ──
  const [generalSettings, setGeneralSettings] = useServerState<GeneralSettings>('generalSettings', DEFAULT_GENERAL_SETTINGS);
  const [notificationSettings, setNotificationSettings] = useServerState<NotificationSettings>('notificationSettings', DEFAULT_NOTIFICATION_SETTINGS);
  const [securitySettings, setSecuritySettings] = useServerState<SecuritySettings>('securitySettings', DEFAULT_SECURITY_SETTINGS);
  const [taskPriorities, setTaskPriorities] = useServerState<TaskPrioritySetting[]>('taskPriorities', DEFAULT_TASK_PRIORITIES);
  const [taskStatuses, setTaskStatuses] = useServerState<TaskStatusSetting[]>('taskStatuses', DEFAULT_TASK_STATUSES);
  const [damStatuses, setDamStatuses] = useServerState<DamStatusSetting[]>('damStatuses', DEFAULT_DAM_STATUSES);
  const [contentStatuses, setContentStatuses] = useServerState<ContentStatusSetting[]>('contentStatuses', DEFAULT_CONTENT_STATUSES);
  const [settingsSaveState, setSettingsSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);

  const dismissToast = (toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  };

  /**
   * نمایش توست بازخورد؛ با dedupeKey می‌توان از تکرار یکسان‌های پشت‌سرهم
   * (مثلاً خطای همگام‌سازی ده‌ها رکورد) جلوگیری کرد.
   */
  const notify = (toast: { type?: 'success' | 'error' | 'info'; title: string; message?: string; detail?: string; dedupeKey?: string }) => {
    const type = toast.type ?? 'info';

    if (toast.dedupeKey) {
      const key = `${type}:${toast.dedupeKey}`;
      const now = Date.now();
      const last = toastCooldownRef.current.get(key) ?? 0;
      if (now - last < 5000) return;
      toastCooldownRef.current.set(key, now);
    }

    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev.slice(-4), { id, type, title: toast.title, message: toast.message, detail: toast.detail }]);
    window.setTimeout(() => dismissToast(id), type === 'error' ? 9000 : 5000);
  };

  /** تبدیل خطای API به توست قابل دیباگ (پیام + کد وضعیت HTTP). */
  const notifyApiError = (scope: string, error: unknown, title: string) => {
    const { status, message } = parseApiError(error);
    notify({
      type: 'error',
      title,
      message,
      detail: status !== undefined ? `HTTP ${status}` : undefined,
      dedupeKey: `${scope}:${status ?? 'x'}:${message}`,
    });
  };

  const confirmed = useConfirmedCommand((key, error) => notifyApiError(key, error, 'تغییر ذخیره نشد'));
  const acceptTask = (response: {data: Task}) => setTasks(prev => [response.data, ...prev.filter(row => row.id !== response.data.id)]);
  const acceptProject = (response: {data: Project}) => setProjects(prev => [response.data, ...prev.filter(row => row.id !== response.data.id)]);
  const acceptContent = (response: {data: Content}) => setContents(prev => [response.data, ...prev.filter(row => row.id !== response.data.id)]);
  const currentTask = (id: string) => queryClient.getQueryData<Task[]>(['workspace', currentUser.id, 'tasks'])?.find(row => row.id === id);

  const loadWorkspace = async (authenticatedUser: User): Promise<Record<string, ModuleError>> => {
    const pagedView = ['dashboard','projects','my-tasks','content','notifications','approvals'].includes(activeView);
    const allowed = <T,>(name: string, permission: string, load: () => Promise<{data:T}>, skip = false) =>
      !skip && (!permission || canUsePermission(authenticatedUser, [], permission)) ? fetchWorkspace(authenticatedUser.id, name, load) : Promise.resolve({ data: null as T });
    const [
      projectResponse, taskResponse, userResponse, contentResponse,
      ideaResponse, meetingResponse, letterResponse, resolutionResponse, dossierResponse,
      roleResponse, departmentResponse, templateResponse, notificationResponse,
      activityResponse, folderResponse, assetResponse, conversationResponse, messageResponse,
      settingsResponse,
    ] = await Promise.allSettled([
      allowed('projects', 'projects.view', () => projectsApi.list({ per_page: 100 }), pagedView),
      allowed('tasks', 'tasks.view', () => tasksApi.list({ per_page: 100 }), pagedView),
      allowed('users', '', () => canUsePermission(authenticatedUser, [], 'users.view') ? usersApi.list() : usersApi.directory().then(response => ({data: response.data.map(user => ({...user, status:'active'})) as User[]}))),
      allowed('contents', 'content.view', () => contentsApi.list(), pagedView),
      allowed('ideas', 'thinktank.view', () => ideasApi.list()),
      allowed('thinkTankMeetings', 'thinktank.view', () => thinkTankMeetingsApi.list()),
      allowed('secretariatLetters', 'secretariat.view', () => secretariatLettersApi.list()),
      allowed('secretariatResolutions', 'secretariat.view', () => secretariatResolutionsApi.list()),
      allowed('archiveDossiers', 'secretariat.view', () => archiveDossiersApi.list()),
      allowed('roles', 'roles.view', () => rolesApi.list()),
      allowed('departments', 'departments.view', () => departmentsApi.list()),
      allowed('templates', 'projects.view', () => projectTemplatesApi.list()),
      allowed('notifications', '', () => notificationsApi.list(), true),
      allowed('activities', 'reports.view', () => activityLogsApi.list()),
      allowed('folders', 'assets.view', () => damApi.folders.list()),
      allowed('assets', 'assets.view', () => damApi.assets.list()),
      allowed('conversations', 'messaging.view', () => chatApi.conversations.list()),
      allowed('messages', 'messaging.view', () => chatApi.messages.list()),
      allowed('settings', '', () => settingsApi.all()),
    ]);

    if (sessionIdRef.current !== authenticatedUser.id) return {};

    // ثبت خطای هر ماژول برای نمایش قابل دیباگ در رابط کاربری.
    const loadErrors: Record<string, ModuleError> = {};
    const describeError = (reason: unknown): ModuleError => {
      if (reason instanceof ApiError) {
        return { message: reason.message, detail: `HTTP ${reason.status}` };
      }
      return {
        message: reason instanceof Error ? reason.message : 'خطای نامشخص در ارتباط با سرور',
        detail: reason instanceof Error ? reason.stack : undefined,
      };
    };

    const data = <T,>(result: PromiseSettledResult<{ data: T }>, label: string): T | null => {
      if (result.status === 'fulfilled') return result.value.data;
      loadErrors[label] = describeError(result.reason);
      console.warn(`Loading ${label} from the backend failed.`, result.reason);
      return null;
    };

    setCurrentUser(authenticatedUser);
    setUsers(data(userResponse, 'users') ?? users);
    const projectsData = data(projectResponse, 'projects'); if (projectsData) setProjects(projectsData);
    const tasksData = data(taskResponse, 'tasks'); if (tasksData) setTasks(tasksData);
    const contentsData = data(contentResponse, 'contents'); if (contentsData) setContents(contentsData);
    setIdeas(data(ideaResponse, 'ideas') ?? ideas);
    setThinkTankMeetings(data(meetingResponse, 'meetings') ?? thinkTankMeetings);
    setSecretariatLetters(data(letterResponse, 'letters') ?? secretariatLetters);
    setSecretariatResolutions(data(resolutionResponse, 'resolutions') ?? secretariatResolutions);
    setArchiveDossiers(data(dossierResponse, 'dossiers') ?? archiveDossiers);

    const roleData = data(roleResponse, 'roles');
    if (roleData) setRoles(roleData);
    const departmentData = data(departmentResponse, 'departments');
    setDepartments(departmentData ?? []);
    const templateData = data(templateResponse, 'project templates');
    if (templateData) setTemplates(templateData);
    const notificationData = data(notificationResponse, 'notifications');
    if (notificationData) setNotifications(notificationData);
    const activityData = data(activityResponse, 'activity logs');
    if (activityData) setActivities(activityData);
    const folderData = data(folderResponse, 'asset folders');
    if (folderData) setFolders(folderData);
    const assetData = data(assetResponse, 'assets');
    if (assetData) setAssets(assetData);
    const conversationData = data(conversationResponse, 'conversations');
    if (conversationData) setConversations(conversationData);
    const messageData = data(messageResponse, 'messages');
    if (messageData) setMessages(messageData);

    let settingsData: Partial<Record<SystemSettingKey, unknown>> | null = null;
    if (settingsResponse.status === 'fulfilled') {
      settingsData = settingsResponse.value.data;
    } else {
      loadErrors['settings'] = describeError(settingsResponse.reason);
      console.warn('Loading system settings from the backend failed.', settingsResponse.reason);
    }
    if (settingsData) {
      if (Array.isArray(settingsData.content_types)) setContentTypes(settingsData.content_types as { id: string; name: string }[]);
      if (Array.isArray(settingsData.categories)) setCategories(settingsData.categories as string[]);
      if (Array.isArray(settingsData.process_templates)) setProcessTemplates(settingsData.process_templates as ContentProcessTemplate[]);
      if (Array.isArray(settingsData.publishing_platforms)) setPublishingPlatforms(settingsData.publishing_platforms as PublishingPlatform[]);
      if (Array.isArray(settingsData.workflows)) setWorkflows(settingsData.workflows as Workflow[]);

      // تنظیمات شیءای (هویت سازمان، اعلان‌ها، امنیت) و لیست اولویت‌ها
      if (settingsData.general && typeof settingsData.general === 'object') {
        setGeneralSettings({ ...DEFAULT_GENERAL_SETTINGS, ...(settingsData.general as Partial<GeneralSettings>) });
      }
      if (settingsData.notifications && typeof settingsData.notifications === 'object') {
        setNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, ...(settingsData.notifications as Partial<NotificationSettings>) });
      }
      if (settingsData.security && typeof settingsData.security === 'object') {
        setSecuritySettings({ ...DEFAULT_SECURITY_SETTINGS, ...(settingsData.security as Partial<SecuritySettings>) });
      }
      if (Array.isArray(settingsData.task_priorities)) {
        setTaskPriorities(settingsData.task_priorities as TaskPrioritySetting[]);
      }
      if (Array.isArray(settingsData.task_statuses)) {
        setTaskStatuses(settingsData.task_statuses as TaskStatusSetting[]);
      }
      if (Array.isArray(settingsData.dam_statuses)) {
        setDamStatuses(settingsData.dam_statuses as DamStatusSetting[]);
      }
      if (Array.isArray(settingsData.content_statuses)) {
        setContentStatuses(settingsData.content_statuses as ContentStatusSetting[]);
      }
    }

    setModuleErrors(loadErrors);
    if (Object.keys(loadErrors).length > 0) {
      notify({
        type: 'error',
        title: 'برخی بخش‌ها از سرور بارگذاری نشدند',
        message: `بخش‌های دارای خطا: ${Object.keys(loadErrors).join('، ')}`,
        dedupeKey: 'workspace-load-errors',
      });
    }
    workspaceLoadedRef.current = true;
    return loadErrors;
  };

  /** بارگذاری مجدد همه ماژول‌ها از سرور (دکمه «تلاش مجدد» بنرهای خطا). */
  const reloadWorkspace = async () => {
    if (isReloadingWorkspace) return;
    setIsReloadingWorkspace(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['workspace', currentUser.id] });
      const errors = await loadWorkspace(currentUser);
      if (Object.keys(errors).length === 0) {
        notify({ type: 'success', title: 'داده‌ها بازخوانی شد', message: 'همه بخش‌ها با موفقیت از سرور دریافت شدند.' });
      }
    } catch (error) {
      notifyApiError('workspace-reload', error, 'بازخوانی داده‌ها از سرور ناموفق بود');
    } finally {
      setIsReloadingWorkspace(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    workspaceLoadedRef.current = false;
    settingsBaseline.current = null;
    if (!isLoggedIn || runtime.demoMode) {
      setIsWorkspaceLoading(false); setIsAuthModalOpen(!isLoggedIn); setModuleErrors({});
      return;
    }
    setIsWorkspaceLoading(true); setIsAuthModalOpen(false);
    void loadWorkspace(currentUser).finally(() => { if (!cancelled) setIsWorkspaceLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser.id, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || isWorkspaceLoading || !readDamEntryLink(window.location.search)) return;
    if (canUsePermission(currentUser, roles, 'assets.view') && canUsePermission(currentUser, roles, 'assets.upload')) {
      setActiveView('assets');
    } else {
      notify({ type: 'error', title: 'ثبت فایل مجاز نیست', message: 'حساب فعلی دسترسی مشاهده و ثبت دارایی ندارد.' });
    }
  }, [isLoggedIn, isWorkspaceLoading, currentUser.id]);

  const previousView = useRef(activeView);
  useEffect(() => {
    if (previousView.current === activeView) return;
    previousView.current = activeView;
    if (isLoggedIn && !runtime.demoMode && !['dashboard','projects','my-tasks','content','notifications','approvals'].includes(activeView)) void loadWorkspace(currentUser);
  }, [activeView]);

  // Messaging & Chat State
  const [conversations, setConversations] = useServerState<Conversation[]>('conversations', demo.conversations);

  const [messages, setMessages] = useServerState<ChatMessage[]>('messages', demo.messages);

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilterCategory>('all');
  const [chatSearchQuery, setChatSearchQuery] = useState<string>('');

  // Think Tank (اتاق فکر) State
  const [ideas, setIdeas] = useServerState<Idea[]>('ideas', []);

  const [thinkTankMeetings, setThinkTankMeetings] = useServerState<ThinkTankMeeting[]>('thinkTankMeetings', []);

  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // Secretariat (دبیرخانه) State
  const [secretariatLetters, setSecretariatLetters] = useServerState<SecretariatLetter[]>('secretariatLetters', []);

  const [secretariatResolutions, setSecretariatResolutions] = useServerState<SecretariatResolution[]>('secretariatResolutions', []);

  const [archiveDossiers, setArchiveDossiers] = useServerState<ArchiveDossier[]>('archiveDossiers', []);

  const [selectedLetterId, setSelectedLetterId] = useState<string | null>(null);
  const [selectedResolutionId, setSelectedResolutionId] = useState<string | null>(null);



  useEffect(() => {
    if (!isLoggedIn || runtime.demoMode) return;
    const timeout = window.setTimeout(() => {
      // هر مجموعه فقط برای کاربرانی همگام می‌شود که مسیر به‌روزرسانی آن‌ها در
      // بک‌اند مجاز است؛ در غیر این صورت هر تغییر، موجی از خطای 403 تولید می‌کند.
      const collections = [
        { name: 'ideas', records: ideas, api: ideasApi, permissions: ['thinktank.edit_idea', 'thinktank.vote', 'thinktank.approve_convert'] },
        { name: 'thinkTankMeetings', records: thinkTankMeetings.filter(meeting => meeting.organizerId === currentUser.id), api: thinkTankMeetingsApi, permissions: ['thinktank.manage_meetings'] },
        { name: 'secretariatLetters', records: secretariatLetters, api: secretariatLettersApi, permissions: ['secretariat.edit_letter', 'secretariat.refer_letter', 'secretariat.archive_letter'] },
        { name: 'secretariatResolutions', records: secretariatResolutions, api: secretariatResolutionsApi, permissions: ['secretariat.manage_resolutions'] },
        { name: 'archiveDossiers', records: archiveDossiers, api: archiveDossiersApi, permissions: ['secretariat.archive_letter'] },
      ];
      collections.forEach(({ name, records, api, permissions }) => {
        if (!permissions.some(permission => hasPermission(permission))) return;
        records
          .filter(record => /^\d+$/.test(record.id) && needsServerWrite(currentUser.id, name, record))
          .forEach(record => void (api.update as (id: string, value: unknown) => Promise<{ data: unknown }>)(record.id, record).then(response => rememberServerRecords(currentUser.id, name, [response.data])).catch(error => {
            console.error('Workspace record synchronization failed.', error);
            notifyApiError('sync:workspace-records', error, 'همگام‌سازی رکوردهای فضای کار با سرور ناموفق بود');
          }));
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [ideas, thinkTankMeetings, secretariatLetters, secretariatResolutions, archiveDossiers, isLoggedIn]);

  // ── همگام‌سازی ماژول‌های متصل به بک‌اند (نقش‌ها، دپارتمان‌ها، تیم‌ها،
  // الگوها، اعلان‌ها، پوشه‌ها، فایل‌ها، گفتگوها و پیام‌ها) ──
  useEffect(() => {
    if (!isLoggedIn || runtime.demoMode) return;
    const timeout = window.setTimeout(() => {
      // همگام‌سازی هر ماژول فقط با مجوزهای به‌روزرسانی متناظر در بک‌اند؛
      // اعلان‌ها/گفتگوها/پیام‌ها شخصی‌اند و برای همه کاربران مجازند.
      const collections = [
        { name: 'folders', records: folders, api: damApi.folders, permissions: ['assets.edit_info'] },
        { name: 'assets', records: assets, api: damApi.assets, permissions: ['assets.edit_info'] },
        { name: 'conversations', records: conversations, api: chatApi.conversations, permissions: [] },
        { name: 'messages', records: messages, api: chatApi.messages, permissions: [] },
      ];
      collections.forEach(({ name, records, api, permissions }) => {
        if (!permissions.some(permission => hasPermission(permission))) return;
        records
          .filter(record => /^\d+$/.test(record.id) && needsServerWrite(currentUser.id, name, record))
          .forEach(record => void (api.update as (id: string, value: unknown) => Promise<{ data: unknown }>)(record.id, record).then(response => rememberServerRecords(currentUser.id, name, [response.data])).catch(error => {
            console.error('Record synchronization failed.', error);
            notifyApiError('sync:records', error, 'همگام‌سازی تغییرات با سرور ناموفق بود');
          }));
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [isLoggedIn, roles, templates, notifications, folders, assets, conversations, messages]);


  const [processTemplates, setProcessTemplates] = useServerState<ContentProcessTemplate[]>('processTemplates', demo.processTemplates);


  const addProcessTemplate = async (templateData: Omit<ContentProcessTemplate, 'id'>): Promise<ContentProcessTemplate> => {
    const newTemplate: ContentProcessTemplate = {
      ...templateData,
      id: `ptpl-${Date.now()}`
    };
    await settingsApi.update('process_templates', [...processTemplates, newTemplate]);
    setProcessTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  };

  const updateProcessTemplate = (templateId: string, updates: Partial<ContentProcessTemplate>) => {
    setProcessTemplates(prev => prev.map(t => t.id === templateId ? { ...t, ...updates } : t));
  };

  const deleteProcessTemplate = (templateId: string) => {
    setProcessTemplates(prev => prev.filter(t => t.id !== templateId));
  };

  const [publishingPlatforms, setPublishingPlatforms] = useServerState<PublishingPlatform[]>('publishingPlatforms', demo.publishingPlatforms);


  // ── همگام‌سازی تنظیمات سیستمی (انواع محتوا، دسته‌ها، الگوهای فرایند،
  // پلتفرم‌های انتشار، گردش‌کارها، هویت سازمان، اعلان‌ها، امنیت و
  // اولویت‌های وظایف) به‌صورت کلید/مقدار در بک‌اند ──
  const persistSettings = async (onlyDirty = false): Promise<boolean> => {
    const settingValues: [SystemSettingKey, unknown][] = [
      ['content_types', contentTypes],
      ['categories', categories],
      ['process_templates', processTemplates],
      ['publishing_platforms', publishingPlatforms],
      ['workflows', workflows],
      ['general', generalSettings],
      ['notifications', notificationSettings],
      ['security', securitySettings],
      ['task_priorities', taskPriorities],
      ['task_statuses', taskStatuses],
      ['dam_statuses', damStatuses],
      ['content_statuses', contentStatuses],
    ];

    if (onlyDirty && !settingsBaseline.current) {
      settingsBaseline.current = Object.fromEntries(settingValues.map(([key, value]) => [key, JSON.stringify(value)]));
      return true;
    }
    const failures: string[] = [];
    const writableSettings = settingValues.filter(([key, value]) => {
      if (onlyDirty && settingsBaseline.current?.[key] === JSON.stringify(value)) return false;
      if (currentUser.role === 'admin' || hasPermission('settings.manage')) return true;
      return ['process_templates', 'workflows'].includes(key) && (hasPermission('content.manage_process') || hasPermission('workflows.manage'));
    });
    await Promise.all(writableSettings.map(async ([key, value]) => {
      try {
        await settingsApi.update(key, value);
        settingsBaseline.current = { ...settingsBaseline.current, [key]: JSON.stringify(value) };
        queryClient.setQueryData(['workspace', currentUser.id, 'settings'], (old: object) => ({ ...old, [key]: value }));
      } catch (error) {
        failures.push(key);
        console.error(`Synchronizing "${key}" setting failed.`, error);
      }
    }));

    if (failures.length === 0) {
      setSettingsSaveError(null);
      setSettingsSaveState('saved');
      window.setTimeout(() => setSettingsSaveState(prev => (prev === 'saved' ? 'idle' : prev)), 3000);
      return true;
    }

    setSettingsSaveState('error');
    setSettingsSaveError(`ذخیره کلیدهای ${failures.join('، ')} ناموفق بود — دسترسی یا اتصال را بررسی کنید.`);
    notify({
      type: 'error',
      title: 'ذخیره تنظیمات ناموفق بود',
      message: `کلیدهای دارای خطا: ${failures.join('، ')}`,
      dedupeKey: 'settings-sync-failed',
    });
    return false;
  };

  /** ذخیره فوری تنظیمات (دکمه «ذخیره تغییرات» در نمای تنظیمات). */
  const saveSettingsNow = async (): Promise<boolean> => {
    if (!isLoggedIn || !workspaceLoadedRef.current) return false;
    setSettingsSaveState('saving');
    try {
      return await persistSettings();
    } catch (error) {
      setSettingsSaveState('error');
      setSettingsSaveError(error instanceof Error ? error.message : 'خطای نامشخص در ذخیره تنظیمات');
      return false;
    }
  };

  useEffect(() => {
    if (!isLoggedIn || runtime.demoMode || !workspaceLoadedRef.current) return;
    const timeout = window.setTimeout(() => {
      void persistSettings(true);
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [isLoggedIn, contentTypes, categories, processTemplates, publishingPlatforms, workflows, generalSettings, notificationSettings, securitySettings, taskPriorities, taskStatuses, damStatuses, contentStatuses]);

  const updatePublishingPlatforms = (platforms: PublishingPlatform[]) => {
    setPublishingPlatforms(platforms);
  };


  // Content Operations
  const addContent = async (contentData: Partial<Content> & { title: string; type: string }): Promise<Content | null> => {
    const template = processTemplates.find(t => t.id === contentData.processTemplateId) || processTemplates[0];
    
    // Build stages from template if not provided
    const generatedStages: ContentStage[] = (contentData.stages && contentData.stages.length > 0)
      ? contentData.stages
      : (template ? template.stages.map((stgTpl: ContentProcessTemplate['stages'][number] & { checklist?: { text: string }[] }, idx) => {
          const dept = departments.find(d => d.id === stgTpl.departmentId);
          return {
            id: `stg-${Date.now()}-${idx}`,
            stageKey: stgTpl.stageKey,
            title: stgTpl.title,
            description: stgTpl.description,
            departmentId: stgTpl.departmentId,
            departmentName: dept?.name || stgTpl.departmentName,
            assigneeRole: stgTpl.defaultRole,
            assigneeId: idx === 0 ? currentUser.id : undefined,
            reviewerId: undefined,
            approverId: undefined,
            order: stgTpl.order,
            status: (idx === 0 ? 'not_started' : 'pending_dependency') as ContentStageStatus,
            startDate: new Date(Date.now() + idx * 86400000).toISOString().split('T')[0],
            deadline: new Date(Date.now() + (idx + (stgTpl.daysFromStart || 2)) * 86400000).toISOString().split('T')[0],
            inputs: stgTpl.inputs.map((inp, inpIdx) => ({
              id: `inp-${Date.now()}-${idx}-${inpIdx}`,
              title: inp.title,
              description: inp.description,
              type: inp.type,
              isReady: idx === 0
            })),
            outputs: stgTpl.outputs.map((out, outIdx) => ({
              id: `out-${Date.now()}-${idx}-${outIdx}`,
              name: out.name,
              type: out.type,
              isRequired: out.isRequired,
              isDelivered: false
            })),
            checklist: stgTpl.checklist ? stgTpl.checklist.map((item, cIdx) => ({
              id: `chk-${Date.now()}-${idx}-${cIdx}`,
              text: item.text,
              isCompleted: false
            })) : [],
            activityLog: [
              {
                id: `act-${Date.now()}-${idx}`,
                userId: currentUser.id,
                userName: currentUser.name,
                action: 'مرحله فرایند مقداردهی اولیه شد',
                timestamp: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())
              }
            ]
          };
        }) : []);

    const newContent: Content = {
      id: 'cnt-' + Date.now(),
      title: contentData.title,
      type: contentData.type,
      isRecurring: contentData.isRecurring,
      recurrenceInterval: contentData.recurrenceInterval,
      recurrenceCount: contentData.recurrenceCount,
      topic: contentData.topic || '',
      targetAudience: contentData.targetAudience || '',
      mediaGoal: contentData.mediaGoal || '',
      description: contentData.description || '',
      departmentId: contentData.departmentId,
      departmentIds: contentData.departmentIds || [],
      projectId: contentData.projectId,
      processTemplateId: contentData.processTemplateId || template?.id,
      ownerId: contentData.ownerId || currentUser.id,
      creatorId: currentUser.id,
      editorIds: contentData.editorIds || [currentUser.id],
      reviewerIds: contentData.reviewerIds || [],
      approverId: contentData.approverId,
      status: contentData.status || 'idea',
      workflowStageId: contentData.workflowStageId || 's1',
      stages: generatedStages,
      currentStageIndex: 0,
      deadline: contentData.deadline || new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      tags: contentData.tags || ['تولید محتوا'],
      tasks: contentData.tasks || [],
      assetIds: contentData.assetIds || [],
      attachments: contentData.attachments || [],
      publishInfo: contentData.publishInfo || {
        channels: ['website'],
        status: 'planned'
      },
      comments: [],
      history: [
        {
          id: 'hist-' + Date.now(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: `پرونده محتوا با الگوی فرایندی "${template?.name || 'استاندارد'}" ایجاد شد`,
          timestamp: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
          fromStatus: 'idea',
          toStatus: contentData.status || 'idea'
        }
      ]
    };

    if (runtime.demoMode) { setContents(prev => [newContent, ...prev]); return newContent; }
    // The server creates canonical linked stage tasks in the same transaction.
    // Never create tasks against a temporary content ID or announce an unsaved record.
    const response = await confirmed.run('contents:create', () => contentsApi.create(newContent), acceptContent);
    if (!response) return null;
    notify({type:'success',title:'پرونده محتوا در سرور ثبت شد.'});
    return response.data;
  };

  const duplicateContent = async (contentId: string): Promise<Content | null> => {
    const source = contents.find(content => content.id === contentId);
    if (!source) return null;
    return addContent({
      title: `${source.title} (انتشار مجدد)`,
      description: source.description,
      type: source.type,
      topic: source.topic,
      targetAudience: source.targetAudience,
      mediaGoal: source.mediaGoal,
      departmentId: source.departmentId,
      departmentIds: source.departmentIds,
      projectId: source.projectId,
      processTemplateId: source.processTemplateId,
      ownerId: source.ownerId || currentUser.id,
      approverId: source.approverId,
      status: 'idea',
      deadline: undefined,
      tags: [...(source.tags || [])],
      assetIds: [...(source.assetIds || [])],
      isRecurring: source.isRecurring,
      recurrenceInterval: source.recurrenceInterval,
      recurrenceCount: source.recurrenceCount,
      publishInfo: {
        channels: [...(source.publishInfo?.channels || ['website'])],
        status: 'planned'
      }
    });
  };

  const updateContent = async (contentId: string, updates: Partial<Content>): Promise<boolean> => {
    if (runtime.demoMode) { setContents(prev => prev.map(row => row.id === contentId ? {...row,...updates} : row)); return true; }
    return !!await confirmed.run(`contents:${contentId}`, () => contentsApi.update(contentId, {...updates,...(updates.stages ? {reviewVersion:contents.find(row=>row.id===contentId)?.reviewVersion} : {})}), acceptContent);
  };

  const deleteContent = async (contentId: string): Promise<boolean> => {
    if (runtime.demoMode) { setContents(prev=>prev.filter(row=>row.id!==contentId)); return true; }
    return !!await confirmed.run(`contents:${contentId}`, async()=>{await contentsApi.remove(contentId);return true;},()=>{
      setContents(prev=>prev.filter(row=>row.id!==contentId));
      if(selectedContentId===contentId){setSelectedContentId(null);setActiveView('content');}
    });
  };
  const changeContentStatus = (contentId: string, status: ContentStatus, note?: string) => {
    if (status === 'published') { void publishContentNow(contentId); return; }
    if (contents.find(c=>c.id===contentId)?.status==='published') { void unpublishContent(contentId); return; }
    void updateContent(contentId,{status});
  };

  const applyContentChange = async (contentId:string, transform:(rows:Content[])=>Content[]):Promise<boolean> => {
    if (runtime.demoMode) {setContents(rows=>rows.map(row=>row.id===contentId?transform([row])[0]:row));return true;}
    return !!await confirmed.run(`contents:${contentId}`, async()=>{
      const {data:current}=await contentsApi.get(contentId);
      const changed=transform([current])[0];
      const ignored=new Set(['id','createdAt','updatedAt','reviewVersion','reviewableStageIds','publicationVersion','history']);
      const updates=Object.fromEntries(Object.entries(changed).filter(([key,value])=>!ignored.has(key)&&JSON.stringify(value)!==JSON.stringify((current as any)[key])));
      return contentsApi.update(contentId,{...updates,...(updates.stages?{reviewVersion:current.reviewVersion}:{})});
    },acceptContent);
  };

  const addContentAttachment = (contentId: string, file: { name: string; size: string; type?: string; url?: string }) => {
    const newAtt = {
      id: `att-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type || 'file',
      url: file.url || '#',
      uploadedAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date()),
      uploadedBy: currentUser.id
    };

    return applyContentChange(contentId, prev => prev.map(c => {
      if (c.id === contentId) {
        return {
          ...c,
          attachments: [...(c.attachments || []), newAtt],
          history: [
            ...c.history,
            {
              id: `hist-${Date.now()}`,
              userId: currentUser.id,
              userName: currentUser.name,
              action: `فایل پیوست "${file.name}" اضافه شد`,
              timestamp: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())
            }
          ]
        };
      }
      return c;
    }));
  };

  const deleteContentAttachment = (contentId: string, attachmentId: string) => {
    return applyContentChange(contentId, prev => prev.map(c => {
      if (c.id === contentId) {
        return {
          ...c,
          attachments: (c.attachments || []).filter(a => a.id !== attachmentId)
        };
      }
      return c;
    }));
  };

  const assignStageResponsibility = (contentId:string,stageId:string,data:{assigneeId?:string;assigneeRole?:string;reviewerId?:string;approverId?:string;deadline?:string}) =>
    applyContentChange(contentId,rows=>rows.map(content=>({...content,stages:(content.stages||[]).map(stage=>stage.id===stageId?{...stage,...data}:stage)})));

  const updateStageStatus = (contentId:string,stageId:string,status:ContentStageStatus,note?:string,reportText?:string) =>
    applyContentChange(contentId,rows=>rows.map(content=>({...content,stages:(content.stages||[]).map(stage=>stage.id===stageId?{...stage,status,...(reportText!==undefined?{workReport:reportText}:{})}:stage)})));

  const addStageDeliverable = (
    contentId: string, 
    stageId: string, 
    outputId: string, 
    data: { fileName?: string; fileSize?: string; value?: string; fileType?: string; url?: string; assetId?: string; title?: string }
  ) => {
    const nowStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());

    return applyContentChange(contentId, prev => prev.map(c => {
      if (c.id !== contentId) return c;

      const updatedStages = (c.stages || []).map(stg => {
        if (stg.id !== stageId) return stg;

        let found = false;
        const updatedOutputs = stg.outputs.map(out => {
          if (out.id !== outputId) return out;
          found = true;
          return {
            ...out,
            isDelivered: true,
            deliveredAt: nowStr,
            deliveredBy: currentUser.id,
            fileName: data.fileName || out.fileName,
            fileSize: data.fileSize || out.fileSize,
            value: data.value !== undefined ? data.value : out.value,
            fileType: data.fileType || out.fileType,
            url: data.url || out.url,
            assetId: data.assetId || out.assetId
          };
        });
        
        if (!found) {
          updatedOutputs.push({
            id: outputId || `out-${Date.now()}`,
            name: data.title || data.fileName || 'خروجی جدید',
            type: data.fileName ? 'file' : data.url ? 'link' : 'text',
            isRequired: false,
            isDelivered: true,
            deliveredAt: nowStr,
            deliveredBy: currentUser.id,
            fileName: data.fileName,
            fileSize: data.fileSize,
            value: data.value,
            fileType: data.fileType,
            url: data.url,
            assetId: data.assetId
          });
        }

        return {
          ...stg,
          outputs: updatedOutputs,
          activityLog: [
            ...(stg.activityLog || []),
            {
              id: `act-${Date.now()}`,
              userId: currentUser.id,
              userName: currentUser.name,
              action: `خروجی "${data.title || data.fileName || data.value || 'مرحله'}" در DAM ثبت شد`,
              timestamp: nowStr
            }
          ]
        };
      });

      return {
        ...c,
        assetIds: data.assetId ? Array.from(new Set([...(c.assetIds || []), data.assetId])) : c.assetIds,
        stages: updatedStages,
        updatedAt: new Date().toISOString().split('T')[0]
      };
    }));
  };

  
  const removeStageDeliverable = (contentId: string, stageId: string, outputId: string) => {
    return applyContentChange(contentId, prev => prev.map(c => {
      if (c.id !== contentId) return c;
      const updatedStages = (c.stages || []).map(stg => {
        if (stg.id !== stageId) return stg;
        return {
          ...stg,
          outputs: stg.outputs.filter(out => out.id !== outputId)
        };
      });
      return { ...c, stages: updatedStages };
    }));
  };

  const decideContentStage = async (contentId: string, stageId: string, decision: 'approve' | 'reject', note?: string): Promise<boolean> => {
    // Approve only the version actually displayed, never silently fetch a newer version first.
    const expectedVersion = contents.find(row=>row.id===contentId)?.reviewVersion;
    const result=await confirmed.run(`contents:${contentId}`,async()=>{
      if (!expectedVersion) throw new Error('نسخهٔ بررسی در دسترس نیست؛ جزئیات را دوباره بارگذاری کنید.');
      return contentsApi.decide(contentId,stageId,{decision,note,expectedVersion});
    },response=>{
      acceptContent(response);
      void queryClient.invalidateQueries({queryKey:['pages',currentUser.id,'approvals']});
      notify({type:'success',title:'تصمیم بررسی ثبت شد.'});
    });
    return !!result;
  };
  const approveStage = (contentId: string, stageId: string, note?: string) => decideContentStage(contentId, stageId, 'approve', note);
  const rejectStage = (contentId: string, stageId: string, note: string) => decideContentStage(contentId, stageId, 'reject', note);

  const refreshPublicationContent = async (contentId: string): Promise<void> => {
    const response = await contentsApi.get(contentId);
    setContents(prev => prev.map(c => c.id === contentId ? response.data : c));
  };

  const publicationVersion = async (contentId: string): Promise<string> => {
    const local = contents.find(c => c.id === contentId)?.publicationVersion;
    if (local) return local;
    const response = await contentsApi.get(contentId);
    if (!response.data.publicationVersion) throw new Error('نسخهٔ جدید بک‌اند نصب نشده است؛ ثبت انتشار انجام نشد.');
    setContents(prev => prev.map(c => c.id === contentId ? response.data : c));
    return response.data.publicationVersion;
  };

  const scheduleContentPublication = async (contentId: string, data: Omit<PublicationSettings, 'expectedVersion'>): Promise<Content> => {
    const response = await withPublicationConflictRefresh(
      async () => contentsApi.schedule(contentId, { ...data, expectedVersion: await publicationVersion(contentId) }),
      () => refreshPublicationContent(contentId),
    );
    setContents(prev => prev.map(c => c.id === contentId ? response.data : c));
    return response.data;
  };

  const createPublicationTask = async (contentId: string, data: PublicationTaskInput): Promise<Task> => {
    const response = await withPublicationConflictRefresh(
      () => contentsApi.createPublicationTask(contentId, data), () => refreshPublicationContent(contentId),
    );
    setTasks(prev => [response.data, ...prev.filter(t => t.id !== response.data.id)]);
    return response.data;
  };

  const updateContentPublishInfo = async (contentId: string, info: Partial<Content['publishInfo']>) => {
    try {
      if (info.status === 'published') { await publishContentNow(contentId); return; }
      await scheduleContentPublication(contentId, { publishInfo: info as PublicationSettings['publishInfo'] });
    } catch (error) { notifyApiError('publication-settings', error, 'برنامهٔ انتشار ذخیره نشد'); }
  };

  const runPublicationCommand = async (contentId: string, action: 'publish' | 'unpublish', expectedVersion?: string): Promise<boolean> => {
    if (publicationInFlight.current.has(contentId)) return false;
    publicationInFlight.current.add(contentId);
    setPublishingContentIds([...publicationInFlight.current]);
    try {
      const response = await withPublicationConflictRefresh(
        async () => contentsApi[action](contentId, expectedVersion || await publicationVersion(contentId)),
        () => refreshPublicationContent(contentId),
      );
      setContents(prev => prev.map(c => c.id === contentId ? response.data.content : c));
      const received = new Map(response.data.tasks.map(task => [task.id, task]));
      setTasks(prev => [...prev.map(task => received.get(task.id) ?? task), ...response.data.tasks.filter(task => !prev.some(old => old.id === task.id))]);
      notify({ type: 'success', title: action === 'publish' ? 'انتشار در تدبیر ثبت شد' : 'ثبت انتشار لغو شد',
        message: action === 'publish' ? 'تسک‌های انتشار مرتبط به‌روزرسانی شدند؛ ارسال خارجی به کانال‌ها انجام نشده است.' : 'سابقهٔ تسک‌های انجام‌شده حفظ شد.' });
      if (action === 'publish') triggerCelebration();
      return true;
    } catch (error) {
      notifyApiError('publication-command', error, 'ثبت تغییر انتشار انجام نشد');
      return false;
    } finally {
      publicationInFlight.current.delete(contentId);
      setPublishingContentIds([...publicationInFlight.current]);
    }
  };

  const publishContentNow = (contentId: string, expectedVersion?: string): Promise<boolean> => runPublicationCommand(contentId, 'publish', expectedVersion);
  const unpublishContent = (contentId: string): Promise<boolean> => runPublicationCommand(contentId, 'unpublish');

  const addContentComment = (contentId:string,text:string) => applyContentChange(contentId,rows=>rows.map(content=>({...content,comments:[...(content.comments||[]),{
    id:crypto.randomUUID(),userId:currentUser.id,userName:currentUser.name,userAvatar:currentUser.avatar,text:text.trim(),timestamp:new Date().toISOString(),createdAt:new Date().toISOString(),
  }]})));

  const refreshDepartments = async () => {
    const response = await departmentsApi.list();
    setDepartments(response.data);
    setModuleErrors(previous => { const next = { ...previous }; delete next.departments; return next; });
  };

  const addDepartment = async (dept: Omit<Department, 'id' | 'createdAt'>): Promise<Department> => {
    const response = await departmentsApi.create(dept);
    setDepartments(previous => [...previous, response.data]);
    return response.data;
  };

  const updateDepartment = async (id: string, updates: Partial<Department>): Promise<Department> => {
    const response = await departmentsApi.update(id, updates);
    setDepartments(previous => previous.map(item => item.id === id ? response.data : item));
    const syncPrimary = (user: User): User => user.departmentId !== id ? user : {
      ...user, departmentId: response.data.members.some(m => m.userId === user.id) ? id : null,
      department: response.data.members.some(m => m.userId === user.id) ? response.data.name : ''
    };
    setUsers(previous => previous.map(syncPrimary));
    setCurrentUser(syncPrimary);
    return response.data;
  };

  const deleteDepartment = async (id: string): Promise<void> => {
    await departmentsApi.remove(id);
    const clearPrimary = (user: User): User => user.departmentId === id ? { ...user, departmentId: null, department: '' } : user;
    setUsers(previous => previous.map(clearPrimary)); setCurrentUser(clearPrimary);
    await refreshDepartments();
  };

  const addCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    setCategories(prev => [...prev, trimmed]);
  };

  const updateCategory = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCategories(prev => prev.map(c => c === oldName ? trimmed : c));
    setProjects(prev => prev.map(p => p.category === oldName ? { ...p, category: trimmed } : p));
  };

  const deleteCategory = (name: string) => {
    setCategories(prev => prev.filter(c => c !== name));
  };

  const resetCategories = () => {
    setCategories(demo.categories);
  };

  const openEditProject = (proj: Project) => {
    setProjectToEdit(proj);
    setIsEditProjectOpen(true);
  };

  const openEditRole = (role: SystemRole) => {
    setRoleToEdit(role);
    setIsEditRoleOpen(true);
  };

  const openEditAsset = (asset: DigitalAsset) => {
    setAssetToEdit(asset);
    setIsEditAssetOpen(true);
  };

  const openEditFolder = (folder: AssetFolder) => {
    setFolderToEdit(folder);
    setIsEditFolderOpen(true);
  };

  const triggerCelebration = () => {
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#6366f1', '#10b981', '#3b82f6', '#f59e0b', '#ec4899']
      });
    } catch {
      // Confetti fallback
    }
  };

  const logActivity = (activity: Omit<ActivityLog, 'id' | 'timestamp'> & { timestamp?: string }) => {
    if (runtime.demoMode) return;
    // Legacy callers may provide a draft ID. Never pretend it is a stored relation.
    void activityLogsApi.create({userId:currentUser.id,action:activity.action,details:activity.details,type:'client_note',
      taskId:/^[1-9]\d*$/.test(activity.taskId||'')?activity.taskId:undefined,
      projectId:/^[1-9]\d*$/.test(activity.projectId||'')?activity.projectId:undefined,
    }).then(response=>setActivities(prev=>[response.data,...prev.slice(0,99)]))
      .catch(error=>notifyApiError('activity-note',error,'یادداشت فعالیت ثبت نشد'));
  };

  const loginAs = (user: User) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    setAuthNotice(null);
    notify({ type: 'success', title: 'ورود موفقیت‌آمیز بود', message: `خوش آمدید ${user.name} عزیز!` });
    triggerCelebration();
    logActivity({
      userId: user.id,
      action: `وارد سامانه تدبیر شد`,
      type: 'auth_login',
      details: `ورود موفق از پرتال احراز هویت`
    });
  };

  const logout = async () => {
    try {
      await logoutSession();
      setAuthNotice('خروج موفقیت‌آمیز بود. برای ادامه وارد شوید.'); setIsAuthModalOpen(true);
    } catch (error) { notifyApiError('logout', error, 'خروج انجام نشد؛ دوباره تلاش کنید.'); }
  };

  // User Management Methods
  /** استخراج پیام فارسی قابل نمایش از خطای سرور (شامل خطاهای اعتبارسنجی). */
  const describeServerError = (error: unknown, fallback: string): string => {
    if (error instanceof ApiError) {
      const fieldErrors = error.errors
        ? Object.values(error.errors).flat().filter(Boolean)
        : [];
      const parts = [...fieldErrors];
      if (error.message && !/\(4\d\d\)|\(5\d\d\)|validation|Validation/.test(error.message)) {
        parts.unshift(error.message);
      }
      const unique = [...new Set(parts)].slice(0, 4);
      if (unique.length > 0) return unique.join(' • ');
      if (error.status === 403) return 'شما اجازه انجام این عملیات را ندارید.';
      if (error.status === 422) return 'اطلاعات واردشده معتبر نیست؛ ورودی‌ها را بررسی کنید.';
      if (error.status >= 500) return 'خطای داخلی سرور؛ لطفاً بعداً تلاش کنید.';
    }
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  };

  const addUserAsync = async (userData: Partial<User> & { name: string; email: string; avatarFile?: File | null }): Promise<User> => {
    const now = new Date();
    const formattedDate = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;

    // Generate username from email or name
    const generatedUsername = userData.username || userData.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.]/g, '');

    // نقش انتخاب‌شده همیشه از روی شناسه نقش به کلید معتبر نگاشت می‌شود تا
    // دقیقاً همان نقشی که کاربر انتخاب کرده در سرور ثبت شود.
    const resolvedRole = roles.find(r => r.id === userData.roleId)
      || roles.find(r => r.key === userData.role)
      || roles[0];

    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: userData.name,
      username: generatedUsername,
      email: userData.email,
      avatar: userData.avatar || '',
      role: resolvedRole ? resolvedRole.key : (userData.role || 'team_member'),
      roleId: resolvedRole ? resolvedRole.id : userData.roleId,
      status: userData.status || 'active',
      title: userData.title || 'عضو تخصصی تیم',
      department: userData.department || '',
      departmentId: userData.departmentId ?? null,
      activeProjectsCount: 0,
      completedTasksCount: 0,
      workloadPercentage: 0,
      skills: userData.skills && userData.skills.length > 0 ? userData.skills : ['همکاری تیمی', 'سامانه تدبیر'],
      phone: userData.phone || '۰۹۱۲۰۰۰۰۰۰۰',
      location: userData.location || 'تهران، ایران',
      lastLogin: 'هنوز وارد نشده',
      createdAt: formattedDate,
      twoFactorEnabled: userData.twoFactorEnabled || false,
      temporaryPassword: userData.temporaryPassword,
      bio: userData.bio || `کاربر جدید سامانه تدبیر در واحد ${userData.department || 'سازمانی'}`
    };

    setUsers(prev => [newUser, ...prev]);
    const { avatarFile } = userData;
    let savedUser: User = newUser;
    if (newUser.temporaryPassword) {
      const createPayload = { ...newUser, username: newUser.username || generatedUsername };
      try {
        const response = await usersApi.create({
          ...createPayload,
          password: newUser.temporaryPassword,
          password_confirmation: newUser.temporaryPassword,
        });
        savedUser = response.data;
        setUsers(prev => prev.map(user => user.id === newUser.id ? response.data : user));
        if (response.data.departmentId) void refreshDepartments().catch(error => notifyApiError('departments:refresh', error, 'دریافت عضویت‌های دپارتمان ناموفق بود'));
        if (avatarFile && response.data?.id) {
          try {
            const avatarResponse = await usersApi.uploadAvatar(response.data.id, avatarFile);
            savedUser = avatarResponse.data;
            setUsers(prev => prev.map(user => user.id === response.data.id ? avatarResponse.data : user));
          } catch (error) {
            console.error('Uploading user avatar failed.', error);
          }
        }
      } catch (error) {
        setUsers(prev => prev.filter(user => user.id !== newUser.id));
        console.error('Creating user on the backend failed.', error);
        throw new Error(describeServerError(error, 'ایجاد کاربر در سرور ناموفق بود.'));
      }
    }

    // Update role user count
    if (newUser.roleId) {
      setRoles(prev => prev.map(r => r.id === newUser.roleId ? { ...r, userCount: (r.userCount || 0) + 1 } : r));
    }

    logActivity({
      userId: currentUser.id,
      action: `کاربر جدید "${newUser.name}" را در سامانه تدبیر ایجاد کرد`,
      type: 'user_created',
      details: `نام کاربری: @${newUser.username} • نقش: ${newUser.title}`
    });

    sendNotification({
      userId: currentUser.id,
      title: 'کاربر جدید اضافه شد',
      message: `حساب کاربری ${newUser.name} (@${newUser.username}) با موفقیت ایجاد شد.`,
      type: 'assignment'
    });

    return savedUser;
  };

  const addUser = (userData: Partial<User> & { name: string; email: string; avatarFile?: File | null }): User => {
    // نگارش قدیمی همگام؛ خطا به‌صورت توست نمایش داده می‌شود.
    const now = new Date();
    const tempId = `usr-${Date.now()}`;
    void addUserAsync(userData)
      .catch(error => notifyApiError('users:create', error, 'ایجاد کاربر ناموفق بود'));
    return { ...userData, id: tempId, username: userData.username || '', avatar: userData.avatar || '', role: userData.role || 'team_member', status: userData.status || 'active', title: userData.title || '', department: userData.department || '', activeProjectsCount: 0, completedTasksCount: 0, workloadPercentage: 0, skills: userData.skills || [], phone: userData.phone || '', location: userData.location || '', lastLogin: '', createdAt: `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}` } as User;
  };

  const updateUserAsync = async (userId: string, updates: Partial<User> & { avatarFile?: File | null }): Promise<User> => {
    const previousUser = users.find(user => user.id === userId);
    // اگر شناسه نقش تغییر کرده، کلید نقش هم از ماتریس نقش‌ها همگام می‌شود.
    const normalizedUpdates: Partial<User> = { ...updates };
    if (updates.roleId) {
      const matchedRole = roles.find(r => r.id === updates.roleId);
      if (matchedRole) normalizedUpdates.role = matchedRole.key;
    } else if (updates.role) {
      const matchedRole = roles.find(r => r.key === updates.role);
      if (matchedRole) normalizedUpdates.roleId = matchedRole.id;
    }
    const { avatarFile } = normalizedUpdates as Partial<User> & { avatarFile?: File | null };
    delete (normalizedUpdates as Partial<User> & { avatarFile?: File | null }).avatarFile;
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        const updated = { ...u, ...normalizedUpdates };
        if (currentUser.id === userId) {
          setCurrentUser(updated);
        }
        return updated;
      }
      return u;
    }));

    const targetUser = users.find(u => u.id === userId);
    logActivity({
      userId: currentUser.id,
      action: `اطلاعات کاربر "${targetUser?.name || 'کاربر'}" را ویرایش کرد`,
      type: 'user_updated',
      details: updates.role ? `تغییر نقش به ${updates.role}` : updates.status ? `تغییر وضعیت به ${updates.status}` : 'به‌روزرسانی مشخصات سازمانی'
    });

    const payload: Partial<User> & { password?: string; password_confirmation?: string } = { ...normalizedUpdates };
    if (normalizedUpdates.temporaryPassword) {
      payload.password = normalizedUpdates.temporaryPassword;
      payload.password_confirmation = normalizedUpdates.temporaryPassword;
      delete payload.temporaryPassword;
    }
    let savedUser = users.find(user => user.id === userId);
    try {
      const response = await usersApi.update(userId, payload);
      savedUser = response.data;
      setUsers(prev => prev.map(user => user.id === userId ? response.data : user));
      if (currentUser.id === userId) setCurrentUser(response.data);
      if (Object.hasOwn(normalizedUpdates, 'departmentId') || Object.hasOwn(normalizedUpdates, 'department')) void refreshDepartments().catch(error => notifyApiError('departments:refresh', error, 'دریافت عضویت‌های دپارتمان ناموفق بود'));
      if (avatarFile && response.data?.id) {
        try {
          const avatarResponse = await usersApi.uploadAvatar(response.data.id, avatarFile);
          savedUser = avatarResponse.data;
          setUsers(prev => prev.map(user => user.id === response.data.id ? avatarResponse.data : user));
          if (currentUser.id === userId) setCurrentUser(avatarResponse.data);
        } catch (error) {
          console.error('Uploading user avatar failed.', error);
        }
      }
    } catch (error) {
      if (previousUser) setUsers(prev => prev.map(user => user.id === userId ? previousUser : user));
      console.error('Updating user on the backend failed.', error);
      throw new Error(describeServerError(error, 'به‌روزرسانی کاربر در سرور ناموفق بود.'));
    }
    if (!savedUser) throw new Error('کاربر یافت نشد.');
    return savedUser;
  };

  const updateUser = (userId: string, updates: Partial<User>) => {
    void updateUserAsync(userId, updates)
      .catch(error => notifyApiError('users:update', error, 'به‌روزرسانی کاربر ناموفق بود'));
  };

  const deleteUser = (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    if (targetUser.id === currentUser.id) {
      alert('نمی‌توانید حساب کاربری فعال خود را حذف کنید.');
      return;
    }

    setUsers(prev => prev.filter(u => u.id !== userId));
    void usersApi.remove(userId).catch(error => {
      setUsers(prev => [targetUser, ...prev]);
      console.error('Deleting user on the backend failed.', error);
    });

    logActivity({
      userId: currentUser.id,
      action: `کاربر "${targetUser.name}" را از سامانه حذف کرد`,
      type: 'user_status_changed',
      details: `حذف حساب کاربری @${targetUser.username || targetUser.email}`
    });
  };

  const changeUserStatus = (userId: string, status: UserStatus) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
    if (currentUser.id === userId) {
      setCurrentUser(prev => ({ ...prev, status }));
    }

    const statusLabels: Record<UserStatus, string> = {
      active: 'فعال',
      inactive: 'غیرفعال',
      blocked: 'مسدود',
      pending: 'در انتظار تأیید'
    };

    logActivity({
      userId: currentUser.id,
      action: `وضعیت حساب کاربر "${targetUser.name}" را به "${statusLabels[status]}" تغییر داد`,
      type: 'user_status_changed',
      details: `شناسه کاربر: ${userId}`
    });
  };

  const bulkChangeUserStatus = (userIds: string[], status: UserStatus) => {
    setUsers(prev => prev.map(u => userIds.includes(u.id) ? { ...u, status } : u));
    
    const statusLabels: Record<UserStatus, string> = {
      active: 'فعال‌سازی',
      inactive: 'غیرفعال‌سازی',
      blocked: 'مسدودسازی',
      pending: 'تعلیق'
    };

    logActivity({
      userId: currentUser.id,
      action: `عملیات گروهی: ${statusLabels[status]} برای ${userIds.length} کاربر انجام شد`,
      type: 'user_status_changed',
      details: `تعداد کاربران متأثر: ${userIds.length}`
    });
  };

  const bulkDeleteUsers = (userIds: string[]) => {
    // Prevent deleting current user
    const filteredIds = userIds.filter(id => id !== currentUser.id);
    setUsers(prev => prev.filter(u => !filteredIds.includes(u.id)));

    logActivity({
      userId: currentUser.id,
      action: `عملیات گروهی: حذف ${filteredIds.length} کاربر از سامانه تدبیر`,
      type: 'user_status_changed',
      details: `تعداد حذف شده: ${filteredIds.length}`
    });
  };

  // Role Management Methods
  const acceptRole=(result:{data:SystemRole})=>{
    setRoles(rows=>[result.data,...rows.filter(row=>row.id!==result.data.id)]);
    setCurrentUser(user=>user.roleId===result.data.id?{...user,role:result.data.key,roleIsActive:result.data.isActive,permissions:result.data.isActive?result.data.permissions:[]}:user);
  };
  const addRole = async (roleData:Partial<SystemRole>&{name:string;key:string}):Promise<SystemRole|null> => {
    const key=/^[A-Za-z0-9_]+$/.test(roleData.key||'')?roleData.key:`role_${Date.now()}`;
    const payload={...roleData,key,permissions:roleData.permissions||[],isActive:roleData.isActive??true};
    const response=await confirmed.run('roles:create',()=>rolesApi.create(payload),acceptRole);
    return response?.data||null;
  };
  const updateRole=async(roleId:string,updates:Partial<SystemRole>):Promise<boolean>=>
    !!await confirmed.run(`roles:${roleId}`,()=>rolesApi.update(roleId,updates),acceptRole);
  const deleteRole=async(roleId:string):Promise<boolean>=>
    !!await confirmed.run(`roles:${roleId}`,async()=>{await rolesApi.remove(roleId);return true;},()=>setRoles(rows=>rows.filter(row=>row.id!==roleId)));
  const toggleRolePermission=async(roleId:string,permissionId:string):Promise<boolean>=>{
    // Read fresh grants inside the serialized command; a second click cannot
    // overwrite a grant just confirmed by the preceding write.
    return !!await confirmed.run(`roles:${roleId}`,async()=>{
      const role=(await rolesApi.list()).data.find(row=>row.id===roleId);
      if(!role)throw new Error('نقش یافت نشد.');
      return rolesApi.update(roleId,{permissions:role.permissions.includes(permissionId)?role.permissions.filter(key=>key!==permissionId):[...role.permissions,permissionId]});
    },acceptRole);
  };
  const toggleRoleStatus=async(roleId:string):Promise<boolean>=>{
    return !!await confirmed.run(`roles:${roleId}`,async()=>{
      const role=(await rolesApi.list()).data.find(row=>row.id===roleId);
      if(!role)throw new Error('نقش یافت نشد.');
      return rolesApi.update(roleId,{isActive:role.isActive===false});
    },acceptRole);
  };

  const hasPermission = (permissionId: string): boolean =>
    canUsePermission(currentUser, roles, permissionId);

  // Auth Operations
  const registerUser = async (data: { name: string; username: string; email: string; phone?: string; password?: string; department?: string; title?: string }) => {
    if (!data.password) {
      return { success: false, message: 'رمز عبور الزامی است.', error: 'رمز عبور الزامی است.' };
    }

    try {
      const response = await authApi.register({
        name: data.name,
        username: data.username,
        email: data.email,
        phone: data.phone,
        department: data.department,
        title: data.title,
        password: data.password,
        password_confirmation: data.password,
      });

      return {
        success: true,
        user: response.data,
        message: response.message || 'ثبت‌نام با موفقیت انجام شد. پس از تأیید مدیر می‌توانید وارد شوید.',
      };
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'ارتباط با سرور برای ثبت‌نام ناموفق بود.';
      return { success: false, message, error: message };
    }
  };

  const loginWithCredentials = async (usernameOrEmail: string, password?: string, rememberMe?: boolean) => {
    if (!password) {
      return { success: false, message: 'رمز عبور الزامی است.', error: 'رمز عبور الزامی است.' };
    }

    try {
      const response = await authenticate({
        login: usernameOrEmail,
        password,
        remember: rememberMe,
      });

      loginAs(response.data);

      return {
        success: true,
        requires2FA: false,
        user: response.data,
        message: response.message || 'ورود با موفقیت انجام شد.',
      };
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'ارتباط با سرور برای ورود ناموفق بود.';
      return { success: false, message, error: message };
    }
  };

  const resetPasswordRequest = async (email: string) => {
    try {
      const response = await authApi.forgotPassword(email);
      return { success: true, message: response.message };
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'ارسال درخواست بازیابی رمز عبور ناموفق بود.';
      return { success: false, message, error: message };
    }
  };

  // Recalculate project progress automatically
  const recalculateProjectProgress = (projectId: string, currentTasks: Task[]) => {
    const projTasks = currentTasks.filter(t => t.projectId === projectId);
    if (projTasks.length === 0) return 0;
    const completed = projTasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / projTasks.length) * 100);
  };

  // Task Operations
  const addTask = (taskData: Partial<Task> & { title: string; projectId?: string }): Task => {
    const targetProject = projects.find(p => p.id === taskData.projectId);
    const newTask: Task = {
      id: `tsk-${Date.now()}`,
      title: taskData.title,
      description: taskData.description || '',
      projectId: taskData.projectId,
      assigneeId: taskData.assigneeId || currentUser.id,
      priority: taskData.priority || 'medium',
      status: taskData.status || 'backlog',
      startDate: taskData.startDate || new Date().toISOString().split('T')[0],
      deadline: taskData.deadline || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      estimatedHours: taskData.estimatedHours || 8,
      loggedHours: 0,
      tags: taskData.tags && taskData.tags.length > 0 ? taskData.tags : ['تسک'],
      subtasks: taskData.subtasks || [],
      comments: [],
      attachments: [],
      activityHistory: [
        {
          id: `act-${Date.now()}`,
          userId: currentUser.id,
          action: `تسک "${taskData.title}" را ایجاد کرد`,
          type: 'task_created',
          timestamp: new Date().toISOString()
        }
      ],
      dependencies: taskData.dependencies || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setTasks(prev => {
      const updated = [newTask, ...prev];
      // Update project progress
      if (taskData.projectId) {
        const newProgress = recalculateProjectProgress(taskData.projectId, updated);
        setProjects(projList =>
          projList.map(p => p.id === taskData.projectId ? { ...p, progress: newProgress } : p)
        );
      }
      return updated;
    });

    if (runtime.demoMode) return newTask;
    const createTask = (async () => {
      const pendingProject = newTask.projectId ? pendingProjectCreates.current.get(newTask.projectId) : undefined;
      const persistedProject = pendingProject ? await pendingProject : null;
      const payload = persistedProject ? { ...newTask, projectId: persistedProject.id } : newTask;
      const response = await tasksApi.create(payload);

      setTasks(prev => prev.map(task => task.id === newTask.id ? response.data : task));
      setSelectedTaskId(prev => prev === newTask.id ? response.data.id : prev);
      remapNotifLinks(newTask.id, response.data.id);
      pendingTaskCreates.current.delete(newTask.id);

      return response.data;
    })().catch(error => {
      pendingTaskCreates.current.delete(newTask.id);
      setTasks(prev => prev.filter(task => task.id !== newTask.id));
      console.error('Creating task on the backend failed.', error);
      throw error;
    });

    pendingTaskCreates.current.set(newTask.id, createTask);
    void createTask.catch(() => undefined);

    // Log Activity
    logActivity({
      userId: currentUser.id,
      action: `تسک جدید "${newTask.title}" را ایجاد کرد`,
      type: 'task_created',
      taskId: newTask.id,
      taskTitle: newTask.title,
      projectId: targetProject?.id,
      projectName: targetProject?.name,
      details: newTask.description || `با اولویت ${newTask.priority === 'urgent' ? 'فوری' : newTask.priority === 'high' ? 'بالا' : 'متوسط'}`
    });

    // Assignment notification is created atomically by the task API, with its persisted ID.
    return newTask;
  };

  const addTaskAsync = async (taskData: Partial<Task> & { title: string; projectId?: string }): Promise<Task> => {
    if (runtime.demoMode) return addTask(taskData);
    const session = snapshotSession();
    const response = await tasksApi.create({
      ...taskData, assigneeId:taskData.assigneeId || currentUser.id,
      status:taskData.status || 'backlog', priority:taskData.priority || 'medium',
    });
    if (snapshotSession() !== session) throw new Error('نشست کاری تغییر کرده است.');
    acceptTask(response);
    return response.data;
  };

  const updateTask = async (taskId: string, updates: Partial<Task>): Promise<boolean> => {
    if (runtime.demoMode) { setTasks(prev => prev.map(row => row.id === taskId ? {...row,...updates} : row)); return true; }
    return !!await confirmed.run(`tasks:${taskId}`, async () => {
      const saved = await pendingTaskCreates.current.get(taskId);
      return tasksApi.update(saved?.id || taskId, updates);
    }, acceptTask);
  };

  const deleteTask = async (taskId: string): Promise<boolean> => {
    if (runtime.demoMode) { setTasks(prev => prev.filter(row => row.id !== taskId)); return true; }
    const result = await confirmed.run(`tasks:${taskId}`, async () => { await tasksApi.remove(taskId); return true; }, () => {
      setTasks(prev => prev.filter(row => row.id !== taskId));
      if (selectedTaskId === taskId) setSelectedTaskId(null);
    });
    return !!result;
  };

  const moveTaskStatus = async (taskId: string, newStatus: TaskStatus): Promise<boolean> => {
    if (runtime.demoMode) return updateTask(taskId, {status:newStatus});
    return !!await confirmed.run(`tasks:${taskId}`, () => tasksApi.moveStatus(taskId, newStatus), response => {
      acceptTask(response);
      if (newStatus === 'completed') triggerCelebration();
    });
  };

  const changeSubtasks = async (taskId: string, change: (items: Task['subtasks']) => Task['subtasks']): Promise<boolean> => {
    if (runtime.demoMode) return updateTask(taskId, {subtasks: change(currentTask(taskId)?.subtasks || [])});
    return !!await confirmed.run(`tasks:${taskId}`, () => tasksApi.update(taskId, {subtasks:change(currentTask(taskId)?.subtasks || [])}), acceptTask);
  };
  const toggleSubtask = (taskId: string, subtaskId: string) => changeSubtasks(taskId, items => items.map(row => row.id === subtaskId ? {...row,completed:!row.completed} : row));
  const addSubtask = (taskId: string, title: string) => changeSubtasks(taskId, items => [...items,{id:crypto.randomUUID(),title:title.trim(),completed:false}]);
  const deleteSubtask = (taskId: string, subtaskId: string) => changeSubtasks(taskId, items => items.filter(row => row.id !== subtaskId));
  const addComment = async (taskId: string, text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    if (runtime.demoMode) return false;
    return !!await confirmed.run(`tasks:${taskId}`, () => request<{data:Task}>(`/tasks/${taskId}/comments`, {method:'POST',body:{text:text.trim()}}), acceptTask);
  };

  const addAttachment = (taskId: string, file: { name: string; size: string; type: string; url?: string }) => {
    const targetTask = tasks.find(t => t.id === taskId);
    const targetProj = projects.find(p => p.id === targetTask?.projectId);

    setTasks(prev => 
      prev.map(task => {
        if (task.id === taskId) {
          const newAtt = {
            id: `att-${Date.now()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            url: file.url || '#',
            uploadDate: new Date().toISOString().split('T')[0],
            uploadedBy: currentUser.id
          };
          return {
            ...task,
            attachments: [...task.attachments, newAtt],
            activityHistory: [
              {
                id: `act-${Date.now()}`,
                userId: currentUser.id,
                action: `فایل "${file.name}" را پیوست کرد`,
                type: 'attachment',
                timestamp: new Date().toISOString()
              },
              ...task.activityHistory
            ],
            updatedAt: new Date().toISOString()
          };
        }
        return task;
      })
    );

    logActivity({
      userId: currentUser.id,
      action: `فایل پیوست "${file.name}" را آپلود کرد`,
      type: 'attachment',
      taskId,
      taskTitle: targetTask?.title,
      projectId: targetProj?.id,
      projectName: targetProj?.name,
      details: `حجم فایل: ${file.size}`
    });
  };

  const deleteAttachment = async (taskId:string,attachmentId:string):Promise<boolean> => {
    if(runtime.demoMode){setTasks(rows=>rows.map(row=>row.id===taskId?{...row,attachments:row.attachments.filter(item=>item.id!==attachmentId)}:row));return true;}
    return !!await confirmed.run(`tasks:${taskId}`,()=>request<{data:Task}>(`/tasks/${taskId}/attachments/${attachmentId}`,{method:'DELETE'}),acceptTask);
  };

  // Project Operations
  const addProject = (projectData: Partial<Project> & { name: string }): Project => {
    const key = (projectData.key || projectData.name.substring(0, 4).toUpperCase()).replace(/[^A-Za-z0-9]/g, '');
    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: projectData.name,
      key: key || 'PROJ',
      description: projectData.description || '',
      projectManagerId: projectData.projectManagerId || currentUser.id,
      memberIds: projectData.memberIds && projectData.memberIds.length > 0 ? projectData.memberIds : [currentUser.id],
      startDate: projectData.startDate || new Date().toISOString().split('T')[0],
      deadline: projectData.deadline || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: projectData.status || 'planning',
      progress: 0,
      priority: (projectData.priority as Priority) || 'medium',
      tags: projectData.tags && projectData.tags.length > 0 ? projectData.tags : ['پروژه'],
      color: projectData.color || '#6366f1',
      budget: projectData.budget || '',
      category: projectData.category || 'توسعه محصول',
      createdAt: new Date().toISOString(),
      templateId: projectData.templateId
    };

    setProjects(prev => [newProject, ...prev]);

    if (runtime.demoMode) return newProject;
    const createProject = projectsApi.create(newProject)
      .then(response => {
        setProjects(prev => prev.map(project => project.id === newProject.id ? response.data : project));
        setTasks(prev => prev.map(task => task.projectId === newProject.id ? { ...task, projectId: response.data.id } : task));
        setSelectedProjectId(prev => prev === newProject.id ? response.data.id : prev);
        remapNotifLinks(newProject.id, response.data.id);
        pendingProjectCreates.current.delete(newProject.id);
        return response.data;
      })
      .catch(error => {
        pendingProjectCreates.current.delete(newProject.id);
        setProjects(prev => prev.filter(project => project.id !== newProject.id));
        console.error('Creating project on the backend failed.', error);
        throw error;
      });

    pendingProjectCreates.current.set(newProject.id, createProject);
    void createProject.catch(() => undefined);

    logActivity({
      userId: currentUser.id,
      action: `پروژه جدید "${newProject.name}" را ایجاد کرد`,
      type: 'project_created',
      projectId: newProject.id,
      projectName: newProject.name,
      details: newProject.description
    });

    return newProject;
  };

  const archiveItem = async (kind: 'task' | 'project' | 'content', id: string): Promise<boolean> => {
    if (kind === 'task') return moveTaskStatus(id, 'archived');
    if (kind === 'project') return updateProject(id, {status:'archived'});
    return updateContent(id, {status:'archived'});
  };
  const unarchiveItem = async (kind: 'task' | 'project' | 'content', id: string): Promise<boolean> => {
    if (runtime.demoMode) return false;
    const module = {task:'tasks',project:'projects',content:'contents'}[kind];
    return !!await confirmed.run(`${module}:${id}`, () => request<{data:any}>(`/${module}/${id}/restore`, {method:'POST'}), response => {
      rememberServerRecords(currentUser.id,module,[response.data]);
      if (kind === 'task') acceptTask(response); else if (kind === 'project') acceptProject(response); else acceptContent(response);
    });
  };
  const updateProject = async (projectId: string, updates: Partial<Project>): Promise<boolean> => {
    if (runtime.demoMode) { setProjects(prev => prev.map(row => row.id === projectId ? {...row,...updates} : row)); return true; }
    return !!await confirmed.run(`projects:${projectId}`, () => projectsApi.update(projectId, updates), acceptProject);
  };

  const deleteProject = async (projectId: string): Promise<boolean> => {
    if (runtime.demoMode) { setProjects(prev=>prev.filter(row=>row.id!==projectId)); return true; }
    return !!await confirmed.run(`projects:${projectId}`, async()=>{await projectsApi.remove(projectId);return true;}, ()=>{
      setProjects(prev=>prev.filter(row=>row.id!==projectId));
      if (selectedProjectId === projectId) { setSelectedProjectId(null); setActiveView('projects'); }
    });
  };

  // Template Operations
  const addTemplate = async (templateData: Partial<ProjectTemplate> & { name: string }): Promise<ProjectTemplate | null> => {
    const newTemplate: ProjectTemplate = {
      id: `tpl-${Date.now()}`,
      name: templateData.name,
      description: templateData.description || '',
      category: templateData.category || 'عمومی',
      icon: templateData.icon || 'Layers',
      color: templateData.color || '#6366f1',
      defaultPriority: templateData.defaultPriority || 'medium',
      estimatedDurationDays: templateData.estimatedDurationDays || 14,
      budget: templateData.budget || '',
      stages: templateData.stages || [
        { id: 'backlog', name: 'بک‌لاگ', color: '#94a3b8' },
        { id: 'todo', name: 'برای انجام', color: '#64748b' },
        { id: 'in_progress', name: 'در حال انجام', color: '#3b82f6' },
        { id: 'review', name: 'بازبینی', color: '#8b5cf6' },
        { id: 'completed', name: 'تکمیل شده', color: '#10b981' }
      ],
      tasks: templateData.tasks || [],
      tags: templateData.tags || ['الگو'],
      isBuiltIn: false,
      createdAt: new Date().toISOString()
    };

    if (runtime.demoMode) {setTemplates(prev=>[newTemplate,...prev]);return newTemplate;}
    const response=await confirmed.run('templates:create',()=>projectTemplatesApi.create(newTemplate),result=>setTemplates(prev=>[result.data,...prev]));
    return response?.data || null;
  };

  const updateTemplate = async (templateId:string,updates:Partial<ProjectTemplate>):Promise<boolean> => {
    if(runtime.demoMode){setTemplates(prev=>prev.map(row=>row.id===templateId?{...row,...updates}:row));return true;}
    return !!await confirmed.run(`templates:${templateId}`,()=>projectTemplatesApi.update(templateId,updates),result=>setTemplates(prev=>prev.map(row=>row.id===templateId?result.data:row)));
  };
  const deleteTemplate = async (templateId:string):Promise<boolean> => {
    if(runtime.demoMode){setTemplates(prev=>prev.filter(row=>row.id!==templateId));return true;}
    return !!await confirmed.run(`templates:${templateId}`,async()=>{await projectTemplatesApi.remove(templateId);return true;},()=>setTemplates(prev=>prev.filter(row=>row.id!==templateId)));
  };

  const applyTemplate = async (
    templateId: string, 
    customOptions?: { projectName?: string; projectKey?: string; projectManagerId?: string; startDate?: string; description?: string; memberIds?: string[]; deadline?: string; color?: string }
  ): Promise<Project> => {
    const template = templates.find(t => t.id === templateId);
    if (!template) throw new Error('الگو یافت نشد.');
    if (!runtime.demoMode) {
      const start = customOptions?.startDate || new Date().toISOString().slice(0,10);
      const response = await projectsApi.create({
        name: customOptions?.projectName || template.name, key:customOptions?.projectKey || 'PROJ',
        description:customOptions?.description ?? template.description, templateId,
        projectManagerId:customOptions?.projectManagerId || currentUser.id,
        memberIds:customOptions?.memberIds || [customOptions?.projectManagerId || currentUser.id],
        startDate:start, deadline:customOptions?.deadline || new Date(new Date(start).getTime() + (template.estimatedDurationDays || 14)*86400000).toISOString().slice(0,10),
        color:customOptions?.color || template.color, category:template.category, tags:template.tags, priority:template.defaultPriority,
      });
      acceptProject(response);
      await queryClient.invalidateQueries({queryKey:['pages',currentUser.id,'tasks']});
      notify({type:'success',title:'پروژه و وظایف الگو با هم در سرور ثبت شدند.'});
      return response.data;
    }
    const startDateStr = customOptions?.startDate || new Date().toISOString().split('T')[0];
    const durationDays = template.estimatedDurationDays || 14;
    const deadlineStr = new Date(new Date(startDateStr).getTime() + durationDays * 86400000).toISOString().split('T')[0];
    const managerId = customOptions?.projectManagerId || currentUser.id;

    // Create the project
    const newProj = addProject({
      name: customOptions?.projectName || template.name,
      key: customOptions?.projectKey || template.name.substring(0, 4).toUpperCase().replace(/[^A-Za-z0-9]/g, '') || 'TPL',
      description: template.description,
      category: template.category,
      color: template.color,
      priority: template.defaultPriority,
      startDate: startDateStr,
      deadline: deadlineStr,
      budget: template.budget,
      tags: template.tags,
      projectManagerId: managerId,
      memberIds: [managerId, 'usr-3', 'usr-4', 'usr-5', 'usr-6'].filter((v, i, a) => a.indexOf(v) === i),
      templateId: template.id
    });

    // Create all predefined tasks from template
    const createdTasks: Task[] = template.tasks.map((tt, idx) => {
      const taskDeadline = new Date(new Date(startDateStr).getTime() + (tt.relativeDueDays || (idx + 1) * 2) * 86400000).toISOString().split('T')[0];
      
      // Auto assign to team members based on suggested role or round-robin
      let assignee = managerId;
      if (tt.suggestedRole) {
        const matchingUser = users.find(u => u.role === tt.suggestedRole);
        if (matchingUser) assignee = matchingUser.id;
      } else {
        const assigneesPool = users.filter(u => u.id !== managerId);
        assignee = assigneesPool[idx % assigneesPool.length]?.id || managerId;
      }

      return {
        id: `tsk-${Date.now()}-${idx}`,
        title: tt.title,
        description: tt.description,
        projectId: newProj.id,
        assigneeId: assignee,
        priority: tt.priority,
        status: tt.status || 'todo',
        startDate: startDateStr,
        deadline: taskDeadline,
        estimatedHours: tt.estimatedHours || 8,
        loggedHours: 0,
        tags: tt.tags || ['الگو'],
        subtasks: (tt.subtasks || []).map((sub, sIdx) => ({
          id: `sub-${Date.now()}-${idx}-${sIdx}`,
          title: sub,
          completed: false
        })),
        comments: [],
        attachments: [],
        activityHistory: [
          {
            id: `act-${Date.now()}-${idx}`,
            userId: currentUser.id,
            action: `از روی الگوی "${template.name}" ایجاد شد`,
            type: 'template_applied',
            timestamp: new Date().toISOString()
          }
        ],
        dependencies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    setTasks(prev => [...createdTasks, ...prev]);

    logActivity({
      userId: currentUser.id,
      action: `الگوی "${template.name}" را روی پروژه "${newProj.name}" اعمال کرد`,
      type: 'template_applied',
      projectId: newProj.id,
      projectName: newProj.name,
      details: `${createdTasks.length} تسک زمان‌بندی‌شده و چک‌لیست‌های مربوطه به طور خودکار تولید شدند.`
    });

    triggerCelebration();

    return newProj;
  };

  const saveProjectAsTemplate = async (projectId: string, templateName: string, description?: string): Promise<ProjectTemplate | null> => {
    const proj = projects.find(p => p.id === projectId);
    const projTasks = tasks.filter(t => t.projectId === projectId);

    const templateTasks = projTasks.map((t, idx) => {
      const startMs = new Date(proj?.startDate || new Date()).getTime();
      const dueMs = new Date(t.deadline).getTime();
      const relativeDays = Math.max(1, Math.round((dueMs - startMs) / 86400000));

      return {
        id: `tt-${Date.now()}-${idx}`,
        title: t.title,
        description: t.description,
        relativeDueDays: relativeDays,
        estimatedHours: t.estimatedHours,
        priority: t.priority,
        status: 'todo' as TaskStatus,
        tags: t.tags,
        subtasks: t.subtasks.map(s => s.title)
      };
    });

    const newTemplate = addTemplate({
      name: templateName,
      description: description || proj?.description || `الگوی مشتق شده از پروژه ${proj?.name}`,
      category: proj?.category || 'سفارشی',
      color: proj?.color || '#6366f1',
      defaultPriority: proj?.priority || 'medium',
      estimatedDurationDays: 30,
      budget: proj?.budget,
      tasks: templateTasks,
      tags: proj?.tags || ['الگو']
    });

    return newTemplate;
  };

  const inviteMember = (memberData: Omit<User, 'id' | 'activeProjectsCount' | 'completedTasksCount' | 'workloadPercentage'>): User => {
    const newMember: User = {
      ...memberData,
      id: `usr-${Date.now()}`,
      activeProjectsCount: 1,
      completedTasksCount: 0,
      workloadPercentage: 30
    };
    setUsers(prev => [...prev, newMember]);

    logActivity({
      userId: currentUser.id,
      action: `عضو جدید "${newMember.name}" را به سازمان دعوت کرد`,
      type: 'member_assigned',
      details: `عنوان: ${newMember.title} • واحد: ${newMember.department}`
    });

    return newMember;
  };

  // Notification Operations
  const markNotificationAsRead = async (id: string) => {
    try {
      const response = await notificationsApi.update(id, { read: true });
      setNotifications(prev => prev.map(n => n.id === id ? response.data : n));
      await queryClient.invalidateQueries({ queryKey: ['pages', currentUser.id, 'notifications'] });
    } catch (error) { notifyApiError('notification-read', error, 'خواندن اعلان ثبت نشد'); }
  };
  const markAllNotificationsAsRead = async () => {
    try {
      await notificationsApi.readAll();
      await queryClient.invalidateQueries({ queryKey: ['pages', currentUser.id, 'notifications'] });
    } catch (error) { notifyApiError('notification-read-all', error, 'خواندن اعلان‌ها ثبت نشد'); }
  };

  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (/^\d+$/.test(id)) void notificationsApi.remove(id).catch(error => console.error('Deleting notification failed.', error));
  };

  /** به‌روزرسانی لینک‌های اعلان پس از جایگزینی شناسه موقت با شناسه سرور. */
  const remapNotifLinks = (oldId: string, newId: string) => {
    if (!oldId || !newId || oldId === newId) return;
    setNotifications(prev => prev.map(n => ({
      ...n,
      linkTaskId: n.linkTaskId === oldId ? newId : n.linkTaskId,
      linkProjectId: n.linkProjectId === oldId ? newId : n.linkProjectId,
    })));
  };

  const sendNotification = (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...notification,
      id: `notif-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
    // Resolve temporary IDs before persisting a resource-scoped notification.
    const taskPending = newNotif.linkTaskId ? pendingTaskCreates.current.get(newNotif.linkTaskId) : undefined;
    const projectPending = newNotif.linkProjectId ? pendingProjectCreates.current.get(newNotif.linkProjectId) : undefined;
    void (async () => {
      const [savedTask, savedProject] = await Promise.all([taskPending, projectPending]);
      const payload = {
        ...newNotif,
        ...(savedTask ? { linkTaskId: savedTask.id, ...(newNotif.linkProjectId ? { linkProjectId: savedTask.projectId } : {}) } : {}),
        ...(savedProject ? { linkProjectId: savedProject.id } : {}),
      };
      const response = await notificationsApi.create(payload);
      setNotifications(prev => prev.map(item => item.id === newNotif.id ? response.data : item));
    })().catch(error => {
      setNotifications(prev => prev.filter(item => item.id !== newNotif.id));
      notify({ type: 'error', title: 'اعلان ثبت نشد', message: 'گیرنده، دسترسی و ذخیره‌شدن رکورد مرتبط را بررسی کنید.' });
      console.error('Creating notification failed.', error);
    });
  };

  // ==========================================
  // Digital Asset Management (DAM) Operations
  // ==========================================

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '۰ بایت';
    const k = 1024;
    const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    const persianDigits = val.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);
    return `${persianDigits} ${sizes[i]}`;
  };

  const getCategoryFromExt = (ext: string): AssetCategory => {
    const lower = ext.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp', 'ico', 'tiff'].includes(lower)) return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(lower)) return 'video';
    if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(lower)) return 'audio';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'].includes(lower)) return 'document';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(lower)) return 'archive';
    return 'other';
  };

  const uploadAsset = (assetData: Partial<DigitalAsset> & { title: string; fileName: string; size: number }): DigitalAsset => {
    const ext = assetData.fileName.split('.').pop()?.toLowerCase() || 'other';
    const category = assetData.category || getCategoryFromExt(ext);
    const sizeFormatted = assetData.sizeFormatted || formatBytes(assetData.size);
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());

    const newAsset: DigitalAsset = {
      id: `ast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: assetData.title,
      fileName: assetData.fileName,
      extension: ext,
      category,
      mimeType: assetData.mimeType || `${category}/${ext}`,
      size: assetData.size,
      sizeFormatted,
      url: assetData.url || '#',
      thumbnailUrl: assetData.thumbnailUrl || (category === 'image' ? assetData.url : undefined),
      folderId: assetData.folderId !== undefined ? assetData.folderId : currentFolderId,
      projectId: assetData.projectId,
      taskId: assetData.taskId,
      tags: assetData.tags || ['General'],
      createdBy: currentUser.id,
      createdAt: dateStr,
      updatedAt: dateStr,
      isFavorite: false,
      isTrash: false,
      permissionLevel: assetData.permissionLevel || 'organization',
      sharedWith: assetData.sharedWith || [],
      currentVersion: 1,
      versions: [
        {
          id: `ver-${Date.now()}-1`,
          versionNumber: 1,
          fileName: assetData.fileName,
          size: assetData.size,
          sizeFormatted,
          url: assetData.url || '#',
          thumbnailUrl: assetData.thumbnailUrl,
          uploadedBy: currentUser.id,
          uploadedAt: dateStr,
          changelog: 'بارگذاری نسخه اولیه فایل در سامانه تدبیر.',
          downloadCount: 0
        }
      ],
      comments: [],
      activities: [
        {
          id: `act-${Date.now()}`,
          userId: currentUser.id,
          action: 'فایل را بارگذاری و ثبت کرد',
          timestamp: dateStr,
          details: `حجم: ${sizeFormatted} • فرمت: ${ext.toUpperCase()}`
        }
      ],
      dimensions: assetData.dimensions,
      duration: assetData.duration,
      downloadCount: 0,
      description: assetData.description || ''
    };

    setAssets(prev => [newAsset, ...prev]);

    void damApi.assets.create(newAsset).then(response => {
      setAssets(prev => prev.map(item => item.id === newAsset.id ? response.data : item));
    }).catch(error => {
      setAssets(prev => prev.filter(item => item.id !== newAsset.id));
      console.error('Creating asset failed.', error);
    });

    if (newAsset.folderId) {
      setFolders(prev => prev.map(f => f.id === newAsset.folderId ? { ...f, itemCount: (f.itemCount || 0) + 1 } : f));
    }

    sendNotification({
      userId: currentUser.id,
      title: 'بارگذاری دارایی جدید',
      message: `فایل "${newAsset.title}" با موفقیت به دارایی‌های دیجیتال اضافه شد.`,
      type: 'system',
      linkProjectId: newAsset.projectId,
      linkTaskId: newAsset.taskId
    });

    logActivity({
      userId: currentUser.id,
      action: `فایل "${newAsset.title}" را به دارایی‌های دیجیتال افزود`,
      type: 'attachment',
      projectId: newAsset.projectId,
      taskId: newAsset.taskId
    });

    return newAsset;
  };

  const uploadNewVersion = (assetId: string, versionData: { fileName: string; size: number; url?: string; changelog: string }) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const sizeFormatted = formatBytes(versionData.size);

    setAssets(prev => prev.map(asset => {
      if (asset.id !== assetId) return asset;
      const nextVersionNumber = (asset.currentVersion || 1) + 1;
      const newVersion: AssetVersion = {
        id: `ver-${Date.now()}-${nextVersionNumber}`,
        versionNumber: nextVersionNumber,
        fileName: versionData.fileName,
        size: versionData.size,
        sizeFormatted,
        url: versionData.url || asset.url,
        uploadedBy: currentUser.id,
        uploadedAt: dateStr,
        changelog: versionData.changelog || `به‌روزرسانی نسخه ${nextVersionNumber}`,
        downloadCount: 0
      };

      const newActivity: AssetActivity = {
        id: `act-${Date.now()}`,
        userId: currentUser.id,
        action: `نسخه ${nextVersionNumber} فایل را بارگذاری کرد`,
        timestamp: dateStr,
        details: versionData.changelog
      };

      return {
        ...asset,
        fileName: versionData.fileName,
        size: versionData.size,
        sizeFormatted,
        url: versionData.url || asset.url,
        currentVersion: nextVersionNumber,
        updatedAt: dateStr,
        versions: [newVersion, ...asset.versions],
        activities: [newActivity, ...asset.activities]
      };
    }));

    sendNotification({
      userId: currentUser.id,
      title: 'نسخه جدید دارایی',
      message: `نسخه جدیدی برای فایل "${versionData.fileName}" بارگذاری شد.`,
      type: 'system'
    });
  };

  const deleteAssetVersion = (assetId: string, versionId: string) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    setAssets(prev => prev.map(asset => {
      if (asset.id !== assetId) return asset;
      const targetVersion = asset.versions.find(v => v.id === versionId);
      if (!targetVersion) return asset;
      if (asset.versions.length <= 1) {
        return asset; // cannot delete only remaining version
      }
      const remainingVersions = asset.versions.filter(v => v.id !== versionId);
      remainingVersions.sort((a, b) => b.versionNumber - a.versionNumber);
      const topVersion = remainingVersions[0];

      const newActivity: AssetActivity = {
        id: `act-${Date.now()}`,
        userId: currentUser.id,
        action: `نسخه ${targetVersion.versionNumber} فایل را از سیستم حذف کرد`,
        timestamp: dateStr,
        details: `نسخه ${targetVersion.versionNumber} (${targetVersion.fileName}) حذف شد.`
      };

      return {
        ...asset,
        currentVersion: topVersion.versionNumber,
        fileName: topVersion.fileName,
        size: topVersion.size,
        sizeFormatted: topVersion.sizeFormatted,
        url: topVersion.url || asset.url,
        updatedAt: dateStr,
        versions: remainingVersions,
        activities: [newActivity, ...asset.activities]
      };
    }));

    sendNotification({
      userId: currentUser.id,
      title: 'حذف نسخه فایل',
      message: 'نسخه مورد نظر از سیستم حذف شد.',
      type: 'system'
    });
  };

  const revertToAssetVersion = (assetId: string, versionId: string) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    setAssets(prev => prev.map(asset => {
      if (asset.id !== assetId) return asset;
      const targetVersion = asset.versions.find(v => v.id === versionId);
      if (!targetVersion) return asset;

      const newActivity: AssetActivity = {
        id: `act-${Date.now()}`,
        userId: currentUser.id,
        action: `فایل را به نسخه ${targetVersion.versionNumber} بازگردانی کرد`,
        timestamp: dateStr,
        details: `نسخه فعال به v${targetVersion.versionNumber} (${targetVersion.fileName}) تغییر یافت.`
      };

      return {
        ...asset,
        currentVersion: targetVersion.versionNumber,
        fileName: targetVersion.fileName,
        size: targetVersion.size,
        sizeFormatted: targetVersion.sizeFormatted,
        url: targetVersion.url || asset.url,
        updatedAt: dateStr,
        activities: [newActivity, ...asset.activities]
      };
    }));

    sendNotification({
      userId: currentUser.id,
      title: 'بازگردانی نسخه فایل',
      message: 'فایل به نسخه انتخابی بازگردانی شد.',
      type: 'system'
    });
  };

  const updateAsset = (assetId: string, updates: Partial<DigitalAsset>) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    setAssets(prev => prev.map(asset => {
      if (asset.id !== assetId) return asset;
      return {
        ...asset,
        ...updates,
        updatedAt: dateStr
      };
    }));
  };

  const deleteAsset = (assetId: string, permanent: boolean = false) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    if (permanent) {
      setAssets(prev => prev.filter(a => a.id !== assetId));
    } else {
      setAssets(prev => prev.map(a => {
        if (a.id !== assetId) return a;
        return {
          ...a,
          isTrash: true,
          deletedAt: dateStr
        };
      }));
    }
  };

  const restoreAsset = (assetId: string) => {
    setAssets(prev => prev.map(a => {
      if (a.id !== assetId) return a;
      return {
        ...a,
        isTrash: false,
        deletedAt: undefined
      };
    }));
  };

  const emptyTrash = () => {
    setAssets(prev => prev.filter(a => !a.isTrash));
  };

  const toggleAssetFavorite = (assetId: string) => {
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isFavorite: !a.isFavorite } : a));
  };

  const addAssetComment = (assetId: string, text: string) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const newComment: AssetComment = {
      id: `comm-${Date.now()}`,
      userId: currentUser.id,
      text,
      createdAt: dateStr
    };
    setAssets(prev => prev.map(a => {
      if (a.id !== assetId) return a;
      return {
        ...a,
        comments: [...a.comments, newComment]
      };
    }));
  };

  const shareAsset = (
    assetId: string, 
    shareData: { targetId: string; targetType: 'user' | 'team'; access: AssetAccessRight; targetName?: string }, 
    permissionLevel?: AssetPermissionLevel
  ) => {
    setAssets(prev => prev.map(a => {
      if (a.id !== assetId) return a;
      const existing = a.sharedWith.filter(s => !(s.targetId === shareData.targetId && s.targetType === shareData.targetType));
      return {
        ...a,
        permissionLevel: permissionLevel || a.permissionLevel,
        sharedWith: [...existing, shareData]
      };
    }));
  };

  const removeAssetShare = (assetId: string, targetId: string) => {
    setAssets(prev => prev.map(a => {
      if (a.id !== assetId) return a;
      return {
        ...a,
        sharedWith: a.sharedWith.filter(s => s.targetId !== targetId)
      };
    }));
  };

  const hasAssetAccess = (
    asset: DigitalAsset, 
    action: 'view' | 'preview' | 'download' | 'upload' | 'edit_info' | 'rename' | 'move' | 'create_version' | 'delete' | 'restore' | 'share' | 'manage_access'
  ): boolean => {
    // 1. Super Admin has full unrestricted access
    if (currentUser.role === 'admin') return true;

    // 2. Check general system permission required for this action
    const actionToPermMap: Record<string, string> = {
      view: 'assets.view',
      preview: 'assets.preview',
      download: 'assets.download',
      upload: 'assets.upload',
      edit_info: 'assets.edit_info',
      rename: 'assets.rename',
      move: 'assets.move',
      create_version: 'assets.create_version',
      delete: 'assets.delete',
      restore: 'assets.restore',
      share: 'assets.share',
      manage_access: 'assets.manage_access',
    };

    const requiredPerm = actionToPermMap[action];
    if (requiredPerm && !hasPermission(requiredPerm)) {
      return false;
    }

    // 3. Creator of the asset has full access
    if (asset.createdBy === currentUser.id) {
      return true;
    }

    // 4. Fine-grained Access Control List (sharedWith)
    const userDepartmentIds = departments.filter(d => d.status === 'active' && d.members.some(m => m.userId === currentUser.id)).map(t => t.id);
    const matchedShares = (asset.sharedWith || []).filter(sw => 
      (sw.targetType === 'user' && sw.targetId === currentUser.id) ||
      (sw.targetType === 'department' && userDepartmentIds.includes(sw.targetId))
    );

    if (matchedShares.length > 0) {
      const rights = matchedShares.map(s => s.access);
      const hasAdmin = rights.includes('manage') || rights.includes('admin');
      const hasEdit = hasAdmin || rights.includes('edit');
      const hasDownload = hasEdit || rights.includes('view_and_download') || rights.includes('view') || rights.includes('comment');
      const hasView = hasDownload || rights.includes('view_only');

      if (action === 'delete' || action === 'restore' || action === 'manage_access' || action === 'share') {
        return hasAdmin;
      }
      if (action === 'edit_info' || action === 'rename' || action === 'move' || action === 'create_version') {
        return hasEdit;
      }
      if (action === 'download') {
        return hasDownload;
      }
      if (action === 'view' || action === 'preview') {
        return hasView;
      }
    }

    // 5. Organization level check
    if (asset.permissionLevel === 'organization') {
      if (['view', 'preview', 'download'].includes(action)) return true;
    }

    // 6. Project level check
    if (asset.permissionLevel === 'project' && asset.projectId) {
      const project = projects.find(p => p.id === asset.projectId);
      if (project) {
        if (project.projectManagerId === currentUser.id) return true;
        if (project.memberIds.includes(currentUser.id) && ['view', 'preview', 'download'].includes(action)) return true;
      }
    }

    // 7. Explicit department scope
    if (asset.permissionLevel === 'department') {
      const userDepartments = departments.filter(d => d.status === 'active' && d.members.some(m => m.userId === currentUser.id));
      if (userDepartments.some(d => d.id === asset.departmentId) && ['view', 'preview', 'download'].includes(action)) return true;
    }

    return false;
  };

  const batchDeleteAssets = (assetIds: string[], permanent: boolean = false) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    if (permanent) {
      setAssets(prev => prev.filter(a => !assetIds.includes(a.id)));
    } else {
      setAssets(prev => prev.map(a => {
        if (!assetIds.includes(a.id)) return a;
        return { ...a, isTrash: true, deletedAt: dateStr };
      }));
    }
  };

  const batchRestoreAssets = (assetIds: string[]) => {
    setAssets(prev => prev.map(a => {
      if (!assetIds.includes(a.id)) return a;
      return { ...a, isTrash: false, deletedAt: undefined };
    }));
  };

  const batchMoveAssets = (assetIds: string[], targetFolderId: string | null) => {
    setAssets(prev => prev.map(a => {
      if (!assetIds.includes(a.id)) return a;
      return { ...a, folderId: targetFolderId };
    }));
  };

  const downloadAsset = (asset: DigitalAsset) => {
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, downloadCount: (a.downloadCount || 0) + 1 } : a));
    
    try {
      const link = document.createElement('a');
      link.href = asset.url !== '#' ? asset.url : 'data:text/plain;charset=utf-8,' + encodeURIComponent(`Tadbir DAM Asset: ${asset.title}\nFile: ${asset.fileName}\nVersion: ${asset.currentVersion}\nSize: ${asset.sizeFormatted}`);
      link.download = asset.fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // fallback
    }

    sendNotification({
      userId: currentUser.id,
      title: 'دانلود فایل',
      message: `دانلود فایل "${asset.fileName}" آغاز شد.`,
      type: 'system'
    });
  };

  const createFolder = (folderData: Partial<AssetFolder> & { name: string }): AssetFolder => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    const newFolder: AssetFolder = {
      id: `fld-${Date.now()}`,
      name: folderData.name,
      parentId: folderData.parentId !== undefined ? folderData.parentId : currentFolderId,
      color: folderData.color || '#6366f1',
      createdBy: currentUser.id,
      createdAt: dateStr,
      projectId: folderData.projectId,
      departmentId: folderData.departmentId,
      itemCount: 0,
      isFavorite: false,
      sharedWith: folderData.sharedWith || []
    };
    setFolders(prev => [newFolder, ...prev]);
    void damApi.folders.create(newFolder).then(response => {
      setFolders(prev => prev.map(item => item.id === newFolder.id ? response.data : item));
    }).catch(error => {
      setFolders(prev => prev.filter(item => item.id !== newFolder.id));
      console.error('Creating folder failed.', error);
    });
    return newFolder;
  };

  const updateFolder = (folderId: string, updates: Partial<AssetFolder>) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, ...updates } : f));
  };

  const deleteFolder = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    const parentId = folder ? folder.parentId : null;
    setAssets(prev => prev.map(a => a.folderId === folderId ? { ...a, folderId: parentId } : a));
    setFolders(prev => prev.filter(f => f.id !== folderId));
    if (/^\d+$/.test(folderId)) void damApi.folders.remove(folderId).catch(error => console.error('Deleting folder failed.', error));
  };

  const toggleFolderFavorite = (folderId: string) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isFavorite: !f.isFavorite } : f));
  };

  // Messaging & Chat Operations
  const sendMessage = (data: {
    conversationId: string;
    text: string;
    replyToMessageId?: string;
    attachments?: ChatAttachment[];
    taskRef?: TaskReference;
    projectRef?: ProjectReference;
  }) => {
    const date = new Date();
    const timeStr = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(date);
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    
    let replyToMsgObj = undefined;
    if (data.replyToMessageId) {
      const parent = messages.find(m => m.id === data.replyToMessageId);
      if (parent) {
        const sender = users.find(u => u.id === parent.senderId);
        replyToMsgObj = {
          id: parent.id,
          senderName: sender ? sender.name : 'کاربر',
          text: parent.text ? parent.text.slice(0, 80) : 'پیوست'
        };
      }
    }

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      conversationId: data.conversationId,
      senderId: currentUser.id,
      text: data.text,
      timestamp: timeStr,
      createdAt: date.toISOString(),
      deliveryStatus: 'sent',
      replyToMessageId: data.replyToMessageId,
      replyToMessage: replyToMsgObj,
      attachments: data.attachments,
      taskRef: data.taskRef,
      projectRef: data.projectRef,
      reactions: []
    };

    setMessages(prev => [...prev, newMsg]);

    const previewText = data.text 
      ? (currentUser.role === 'admin' ? `${currentUser.name}: ${data.text}` : data.text)
      : data.attachments && data.attachments.length > 0 
      ? `[پیوست ${data.attachments[0].name}]`
      : data.taskRef
      ? `[ارجاع به تسک ${data.taskRef.title}]`
      : data.projectRef
      ? `[ارجاع به پروژه ${data.projectRef.name}]`
      : 'پیام جدید';

    setConversations(prev => prev.map(conv => {
      if (conv.id !== data.conversationId) return conv;
      return {
        ...conv,
        unreadCount: (conv.unreadCount || 0) + 1,
        lastMessage: {
          text: previewText,
          timestamp: timeStr,
          senderId: currentUser.id,
          senderName: currentUser.name
        },
        updatedAt: dateStr
      };
    }));

    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, deliveryStatus: 'delivered' } : m));
    }, 600);
    setTimeout(() => {
      setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...m, deliveryStatus: 'read' } : m));
    }, 1500);

    return newMsg;
  };

  const editMessage = (messageId: string, newText: string) => {
    const timeStr = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      return {
        ...m,
        text: newText,
        isEdited: true,
        editedAt: timeStr
      };
    }));
  };

  const deleteMessage = (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
    if (/^\d+$/.test(messageId)) void chatApi.messages.remove(messageId).catch(error => console.error('Deleting message failed.', error));
  };

  const togglePinMessage = (messageId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const willPin = !m.isPinned;
      return { ...m, isPinned: willPin };
    }));

    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      setConversations(prev => prev.map(c => {
        if (c.id !== msg.conversationId) return c;
        const currentPins = c.pinnedMessageIds || [];
        const isPinned = currentPins.includes(messageId);
        const newPins = isPinned 
          ? currentPins.filter(id => id !== messageId)
          : [...currentPins, messageId];
        return { ...c, pinnedMessageIds: newPins };
      }));
    }
  };

  const toggleStarMessage = (messageId: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      return { ...m, isStarred: !m.isStarred };
    }));
  };

  const toggleMessageReaction = (messageId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions ? [...m.reactions] : [];
      const existingReactionIndex = reactions.findIndex(r => r.emoji === emoji);

      if (existingReactionIndex >= 0) {
        const existing = reactions[existingReactionIndex];
        const userHasReacted = existing.userIds.includes(currentUser.id);
        if (userHasReacted) {
          const updatedUserIds = existing.userIds.filter(uid => uid !== currentUser.id);
          if (updatedUserIds.length === 0) {
            reactions.splice(existingReactionIndex, 1);
          } else {
            reactions[existingReactionIndex] = {
              ...existing,
              count: updatedUserIds.length,
              userIds: updatedUserIds
            };
          }
        } else {
          reactions[existingReactionIndex] = {
            ...existing,
            count: existing.count + 1,
            userIds: [...existing.userIds, currentUser.id]
          };
        }
      } else {
        reactions.push({
          emoji,
          count: 1,
          userIds: [currentUser.id]
        });
      }

      return {
        ...m,
        reactions
      };
    }));
  };

  const createConversation = (data: Partial<Conversation> & { name: string; type: ChatType; memberIds: string[] }) => {
    // Prevent duplicate direct chats between same users
    if (data.type === 'direct') {
      const otherUserId = data.memberIds.find(id => id !== currentUser.id) || data.memberIds[0];
      if (otherUserId) {
        const existingDirect = conversations.find(
          c => c.type === 'direct' && c.memberIds.includes(currentUser.id) && c.memberIds.includes(otherUserId)
        );
        if (existingDirect) {
          setActiveConversationId(existingDirect.id);
          setActiveView('messages');
          return existingDirect;
        }
      }
    }

    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    const memberObjects: ConversationMember[] = data.memberIds.map(uid => ({
      userId: uid,
      role: uid === currentUser.id ? 'owner' : 'member',
      joinedAt: dateStr
    }));
    if (!data.memberIds.includes(currentUser.id)) {
      memberObjects.push({
        userId: currentUser.id,
        role: 'owner',
        joinedAt: dateStr
      });
      data.memberIds.push(currentUser.id);
    }

    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      type: data.type,
      name: data.name,
      avatar: data.avatar,
      color: data.color || '#6366f1',
      description: data.description || '',
      projectId: data.projectId,
      departmentId: data.departmentId,
      writePermission: data.writePermission || (data.type === 'channel' ? 'admins_only' : 'all'),
      deletePermission: data.deletePermission || 'authors_and_admins',
      members: memberObjects,
      memberIds: data.memberIds,
      unreadCount: 0,
      isMuted: false,
      pinnedMessageIds: [],
      createdAt: dateStr,
      updatedAt: 'همین الان'
    };

    setConversations(prev => [newConv, ...prev]);
    void chatApi.conversations.create(newConv).then(response => {
      setConversations(prev => prev.map(c => c.id === newConv.id ? response.data : c));
    }).catch(error => {
      setConversations(prev => prev.filter(c => c.id !== newConv.id));
      console.error('Creating conversation failed.', error);
    });
    setActiveConversationId(newConv.id);
    setActiveView('messages');
    return newConv;
  };

  const updateConversation = (convId: string, updates: Partial<Conversation>) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, ...updates } : c));
  };

  const updateConversationPermissions = (
    convId: string,
    writePermission: ChatWritePermission,
    deletePermission: ChatDeletePermission
  ) => {
    setConversations(prev =>
      prev.map(c =>
        c.id === convId
          ? {
              ...c,
              writePermission,
              deletePermission
            }
          : c
      )
    );
  };

  const addConversationMembers = (convId: string, newMemberIds: string[]) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      const existingIds = new Set(c.memberIds);
      const toAdd = newMemberIds.filter(id => !existingIds.has(id));
      const newMemberObjs: ConversationMember[] = toAdd.map(id => ({
        userId: id,
        role: 'member',
        joinedAt: dateStr
      }));
      return {
        ...c,
        memberIds: [...c.memberIds, ...toAdd],
        members: [...c.members, ...newMemberObjs]
      };
    }));
  };

  const removeConversationMember = (convId: string, userId: string) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      return {
        ...c,
        memberIds: c.memberIds.filter(id => id !== userId),
        members: c.members.filter(m => m.userId !== userId)
      };
    }));
  };

  const updateMemberRole = (convId: string, userId: string, role: ConversationRole) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== convId) return c;
      return {
        ...c,
        members: c.members.map(m => m.userId === userId ? { ...m, role } : m)
      };
    }));
  };

  const toggleMuteConversation = (convId: string) => {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, isMuted: !c.isMuted } : c));
  };

  const markConversationAsRead = (id: string) => {
    setConversations(prev => prev.map(conv => conv.id === id ? { ...conv, unreadCount: 0 } : conv));
  };

  const markConversationAsUnread = (id: string) => {
    setConversations(prev => prev.map(conv => conv.id === id ? { ...conv, unreadCount: (conv.unreadCount || 0) + 1 } : conv));
  };

  

  const startDirectChatWithUser = (targetUserId: string): string => {
    const existing = conversations.find(
      c => c.type === 'direct' && c.memberIds.includes(currentUser.id) && c.memberIds.includes(targetUserId)
    );
    if (existing) {
      setActiveConversationId(existing.id);
      return existing.id;
    }
    
    const targetUser = users.find(u => u.id === targetUserId);
    const date = new Date();
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(date);
    
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      type: 'direct',
      name: targetUser?.name || 'گفتگوی مستقیم',
      memberIds: [currentUser.id, targetUserId],
      members: [
        { userId: currentUser.id, role: 'owner', joinedAt: date.toISOString() },
        { userId: targetUserId, role: 'member', joinedAt: date.toISOString() }
      ],
      createdAt: dateStr,
      updatedAt: dateStr
    };
    
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    return newConv.id;
  };

  const openProjectChannel = (projectId: string): string => {
    const existing = conversations.find(
      c => c.type === 'channel' && c.projectId === projectId
    );
    if (existing) {
      setActiveConversationId(existing.id);
      return existing.id;
    }
    
    const project = projects.find(p => p.id === projectId);
    const date = new Date();
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(date);
    
    const newConv: Conversation = {
      id: `conv-${Date.now()}`,
      type: 'channel',
      name: project ? `پروژه ${project.name}` : 'کانال پروژه',
      projectId: projectId,
      memberIds: [currentUser.id],
      members: [
        { userId: currentUser.id, role: 'owner', joinedAt: date.toISOString() }
      ],
      createdAt: dateStr,
      updatedAt: dateStr
    };
    
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    return newConv.id;
  };
  const addIdea = async (ideaData: Partial<Idea> & { title: string; description: string }): Promise<Idea> => {
    const code = `IDEA-${ideas.length + 101}`;
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    const newIdea: Idea = {
      id: `idea-${Date.now()}`,
      code,
      title: ideaData.title,
      description: ideaData.description || '',
      problemSolved: ideaData.problemSolved || ideaData.description,
      proposedSolution: ideaData.proposedSolution || ideaData.description,
      processTemplateId: ideaData.processTemplateId,
      estimatedEffort: ideaData.estimatedEffort,
      estimatedBudget: ideaData.estimatedBudget,
      creatorId: currentUser.id,
      departmentId: ideaData.departmentId,
      projectId: ideaData.projectId,
      priority: ideaData.priority || 'medium',
      status: ideaData.status || 'draft',
      tags: ideaData.tags || [],
      assetIds: ideaData.assetIds || [],
      comments: [],
      activities: [{
        id: `act-${Date.now()}`,
        userId: currentUser.id,
        action: 'ایده را ثبت کرد.',
        timestamp: dateStr,
        type: 'status_change'
      }],
      votes: [],
      hasPoll: ideaData.hasPoll || false,
      pollQuestion: ideaData.pollQuestion,
      pollOptions: ideaData.pollOptions,
      createdAt: dateStr,
      updatedAt: dateStr
    };
    const response = await ideasApi.create(newIdea);
    setIdeas(prev => [response.data, ...prev]);
    return response.data;
  };

  const updateIdea = async (ideaId: string, updates: Partial<Idea>): Promise<void> => {
    try {
      const response = await ideasApi.update(ideaId, updates);
      setIdeas(prev => prev.map(item => item.id === ideaId ? response.data : item));
    } catch (error) {
      notifyApiError('idea:update', error, 'ذخیره ایده ناموفق بود');
      throw error;
    }
  };

  const addIdeaAttachment = async (ideaId: string, file: File) => {
    const idea = ideas.find(item => item.id === ideaId);
    const sizeLabel = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`
      : `${Math.max(1, Math.round(file.size / 1024))} کیلوبایت`;
    const uploadedAt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    try {
      const response = await damApi.library.createFile(file, {
        title: `پیوست ایده: ${idea?.title || ''} — ${file.name}`.slice(0, 200),
        description: `idea:${ideaId}`,
      });
      const assetId = response.data?.id;
      const attachment: MeetingAttachment = {
        id: `iatt-${Date.now()}`,
        name: file.name,
        size: sizeLabel,
        url: assetId ? damApi.library.previewUrl(assetId) : '',
        uploadedBy: currentUser.id,
        uploadedAt,
      };
      setIdeas(prev => prev.map(item => {
        if (item.id !== ideaId) return item;
        const next = [...(item.attachments || []), attachment];
        if (/^\d+$/.test(ideaId)) {
          void ideasApi.update(ideaId, { attachments: next } as any)
            .catch(error => console.error('Persisting idea attachments failed.', error));
        }
        return { ...item, attachments: next };
      }));
    } catch (error) {
      console.error('Uploading idea attachment failed.', error);
      throw error;
    }
  };

  const removeIdeaAttachment = (ideaId: string, attachmentId: string) => {
    setIdeas(prev => prev.map(item => {
      if (item.id !== ideaId) return item;
      const next = (item.attachments || []).filter(a => a.id !== attachmentId);
      if (/^\d+$/.test(ideaId)) {
        void ideasApi.update(ideaId, { attachments: next } as any)
          .catch(error => console.error('Persisting idea attachments failed.', error));
      }
      return { ...item, attachments: next };
    }));
  };

  const deleteIdea = (ideaId: string) => {
    setIdeas(prev => prev.filter(item => item.id !== ideaId));
    if (selectedIdeaId === ideaId) setSelectedIdeaId(null);
    if (/^\d+$/.test(ideaId)) void ideasApi.remove(ideaId).catch(error => console.error('Deleting idea failed.', error));
  };

  const voteIdea = (ideaId: string, option: IdeaVoteOption, comment?: string) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    setIdeas(prev => prev.map(item => {
      if (item.id !== ideaId) return item;
      
      const existingVoteIndex = item.votes.findIndex(v => v.userId === currentUser.id);
      let updatedVotes = [...item.votes];
      
      if (existingVoteIndex >= 0) {
        updatedVotes[existingVoteIndex] = { ...updatedVotes[existingVoteIndex], option, comment, timestamp: dateStr };
      } else {
        updatedVotes.push({
          userId: currentUser.id,
          option,
          comment,
          timestamp: dateStr
        });
      }
      
      const optionLabels = { approve: 'موافق', reject: 'مخالف', abstain: 'ممتنع' };
      const newAct: IdeaActivity = {
        id: `act-${Date.now()}`,
        userId: currentUser.id,
        action: `رأی «${optionLabels[option]}» خود را ثبت کرد.`,
        timestamp: dateStr,
        type: 'vote'
      };
      return {
        ...item,
        votes: updatedVotes,
        activities: [...item.activities, newAct],
        updatedAt: dateStr
      };
    }));
  };

  const votePollOption = (ideaId: string, optionId: string) => {
    setIdeas(prev => prev.map(item => {
      if (item.id !== ideaId || !item.pollOptions) return item;
      const updatedOpts = item.pollOptions.map(opt => {
        const withoutUser = opt.votes.filter(uId => uId !== currentUser.id);
        if (opt.id === optionId) {
          return { ...opt, votes: [...withoutUser, currentUser.id] };
        }
        return { ...opt, votes: withoutUser };
      });
      return { ...item, pollOptions: updatedOpts };
    }));
  };

  const addIdeaComment = (ideaId: string, text: string, replyToId?: string, assetIds?: string[]) => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    setIdeas(prev => prev.map(item => {
      if (item.id !== ideaId) return item;
      let replyToAuthor: string | undefined;
      let replyToText: string | undefined;
      if (replyToId) {
        const targetComm = item.comments.find(c => c.id === replyToId);
        if (targetComm) {
          const authorUser = users.find(u => u.id === targetComm.userId);
          replyToAuthor = authorUser ? authorUser.name : 'کاربر';
          replyToText = targetComm.text.slice(0, 45) + (targetComm.text.length > 45 ? '...' : '');
        }
      }
      const newComment: IdeaComment = {
        id: `comm-${Date.now()}`,
        userId: currentUser.id,
        text,
        timestamp: dateStr,
        replyToId,
        replyToAuthor,
        replyToText,
        reactions: [],
        assetIds
      };
      const newAct: IdeaActivity = {
        id: `act-${Date.now()}`,
        userId: currentUser.id,
        action: 'دیدگاه جدیدی ثبت کرد.',
        timestamp: dateStr,
        type: 'comment'
      };
      return {
        ...item,
        comments: [...item.comments, newComment],
        activities: [...item.activities, newAct],
        updatedAt: dateStr
      };
    }));
    const targetIdea = ideas.find(i => i.id === ideaId);
    const replyTarget = replyToId ? targetIdea?.comments.find(c => c.id === replyToId) : undefined;
    const ideaRecipients = [targetIdea?.creatorId, replyTarget?.userId]
      .filter((id): id is string => !!id && id !== currentUser.id);
    [...new Set(ideaRecipients)].forEach(userId => sendNotification({
      userId,
      title: 'دیدگاه جدید روی ایده',
      message: `${currentUser.name} روی ایده «${targetIdea?.title || ''}» دیدگاه ثبت کرد.`,
      type: 'comment',
      linkIdeaId: ideaId,
    }));
  };

  const toggleIdeaCommentReaction = (ideaId: string, commentId: string, emoji: string) => {
    setIdeas(prev => prev.map(item => {
      if (item.id !== ideaId) return item;
      const updatedComments = item.comments.map(c => {
        if (c.id !== commentId) return c;
        const rx = c.reactions || [];
        const existing = rx.find(r => r.emoji === emoji);
        let newRx;
        if (existing) {
          if (existing.userIds.includes(currentUser.id)) {
            const nextUsers = existing.userIds.filter(u => u !== currentUser.id);
            if (nextUsers.length === 0) {
              newRx = rx.filter(r => r.emoji !== emoji);
            } else {
              newRx = rx.map(r => r.emoji === emoji ? { ...r, userIds: nextUsers, count: nextUsers.length } : r);
            }
          } else {
            newRx = rx.map(r => r.emoji === emoji ? { ...r, userIds: [...r.userIds, currentUser.id], count: r.count + 1 } : r);
          }
        } else {
          newRx = [...rx, { emoji, userIds: [currentUser.id], count: 1 }];
        }
        return { ...c, reactions: newRx };
      });
      return { ...item, comments: updatedComments };
    }));
  };

  const createIdeaPoll = (ideaId: string, question: string, options: string[]) => {
    const pollOptions = options.map((opt, idx) => ({
      id: `opt-${Date.now()}-${idx}`,
      text: opt,
      votes: []
    }));
    void updateIdea(ideaId, { hasPoll: true, pollQuestion: question, pollOptions }).catch(() => undefined);
  };

  const convertIdeaToProject = (ideaId: string, customData?: { name?: string; key?: string; description?: string }): Project => {
    const targetIdea = ideas.find(i => i.id === ideaId);
    if (!targetIdea) throw new Error('Idea not found');
    const newProj = addProject({
      name: customData?.name || `پروژه اجرایی: ${targetIdea.title}`,
      key: customData?.key || targetIdea.code.replace('-', ''),
      description: customData?.description || `${targetIdea.description}\n\nمسئله حل‌شده: ${targetIdea.problemSolved}\nراه‌حل: ${targetIdea.proposedSolution}`,
      priority: targetIdea.priority,
      status: 'planning',
      projectManagerId: currentUser.id,
      memberIds: [currentUser.id, targetIdea.creatorId]
    });
    void updateIdea(ideaId, { status: 'in_progress', convertedProjectId: newProj.id }).catch(() => undefined);
    triggerCelebration();
    sendNotification({
      userId: currentUser.id,
      title: '🚀 تبدیل ایده به پروژه',
      message: `ایده "${targetIdea.title}" با موفقیت به پروژه سازمانی تبدیل شد.`,
      type: 'system',
      linkProjectId: newProj.id
    });
    return newProj;
  };

  const convertIdeaToTask = (ideaId: string, projectId: string, title?: string): Task => {
    const targetIdea = ideas.find(i => i.id === ideaId);
    if (!targetIdea) throw new Error('Idea not found');
    const newTask = addTask({
      title: title || `پیاده‌سازی: ${targetIdea.title}`,
      description: `خروجی اتاق فکر (${targetIdea.code}):\n${targetIdea.description || [targetIdea.problemSolved, targetIdea.proposedSolution].filter(Boolean).join('\n\n')}`,
      projectId,
      priority: targetIdea.priority,
      assigneeId: targetIdea.creatorId,
      status: 'todo',
      tags: [...targetIdea.tags, 'اتاق فکر']
    });
    void updateIdea(ideaId, { status: 'in_progress', convertedTaskId: newTask.id }).catch(() => undefined);

    return newTask;
  };

  const addThinkTankMeeting = async (meetingData: Partial<ThinkTankMeeting> & { title: string; date: string; time: string }): Promise<ThinkTankMeeting> => {
    const newMeeting: ThinkTankMeeting = {
      id: `ttm-${Date.now()}`,
      title: meetingData.title,
      description: meetingData.description,
      date: meetingData.date,
      time: meetingData.time,
      duration: meetingData.duration || '۶۰ دقیقه',
      organizerId: currentUser.id,
      attendeeIds: meetingData.attendeeIds || [currentUser.id],
      agenda: meetingData.agenda || [],
      relatedIdeaIds: meetingData.relatedIdeaIds || [],
      assetIds: meetingData.assetIds || [],
      attachments: meetingData.attachments || [],
      status: 'scheduled',
      locationType: meetingData.locationType || 'in_person',
      locationDetails: meetingData.locationDetails,
      decisions: [],
      actionItems: [],
      createdAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date())
    };
    const response = await thinkTankMeetingsApi.create(newMeeting);
    setThinkTankMeetings(prev => [response.data, ...prev]);
    void notificationsApi.list().then(r => setNotifications(r.data)).catch(() => undefined);
    return response.data;
  };

  const updateThinkTankMeeting = async (meetingId: string, updates: Partial<ThinkTankMeeting>): Promise<ThinkTankMeeting> => {
    const response = await thinkTankMeetingsApi.update(meetingId, updates);
    setThinkTankMeetings(prev => prev.map(m => m.id === meetingId ? response.data : m));
    return response.data;
  };

  const deleteThinkTankMeeting = (meetingId: string) => {
    setThinkTankMeetings(prev => prev.filter(m => m.id !== meetingId));
    if (selectedMeetingId === meetingId) setSelectedMeetingId(null);
    if (/^\d+$/.test(meetingId)) void thinkTankMeetingsApi.remove(meetingId).catch(error => console.error('Deleting think tank meeting failed.', error));
  };

  const persistMeetingAttachments = (meetingId: string, attachments: MeetingAttachment[]) => {
    if (!/^\d+$/.test(meetingId)) return;
    void thinkTankMeetingsApi.update(meetingId, { attachments } as any)
      .catch(error => console.error('Persisting meeting attachments failed.', error));
  };

  const addMeetingAttachment = async (meetingId: string, file: File, folderId?: string) => {
    const meeting = thinkTankMeetings.find(m => m.id === meetingId);
    const sizeLabel = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`
      : `${Math.max(1, Math.round(file.size / 1024))} کیلوبایت`;
    const uploadedAt = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    // فایل جلسه در مخزن مرکزی DAM ذخیره می‌شود تا لینک دانلود پایدار داشته باشد.
    try {
      const response = await damApi.library.createFile(file, {
        title: `پیوست جلسه: ${meeting?.title || ''} — ${file.name}`.slice(0, 200),
        description: `meeting:${meetingId}`,
        folderId,
      });
      const assetId = response.data?.id;
      const attachment: MeetingAttachment = {
        id: `matt-${Date.now()}`,
        name: file.name,
        size: sizeLabel,
        url: assetId ? damApi.library.previewUrl(assetId) : '',
        uploadedBy: currentUser.id,
        uploadedAt,
      };
      await appendMeetingAttachments(meetingId, [attachment]);
    } catch (error) {
      console.error('Uploading meeting attachment failed.', error);
      throw error;
    }
  };

  const appendMeetingAttachments = async (meetingId: string, attachments: MeetingAttachment[]) => {
    if (attachments.length === 0) return;
    const current = (await thinkTankMeetingsApi.get(meetingId)).data;
    await updateThinkTankMeeting(meetingId, { attachments: [...(current.attachments || []), ...attachments] });
  };

  const removeMeetingAttachment = (meetingId: string, attachmentId: string) => {
    setThinkTankMeetings(prev => prev.map(m => {
      if (m.id !== meetingId) return m;
      const next = (m.attachments || []).filter(a => a.id !== attachmentId);
      persistMeetingAttachments(meetingId, next);
      return { ...m, attachments: next };
    }));
  };

  const addMeetingMinutes = async (meetingId: string, minutes: string, decisions: string[], actionItems?: MeetingActionItem[], presentIds?: string[]) => {
    const meeting = thinkTankMeetings.find(m => m.id === meetingId);
    await updateThinkTankMeeting(meetingId, {
      status: 'completed', minutesSummary: minutes, decisions,
      actionItems: actionItems || meeting?.actionItems || [],
      presentIds: presentIds ?? meeting?.presentIds ?? [],
    });
    notify({ type: 'success', title: 'صورت‌جلسه ذخیره شد' });
  };

  const convertActionItemToTask = async (meetingId: string, actionItemId: string, projectId: string): Promise<Task> => {
    const response = await request<{ data: { task: Task; meeting: ThinkTankMeeting } }>(`/think-tank-meetings/${encodeURIComponent(meetingId)}/actions/${encodeURIComponent(actionItemId)}/task`, { method: 'POST', body: { projectId: projectId || null } });
    const { task, meeting } = response.data;
    setTasks(prev => [task, ...prev.filter(t => t.id !== task.id)]);
    setThinkTankMeetings(prev => prev.map(m => m.id === meetingId ? meeting : m));
    void notificationsApi.list().then(r => setNotifications(r.data)).catch(() => undefined);
    return task;
  };

  // ==========================================
  // Secretariat (دبیرخانه) Operations
  // ==========================================
  const addLetter = (letterData: Partial<SecretariatLetter> & { subject: string; content: string; type: LetterType; sender: string; recipient: string }): SecretariatLetter => {
    const dateStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());
    const timeStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const count = secretariatLetters.length + 1;
    const prefix = letterData.type === 'incoming' ? 'دب' : (letterData.type === 'outgoing' ? 'صاد' : 'داخ');
    const letterNumber = `${letterData.type === 'incoming' ? 'وارده: ' : (letterData.type === 'outgoing' ? 'صادره: ' : 'داخلی: ')}${prefix}-۱۴۰۵/${count.toString().padStart(3, '0')}`;
    const indicatNumber = `۱۴۰۵/${count.toString().padStart(3, '0')}`;

    const newLetter: SecretariatLetter = {
      id: `let-${Date.now()}`,
      letterNumber,
      indicatNumber,
      type: letterData.type,
      subject: letterData.subject,
      content: letterData.content,
      sender: letterData.sender,
      senderUserId: letterData.senderUserId || (letterData.type === 'outgoing' ? currentUser.id : undefined),
      recipient: letterData.recipient,
      recipientUserId: letterData.recipientUserId,
      ccList: letterData.ccList || [],
      date: letterData.date || dateStr,
      registeredAt: timeStr,
      classification: letterData.classification || 'normal',
      urgency: letterData.urgency || 'normal',
      status: letterData.status || (letterData.type === 'outgoing' ? 'draft' : 'registered'),
      responseDeadline: letterData.responseDeadline,
      relatedLetterId: letterData.relatedLetterId,
      assetIds: letterData.assetIds || [],
      referrals: [],
      workflow: [
        {
          id: `wf-${Date.now()}`,
          userId: currentUser.id,
          stageName: 'ثبت اولیه در دبیرخانه',
          action: `نامه ${letterData.type === 'incoming' ? 'وارده' : 'صادره'} با شماره ${letterNumber} ثبت شد.`,
          timestamp: timeStr,
          status: 'completed'
        }
      ],
      archiveDossierId: letterData.archiveDossierId,
      archiveBox: letterData.archiveBox,
      tags: letterData.tags || ['مکاتبات'],
      createdAt: timeStr,
      updatedAt: timeStr
    };

    setSecretariatLetters(prev => [newLetter, ...prev]);
    void secretariatLettersApi.create(newLetter).then(response => {
      setSecretariatLetters(prev => prev.map(item => item.id === newLetter.id ? response.data : item));
    }).catch(error => {
      setSecretariatLetters(prev => prev.filter(item => item.id !== newLetter.id));
      console.error('Creating secretariat letter failed.', error);
    });
    sendNotification({
      userId: currentUser.id,
      title: `📬 ثبت نامه ${letterData.type === 'incoming' ? 'وارده' : 'صادره'} در دبیرخانه`,
      message: `نامه با شماره ${letterNumber} با موضوع "${newLetter.subject}" ثبت شد.`,
      type: 'system'
    });
    return newLetter;
  };

  const updateLetter = (letterId: string, updates: Partial<SecretariatLetter>) => {
    const timeStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    setSecretariatLetters(prev => prev.map(l => l.id === letterId ? { ...l, ...updates, updatedAt: timeStr } : l));
  };

  const deleteLetter = (letterId: string) => {
    setSecretariatLetters(prev => prev.filter(l => l.id !== letterId));
    if (selectedLetterId === letterId) setSelectedLetterId(null);
    if (/^\d+$/.test(letterId)) void secretariatLettersApi.remove(letterId).catch(error => console.error('Deleting secretariat letter failed.', error));
  };

  const referLetter = (letterId: string, referralData: { toUserId?: string; toDepartmentId?: string; department?: string; actionType: ReferralActionType; instructions: string; deadline: string }) => {
    const timeStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const newRef: LetterReferral = {
      id: `ref-${Date.now()}`,
      letterId,
      fromUserId: currentUser.id,
      toUserId: referralData.toUserId,
      toDepartmentId: referralData.toDepartmentId,
      department: referralData.department,
      actionType: referralData.actionType,
      instructions: referralData.instructions,
      deadline: referralData.deadline,
      status: 'pending',
      timestamp: timeStr
    };

    const actionLabels: Record<ReferralActionType, string> = {
      review: 'بررسی و اظهار نظر',
      action: 'اقدام لازم',
      response: 'تهیه پاسخ رسمی',
      info: 'جهت استحضار و اطلاع',
      followup: 'پیگیری مستمر'
    };

    const targetUser = users.find(u => u.id === referralData.toUserId);
    const targetName = targetUser ? targetUser.name : (referralData.department || 'واحد مربوطه');

    const newWorkflowStep: LetterWorkflowStep = {
      id: `wf-${Date.now()}`,
      userId: currentUser.id,
      stageName: 'ارجاع سازمانی',
      action: `ارجاع به ${targetName} با دستور: ${actionLabels[referralData.actionType]}`,
      notes: referralData.instructions,
      timestamp: timeStr,
      status: 'completed'
    };

    setSecretariatLetters(prev => prev.map(l => {
      if (l.id !== letterId) return l;
      return {
        ...l,
        status: 'referred',
        referrals: [...l.referrals, newRef],
        workflow: [...l.workflow, newWorkflowStep],
        updatedAt: timeStr
      };
    }));

    const letter = secretariatLetters.find(item => item.id === letterId);
    if (referralData.toUserId && letter) {
      const recipientId = referralData.toUserId;
      void secretariatLettersApi.update(letterId, { status: 'referred', referrals: [...letter.referrals, newRef] }).then(response => {
        setSecretariatLetters(prev => prev.map(item => item.id === letterId ? response.data : item));
        sendNotification({
          userId: recipientId,
          title: '📨 ارجاع نامه اداری جدید',
          message: `${currentUser.name} نامه‌ای را با دستور "${referralData.instructions}" به شما ارجاع داد.`,
          type: 'assignment',
          linkLetterId: response.data.id,
        });
      }).catch(error => notifyApiError('letter-referral', error, 'ثبت ارجاع و اعلان آن ناموفق بود'));
    }
  };

  const updateReferralStatus = (letterId: string, referralId: string, status: 'pending' | 'in_progress' | 'completed' | 'rejected', responseNotes?: string) => {
    const timeStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    setSecretariatLetters(prev => prev.map(l => {
      if (l.id !== letterId) return l;
      const updatedRefs = l.referrals.map(r => {
        if (r.id !== referralId) return r;
        return {
          ...r,
          status,
          responseNotes: responseNotes || r.responseNotes,
          completedAt: status === 'completed' ? timeStr : r.completedAt
        };
      });
      const allCompleted = updatedRefs.every(r => r.status === 'completed');
      return {
        ...l,
        status: allCompleted ? 'in_progress' : l.status,
        referrals: updatedRefs,
        updatedAt: timeStr
      };
    }));
  };

  const convertReferralToTask = (letterId: string, referralId: string, projectId: string): Task => {
    const letter = secretariatLetters.find(l => l.id === letterId);
    const referral = letter?.referrals.find(r => r.id === referralId);
    if (!letter || !referral) throw new Error('Referral not found');

    const newTask = addTask({
      title: `اقدام نامه ${letter.letterNumber}: ${letter.subject}`,
      description: `دستور ارجاع دبیرخانه:\n${referral.instructions}\n\nخلاصه نامه:\n${letter.content}`,
      projectId,
      assigneeId: referral.toUserId || currentUser.id,
      deadline: referral.deadline,
      priority: letter.urgency === 'immediate' ? 'urgent' : (letter.urgency === 'urgent' ? 'high' : 'medium'),
      status: 'todo',
      tags: ['دبیرخانه', letter.letterNumber]
    });

    setSecretariatLetters(prev => prev.map(l => {
      if (l.id !== letterId) return l;
      return {
        ...l,
        referrals: l.referrals.map(r => r.id === referralId ? { ...r, convertedTaskId: newTask.id } : r)
      };
    }));


    return newTask;
  };

  const addLetterWorkflowStep = (letterId: string, step: { stageName: string; action: string; notes?: string }) => {
    const timeStr = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const newStep: LetterWorkflowStep = {
      id: `wf-${Date.now()}`,
      userId: currentUser.id,
      stageName: step.stageName,
      action: step.action,
      notes: step.notes,
      timestamp: timeStr,
      status: 'completed'
    };
    setSecretariatLetters(prev => prev.map(l => l.id === letterId ? { ...l, workflow: [...l.workflow, newStep], updatedAt: timeStr } : l));
  };

  const replyLetter = (originalLetterId: string, replyData: Partial<SecretariatLetter> & { subject: string; content: string }): SecretariatLetter => {
    const orig = secretariatLetters.find(l => l.id === originalLetterId);
    const newOutgoing = addLetter({
      ...replyData,
      type: 'outgoing',
      subject: replyData.subject || (orig ? `پاسخ به: ${orig.subject}` : 'پاسخ نامه'),
      recipient: replyData.recipient || (orig ? orig.sender : ''),
      sender: 'سامانه تدبیر',
      relatedLetterId: originalLetterId,
      classification: orig?.classification || 'normal',
      urgency: orig?.urgency || 'normal'
    });
    updateLetter(originalLetterId, { status: 'answered' });
    addLetterWorkflowStep(originalLetterId, {
      stageName: 'پاسخ رسمی',
      action: `پاسخ رسمی با نامه صادره به شماره ${newOutgoing.letterNumber} ارسال گردید.`
    });
    return newOutgoing;
  };

  const archiveLetter = (letterId: string, dossierId: string, boxLocation?: string) => {
    updateLetter(letterId, { status: 'archived', archiveDossierId: dossierId, archiveBox: boxLocation });
    setArchiveDossiers(prev => prev.map(d => {
      if (d.id !== dossierId) return d;
      return {
        ...d,
        letterIds: d.letterIds.includes(letterId) ? d.letterIds : [...d.letterIds, letterId]
      };
    }));
    addLetterWorkflowStep(letterId, {
      stageName: 'بایگانی اسناد',
      action: `نامه در پرونده بایگانی با کد ${dossierId} ذخیره شد.`
    });
  };

  const addResolution = (resData: Partial<SecretariatResolution> & { title: string; content: string; deadline: string; responsibleUserId: string }): SecretariatResolution => {
    const count = secretariatResolutions.length + 1;
    const newRes: SecretariatResolution = {
      id: `res-${Date.now()}`,
      code: `مصوبه م-۱۴۰۵/${count.toString().padStart(2, '0')}`,
      title: resData.title,
      meetingId: resData.meetingId,
      meetingTitle: resData.meetingTitle,
      date: resData.date || new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date()),
      content: resData.content,
      responsibleUserId: resData.responsibleUserId,
      department: resData.department,
      deadline: resData.deadline,
      status: 'approved',
      taskIds: [],
      assetIds: resData.assetIds || [],
      notes: resData.notes,
      createdAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date())
    };
    setSecretariatResolutions(prev => [newRes, ...prev]);
    void secretariatResolutionsApi.create(newRes).then(response => {
      setSecretariatResolutions(prev => prev.map(item => item.id === newRes.id ? response.data : item));
      sendNotification({
        userId: resData.responsibleUserId || currentUser.id,
        title: '⚖️ مصوبه سازمانی جدید ثبت شد',
        message: `مصوبه "${newRes.title}" با کد ${newRes.code} ثبت گردید.`,
        type: 'system',
        linkResolutionId: response.data.id,
      });
    }).catch(error => {
      setSecretariatResolutions(prev => prev.filter(item => item.id !== newRes.id));
      notifyApiError('resolution-create', error, 'ثبت مصوبه ناموفق بود');
    });
    return newRes;
  };

  const updateResolution = (resId: string, updates: Partial<SecretariatResolution>) => {
    setSecretariatResolutions(prev => prev.map(r => r.id === resId ? { ...r, ...updates } : r));
  };

  const deleteResolution = (resId: string) => {
    setSecretariatResolutions(prev => prev.filter(r => r.id !== resId));
    if (selectedResolutionId === resId) setSelectedResolutionId(null);
    if (/^\d+$/.test(resId)) void secretariatResolutionsApi.remove(resId).catch(error => console.error('Deleting secretariat resolution failed.', error));
  };

  const convertResolutionToTask = (resolutionId: string, projectId: string): Task => {
    const res = secretariatResolutions.find(r => r.id === resolutionId);
    if (!res) throw new Error('Resolution not found');
    const newTask = addTask({
      title: `اجرای مصوبه ${res.code}: ${res.title}`,
      description: `متن مصوبه سازمانی:\n${res.content}\n\nمهلت اجرا: ${res.deadline}`,
      projectId,
      assigneeId: res.responsibleUserId,
      deadline: res.deadline,
      priority: 'high',
      status: 'todo',
      tags: ['مصوبه هیئت مدیره', res.code]
    });
    setSecretariatResolutions(prev => prev.map(r => {
      if (r.id !== resolutionId) return r;
      return {
        ...r,
        status: 'in_progress',
        taskIds: [...(r.taskIds || []), newTask.id]
      };
    }));

    return newTask;
  };

  const addArchiveDossier = (dossierData: Partial<ArchiveDossier> & { title: string; category: ArchiveCategory; location: string }): ArchiveDossier => {
    const count = archiveDossiers.length + 1;
    const newDossier: ArchiveDossier = {
      id: `dos-${Date.now()}`,
      code: `DOS-${dossierData.category.toUpperCase().slice(0, 3)}-1405-${count.toString().padStart(2, '0')}`,
      title: dossierData.title,
      category: dossierData.category,
      location: dossierData.location,
      confidentiality: dossierData.confidentiality || 'normal',
      letterIds: dossierData.letterIds || [],
      resolutionIds: dossierData.resolutionIds || [],
      assetIds: dossierData.assetIds || [],
      description: dossierData.description,
      retentionYears: dossierData.retentionYears || 5,
      createdAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date()),
      updatedAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date())
    };
    setArchiveDossiers(prev => [newDossier, ...prev]);
    void archiveDossiersApi.create(newDossier).then(response => {
      setArchiveDossiers(prev => prev.map(item => item.id === newDossier.id ? response.data : item));
    }).catch(error => {
      setArchiveDossiers(prev => prev.filter(item => item.id !== newDossier.id));
      console.error('Creating archive dossier failed.', error);
    });
    return newDossier;
  };

  const updateArchiveDossier = (dossierId: string, updates: Partial<ArchiveDossier>) => {
    setArchiveDossiers(prev => prev.map(d => d.id === dossierId ? { ...d, ...updates, updatedAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date()) } : d));
  };

  const deleteArchiveDossier = (dossierId: string) => {
    setArchiveDossiers(prev => prev.filter(d => d.id !== dossierId));
    if (/^\d+$/.test(dossierId)) void archiveDossiersApi.remove(dossierId).catch(error => console.error('Deleting archive dossier failed.', error));
  };


  return (
    <AppContext.Provider
      value={{
        currentUser,
        pendingMutationKeys: confirmed.pendingKeys,
        users,
        projects,
        tasks,
        roles,
        notifications,
        templates,
        activities,
        departments,
        workflows,
        contents,
        // DAM
        assets,
        folders,
        damSubView,
        setDamSubView,
        currentFolderId,
        setCurrentFolderId,
        previewAssetId,
        setPreviewAssetId,
        detailAssetId,
        setDetailAssetId,
        versionModalAssetId,
        setVersionModalAssetId,
        shareTargetAssetId,
        setShareTargetAssetId,
        shareTargetFolderId,
        setShareTargetFolderId,
        isUploadAssetOpen,
        setIsUploadAssetOpen,
        isEditAssetOpen,
        setIsEditAssetOpen,
        assetToEdit,
        setAssetToEdit,
        openEditAsset,
        isCreateFolderOpen,
        setIsCreateFolderOpen,
        isEditFolderOpen,
        setIsEditFolderOpen,
        folderToEdit,
        setFolderToEdit,
        openEditFolder,
        uploadAsset,
        uploadNewVersion,
        deleteAssetVersion,
        revertToAssetVersion,
        updateAsset,
        deleteAsset,
        restoreAsset,
        emptyTrash,
        toggleAssetFavorite,
        addAssetComment,
        shareAsset,
        removeAssetShare,
        hasAssetAccess,
        batchDeleteAssets,
        batchRestoreAssets,
        batchMoveAssets,
        downloadAsset,
        createFolder,
        updateFolder,
        deleteFolder,
        toggleFolderFavorite,
        conversations,
        messages,
        activeConversationId,
        setActiveConversationId,
        chatFilter,
        setChatFilter,
        chatSearchQuery,
        setChatSearchQuery,
        sendMessage,
        editMessage,
        deleteMessage,
        togglePinMessage,
        toggleStarMessage,
        toggleMessageReaction,
        createConversation,
        updateConversation,
        addConversationMembers,
        removeConversationMember,
        updateMemberRole,
        toggleMuteConversation,
        markConversationAsRead,
        markConversationAsUnread,
        updateConversationPermissions,
        startDirectChatWithUser,
        openProjectChannel,
        // Categories
        categories,
        addDepartment,
        refreshDepartments,
        updateDepartment,
        deleteDepartment,
        contentTypes,
        addContentType,
        deleteContentType,
        updateContentType,
        addCategory,
        updateCategory,
        deleteCategory,
        resetCategories,
        // Think Tank (اتاق فکر)
        ideas,
        thinkTankMeetings,
        selectedIdeaId,
        setSelectedIdeaId,
        selectedMeetingId,
        setSelectedMeetingId,
        addIdea,
        updateIdea,
        addIdeaAttachment,
        removeIdeaAttachment,
        deleteIdea,
        voteIdea,
        votePollOption,
        addIdeaComment,
        toggleIdeaCommentReaction,
        createIdeaPoll,
        convertIdeaToProject,
        convertIdeaToTask,
        addThinkTankMeeting,
        updateThinkTankMeeting,
        deleteThinkTankMeeting,
        addMeetingMinutes,
        addMeetingAttachment,
        appendMeetingAttachments,
        removeMeetingAttachment,
        convertActionItemToTask,
        // Secretariat (دبیرخانه)
        secretariatLetters,
        secretariatResolutions,
        archiveDossiers,
        selectedLetterId,
        setSelectedLetterId,
        selectedResolutionId,
        setSelectedResolutionId,
        addLetter,
        updateLetter,
        deleteLetter,
        referLetter,
        updateReferralStatus,
        convertReferralToTask,
        addLetterWorkflowStep,
        replyLetter,
        archiveLetter,
        addResolution,
        updateResolution,
        deleteResolution,
        convertResolutionToTask,
        addArchiveDossier,
        updateArchiveDossier,
        deleteArchiveDossier,
        activeView,
        setActiveView,
        selectedProjectId,
        selectedContentId,
        setSelectedContentId,
        setSelectedProjectId,
        selectedTaskId,
        setSelectedTaskId,
        selectedMemberId,
        setSelectedMemberId,
        selectedTemplateId,
        setSelectedTemplateId,
        selectedUserId,
        setSelectedUserId,
        userProfileId,
        setUserProfileId,
        searchQuery,
        setSearchQuery,
        isSearchOpen,
        setIsSearchOpen,
        isCreateTaskOpen,
        setIsCreateTaskOpen,
        isCreateProjectOpen,
        setIsCreateProjectOpen,
        isCreateContentOpen,
        setIsCreateContentOpen,
        contentCreateProjectId,
        setContentCreateProjectId,
        isEditProjectOpen,
        setIsEditProjectOpen,
        projectToEdit,
        setProjectToEdit,
        openEditProject,
        meetingModalRequest,
        requestMeetingModal,
        isCreateUserOpen,
        setIsCreateUserOpen,
        isEditUserOpen,
        setIsEditUserOpen,
        userToEdit,
        setUserToEdit,
        isCreateRoleOpen,
        setIsCreateRoleOpen,
        isEditRoleOpen,
        setIsEditRoleOpen,
        roleToEdit,
        setRoleToEdit,
        openEditRole,
        isTemplatesModalOpen,
        setIsTemplatesModalOpen,
        isTemplateEditorOpen,
        setIsTemplateEditorOpen,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isLoggedIn,
        logout,
        authNotice,
        addUser,
        addUserAsync,
        updateUser,
        updateUserAsync,
        deleteUser,
        changeUserStatus,
        bulkChangeUserStatus,
        bulkDeleteUsers,
        addRole,
        updateRole,
        deleteRole,
        toggleRolePermission,
        toggleRoleStatus,
        hasPermission,
        isWorkspaceLoading,
        isReloadingWorkspace,
        moduleErrors,
        reloadWorkspace,
        toasts,
        notify,
        dismissToast,
        notifyApiError,
        generalSettings,
        setGeneralSettings,
        notificationSettings,
        setNotificationSettings,
        securitySettings,
        setSecuritySettings,
        taskPriorities,
        setTaskPriorities,
        taskStatuses,
        setTaskStatuses,
        damStatuses,
        setDamStatuses,
        contentStatuses,
        setContentStatuses,
        settingsSaveState,
        settingsSaveError,
        saveSettingsNow,
        registerUser,
        loginWithCredentials,
        resetPasswordRequest,
        addTask,
        addTaskAsync,
        updateTask,
        deleteTask,
        moveTaskStatus,
        toggleSubtask,
        addSubtask,
        deleteSubtask,
        addComment,
        addAttachment,
        deleteAttachment,
        // Content Operations
        processTemplates,
        addProcessTemplate,
        updateProcessTemplate,
        deleteProcessTemplate,
        publishingPlatforms,
        updatePublishingPlatforms,
        addContent,
        duplicateContent,
        updateContent,
        deleteContent,
        changeContentStatus,
        updateContentPublishInfo,
        publishingContentIds,
        scheduleContentPublication,
        createPublicationTask,
        publishContentNow,
        unpublishContent,
        addContentComment,
        addContentAttachment,
        deleteContentAttachment,
        assignStageResponsibility,
        updateStageStatus,
        addStageDeliverable,
        removeStageDeliverable,
        approveStage,
        rejectStage,
        addProject,
        waitForProject: (id: string) => pendingProjectCreates.current.get(id) ?? Promise.resolve(projects.find(p => p.id === id)),
        updateProject,
        archiveItem,
        unarchiveItem,
        deleteProject,
        addTemplate,
        updateTemplate,
        deleteTemplate,
        applyTemplate,
        saveProjectAsTemplate,
        inviteMember,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        clearNotification,
        sendNotification,
        logActivity,
        triggerCelebration,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
