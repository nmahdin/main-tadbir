export type Role = 'admin' | 'project_manager' | 'team_member' | string;

export type UserStatus = 'active' | 'inactive' | 'blocked' | 'pending';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'archived';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'completed' | 'archived';

export interface User {
  contentMembershipAccess?: boolean;
  id: string;
  name: string;
  username?: string;
  avatar: string;
  role: Role;
  roleId?: string;
  roleIsActive?: boolean;
  status: UserStatus;
  title: string;
  department: string;
  departmentId?: string | null;
  activeProjectsCount: number;
  completedTasksCount: number;
  workloadPercentage: number;
  skills: string[];
  phone?: string;
  location?: string;
  lastLogin?: string;
  createdAt: string;
  twoFactorEnabled?: boolean;
  temporaryPassword?: string;
  password?: string;
  bio?: string;
  /** کلید دسترسی‌های نقش کاربر که از بک‌اند (UserResource) دریافت می‌شود. */
  permissions?: string[];
}

export interface PermissionItem {
  id: string;
  label: string;
  description: string;
  category: 'users' | 'roles' | 'projects' | 'tasks' | 'dam' | 'comments' | 'messaging' | 'secretariat' | 'thinktank' | 'reports' | 'settings' | 'departments' | 'content' | 'meetings';
}

export interface SystemRole {
  id: string;
  key: string;
  name: string;
  description: string;
  color: string;
  isSystem: boolean;
  isActive?: boolean;
  userCount?: number;
  permissions: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskComment {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
  attachments?: TaskAttachment[];
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: string;
  type: string;
  url: string;
  uploadDate: string;
  uploadedBy: string;
}

export type ActivityType =
  | 'client_note'
  | 'task_created'
  | 'status_change'
  | 'automatic_status_change'
  | 'comment'
  | 'attachment'
  | 'project_created'
  | 'project_updated'
  | 'template_created'
  | 'template_applied'
  | 'blocker'
  | 'team_update'
  | 'member_assigned'
  | 'user_created'
  | 'user_updated'
  | 'user_status_changed'
  | 'role_created'
  | 'role_updated'
  | 'auth_login'
  | 'auth_2fa_verified';

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  type?: ActivityType;
  timestamp: string;
  details?: string;
  taskId?: string;
  taskTitle?: string;
  projectId?: string;
  projectName?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId?: string;
  contentId?: string | null;
  contentStageId?: string;
  kind?: string;
  parentTaskId?: string | null;
  assigneeId: string;
  priority: Priority;
  status: TaskStatus;
  startDate: string;
  deadline: string;
  estimatedHours: number;
  loggedHours?: number;
  tags: string[];
  subtasks: Subtask[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  activityHistory: ActivityLog[];
  dependencies: string[]; // Task IDs this task depends on
  isBlocked?: boolean;
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStage {
  id: TaskStatus;
  name: string;
  color: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  projectManagerId: string;
  memberIds: string[];
  startDate: string;
  deadline: string;
  status: ProjectStatus;
  progress: number; // 0 to 100
  priority: Priority;
  tags: string[];
  color: string;
  budget?: string;
  category: string;
  createdAt: string;
  templateId?: string;
}

export interface TemplateTask {
  id: string;
  title: string;
  description: string;
  relativeDueDays: number; // offset days from project start date
  estimatedHours: number;
  priority: Priority;
  status: TaskStatus;
  tags: string[];
  subtasks: string[];
  suggestedRole?: Role;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  defaultPriority: Priority;
  estimatedDurationDays: number;
  budget?: string;
  stages: { id: TaskStatus; name: string; color: string }[];
  tasks: TemplateTask[];
  tags: string[];
  isBuiltIn?: boolean;
  createdAt: string;
  updatedAt?: string;
}


export type DepartmentStatus = 'active' | 'inactive';

export interface DepartmentMember {
  userId: string;
  role: string; // e.g. 'مدیر', 'معاون', 'کارشناس'
  joinedAt?: string | null;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  managerId?: string | null;
  managedByMe?: boolean;
  parentId?: string | null; // For hierarchical structure
  status: DepartmentStatus;
  members: DepartmentMember[];
  createdAt: string;
}

// ==========================================
// موتور گردش کار (Workflow Engine) Types
// ==========================================
export type WorkflowEntityType = 'content' | 'project' | 'idea' | 'letter' | 'general';

export interface WorkflowStage {
  id: string;
  name: string;
  description?: string;
  roleIds?: string[]; // Roles allowed to perform this stage
  userIds?: string[]; // Specific users allowed
  canTransitionNext: boolean;
  canRevert: boolean;
  deadlineDays?: number; // Expected days to complete this stage
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  entityType: WorkflowEntityType;
  stages: WorkflowStage[];
  createdAt: string;
}

export interface WorkflowHistory {
  id: string;
  entityId: string;
  entityType: WorkflowEntityType;
  fromStageId?: string;
  toStageId: string;
  userId: string;
  timestamp: string;
  notes?: string;
}

// ==========================================
// مدیریت محتوا (Content Management) Types
// ==========================================
export type ContentStatus = 'idea' | 'planning' | 'producing' | 'in_progress' | 'reviewing' | 'revising' | 'approving' | 'approved' | 'ready_to_publish' | 'published' | 'completed' | 'suspended' | 'cancelled' | 'archived';
export type ContentPublishStatus = 'planned' | 'ready' | 'published' | 'cancelled';

export type ContentStageStatus =
  | 'pending_dependency' // در انتظار تکمیل مراحل پیش‌نیاز
  | 'ready'              // آماده برای شروع کار
  | 'not_started'        // شروع‌نشده
  | 'in_progress'        // در حال انجام توسط مسئول
  | 'ready_for_review'   // خروجی بارگذاری شده و آماده بررسی
  | 'pending_approval'   // در انتظار تأیید و بررسی مدیر
  | 'needs_revision'     // نیازمند اصلاح و بازگشت به مسئول
  | 'revisions_needed'   // نیازمند بازبینی و اصلاح
  | 'approved'           // تأیید شده توسط مدیر دپارتمان / بازبین
  | 'completed'          // تکمیل قطعی مرحله
  | 'skipped';           // عبور شده / غیرضروری

export interface ContentStageOutput {
  fileType?: string;
  id: string;
  name: string;
  type: 'text' | 'file' | 'link' | 'image' | 'video' | 'design_file';
  isRequired: boolean;
  isDelivered: boolean;
  value?: string; // Text or URL
  url?: string; // Secure DAM preview or external link
  fileName?: string;
  fileSize?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  assetId?: string; // Connected DAM asset
}

export interface ContentStageInput {
  id: string;
  title: string;
  type: 'text' | 'file' | 'brief' | 'dependency_stage';
  description?: string;
  isReady: boolean;
  sourceStageId?: string;
  contentRef?: string;
}

export interface ContentStageActivity {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface ContentStage {
  id: string;
  stageKey: string; // e.g. 'text_prep', 'design_graphic', 'video_edit', 'quality_review', 'final_approval', 'publish', 'archive'
  title: string; // e.g. 'تأمین متن و سناریو', 'طراحی گرافیک و پوستر', 'تدوین و جلوه‌های ویژه', 'بازبینی سردبیری', 'تأیید نهایی مدیر', 'انتشار در شبکه‌های اجتماعی'
  description?: string;

  departmentId: string; // دپارتمان مسئول
  departmentName?: string;

  assigneeId?: string; // مسئول مستقیم کار
  assigneeRole?: string; // یا نقش سازمانی مسئول (مانند: گرافیست، نویسنده، تدوین‌گر)

  reviewerId?: string; // بازبین / مدیر دپارتمان
  approverId?: string; // تأییدکننده نهایی
  reviewRequired?: boolean; // امکان عبور مرحله بدون ارزیابی مستقل

  order: number;
  status: ContentStageStatus;

  dependsOnStageIds?: string[]; // شناسه مراحل پیش‌نیاز

  startDate?: string;
  deadline?: string;
  completedAt?: string;

  inputs: ContentStageInput[];
  outputs: ContentStageOutput[];

  notes?: string;
  revisionReason?: string;
  reportText?: string; // گزارش کار انجام شده توسط مسئول

  activityLog?: ContentStageActivity[];
}

export interface ContentProcessTemplate {
  id: string;
  name: string; // e.g. 'فرایند استاندارد پوستر و بنر', 'فرایند موشن‌گرافیک و ویدیو', 'فرایند تولید مقاله و یادداشت تحلیلی', 'فرایند پادکست و صوت', 'فرایند اینفوگرافیک'
  type: string; // 'poster', 'video', 'article', 'podcast', 'social_post', 'infographic'
  iconName?: string;
  description: string;
  estimatedDays?: number;
  stages: Array<{
    stageKey: string;
    title: string;
    description: string;
    departmentId: string;
    departmentName: string;
    defaultRole: string;
    order: number;
    daysFromStart: number;
    inputs: Array<{ id: string; title: string; type: 'text' | 'file' | 'brief' | 'dependency_stage'; description?: string }>;
    outputs: Array<{ id: string; name: string; type: 'text' | 'file' | 'link' | 'image' | 'video' | 'design_file'; isRequired: boolean }>;
    dependsOnPrevious?: boolean;
  }>;
}

export interface PublishingPlatform {
  id: string; // e.g. 'website', 'instagram', 'telegram', 'bale', 'eitaa', 'rubika', 'youtube', 'linkedin', 'twitter'
  name: string;
  iconName?: string;
  color: string;
  bg: string;
  isEnabled: boolean;
  urlPattern?: string;
  description?: string;
  /** فیلدهای قدیمی برای سازگاری با داده‌های ذخیره‌شده قبلی */
  category?: string;
  handle?: string;
  defaultHandle?: string;
}

export interface ContentAttachment {
  id: string;
  name: string;
  size: string;
  sizeBytes?: number;
  url?: string;
  type?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface ContentPublishInfo {
  date?: string;
  time?: string;
  channels: string[]; // e.g. 'website', 'instagram', 'telegram', 'youtube', 'linkedin', 'bale'
  status: ContentPublishStatus;
  caption?: string;
  publishUrl?: string;
  metrics?: {
    views?: number;
    likes?: number;
    shares?: number;
    comments?: number;
  };
}

export interface ContentComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  stage?: string;
  createdAt: string;
}

export interface ContentHistoryItem {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: string;
  fromStatus?: string;
  toStatus?: string;
}

export interface Content {
  access?: {edit:boolean};
  progress?: number;
  reviewVersion?: string;
  reviewableStageIds?: string[];
  /** Server concurrency token for publication commands, never edited by a user. */
  publicationVersion?: string;
  id: string;
  title: string;
  description: string;
  topic?: string;
  type: string; // content-type id from settings (contentTypes)
  isRecurring?: boolean; // محتوای تکرارشونده (سریالی)
  recurrenceInterval?: 'daily' | 'weekly' | 'monthly'; // تناوب تکرار
  recurrenceCount?: number; // تعداد قسمت/دوره
  targetAudience?: string;
  mediaGoal?: string;

  projectId?: string;
  departmentId?: string;
  departmentIds?: string[];

  ownerId: string; // مسئول اصلی پرونده
  publisherId?: string; // ناشر (مسئول انتشار نهایی)
  creatorId?: string;
  creatorIds?: string[]; // اعضای همکار (تولیدکنندگان)
  editorIds?: string[];
  reviewerIds?: string[]; // بازبین‌ها
  approverId?: string;
  approverIds?: string[]; // تأییدکنندگان

  deadline?: string;
  publishInfo: ContentPublishInfo;

  status: ContentStatus;
  workflowId?: string;
  workflowStageId?: string;
  currentStageId?: string;
  currentStageIndex?: number;

  processTemplateId?: string; // شناسه قالب فرایند
  stages?: ContentStage[]; // مراحل پرونده فرایند تولید

  tags: string[];
  assetIds: string[]; // Connected DAM assets
  attachments?: ContentAttachment[]; // Direct uploaded files/attachments
  taskIds?: string[]; // Connected tasks
  tasks?: any[];

  comments?: ContentComment[];
  history?: ContentHistoryItem[];

  createdAt: string;
  updatedAt: string;
}

export type NotificationType = 'assignment' | 'deadline' | 'status_change' | 'comment' | 'overdue' | 'mention' | 'system' | 'info';

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  timestamp: string;
  linkTaskId?: string;
  linkProjectId?: string;
  linkIdeaId?: string;
  linkContentId?: string;
  linkMeetingId?: string;
  linkLetterId?: string;
  linkResolutionId?: string;
}

export type ActiveView =
  | 'dashboard'
  | 'approvals'
  | 'my-tasks'
  | 'projects'
  | 'project-detail'
  | 'thought-room'
  | 'secretariat'
  | 'assets'
  | 'templates'

  | 'calendar'
  | 'departments'
  | 'department-dashboard'
  | 'content'
  | 'content-detail'
  | 'content-publishing'
  | 'content-published'
  | 'archive'
  | 'activity'
  | 'reports'
  | 'analytics'
  | 'notifications'
  | 'comments'
  | 'messages'
  | 'user-management'
  | 'roles-management'
  | 'user-profile'
  | 'settings';

// ==========================================
// Digital Asset Management (DAM) Types
// ==========================================

export type AssetCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

export type AssetPermissionLevel = 'private' | 'department' | 'project' | 'organization';

export type AssetAccessRight = 'view_only' | 'view_and_download' | 'view' | 'comment' | 'edit' | 'manage' | 'admin';

export type DamSubView =
  | 'all'
  | 'recent'
  | 'my-folders'
  | 'shared'
  | 'project-files'
  | 'favorites'
  | 'trash';

export interface AssetVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  size: number; // in bytes
  sizeFormatted: string;
  url: string;
  thumbnailUrl?: string;
  uploadedBy: string; // userId
  uploadedAt: string;
  changelog: string;
  downloadCount?: number;
}

export interface AssetComment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface AssetActivity {
  id: string;
  userId: string;
  action: string;
  timestamp: string;
  details?: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  projectId?: string;
  departmentId?: string;
  isFavorite?: boolean;
  itemCount?: number;
  sharedWith?: {
    targetId: string;
    targetType: 'user' | 'department';
    targetName?: string;
    access: AssetAccessRight;
  }[];
}

export interface DigitalAsset {
  id: string;
  title: string;
  fileName: string;
  extension: string; // e.g. 'png', 'pdf', 'mp4', 'xlsx', 'zip', 'mp3', 'svg'
  category: AssetCategory;
  mimeType: string;
  size: number; // in bytes
  sizeFormatted: string;
  url: string;
  thumbnailUrl?: string;
  folderId: string | null;
  projectId?: string;
  taskId?: string;
  tags: string[];
  createdBy: string; // userId
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  isTrash: boolean;
  deletedAt?: string;
  permissionLevel: AssetPermissionLevel;
  sharedWith: {
    targetId: string;
    targetType: 'user' | 'department';
    targetName?: string;
    access: AssetAccessRight;
  }[];
  currentVersion: number;
  versions: AssetVersion[];
  comments: AssetComment[];
  activities: AssetActivity[];
  dimensions?: string; // e.g. "1920x1080"
  duration?: string; // e.g. "04:12"
  downloadCount: number;
  description?: string;
  departmentId?: string;
}

// ==========================================
// Internal Messaging & Chat Types
// ==========================================

export type ChatType = 'direct' | 'group' | 'channel';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface ChatReaction {
  emoji: string; // e.g. 👍, ❤️, 😂, 🎉, ✅, ❓
  count: number;
  userIds: string[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  sizeFormatted: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'voice' | 'archive';
  url: string;
  thumbnailUrl?: string;
  duration?: string;
}

export interface TaskReference {
  taskId: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  projectName?: string;
  assigneeName?: string;
}

export interface ProjectReference {
  projectId: string;
  name: string;
  color: string;
  status: ProjectStatus;
  progress: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: string;
  createdAt: string;
  deliveryStatus: MessageDeliveryStatus;
  isEdited?: boolean;
  editedAt?: string;
  isPinned?: boolean;
  isStarred?: boolean;
  replyToMessageId?: string;
  replyToMessage?: {
    id: string;
    senderName: string;
    text: string;
  };
  attachments?: ChatAttachment[];
  taskRef?: TaskReference;
  projectRef?: ProjectReference;
  reactions?: ChatReaction[];
  mentions?: string[];
}

export type ConversationRole = 'owner' | 'admin' | 'member';

export interface ConversationMember {
  userId: string;
  role: ConversationRole;
  joinedAt: string;
  muted?: boolean;
}

export type ChatWritePermission = 'all' | 'admins_only';
export type ChatDeletePermission = 'authors_and_admins' | 'admins_only' | 'all';

export interface Conversation {
  id: string;
  type: ChatType; // 'direct' | 'group' | 'channel'
  name: string;
  avatar?: string;
  color?: string;
  description?: string;
  projectId?: string;
  departmentId?: string;
  members: ConversationMember[];
  memberIds: string[];
  unreadCount?: number;
  lastMessage?: {
    text: string;
    timestamp: string;
    senderId: string;
    senderName: string;
  };
  pinnedMessageIds?: string[];
  isArchived?: boolean;
  isMuted?: boolean;
  writePermission?: ChatWritePermission; // 'all' (پیش‌فرض) یا 'admins_only' (فقط مدیران)
  deletePermission?: ChatDeletePermission; // 'authors_and_admins' | 'admins_only' | 'all'
  createdAt: string;
  updatedAt: string;
}

export type ChatFilterCategory = 'all' | 'direct' | 'group' | 'channel' | 'starred';

// ==========================================
// اتاق فکر (Think Tank / Idea Management) Types
// ==========================================

export type IdeaStatus =
  | 'draft'               // پیش‌نویس
  | 'submitted'           // ثبت‌شده / در انتظار بررسی
  | 'under_review'        // در حال ارزیابی تخصصی
  | 'needs_info'          // نیازمند اطلاعات تکمیلی
  | 'approved'            // تصویب‌شده
  | 'rejected'            // ردشده
  | 'in_progress'         // در حال اجرا
  | 'implemented'        // پیاده‌سازی‌شده
  | 'completed'          // تکمیل‌شده
  | 'archived';          // بایگانی‌شده

export type IdeaVoteOption = 'agree' | 'disagree' | 'needs_investigation';

export interface IdeaVote {
  id: string;
  userId: string;
  option: IdeaVoteOption;
  timestamp: string;
  comment?: string;
}

export interface IdeaCommentReaction {
  emoji: string;
  userIds: string[];
  count: number;
}

export interface IdeaComment {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
  replyToId?: string;
  replyToText?: string;
  replyToAuthor?: string;
  reactions?: IdeaCommentReaction[];
  mentions?: string[];
  assetIds?: string[];
}

export interface IdeaActivity {
  id: string;
  userId: string;
  action: string;
  timestamp: string;
  details?: string;
  type?: 'status_change' | 'comment' | 'vote' | 'conversion' | 'meeting' | 'edit';
}

export interface Idea {
  id: string;
  code: string; // e.g. "IDEA-101"
  title: string;
  description: string;
  problemSolved: string;
  proposedSolution: string;
  creatorId: string;
  departmentId?: string;
  category?: string;
  projectId?: string;
  convertedProjectId?: string;
  convertedTaskId?: string;
  processTemplateId?: string;
  flowStages?: { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' }[];
  priority: Priority;
  status: IdeaStatus;
  tags: string[];
  assetIds: string[]; // DAM attachment ids
  attachments?: MeetingAttachment[];
  comments: IdeaComment[];
  activities: IdeaActivity[];
  votes: IdeaVote[];
  hasPoll: boolean;
  pollQuestion?: string;
  pollOptions?: { id: string; text: string; votes: string[] }[];
  targetDepartment?: string;
  targetAudience?: string; // مخاطب هدف رسانه‌ای
  mediaGoal?: string; // هدف رسانه‌ای
  contentFormat?: string; // قالب محتوا (پست، ویدئو، گزارش، اینفوگرافیک، پادکست...)
  mediaTopic?: string; // موضوع و محور رسانه‌ای
  executionProposal?: string; // پیشنهاد اجرایی
  estimatedBudget?: string;
  estimatedEffort?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThinkTankMeetingAgendaItem {
  id: string;
  title: string;
  durationMinutes?: number;
  presenterId?: string;
  completed: boolean;
  notes?: string;
  relatedIdeaId?: string;
}

export interface MeetingActionItem {
  id: string;
  title: string;
  assigneeId: string;
  deadline: string;
  convertedTaskId?: string;
  status: 'pending' | 'converted' | 'completed';
}

export interface MeetingAttachment {
  id: string;
  name: string;
  size: string;
  url: string;
  uploadedBy?: string;
  uploadedAt?: string;
}

export interface ThinkTankMeeting {
  id: string;
  title: string;
  description?: string;
  date: string; // e.g. "۱۴۰۵/۰۶/۱۵"
  time: string; // e.g. "۱۰:۳۰"
  duration: string; // e.g. "۹۰ دقیقه"
  organizerId: string;
  attendeeIds: string[];
  presentIds?: string[];
  agenda: ThinkTankMeetingAgendaItem[];
  relatedIdeaIds?: string[];
  assetIds?: string[];
  attachments?: MeetingAttachment[];
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  locationType: 'in_person' | 'online' | 'hybrid';
  locationDetails?: string;
  minutesSummary?: string;
  decisions?: string[];
  actionItems?: MeetingActionItem[];
  createdAt: string;
}

// ==========================================
// دبیرخانه (Secretariat / Correspondence) Types
// ==========================================

export type LetterType = 'incoming' | 'outgoing' | 'internal';

export type LetterClassification =
  | 'normal'              // عادی
  | 'confidential'        // محرمانه
  | 'highly_confidential' // خیلی محرمانه
  | 'secret'              // سری
  | 'top_secret';         // به کلی سری

export type LetterUrgency =
  | 'normal'              // عادی
  | 'urgent'              // فوری
  | 'immediate';          // آنی

export type LetterStatus =
  | 'registered'          // ثبت‌شده
  | 'referred'            // ارجاع داده‌شده
  | 'in_progress'         // در حال اقدام
  | 'answered'            // پاسخ داده‌شده
  | 'draft'               // پیش‌نویس (صادره)
  | 'under_review'        // در حال بررسی (صادره)
  | 'approved'            // تأییدشده (صادره)
  | 'sent'                // ارسال‌شده (صادره)
  | 'archived';           // بایگانی‌شده

export type ReferralActionType =
  | 'review'              // جهت بررسی و اظهار نظر
  | 'action'              // جهت اقدام لازم
  | 'response'            // جهت تهیه پاسخ
  | 'info'                // صرفاً جهت استحضار و اطلاع
  | 'followup';           // جهت پیگیری مستمر

export interface LetterReferral {
  id: string;
  letterId: string;
  fromUserId: string;
  toUserId?: string;
  toDepartmentId?: string;
  department?: string;
  actionType: ReferralActionType;
  instructions: string;
  deadline: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  responseNotes?: string;
  completedAt?: string;
  timestamp: string;
  convertedTaskId?: string;
}

export interface LetterWorkflowStep {
  id: string;
  userId: string;
  stageName: string;
  action: string;
  timestamp: string;
  notes?: string;
  status: 'completed' | 'current' | 'pending';
}

export type MediaLetterCategory =
  | 'content_request'     // درخواست تولید محتوا
  | 'design_request'      // درخواست طراحی و گرافیک
  | 'publishing_request'  // درخواست انتشار و پخش
  | 'assignment'          // مأموریت و ارجاع کار رسانه‌ای
  | 'official_letter'     // نامه رسمی اداری
  | 'general';            // عمومی و متفرقه

export interface SecretariatLetter {
  id: string;
  letterNumber: string; // e.g. "وارده: دب-۱۴۰۵/۳۲۰" or "صادره: صاد-۱۴۰۵/۰۸۲"
  indicatNumber?: string; // شماره اندیکاتور
  type: LetterType;
  mediaCategory?: MediaLetterCategory; // دسته‌بندی رسانه‌ای
  subject: string;
  content: string;
  sender: string; // سازمان یا شخص فرستنده
  senderUserId?: string;
  recipient: string; // گیرنده اصلی
  recipientUserId?: string;
  ccList?: string[]; // رونوشت به
  date: string;
  registeredAt: string;
  classification: LetterClassification;
  urgency: LetterUrgency;
  status: LetterStatus;
  responseDeadline?: string;
  relatedLetterId?: string; // عطف به یا پیرو نامه دیگر
  assetIds: string[]; // پیوست‌ها متصل به DAM
  referrals: LetterReferral[];
  workflow: LetterWorkflowStep[];
  archiveDossierId?: string;
  archiveBox?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type ResolutionStatus = 'approved' | 'in_progress' | 'implemented' | 'overdue' | 'cancelled';

export interface SecretariatResolution {
  id: string;
  code: string; // e.g. "مصوبه شماره ۱۴۰۵/۲۲"
  title: string;
  meetingId?: string;
  meetingTitle?: string;
  date: string;
  content: string;
  responsibleUserId: string;
  department?: string;
  deadline: string;
  status: ResolutionStatus;
  taskIds?: string[];
  assetIds?: string[];
  notes?: string;
  createdAt: string;
}

export type ArchiveCategory = 'contracts' | 'financial' | 'administrative' | 'projects' | 'legal' | 'general';

export interface ArchiveDossier {
  id: string;
  code: string; // e.g. "DOS-2026-ADM"
  title: string;
  category: ArchiveCategory;
  location: string; // زونکن / سرور دیجیتال
  confidentiality: LetterClassification;
  letterIds: string[];
  resolutionIds: string[];
  assetIds: string[];
  description?: string;
  retentionYears?: number;
  createdAt: string;
  updatedAt: string;
}

// ── تنظیمات پویای سامانه (همگام با SystemSettingController بک‌اند) ──

export interface GeneralSettings {
  orgName: string;
  workspaceSlug?: string;
  sprintLength: '1 week' | '2 weeks' | '3 weeks' | '4 weeks' | string;
  timezone: string;
  calendar: 'jalali' | 'gregorian' | string;
  /** توضیح اختیاری زیر عنوان ورود؛ مقدار خالی یعنی در صفحهٔ ورود نمایش داده نشود. */
  loginDescription?: string;
  /** رنگ اصلی سامانه (قابل تنظیم از بخش تنظیمات عمومی) */
  themeColor?: string;
  /** فعال بودن ماژول دبیرخانه و کارتابل نامه‌ها */
  secretariatEnabled?: boolean;
}

export interface NotificationSettings {
  deadlineReminders: boolean;
  mentionAlerts: boolean;
}

export interface SecuritySettings {
  twoFactorEnforced?: boolean;
  passwordMinLength: number;
  sessionLifetimeMinutes: number;
  maxLoginAttempts: number;
}

export interface TaskPrioritySetting {
  id: Priority;
  label: string;
  color: string;
  order: number;
}

export interface TaskStatusSetting {
  id: TaskStatus;
  label: string;
  color: string;
  order: number;
}

export interface DamStatusSetting {
  id: string;
  label: string;
  color: string;
  order: number;
}

export interface ContentStatusSetting {
  id: string;
  label: string;
  color: string;
  order: number;
}
