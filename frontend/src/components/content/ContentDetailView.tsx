import { DamLibrary } from '../dam/DamLibrary';
import { resourceUrl } from '../../utils/resourceUrl';
import { Button, FormField, Input, Modal, Select, Textarea } from '../common/Primitives';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';
import { runtime } from '../../config/runtime';
import { RelatedRecords } from '../workspace/RelatedRecords';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { safeReturnTo } from '../../routing/listQuery';
import { ContentStatusBadge, DETAIL_BADGE_CLASS } from '../../utils/statusBadges';
import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { deadlineDaysLabel, deadlineRelativeLabel, deadlineState, formatPersianDate, formatPersianDateTime, formatPersianTime } from '../../utils/date';
import {
  PUBLICATION_ICON_TONE_CLASSES,
  PUBLICATION_SURFACE_TONE_CLASSES,
  PUBLICATION_TEXT_TONE_CLASSES,
  isPublishedContent,
  publicationRemaining,
} from '../../utils/publicationTiming';
import {
  StageAssetSection,
  StageAssetPreviewModal,
  deliveredOutputs as stageDeliveredOutputs,
  inputToAssetView,
  outputToAssetView,
  pendingOutputs as stagePendingOutputs,
  type StageAssetView,
} from './StageAssetSections';
import { damApi } from '../../api/dam';
import { contentsApi } from '../../api/contents';
import { seriesApi } from '../../api/series';
import { apiErrorMessage, parseApiError } from '../../api/errors';
import { request, apiConfig } from '../../api/client';
import { downloadTextAsset } from '../../utils/textAssetDownload';
import { useApp } from '../../context/AppContext';
import { ContentProcessTemplate, ContentStageStatus, ContentStage, ContentStageInput } from '../../types';
import { type FlowStageTask } from './ContentFlowPanel';
import { addCalendarDays, buildStagesFromTemplate, departmentMembers, flowHasStarted, sameId, stageWaitingReason } from '../../utils/contentWorkflow';
import { platformIcon as getPlatformIcon } from '../../utils/platformIcons';
import { dataTableRowValueSummary } from '../../utils/dataTableRows';
import { RowDetailsModal, type DamDataRow, type TableColumn } from '../dam/DamDataTables';
import { DEADLINE_CHIP_TONES, DEADLINE_ICON_TONES } from '../../utils/deadlineTones';
import { Avatar } from '../common/Avatar';
import { InlineSpinner } from '../common/Feedback';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { EditContentModal } from './EditContentModal';
import { EditWorkflowModal } from './EditWorkflowModal';
import { Settings } from 'lucide-react';
import {
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Users,
  Layout,
  MessageSquare,
  Globe,
  MoreVertical,
  Activity,
  Calendar,
  Send,
  Zap,
  Trash2,
  Edit3,
  Check,
  RotateCcw,
  Sparkles,
  Plus,
  Paperclip,
  Download,
  Eye,
  FolderKanban,
  CheckSquare,
  UserCheck,
  XCircle,
  FileCheck,
  Building2,
  UploadCloud,
  ChevronRight,
  ShieldCheck,
  Tag,
  Hash,
  Repeat,
  Layers3,
  ListChecks,
  ArrowRight,
  X,
  Archive,
  Bell,
  BellOff,
  PauseCircle,
  Reply,
  Pencil,
  Save,
  TableProperties,
  Copy,
  ChevronDown,
  Lightbulb,
  Loader2
} from 'lucide-react';

/** یک دستور مجاز چرخهٔ عمر پرونده محتوا. */
interface LifecycleCommand {
  id: 'suspend' | 'cancel' | 'archive' | 'restore' | 'force-delete';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  run: () => void;
}

type LinkedContentAsset = {
  id: number;
  type: 'file' | 'content';
  title: string;
  description?: string | null;
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
  folder?: { id: number; name: string } | null;
  folder_id?: number | null;
  relations?: Array<{
    related_type: string;
    related_id: number;
    relation_type?: string | null;
    stage_id?: string | null;
    output_id?: string | null;
  }>;
};

type LinkedContentAssetPage = {
  data: LinkedContentAsset[];
  current_page: number;
  last_page: number;
  total: number;
};

/** ردیف «جدول اطلاعات» که به همین پرونده وصل شده است (پاسخ مسیر rows-by-task با `content_id`). */
type LinkedContentRow = {
  id: number;
  cells?: Record<string, string>;
  content_id?: number | null;
  can_edit?: boolean;
  data_table?: { id: number; name?: string } | null;
};

/** اندازهٔ فایل با ارقام فارسی؛ برای داده‌های ناقص چیزی نمایش داده نمی‌شود. */
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes.toLocaleString('fa-IR')} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} کیلوبایت`;
  return `${(bytes / 1024 / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} مگابایت`;
};

/** دارایی مخزن را برای پنجرهٔ پیش‌نمایش درون‌صفحه‌ای آماده می‌کند. */
const linkedAssetView = (asset: LinkedContentAsset, label: string): StageAssetView => ({
  id: `linked-${asset.id}`,
  kind: 'output',
  title: asset.title,
  subtitle: label,
  contextLabel: label,
  statusLabel: 'ثبت‌شده در مخزن',
  statusTone: 'ready',
  stageTitle: label,
  description: asset.description || undefined,
  assetId: String(asset.id),
  fileName: asset.latest_file?.original_filename,
  fileSize: formatFileSize(asset.latest_file?.file_size),
});

/**
 * ورودی ارجاع‌شده = خروجی مرحلهٔ قبل که به این مرحله ارجاع شده است. چنین قلمی هم
 * ورودی همین مرحله است و کامل نمایش داده می‌شود؛ این تابع فقط برای برچسب‌گذاری و
 * شمارش «چند ورودی ارجاعی دارد» استفاده می‌شود، نه برای پنهان‌کردن.
 */
const isForwardedStageInput = (input: ContentStageInput): boolean =>
  Boolean(input.sourceStageId || input.sourceOutputId || input.forwardedAt || input.type === 'dependency_stage');

/** همهٔ ورودی‌های اعلام‌شدهٔ یک مرحله — نمایش در کارت خود همان مرحله. */
const stageInputs = (stage: ContentStage): ContentStageInput[] => stage.inputs || [];

/** شمار ورودی‌های ارجاع‌شدهٔ یک مرحله، برای توضیح کوتاه بخش ورودی‌ها. */
const forwardedStageInputCount = (stage: ContentStage): number =>
  stageInputs(stage).filter(input => isForwardedStageInput(input)).length;

/** مراحل تمام‌شده هرگز «در تأخیر» شمرده نمی‌شوند. */
const OPEN_STAGE_STATUSES = ['pending_dependency', 'ready', 'not_started', 'in_progress', 'ready_for_review', 'pending_approval', 'needs_revision', 'revisions_needed'];

const INPUT_ASSET_ROLES = new Set(['initial_input', 'stage_input', 'reference']);
const OUTPUT_ASSET_ROLES = new Set(['stage_output', 'final_output', 'publication_asset']);

export const ContentDetailView: React.FC = () => {
  const {
    pendingMutationKeys, notify,
    contents,
    selectedContentId,
    setSelectedContentId,
    setActiveView, hasPermission,
    setDetailAssetId,
    contentTypes,
    contentStatuses,
    setSelectedProjectId,
    users,
    departments,
    projects,
    publishingPlatforms,
    scheduleContentPublication,
    suspendContent,
    cancelContent,
    archiveContent,
    restoreContent,
    forceDeleteContent,
    publishContentNow,
    publishingContentIds,
    unpublishContent,
    addContentComment,
    editContentComment,
    deleteContentComment,
    assignStageResponsibility,
    updateStageStatus,
    addStageDeliverable,
    removeStageDeliverable,
    forwardStageOutput,
    approveStage,
    rejectStage,
    addContentAttachment,
    deleteContentAttachment,
    processTemplates,
    updateContent,
    tasks,
    setSelectedTaskId,
    lastMutationError,
    currentUser
  } = useApp();

  const navigate = useNavigate();
  const [tabParams,setTabParams] = useSearchParams();
  const activeTab = ['process','attachments','publish','tasks'].includes(tabParams.get('tab') || '') ? tabParams.get('tab')! : 'process';
  const setActiveTab = (tab:string) => {const next=new URLSearchParams(tabParams);next.set('tab',tab);setTabParams(next, { replace: true });};
  const goBack = () => {
    const explicitReturn = tabParams.get('returnTo');
    if (explicitReturn) { navigate(safeReturnTo(explicitReturn, '/contents')); return; }
    if ((window.history.state?.idx ?? 0) > 0) { navigate(-1); return; }
    navigate('/contents');
  };
  const [commentInput, setCommentInput] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [publicationEditOpen, setPublicationEditOpen] = useState(false);
  const [publicationSaving, setPublicationSaving] = useState(false);
  const [publicationDraft, setPublicationDraft] = useState({ publisherId: '', date: '', time: '', caption: '', channels: [] as string[] });
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditWorkflowOpen, setIsEditWorkflowOpen] = useState(false);
  /** بازخورد کوتاه دکمهٔ «کپی کپشن»؛ فقط ظاهری و بدون ذخیره در سرویس. */
  const [captionCopied, setCaptionCopied] = useState(false);
  /** کدام تراشهٔ مسئول/ارزیاب باز است؛ هر بار فقط یکی. */
  const [stagePersonPicker, setStagePersonPicker] = useState<{ stageId: string; field: 'assignee' | 'reviewer' } | null>(null);
  const [stagePersonSaving, setStagePersonSaving] = useState<string | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  // مختصات منوی وضعیت جدا از سربرگ کارت محاسبه می‌شود تا برش نخورد.
  const [statusMenuPos, setStatusMenuPos] = useState<{ top: number; right: number } | null>(null);
  const statusBadgeRef = useRef<HTMLButtonElement>(null);
  const [watching, setWatching] = useState(false);
  const [watchSaving, setWatchSaving] = useState(false);

  // Deliverable modal
  const [selectedStageForDeliverable, setSelectedStageForDeliverable] = useState<ContentStage | null>(null);
  /**
   * آخرین خروجی متنیِ همین مرحله؛ متن بلند در چند بخش نوشته می‌شود و باید
   * بتواند به همان خروجی قبلی افزوده و از همین‌جا ثبت شود.
   */
  const textOutputToAppend = [...(selectedStageForDeliverable?.outputs || [])]
    .reverse()
    .find(output => String(output.value || '').trim().length > 0) || null;
  const [deliverableTitle, setDeliverableTitle] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');
  /**
   * شناسهٔ خروجیِ متنی که این متن به آن **افزوده** می‌شود.
   *
   * متن‌های بلند معمولاً در چند بخش نوشته می‌شوند؛ با این شناسه، همان خروجی
   * به‌روزرسانی می‌شود (نه یک خروجی تازه) و متن یکجا و کامل ثبت می‌ماند.
   */
  const [deliverableAppendTo, setDeliverableAppendTo] = useState<string | null>(null);
  const [deliverableDraft, setDeliverableDraft] = useState(createEmptyAttachmentDraft);
  const [isSavingDeliverable, setIsSavingDeliverable] = useState(false);
  const [rejectSaving,setRejectSaving]=useState(false);
  /** دلیل ناموفق‌بودن «نیازمند اصلاح»؛ پیش‌تر بی‌صدا رد می‌شد. */
  const [rejectError,setRejectError]=useState('');
  const [deliverableError, setDeliverableError] = useState('');
  const [previewStageAsset, setPreviewStageAsset] = useState<StageAssetView | null>(null);
  const [stageActionKey, setStageActionKey] = useState<string | null>(null);
  /**
   * دلیل روشن انجام‌نشدن یک اقدام جریان (یا رد شدن آن از سوی سرور).
   *
   * پیش‌تر دکمه‌های مرحله فقط خاکستری می‌شدند و کاربر نمی‌دانست چرا؛ حالا هر
   * اقدام انجام‌نشده، همان‌جا دلیل خودش را نشان می‌دهد.
   */
  const [stageActionFailure, setStageActionFailure] = useState<{ key: string; title: string; message: string } | null>(null);
  /** وضعیت قطع اتصال ردیف جدول اطلاعات از این پرونده. */
  const [unlinkingRowId, setUnlinkingRowId] = useState<number | null>(null);
  /**
   * مشاهدهٔ کامل یک ردیفِ جدول اطلاعات در همین صفحه: همان مودالی که در
   * «دارایی‌های دیجیتال ← جدول اطلاعات» با کلیک روی ردیف باز می‌شود. ستون‌های
   * جدول همان لحظه از سرور خوانده می‌شوند تا مودال با دادهٔ واقعی باز شود.
   */
  const [rowDetails, setRowDetails] = useState<{ tableId: number; tableName: string; columns: TableColumn[]; row: DamDataRow; canEdit: boolean } | null>(null);
  const [rowDetailsLoadingId, setRowDetailsLoadingId] = useState<number | null>(null);
  const [rowLinkError, setRowLinkError] = useState('');

  // Rejection modal
  const [selectedStageForReject, setSelectedStageForReject] = useState<ContentStage | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionAssigneeId, setCorrectionAssigneeId] = useState('');

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // پروندهٔ جاری: اگر در فهرست بارگذاری‌شده باشد از همان خوانده می‌شود و اگر
  // نباشد (بیش از یک صفحه محتوا، دسترسی محدود، ورود مستقیم با پیوند یا از
  // اعلان‌ها) همان رکورد مستقیم از سرور خوانده می‌شود. بنابراین صفحهٔ جزئیات
  // برای هر پروندهٔ موجودی باز می‌شود و «یافت نشد» فقط واقعاً برای پروندهٔ
  // حذف‌شده یا نبودن دسترسی نمایش داده می‌شود.
  const listedContent = contents.find(c => sameId(c.id, selectedContentId));
  const directContent = useQuery({
    queryKey: ['content', 'detail', String(selectedContentId || '')],
    queryFn: ({ signal }) => contentsApi.get(String(selectedContentId), signal),
    enabled: Boolean(selectedContentId) && !listedContent && !runtime.demoMode && /^\d+$/.test(String(selectedContentId)),
    staleTime: 30_000,
    retry: 1,
  });
  const content = listedContent ?? directContent.data?.data;
  const contentFallbackLoading = directContent.isLoading;
  const linkedSeries = useQuery({
    queryKey: ['content-series', 'detail', content?.seriesId],
    queryFn: () => seriesApi.get(content!.seriesId!),
    enabled: Boolean(content?.seriesId),
    staleTime: 60_000,
  });
  // دارایی‌های پیوست از همان بارگذاری صفحه خوانده می‌شوند تا شمار پیوست‌ها و
  // تب «پیوست‌ها» پیش از باز کردن تب هم درست باشد؛ کلید بر شناسهٔ محتوا است.
  const linkedContentAssets = useQuery({
    queryKey: ['content', content?.id, 'dam-assets'],
    queryFn: () => request<LinkedContentAssetPage>(`/dam/library?content_id=${encodeURIComponent(content!.id)}&per_page=100&sort=created_at&direction=asc`),
    enabled: Boolean(content?.id && !runtime.demoMode && /^\d+$/.test(String(content?.id || ''))),
  });
  /**
   * ردیف‌های «جدول اطلاعات» که به همین پرونده وصل شده‌اند.
   *
   * همان مسیر سرور با `content_id` کار می‌کند؛ ردیف‌های جدول‌های بدون دسترسی در
   * سرور حذف می‌شوند، پس چیزی که نمی‌بینیم واقعاً در دسترس ما نیست.
   */
  const contentLinkedRows = useQuery({
    queryKey: ['content', content?.id, 'dam-data-rows'],
    queryFn: ({ signal }) => request<{ data: LinkedContentRow[]; meta?: { total?: number } }>(`/dam/data-tables/rows-by-task?content_id=${encodeURIComponent(content!.id)}&per_page=50`, { signal }),
    enabled: Boolean(content?.id && !runtime.demoMode && hasPermission('assets.view') && /^\d+$/.test(String(content?.id || ''))),
    staleTime: 30_000,
  });
  // تسک‌های واقعی مراحل همین پرونده؛ مبنای تب «جریان‌های محتوا» برای نشان‌دادن
  // اینکه سرور برای کدام مرحله تسک ساخته و کدام مرحله هنوز در انتظار پیش‌نیاز است.
  const stageTasksQuery = useQuery({
    queryKey: ['content', content?.id, 'stage-tasks'],
    queryFn: ({ signal }) => request<{ data: FlowStageTask[] }>(`/tasks?content_id=${encodeURIComponent(content!.id)}&per_page=100`, { signal }),
    enabled: Boolean(content?.id && !runtime.demoMode && hasPermission('tasks.view') && /^\d+$/.test(String(content?.id || ''))),
    staleTime: 20_000,
  });
  React.useEffect(() => setWatching(Boolean(content?.isWatched)), [content?.id, content?.isWatched]);
  // منوی وضعیت با موقعیت ثابت رندر می‌شود؛ با اسکرول یا تغییر اندازه بسته می‌شود
  // تا مختصات آن از کارت سربرگ جدا بماند و روی داده‌ی کهنه باز نماند.
  React.useEffect(() => {
    if (!statusMenuOpen) return;
    const close = () => setStatusMenuOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [statusMenuOpen]);
  React.useEffect(() => {
    setCommentInput(''); setReplyToId(null); setEditingCommentId(null); setCommentSubmitting(false);
    setPublicationEditOpen(false); setStatusMenuOpen(false);
  }, [content?.id]);
  const toggleWatch = async () => {
    if (!content || watchSaving) return;
    setWatchSaving(true);
    try {
      const response = watching ? await contentsApi.unwatch(content.id) : await contentsApi.watch(content.id);
      setWatching(response.data.watching);
    } finally { setWatchSaving(false); }
  };

  /**
   * دستورهای مجاز چرخهٔ عمر. وضعیت‌های مشتق از جریان تولید اینجا نیستند، چون
   * کاربر آن‌ها را نمی‌نویسد؛ هر دستور یک مجوز سروری جداگانه دارد و پنهان‌سازی
   * دکمه به‌تنها کنترل امنیتی نیست.
   */
  const lifecycleCommands = useMemo(() => {
    const status = content?.status;
    const lifecycle: LifecycleCommand[] = [];
    const archived = status === 'archived';
    const terminal = status === 'published' || status === 'cancelled' || archived;

    if (archived) {
      lifecycle.push({
        id: 'restore', label: 'بازگرداندن به وضعیت قبل', icon: RotateCcw,
        run: () => { void restoreContent(content!.id); },
      });
      if (hasPermission('content.force_delete')) {
        lifecycle.push({
          id: 'force-delete', label: 'حذف نهایی (بازگشت‌ناپذیر)', icon: Trash2, hint: 'مدیر',
          run: () => { void forceDeleteContent(content!.id); },
        });
      }
      return lifecycle;
    }

    if (hasPermission('content.edit') && !terminal) {
      lifecycle.push({ id: 'suspend', label: 'تعلیق موقت', icon: PauseCircle, run: () => { void suspendContent(content!.id); } });
      lifecycle.push({ id: 'cancel', label: 'لغو پرونده', icon: XCircle, run: () => { void cancelContent(content!.id); } });
    }
    if (hasPermission('content.delete') && status !== 'suspended') {
      lifecycle.push({
        id: 'archive', label: 'آرشیو (حذف نرم)', icon: Archive,
        run: () => { void archiveContent(content!.id); },
      });
    }
    if (status === 'suspended' && hasPermission('content.edit')) {
      lifecycle.push({
        id: 'restore', label: 'بازگرداندن به چرخه تولید', icon: RotateCcw,
        run: () => { void restoreContent(content!.id); },
      });
    }

    return lifecycle;
  }, [content?.id, content?.status, hasPermission, suspendContent, cancelContent, archiveContent, restoreContent, forceDeleteContent]);

  if (!content) {
    // تا زمانی که خواندن مستقیم پرونده در جریان است، پیام «یافت نشد» نمایش
    // داده نمی‌شود؛ این حالت پیش‌تر باعث می‌شد کاربر فکر کند صفحه باز نمی‌شود.
    if (contentFallbackLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-500" dir="rtl" role="status" aria-live="polite">
          <InlineSpinner size="lg" className="text-indigo-600" />
          <p className="text-xs font-bold">در حال بارگذاری پروندهٔ محتوا…</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-slate-500" dir="rtl">
        <AlertCircle className="w-12 h-12 text-slate-300" />
        <p className="font-bold text-slate-800">محتوای مورد نظر یافت نشد یا حذف شده است.</p>
        {selectedContentId && <p className="text-[11px] text-slate-400">شناسهٔ درخواستی: <bdi className="font-mono">{selectedContentId}</bdi></p>}
        <p className="max-w-md text-[11px] leading-5 text-slate-500">
          اگر این پرونده در فهرست محتوا دیده می‌شود، یک بار دیگر تلاش کنید؛ پرونده‌های آرشیوشده از بخش «بایگانی» باز می‌شوند.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!runtime.demoMode && /^\d+$/.test(String(selectedContentId || '')) && (
            <Button variant="secondary" onClick={() => void directContent.refetch()}>تلاش مجدد</Button>
          )}
          <Button variant="primary" onClick={goBack}>رفتن به فهرست محتواها</Button>
        </div>
      </div>
    );
  }

  /**
   * دپارتمان مجری: شناسه در payload محتوا نگه داشته می‌شود. اگر پرونده‌ای آن را
   * نداشته باشد (پرونده‌های قدیمی یا ساخته‌شده از مجموعه) از دپارتمان مراحل
   * خوانده می‌شود؛ هیچ دپارتمانی حدس زده یا جعل نمی‌شود.
   */
  const stageDepartment = (content.stages || []).find(stage => stage.departmentId || stage.departmentName);
  const departmentId = content.departmentId || stageDepartment?.departmentId || '';
  const dept = departments.find(d => sameId(d.id, departmentId));
  const departmentFromStages = !content.departmentId && Boolean(stageDepartment);
  const departmentLabel = dept?.name
    || stageDepartment?.departmentName
    || (departmentId ? `دپارتمان شمارهٔ ${departmentId}` : 'دپارتمان تعیین نشده');
  const owner = users.find(u => u.id === content.ownerId);
  const publisher = users.find(u => u.id === content.publisherId);
  const connectedProject = projects.find(p => p.id === content.projectId);
  const connectedSeries = linkedSeries.data?.data;
  const isPublished = isPublishedContent(content);
  const workflowReady = !!content.stages?.length && content.stages.every(stage => ['approved', 'completed', 'skipped'].includes(stage.status));
  /**
   * «مهلت نهایی» پرونده تا وقتی در جریان است ردهٔ رنگی می‌گیرد (کهربایی برای
   * امروز/فردا، بنفش برای گذشته) و پس از انتشار یا تمام‌شدن همهٔ مراحل خنثی
   * می‌شود. مقدار ذخیره‌شدهٔ تاریخ هرگز تغییر نمی‌کند.
   */
  const contentFinished = ['published', 'archived', 'cancelled', 'suspended'].includes(content.status) || workflowReady;
  const contentDeadlineState = deadlineState(content.deadline);
  const contentDeadlineDelayed = !contentFinished && ['past', 'today', 'soon'].includes(contentDeadlineState.tier);
  const contentDeadlineTone = !contentDeadlineDelayed
    ? 'border-slate-100 bg-slate-50/70'
    : contentDeadlineState.tier === 'past' ? 'border-violet-200 bg-violet-50/70' : 'border-amber-200 bg-amber-50/70';
  const contentDeadlineTextTone = !contentDeadlineDelayed
    ? 'text-slate-800'
    : contentDeadlineState.tier === 'past' ? 'text-violet-700' : 'text-amber-800';
  /** «چند روز مانده» برای مهلت نهایی؛ فقط روز، بدون ساعت. */
  const contentDeadlineLabel = contentFinished ? '' : deadlineDaysLabel(contentDeadlineState);
  /**
   * فاصلهٔ دقیق تا انتشار (روز و ساعت) از همان قرارداد مشترک فهرست‌ها و میز
   * انتشار؛ بدون تاریخ ثبت‌شده هیچ عددی ساخته نمی‌شود.
   */
  const publicationState = publicationRemaining(content.publishInfo, { published: isPublished });
  const publicationBoxTone = PUBLICATION_SURFACE_TONE_CLASSES[publicationState?.tone ?? 'unknown'];
  const publicationTextTone = PUBLICATION_TEXT_TONE_CLASSES[publicationState?.tone ?? 'unknown'];
  const publicationIconTone = PUBLICATION_ICON_TONE_CLASSES[publicationState?.tone ?? 'unknown'];
  const canManageContentWorkflow = currentUser.role === 'admin' || hasPermission('content.workflow.manage');
  /**
   * تغییر فرد مسئول یا ارزیاب یک مرحله، بدون بازکردن پنجرهٔ ویرایش جریان.
   * دارندگان مدیریت جریان و «مدیر محتوا» این کار را مستقیم انجام می‌دهند؛ سرور
   * هم همین دو گروه را برای تغییر همین دو فیلد می‌پذیرد.
   */
  const canAssignStagePeople = canManageContentWorkflow || currentUser.role === 'content_manager';
  /** مجوز ساختن دارایی تازه در مخزن مرکزی؛ بدون آن هم ثبت خروجی پیوند/یادداشت ممکن است. */
  const canUploadToDam = hasPermission('assets.upload');

  const stages = content.stages || [];
  /**
   * پیوند مستقیم ثبت خروجی: `/contents/:id?tab=process&output=<stageId>` از
   * باکس «وظیفه‌های محتوا» در کارتابل می‌آید و مدال ثبت خروجی همان مرحله را یک
   * بار باز می‌کند؛ نشانی پس از باز شدن پاک می‌شود تا بازگشت یا تازه‌سازی،
   * مدال را دوباره باز نکند.
   */
  React.useEffect(() => {
    const requested = tabParams.get('output');
    if (!requested || !content?.id || !stages.length) return;
    const stage = stages.find(item => sameId(item.id, requested));
    if (!stage) return;
    setSelectedStageForDeliverable(stage);
    const next = new URLSearchParams(tabParams);
    next.delete('output');
    setTabParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParams, content?.id, stages.length]);
  const completedStages = stages.filter(stage => ['approved', 'completed', 'skipped'].includes(stage.status)).length;
  const workflowProgress = stages.length ? Math.round((completedStages / stages.length) * 100) : 0;
  /**
   * مراحل ناتمامی که از مهلت خود گذشته‌اند. سرور از همین مهلت‌ها وضعیت مشتق
   * «تأخیر» را می‌سازد؛ اگر وضعیت پرونده هنوز به‌روز نشده باشد (پیش از نخستین
   * بازبینی سرور) همان واقعیت در سربرگ نشان داده می‌شود، نه وضعیت جعلی.
   */
  const overdueOpenStages = stages.filter(stage =>
    OPEN_STAGE_STATUSES.includes(stage.status) && Boolean(stage.deadline) && deadlineState(stage.deadline).tier === 'past');
  const platformConfig = (platformId: string) => publishingPlatforms.find(platform => platform.id === platformId);
  const platformLabel = (platformId: string) => platformConfig(platformId)?.name || ({ website: 'وب‌سایت', instagram: 'اینستاگرام', telegram: 'تلگرام', bale: 'بله', eitaa: 'ایتا', rubika: 'روبیکا', youtube: 'یوتیوب', linkedin: 'لینکدین', twitter: 'ایکس', x: 'ایکس' } as Record<string, string>)[platformId] || platformId;
  const platformAppearance = (platformId: string) => {
    const config = platformConfig(platformId);
    return {
      color: /^#[0-9a-f]{6}$/i.test(config?.color || '') ? config!.color : '#4f46e5',
      backgroundColor: /^#[0-9a-f]{6}$/i.test(config?.bg || '') ? config!.bg : '#eef2ff',
    };
  };

  const openPublicationEdit = () => {
    setPublicationDraft({
      publisherId: content.publisherId || '',
      date: content.publishInfo?.date || '',
      time: content.publishInfo?.time || '',
      caption: content.publishInfo?.caption || '',
      channels: content.publishInfo?.channels || [],
    });
    setPublicationEditOpen(true);
  };
  const submitPublicationSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (publicationSaving || !publicationDraft.date || !publicationDraft.time || publicationDraft.channels.length === 0) return;
    setPublicationSaving(true);
    try {
      await scheduleContentPublication(content.id, {
        publisherId: publicationDraft.publisherId || null,
        publishInfo: {
          date: publicationDraft.date,
          time: publicationDraft.time,
          channels: publicationDraft.channels,
          caption: publicationDraft.caption.trim(),
          status: content.status === 'ready_to_publish' || content.publishInfo?.status === 'ready' ? 'ready' : 'planned',
        },
      });
      notify({ type: 'success', title: 'تنظیمات انتشار ذخیره شد' });
      setPublicationEditOpen(false);
    } catch (error) {
      notify({ type: 'error', title: 'تنظیمات انتشار ذخیره نشد', message: apiErrorMessage(error) });
    } finally { setPublicationSaving(false); }
  };
  /**
   * کپی متن کپشن در کلیپ‌بورد. متن از همان `publishInfo.caption` واقعی خوانده
   * می‌شود و اگر مرورگر اجازهٔ کلیپ‌بورد نداد، پیام روشن نشان داده می‌شود؛ هیچ
   * متن ساختگی جایگزین نمی‌شود.
   */
  const copyCaption = async () => {
    const caption = String(content.publishInfo?.caption || '').trim();
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCaptionCopied(true);
      window.setTimeout(() => setCaptionCopied(false), 1800);
      notify({ type: 'success', title: 'کپشن کپی شد', message: 'متن کپشن در حافظهٔ موقت دستگاه قرار گرفت.', dedupeKey: `caption-copy-${content.id}` });
    } catch {
      notify({ type: 'error', title: 'کپی خودکار ممکن نبود', message: 'متن کپشن را انتخاب و با صفحه‌کلید کپی کنید.' });
    }
  };
  /**
   * دانلود خروجی‌های ثبت‌شدهٔ محتوا.
   *
   * هر خروجی بر پایهٔ نوعش دریافت می‌شود: داراییِ مخزن با همان مسیر دانلودِ
   * دارایی‌ها، پیوند با بازکردن نشانی و متنِ آزاد به‌صورت پروندهٔ متنی. خروجی‌ای
   * که ردیف جدول اطلاعات است فایلی برای دریافت ندارد و نمی‌آید.
   */
  const publishOutputs = (content.stages || []).flatMap(stage => (stage.outputs || []).map(output => ({ stage: stage.title, ...output })));
  const [downloadingOutputs, setDownloadingOutputs] = useState(false);
  const downloadOutput = async (output: Record<string, any>) => {
    const assetId = typeof output.assetId === 'string' && /^\d+$/.test(output.assetId) ? output.assetId : '';
    if (assetId) {
      const response = await fetch(`${apiConfig.baseUrl}/dam/library/${assetId}/download`, { credentials: 'include', headers: { Accept: 'application/octet-stream' } });
      if (!response.ok) throw new Error(`دریافت فایل ناموفق بود (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = String(output.fileName || output.title || `خروجی-${assetId}`);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }
    if (typeof output.url === 'string' && /^https?:\/\//i.test(output.url)) {
      window.open(output.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const text = String(output.value || '').trim();
    if (text) {
      await downloadTextAsset(String(output.title || output.fileName || `خروجی محتوا ${content.code || ''}`.trim()), `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`, 'txt');
      return;
    }
    throw new Error('برای این خروجی فایل یا متنی ثبت نشده است.');
  };
  const downloadAllOutputs = async () => {
    if (downloadingOutputs || !publishOutputs.length) return;
    setDownloadingOutputs(true);
    let failed = 0;
    for (const output of publishOutputs) {
      try {
        await downloadOutput(output);
        // فاصلهٔ کوتاه بین دانلودها تا مرورگر همهٔ آن‌ها را مسدود نکند.
        await new Promise(resolve => window.setTimeout(resolve, 250));
      } catch {
        failed += 1;
      }
    }
    setDownloadingOutputs(false);
    if (failed > 0) notify({ type: 'error', title: 'برخی خروجی‌ها دریافت نشدند', message: `${failed.toLocaleString('fa-IR')} خروجی از ${publishOutputs.length.toLocaleString('fa-IR')} خروجی دریافت نشد؛ خروجی‌هایی که ردیف جدول اطلاعات هستند فایلی ندارند و در خود جدول دیده می‌شوند.`, dedupeKey: `outputs-download-${content.id}` });
    else notify({ type: 'success', title: 'خروجی‌ها دریافت شدند', message: `${publishOutputs.length.toLocaleString('fa-IR')} خروجی روی دستگاه شما ذخیره شد.`, dedupeKey: `outputs-download-${content.id}` });
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim() || commentSubmitting || pendingMutationKeys.includes(`contents:${content.id}`)) return;
    setCommentSubmitting(true);
    try {
      const saved = editingCommentId
        ? await editContentComment(content.id, editingCommentId, commentInput.trim())
        : await addContentComment(content.id, commentInput.trim(), replyToId || undefined);
      if (saved) { setCommentInput(''); setReplyToId(null); setEditingCommentId(null); }
    } finally { setCommentSubmitting(false); }
  };
  const formatCommentDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'زمان نامشخص' : new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  };

  /**
   * دلیل دقیق آخرین فرمان ناموفق همین پرونده.
   *
   * `updateContent`/`applyContentChange` فقط `false` برمی‌گردانند (توست خطا در
   * جای دیگری نمایش داده می‌شود)، پس برای متن داخل فرم همان خطای ثبت‌شده در
   * `lastMutationError` خوانده می‌شود تا پیام مبهم «ذخیره نشد» تکرار نشود.
   */
  const commandFailure = (fallback: string): string => {
    const failure = lastMutationError(`contents:${content.id}`);
    return failure ? apiErrorMessage(failure, fallback) : fallback;
  };

  /** برچسب فارسی هر اقدام جریان برای پیام خطا («شروع مرحله «X» انجام نشد»). */
  const stageActionLabel = (key: string): string => {
    const [verb, stageId] = key.split(':');
    const stage = stages.find(item => sameId(item.id, stageId));
    const labels: Record<string, string> = {
      start: 'شروع مرحله', submit: 'ارسال مرحله برای ارزیابی', approve: 'تأیید مرحله',
      revise: 'شروع اصلاحات', forward: 'ارجاع خروجی', remove: 'حذف خروجی',
    };
    return `${labels[verb] || 'اقدام جریان'}${stage ? ` «${stage.title}»` : ''}`;
  };

  /** دلیل انجام‌نشدن را در همان صفحه نشان می‌دهد؛ هیچ اقدامی بی‌توضیح رد نمی‌شود. */
  const reportStageActionFailure = (key: string, message: string) => {
    setStageActionFailure({ key, title: `${stageActionLabel(key)} انجام نشد`, message });
  };

  /** چرا این کاربر اجازهٔ اقدام روی مراحل این پرونده را ندارد. */
  const editRefusal = (): string => (content.access?.edit ?? hasPermission('content.edit'))
    ? ''
    : 'برای اقدام روی مراحل این پرونده، مجوز ویرایش محتوا لازم است.';

  /** چرا «شروع/تکمیل» این مرحله از این کاربر برنمی‌آید. */
  const assigneeRefusal = (stage: ContentStage, action: string): string => {
    if (sameId(currentUser.id, stage.assigneeId)) return '';
    const assignee = users.find(user => sameId(user.id, stage.assigneeId));
    return assignee
      ? `«${action}» فقط از مسئول همین مرحله برمی‌آید؛ مسئول فعلی این مرحله «${assignee.name}» است. ثبت خروجی مرحله برای مدیر پرونده هم باز است.`
      : `«${action}» فقط از مسئول همین مرحله برمی‌آید و برای این مرحله مسئولی تعیین نشده است؛ از «ویرایش جریان و مراحل» مسئول مرحله را تعیین کنید.`;
  };

  /**
   * چرا مرحله هنوز فعال نشده است.
   *
   * همان قرارداد مشترک جریان (`stageWaitingReason`) که پنل «جریان‌های محتوا» هم
   * استفاده می‌کند؛ متن دوم فقط برای تفاوت گویش فارسی همین‌جا ساخته می‌شود.
   */
  const prerequisiteRefusal = (stage: ContentStage): string => {
    const waiting = stageWaitingReason(stages, stage);
    return waiting ? `${waiting}؛ تا آن زمان این اقدام انجام نمی‌شود.` : '';
  };

  /**
   * ثبت خروجی برای چه کسانی باز است؟
   *
   * مسئول همان مرحله، مدیر پرونده، دارندهٔ «مدیریت جریان محتوا» و هر کسی که سرور
   * ویرایش این پرونده را برایش مجاز دانسته (`content.access.edit`). سرور هم همین
   * دامنه را می‌پذیرد (`ContentAccess::guardEdit`)، پس مدیر محتوا از ثبت خروجی
   * کنار گذاشته نمی‌شود.
   */
  const canDepositOutput = (stage: ContentStage): boolean =>
    sameId(currentUser.id, stage.assigneeId)
    || sameId(currentUser.id, content.ownerId)
    || currentUser.role === 'admin'
    || hasPermission('content.workflow.manage')
    || (content.access?.edit ?? hasPermission('content.edit'));

  /**
   * متن خروجی‌ای که دارایی مخزن ندارد، همان‌جا در جریان ذخیره می‌شود؛ متن ساده
   * ذخیره می‌شود تا کارت‌ها و پیگیری‌ها همان چیزی را نشان دهند که کاربر نوشته است.
   */
  const saveOutputText = async (view: StageAssetView, plainText: string) => {
    const stage = stages.find(item => sameId(item.id, view.stageId || ''));
    if (!stage || !view.outputId) throw new Error('این خروجی دیگر در جریان این پرونده نیست؛ صفحه را تازه کنید.');
    if (!canDepositOutput(stage)) throw new Error('ویرایش متن خروجی این مرحله برای شما مجاز نیست.');
    const saved = await addStageDeliverable(content.id, stage.id, view.outputId, { value: plainText });
    if (!saved) throw new Error(commandFailure('ذخیرهٔ متن خروجی انجام نشد؛ دلیل خطا در پیام سرور آمده است.'));
  };

  const runStageAction = async (key: string, action: () => Promise<unknown>) => {
    if (stageActionKey) {
      reportStageActionFailure(key, 'یک اقدام دیگر همین حالا در جریان است؛ پس از پایان آن دوباره تلاش کنید.');
      return;
    }
    if (pendingMutationKeys.includes(`contents:${content.id}`)) {
      reportStageActionFailure(key, 'این پرونده در حال ذخیره است؛ پس از پایان ذخیره دوباره تلاش کنید.');
      return;
    }
    setStageActionKey(key);
    setStageActionFailure(null);
    try {
      const result = await action();
      // فرمان‌های جریان در ناکامی `false` برمی‌گردانند؛ دلیل واقعی سرور در
      // `lastMutationError` ثبت شده است و همان‌جا نمایش داده می‌شود.
      if (result === false) {
        reportStageActionFailure(key, commandFailure('دلیل دقیق از سرور دریافت نشد؛ وضعیت مرحله، مسئول آن و پایان پیش‌نیازها را بررسی کنید.'));
      }
    } catch (error) {
      // خطای پرتاب‌شده (مثلاً قطع شبکه یا پیام اعتبارسنجی) دیگر در سکوت نمی‌ماند.
      console.error('Content workflow action failed.', error);
      reportStageActionFailure(key, apiErrorMessage(error, 'اقدام انجام نشد؛ پیام خطا را بررسی کنید.'));
    } finally {
      setStageActionKey(null);
    }
  };

  /**
   * قطع اتصال یک ردیف جدول اطلاعات از این پرونده.
   *
   * سرور با `content_id: null` همین را می‌پذیرد؛ ردیف و داده‌هایش حذف نمی‌شود و
   * فقط پیوند برمی‌گردد. بدون مجوز ویرایش همان جدول، دکمه نمایش داده نمی‌شود.
   */
  const unlinkContentRow = async (row: LinkedContentRow) => {
    if (!row.data_table?.id || row.can_edit === false || unlinkingRowId) return;
    if (!confirm('اتصال این ردیف جدول از این پرونده قطع شود؟ ردیف و داده‌های آن حذف نمی‌شود.')) return;
    setUnlinkingRowId(row.id);
    setRowLinkError('');
    try {
      await request(`/dam/data-tables/${row.data_table.id}/rows/${row.id}`, { method: 'PATCH', body: { content_id: null } });
      await contentLinkedRows.refetch();
      notify({ type: 'success', title: 'اتصال ردیف جدول اطلاعات از این پرونده قطع شد.' });
    } catch (error) {
      setRowLinkError(apiErrorMessage(error, 'قطع اتصال ردیف جدول انجام نشد.'));
    } finally {
      setUnlinkingRowId(null);
    }
  };

  /**
   * «مشاهدهٔ کامل ردیف» در تب فایل‌ها: جدول و ردیف از سرور خوانده می‌شوند و
   * همان مودالِ ردیف‌های جدول اطلاعات (با تاریخچه و ویرایش سلول‌ها) باز می‌شود.
   */
  const openLinkedRowDetails = async (row: LinkedContentRow) => {
    const tableId = Number(row.data_table?.id);
    if (!Number.isInteger(tableId) || tableId <= 0 || rowDetailsLoadingId) return;
    setRowDetailsLoadingId(row.id);
    setRowLinkError('');
    try {
      const result = await request<{ data: { name?: string; columns?: TableColumn[]; pinned_rows?: DamDataRow[]; can_edit?: boolean } }>(
        `/dam/data-tables/${tableId}?per_page=1&row_ids[0]=${row.id}`,
      );
      const pinned = result.data?.pinned_rows || [];
      const full = pinned.find(item => item.id === row.id) || null;
      if (!full) throw new Error('این ردیف در جدول پیدا نشد.');
      setRowDetails({
        tableId,
        tableName: result.data?.name || row.data_table?.name || 'جدول اطلاعات',
        columns: result.data?.columns || [],
        row: { ...full, content_id: full.content_id ?? (Number(content?.id) || null) },
        canEdit: result.data?.can_edit !== false && row.can_edit !== false,
      });
    } catch (error) {
      setRowLinkError(apiErrorMessage(error, 'نمایش کامل ردیف انجام نشد.'));
    } finally {
      setRowDetailsLoadingId(null);
    }
  };

  const handleAddDeliverableSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStageForDeliverable || isSavingDeliverable) return;
    const draftCount = attachmentDraftCount(deliverableDraft);
    // متن خروجی به‌تنهایی هم کافی است: پیش‌تر عنوان اجباری بود و ثبت متنِ
    // طولانی بدون عنوان با خطا برمی‌گشت.
    if (!draftCount && !deliverableTitle.trim() && !deliverableNotes.trim() && !deliverableUrl.trim()) {
      setDeliverableError('یک فایل، پیوند، عنوان یا متن خروجی وارد کنید.');
      return;
    }
    if (draftCount && !canUploadToDam) {
      // ثبت خروجی به مجوز مخزن گره نمی‌خورد؛ اما ساخت دارایی و ردیف جدول بدون
      // آن مجاز نیست، پس مسیر درست همان‌جا پیشنهاد می‌شود.
      const tableOnly = !deliverableDraft.files.length && !deliverableDraft.texts.length && !deliverableDraft.assets.length;
      setDeliverableError(tableOnly
        ? 'ساخت یا اتصال ردیف جدول در مخزن به مجوز بارگذاری دارایی نیاز دارد؛ برای ثبت خروجی، از «پیوند دسترسی یا دانلود» و «توضیحات تکمیلی» استفاده کنید.'
        : 'برای ثبت فایل یا دارایی در مخزن، مجوز بارگذاری دارایی لازم است؛ با «پیوند دسترسی یا دانلود» و «توضیحات تکمیلی» هم می‌توانید خروجی را ثبت کنید.');
      return;
    }

    setIsSavingDeliverable(true);
    setDeliverableError('');
    try {
      // مرحلهٔ هدف باید همین حالا در جریان همین پرونده باشد: اگر جریان دوباره
      // اعمال یا بازسازی شده باشد، شناسهٔ قدیمی دیگر در پرونده نیست و ثبت در
      // مخزن با ۴۲۲ («مرحلهٔ انتخابی متعلق به این محتوا نیست») رد می‌شد و فایل
      // بی‌صاحب در مخزن می‌ماند. این بررسی پیش از بارگذاری انجام می‌شود.
      const targetStage = stages.find(stage => sameId(stage.id, selectedStageForDeliverable.id));
      if (!targetStage) throw new Error('مرحلهٔ انتخابی دیگر در جریان این پرونده نیست؛ صفحه را تازه کنید و از مرحلهٔ فعلی خروجی ثبت کنید.');
      const externalUrl = deliverableUrl.trim();
      const description = deliverableNotes.trim();
      if (externalUrl && !resourceUrl(externalUrl)) throw new Error('پیوند باید HTTP یا HTTPS معتبر باشد.');
      const persisted = draftCount
        ? await persistAttachmentDraft(deliverableDraft, { contentId: content.id, projectId: content.projectId || undefined, contentBucket: 'outputs', relationRole: 'stage_output', stageId: targetStage.id }, targetStage.title)
        : [];

      if (persisted.length) {
        for (const asset of persisted) {
          const saved = await addStageDeliverable(content.id, targetStage.id, `out-${asset.type}-${asset.assetId}`, {
            title: deliverableTitle.trim() || asset.name,
            assetId: asset.type === 'data_table' ? undefined : String(asset.assetId),
            assetVersionId: asset.assetVersionId ? String(asset.assetVersionId) : undefined,
            assetVersionNumber: asset.assetVersionNumber,
            fileName: asset.type === 'file' ? asset.name : undefined,
            fileSize: asset.size ? `${(asset.size / 1024 / 1024).toFixed(2)} MB` : undefined,
            url: externalUrl || asset.previewUrl || undefined,
            value: asset.type === 'data_table' ? [description, `جدول اطلاعات شماره ${asset.dataTableId}`].filter(Boolean).join(' — ') : description || undefined,
            // خروجی‌ای که خودش ردیفی از جدول اطلاعات است، شناسهٔ جدول و ردیف‌ها را
            // همراه می‌برد؛ پیش‌نمایش همان ردیف را نشان می‌دهد و «رفتن به جدول»
            // از داخل مدال ممکن می‌شود.
            dataTableId: asset.type === 'data_table' && asset.dataTableId ? String(asset.dataTableId) : undefined,
            dataTableName: asset.type === 'data_table' ? asset.name : undefined,
            rowIds: asset.type === 'data_table' ? (asset.rowIds || []).map(String) : undefined,
            rowLabels: asset.type === 'data_table' ? asset.rowLabels : undefined,
          });
          if (!saved) throw new Error(commandFailure('اتصال یکی از خروجی‌ها به مرحله ذخیره نشد؛ دوباره بررسی کنید.'));
        }
      } else if (deliverableAppendTo && !externalUrl) {
        // افزودن به متن خروجی قبلی: همان شناسه به‌روزرسانی می‌شود تا متنِ
        // چندبخشی یک خروجی بماند و «ثبت» از همان‌جا انجام شود.
        const saved = await addStageDeliverable(content.id, targetStage.id, deliverableAppendTo, {
          title: deliverableTitle.trim() || undefined,
          value: description,
        });
        if (!saved) throw new Error(commandFailure('افزودن متن به خروجی قبلی ذخیره نشد؛ دوباره تلاش کنید.'));
      } else {
        const note = { title: deliverableTitle.trim(), url: externalUrl || undefined, value: description || undefined };
        let stored = false;
        if (canUploadToDam) {
          try {
            const body = [externalUrl ? `پیوند خروجی: ${externalUrl}` : '', description].filter(Boolean).join('\n\n') || deliverableTitle.trim();
            const response = await damApi.library.createText({ title: deliverableTitle.trim(), contentId: content.id, contentBucket: 'outputs', relationRole: 'stage_output', stageId: targetStage.id, body, description: description || undefined });
            const asset = response.data;
            stored = await addStageDeliverable(content.id, targetStage.id, `out-${asset.id}`, {
              title: deliverableTitle.trim(), assetId: String(asset.id), url: externalUrl || damApi.library.previewUrl(asset.id), value: description || undefined,
            });
          } catch (assetError) {
            console.warn('Creating the text asset for the stage output failed; keeping the output inside the flow.', assetError);
          }
        }
        // ثبت خروجی هرگز به سلامت مخزن گره نمی‌خورد: مدیر محتوا همیشه می‌تواند
        // پیوند/یادداشت خروجی را در خود جریان ثبت کند؛ در این حالت هیچ دارایی‌ای
        // در مخزن ساخته نمی‌شود و همان‌جا هم گفته می‌شود.
        if (!stored) {
          const saved = await addStageDeliverable(content.id, targetStage.id, `out-note-${Date.now()}`, note);
          if (!saved) throw new Error(commandFailure('ثبت خروجی مرحله ذخیره نشد؛ دلیل خطا در پیام سرور آمده است.'));
        }
      }
      if (targetStage.reviewRequired === false) {
        await updateStageStatus(content.id, targetStage.id, 'completed');
      } else if (targetStage.status === 'in_progress') {
        // با ثبت اولین خروجی، وضعیت مرحله به آماده برای ارسال تغییر کند.
        const alreadyHasOutput = (targetStage.outputs || []).some(o => Boolean(o.isDelivered || o.value || o.url || o.assetId || o.fileName));
        if (!alreadyHasOutput) {
          await updateStageStatus(content.id, targetStage.id, 'ready_for_review');
        }
      }
      setSelectedStageForDeliverable(null);
      setDeliverableTitle(''); setDeliverableUrl(''); setDeliverableNotes(''); setDeliverableAppendTo(null);
      setDeliverableDraft(createEmptyAttachmentDraft());
    } catch (error) {
      console.error('Registering workflow output in DAM failed.', error);
      setDeliverableError(apiErrorMessage(error, 'ثبت خروجی در مخزن مرکزی انجام نشد.'));
    } finally {
      setIsSavingDeliverable(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStageForReject || !rejectReason.trim() || rejectSaving) return;
    setRejectSaving(true);
    setRejectError('');
    try {
      const done = await rejectStage(content.id, selectedStageForReject.id, rejectReason.trim(), correctionAssigneeId || undefined);
      if (done) { setSelectedStageForReject(null); setRejectReason(''); setCorrectionAssigneeId(''); }
      else setRejectError(commandFailure('ثبت بازبینی انجام نشد؛ وضعیت مرحله و ارزیاب آن را بررسی کنید.'));
    } catch (error) {
      console.error('Requesting stage revision failed.', error);
      setRejectError(apiErrorMessage(error, 'ثبت بازبینی انجام نشد؛ دوباره تلاش کنید.'));
    } finally { setRejectSaving(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const newAtt = {
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
        type: file.type || 'application/octet-stream',
        url: URL.createObjectURL(file),
        uploadedBy: currentUser.name,
        uploadedAt: new Date().toLocaleDateString('fa-IR')
      };
      addContentAttachment(content.id, newAtt);
    }
  };

  const getStageStatusBadge = (status: ContentStageStatus, readyForStart = false, reviewRequired = true) => {
    switch (status) {
      case 'completed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" />{reviewRequired ? 'تأییدشده و نهایی' : 'تکمیل‌شده'}</span>;
      case 'approved':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> تأییدشده و نهایی</span>;
      case 'skipped':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200"><Check className="w-3.5 h-3.5" /> عبور داده‌شده</span>;
      case 'ready_for_review':
      case 'pending_approval':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"><FileCheck className="w-3.5 h-3.5" /> در انتظار بررسی مدیر</span>;
      case 'in_progress':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"><Activity className="w-3.5 h-3.5 animate-pulse" /> در حال انجام</span>;
      case 'needs_revision':
      case 'revisions_needed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"><RotateCcw className="w-3.5 h-3.5" /> نیازمند بازبینی و اصلاح</span>;
      case 'pending_dependency':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> در انتظار مرحله قبل</span>;
      case 'ready':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"><Sparkles className="w-3.5 h-3.5" /> آماده شروع</span>;
      default:
        return readyForStart
          ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"><Sparkles className="w-3.5 h-3.5" /> آماده شروع</span>
          : <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">شروع‌نشده</span>;
    }
  };

  const contentTypeBadge = <span className={`${DETAIL_BADGE_CLASS} font-black`} style={{ color: contentTypes.find(type => type.id === content.type)?.color || '#4f46e5', backgroundColor: `${contentTypes.find(type => type.id === content.type)?.color || '#4f46e5'}18`, borderColor: `${contentTypes.find(type => type.id === content.type)?.color || '#4f46e5'}45` }}>
    {contentTypes.find(type => type.id === content.type)?.name || content.type}
  </span>;
  /**
   * منوی دستورهای پرونده جدا از کارت سربرگ (روی document.body) رندر می‌شود تا
   * برش‌خوردن با overflow کارت رخ ندهد؛ مختصات از خود نشانگر اندازه‌گیری می‌شود.
   */
  const toggleStatusMenu = () => {
    const next = !statusMenuOpen;
    if (next) {
      const rect = statusBadgeRef.current?.getBoundingClientRect();
      setStatusMenuPos(rect
        ? { top: Math.round(rect.bottom + 6), right: Math.round(Math.max(8, window.innerWidth - rect.right)) }
        : null);
    }
    setStatusMenuOpen(next);
  };
  const statusControl = <div className="inline-block">
    <button ref={statusBadgeRef} type="button" onClick={toggleStatusMenu} aria-haspopup="menu" aria-expanded={statusMenuOpen} title="دستورهای پرونده محتوا" className="cursor-pointer rounded-xl transition-all hover:ring-2 hover:ring-indigo-200">
      <ContentStatusBadge status={content.status} size="md" />
    </button>
    {statusMenuOpen && createPortal(<>
      <div className="fixed inset-0 z-40 cursor-default" onClick={() => setStatusMenuOpen(false)} />
      <div
        role="menu"
        dir="rtl"
        style={{ position: 'fixed', top: statusMenuPos?.top ?? 0, right: statusMenuPos?.right ?? 8 }}
        className="z-50 w-[248px] max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 bg-white py-1.5 text-right shadow-xl"
      >
        <p className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400">{lifecycleCommands.length > 0 ? 'دستورهای پرونده:' : 'برای این وضعیت دستوری ثبت نشده است'}</p>
        <div className="max-h-64 overflow-y-auto">{lifecycleCommands.map(command => <button key={command.id} type="button" onClick={() => { setStatusMenuOpen(false); command.run(); }} disabled={command.disabled} className={`flex w-full items-center gap-2 px-3.5 py-2 text-right text-xs font-bold transition-colors ${command.disabled ? 'cursor-not-allowed text-slate-300' : 'cursor-pointer text-slate-700 hover:bg-slate-50'}`}><command.icon className="h-3.5 w-3.5 shrink-0" /><span>{command.label}</span>{command.hint && <span className="mr-auto text-[10px] font-bold text-slate-400">{command.hint}</span>}</button>)}</div>
        <p className="mt-1 border-t border-slate-100 px-3.5 pb-1 pt-1.5 text-[10px] font-bold leading-4 text-slate-400">وضعیت تولید، بازبینی، اصلاح و تأخیر را جریان محتوا تعیین می‌کند.</p>
      </div>
    </>, document.body)}
  </div>;

  const contentComments = content.comments || [];
  const knownCommentIds = new Set(contentComments.map(comment => comment.id));
  const rootComments = contentComments.filter(comment => !comment.replyToId || !knownCommentIds.has(comment.replyToId));
  const renderComment = (comment: (typeof contentComments)[number], depth = 0): React.ReactNode => {
    const author = users.find(user => user.id === comment.userId);
    const children = contentComments.filter(item => item.replyToId === comment.id);
    const own = comment.userId === currentUser.id;
    return <div key={comment.id} className={depth > 0 ? 'mr-5 border-r-2 border-indigo-100 pr-3 sm:mr-8' : ''}>
      <article className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Avatar user={author || { id: comment.userId, name: comment.userName, avatar: comment.userAvatar }} size="xs" /><span className="truncate text-xs font-black text-slate-800">{comment.userName || author?.name || 'کاربر'}</span></div><time dateTime={comment.createdAt} className="shrink-0 font-sans text-[10px] font-medium text-slate-500">{formatCommentDate(comment.createdAt)}</time></div>
        <p className="mt-2 whitespace-pre-wrap pr-7 text-xs leading-6 text-slate-700">{comment.text}</p>
        <div className="mt-2 flex items-center justify-end gap-1 border-t border-slate-200/70 pt-2">
          {depth < 3 && <button type="button" onClick={() => { setReplyToId(comment.id); setEditingCommentId(null); setCommentInput(''); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50"><Reply className="h-3.5 w-3.5" />پاسخ</button>}
          {own && <button type="button" onClick={() => { setEditingCommentId(comment.id); setReplyToId(null); setCommentInput(comment.text); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-white"><Pencil className="h-3.5 w-3.5" />ویرایش</button>}
          {own && <button type="button" onClick={() => { if (confirm('این دیدگاه حذف شود؟')) void deleteContentComment(content.id, comment.id); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />حذف</button>}
        </div>
      </article>
      {children.length > 0 && <div className="mt-2 space-y-2">{children.map(child => renderComment(child, Math.min(depth + 1, 3)))}</div>}
    </div>;
  };

  // همهٔ ورودی‌های مراحل (شامل ورودی‌های ارجاع‌شده)؛ همان چیزی که داخل هر مرحله دیده می‌شود.
  const workflowInputs = stages.flatMap(stage => stageInputs(stage).map(input => ({ input, stageTitle: stage.title })));
  const workflowOutputs = stages.flatMap(stage => stageDeliveredOutputs(stage).map(output => ({ output, stageTitle: stage.title, stageId: stage.id })));
  const damAssets = linkedContentAssets.data?.data || [];
  const contentAssetRoles = (asset: LinkedContentAsset) => new Set((asset.relations || [])
    .filter(relation => relation.related_type === 'content' && String(relation.related_id) === String(content.id))
    .map(relation => relation.relation_type || 'attachment'));
  const inputAssets = damAssets.filter(asset => [...contentAssetRoles(asset)].some(role => INPUT_ASSET_ROLES.has(role)));
  const outputAssets = damAssets.filter(asset => [...contentAssetRoles(asset)].some(role => OUTPUT_ASSET_ROLES.has(role)));
  const otherAssets = damAssets.filter(asset => {
    const roles = [...contentAssetRoles(asset)];
    return roles.length === 0 || roles.every(role => !INPUT_ASSET_ROLES.has(role) && !OUTPUT_ASSET_ROLES.has(role));
  });
  const connectedTasks = tasks.filter(t => t.contentId === content.id);
  const flowStageTasks: FlowStageTask[] = runtime.demoMode
    ? (connectedTasks as unknown as FlowStageTask[])
    : (stageTasksQuery.data?.data || []);
  // بدون مجوز دیدن وظایف، ستون تسک در تب جریان «نامعلوم» می‌ماند؛ هرگز صفر یا
  // «تسک ساخته نشده» نمایش داده نمی‌شود.
  const flowTasksVisible = runtime.demoMode || hasPermission('tasks.view');
  const flowTasksLoading = !runtime.demoMode && flowTasksVisible && stageTasksQuery.isLoading;
  const flowTasksError = !runtime.demoMode && (!flowTasksVisible || stageTasksQuery.isError);
  /**
   * اعمال یک قالب جریان روی پروندهٔ شروع‌نشده.
   *
   * فقط زمانی مجاز است که هیچ مرحله‌ای شروع/بررسی/تأیید نشده باشد؛ در آن حالت
   * مرحله‌های شروع‌نشده با مرحله‌های جریان تازه جانشین می‌شوند و سرور خودش تسک‌ها
   * را از نو می‌سازد؛ مرحله‌های وابسته تا اتمام پیش‌نیاز تسک نمی‌گیرند.
   */
  const applyFlowTemplate = async (template: ContentProcessTemplate) => {
    if (!content) return;
    if (flowHasStarted(stages)) {
      notify({ type: 'error', title: 'مراحل این پرونده آغاز شده است', message: 'برای تغییر ساختار از «ویرایش جریان و مراحل» استفاده کنید.' });
      return;
    }
    if (!window.confirm(`جریان «${template.name}» روی این پرونده اعمال شود؟ مرحله‌های شروع‌نشدهٔ فعلی با ${template.stages.length.toLocaleString('fa-IR')} مرحلهٔ این جریان جانشین می‌شوند.`)) return;
    setApplyingTemplateId(template.id);
    const nextStages = buildStagesFromTemplate(template, {
      seed: Date.now(),
      departmentName: departmentId => departments.find(department => String(department.id) === String(departmentId))?.name,
      assignment: (stage, index) => {
        const candidates = departmentMembers(stage.departmentId, departments, users);
        // مثل صفحهٔ ساخت محتوا: مرحلهٔ نخست اگر خود کاربر عضو همان دپارتمان باشد به او سپرده می‌شود.
        const assigneeId = index === 0 && candidates.some(user => user.id === currentUser.id) ? currentUser.id : '';
        return { candidateIds: candidates.map(user => user.id), assigneeId };
      },
      ownerId: content.ownerId,
      contentDeadline: content.deadline || undefined,
      addDays: addCalendarDays,
    });
    const saved = await updateContent(content.id, { processTemplateId: template.id, stages: nextStages });
    setApplyingTemplateId(null);
    if (saved) await stageTasksQuery.refetch();
    notify(saved
      ? { type: 'success', title: 'جریان محتوا اعمال شد', message: 'مرحله‌ها از جریان انتخابی بازسازی شدند.' }
      // دلیل دقیق رد شدن، هم در توست خطا و هم همین‌جا نمایش داده می‌شود؛
      // پیام عمومی «ذخیره نشد» کاربر را برای اصلاح مشکل بی‌راه می‌گذاشت.
      : { type: 'error', title: 'اعمال جریان انجام نشد', message: commandFailure('دلیل خطا در پیام‌های سرور آمده است؛ آن را برطرف کنید و دوباره تلاش کنید.') });
  };
  /** گزینه‌های واقعی هر انتخاب: اعضای دپارتمان مرحله برای مسئول، دارندگان تأیید برای ارزیاب. */
  const stagePeopleOptions = (stage: ContentStage, field: 'assignee' | 'reviewer') => {
    const active = users.filter(user => user.status === 'active');
    if (field === 'assignee') {
      const members = departmentMembers(stage.departmentId || departmentId, departments, users).filter(user => user.status === 'active');
      return members.length > 0 ? members : active;
    }
    const approvers = active.filter(user => user.role === 'admin' || (user.permissions || []).includes('content.approve'));
    return approvers.length > 0 ? approvers : active;
  };

  /** ثبت تغییر فرد روی همان مرحله؛ مسیر داده همان `assignStageResponsibility` است. */
  const changeStagePerson = async (stage: ContentStage, field: 'assignee' | 'reviewer', userId: string) => {
    if (!canAssignStagePeople) return;
    const currentId = field === 'assignee'
      ? stage.assigneeId
      : stage.reviewerId || stage.approverId || content.approverId || content.ownerId;
    if (sameId(currentId, userId)) { setStagePersonPicker(null); return; }
    setStagePersonSaving(stage.id);
    // انتخاب دستی ارزیاب، سیاست ارزیاب را روی «ارزیاب همین مرحله» می‌گذارد؛ وگرنه
    // سیاست‌های خودکار، انتخاب کاربر را نادیده می‌گرفتند.
    const saved = await assignStageResponsibility(content.id, stage.id, field === 'assignee'
      ? { assigneeId: userId }
      : { reviewerId: userId, reviewerStrategy: 'stage_reviewer' });
    setStagePersonSaving(null);
    setStagePersonPicker(null);
    notify(saved
      ? { type: 'success', title: field === 'assignee' ? 'مسئول انجام مرحله تغییر کرد' : 'ارزیاب مرحله تغییر کرد', dedupeKey: `stage-person-${stage.id}` }
      : { type: 'error', title: 'تغییر فرد انجام نشد', message: 'دلیل دقیق در پیام‌های سرور آمده است؛ دسترسی و وضعیت جریان را بررسی کنید.' });
  };

  /** فهرست کشویی انتخاب فرد؛ با کلیک بیرون بسته می‌شود و داده‌ای جعل نمی‌کند. */
  const stagePersonPanel = (stage: ContentStage, field: 'assignee' | 'reviewer') => {
    const options = stagePeopleOptions(stage, field);
    const currentId = field === 'assignee'
      ? stage.assigneeId
      : stage.reviewerId || stage.approverId || content.approverId || content.ownerId;
    return (
      <>
        <button type="button" tabIndex={-1} aria-label="بستن فهرست انتخاب فرد" onClick={() => setStagePersonPicker(null)} className="fixed inset-0 z-30 cursor-default bg-transparent" />
        <div role="listbox" aria-label={field === 'assignee' ? 'انتخاب مسئول انجام مرحله' : 'انتخاب ارزیاب مرحله'} className="absolute right-0 top-full z-40 mt-1 max-h-64 w-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-xl">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-black text-slate-500">{field === 'assignee' ? 'مسئول انجام این مرحله' : 'ارزیاب این مرحله'}</p>
          {options.map(user => {
            const selected = sameId(user.id, currentId);
            return (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={stagePersonSaving === stage.id}
                onClick={() => void changeStagePerson(stage, field, user.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-60 ${selected ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <Avatar user={user} size="xs" />
                <span className="min-w-0 flex-1 truncate text-right">{user.name}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
          {options.length === 0 && <p className="px-2 py-2 text-[10px] font-bold text-slate-400">کاربر فعالی برای انتخاب نیست.</p>}
        </div>
      </>
    );
  };

  const detailTabs = [
    { id: 'process', label: 'فرایند تولید و مسئولیت‌ها', icon: Activity, count: stages.length },
    // تب جریان محتوا فعلا پنهان (نوبت ۱۷)
    ...(false ? [{ id: 'flows', label: 'جریان‌های محتوا', icon: Layers3, count: processTemplates.filter(template => template.type === content.type).length }] as any : []),
    // سناریو و اهداف رسانه‌ای فعلا پنهان
    ...(false ? [{ id: 'info', label: 'سناریو و اهداف رسانه‌ای', icon: FileText, count: 0 }] as any : []),
    /**
     * شمار «فایل‌های مربوط»: دارایی‌های متصل به پرونده به‌همراه ردیف‌های جدول
     * اطلاعاتِ متصل؛ هر دو از پاسخ واقعی سرور می‌آیند و چیزی حدس زده نمی‌شود.
     */
    { id: 'attachments', label: 'فایل‌های مربوط', icon: Paperclip, count: (linkedContentAssets.data?.total || damAssets.length || content.attachments?.length || 0) + (contentLinkedRows.data?.meta?.total ?? contentLinkedRows.data?.data.length ?? 0) },
    { id: 'publish', label: 'تنظیمات انتشار', icon: Globe, count: content.publishInfo?.channels?.length || 0 },
    { id: 'tasks', label: 'تسک‌های مربوط', icon: CheckCircle2, count: runtime.demoMode ? connectedTasks.length : flowStageTasks.length },
    // گفت‌وگوها و دیدگاه‌ها فعلا پنهان
    ...(false ? [{ id: 'comments', label: 'گفت‌وگوها', icon: MessageSquare, count: contentComments.length }] as any : []),
    ...(false ? [{ id: 'ideas', label: 'دیدگاه‌ها', icon: Lightbulb, count: 0 }] as any : []),
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-right" dir="rtl">
      {/* Top Header Card */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="h-1 bg-gradient-to-l from-indigo-600 via-violet-500 to-sky-400" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <button type="button" onClick={goBack} aria-label="بازگشت به صفحه قبل" title="بازگشت به صفحه قبل" className="ui-button ui-button-ghost ui-icon-button ui-icon-button-back !h-9 !w-9 shrink-0"><ArrowRight className="h-4 w-4" /></button>
                <h1 className="min-w-0 flex-1 break-words text-xl font-black tracking-tight text-slate-950 sm:text-3xl">{content.title}</h1>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span dir="ltr" title="کد محتوا" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3 font-mono text-xs font-black tracking-[0.08em] leading-none text-slate-900 shadow-2xs">
                  <Hash className="h-4 w-4 text-slate-500" />
                  {content.code || 'در انتظار کد عمومی'}
                </span>
                {statusControl}
                {contentTypeBadge}
                {content.seriesId && <button type="button" onClick={() => navigate(`/contents/series?series=${encodeURIComponent(content.seriesId!)}`)} className={`${DETAIL_BADGE_CLASS} border-indigo-200 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100`}><Layers3 className="h-3.5 w-3.5" />مجموعه: {connectedSeries?.name || content.seriesCode || `#${content.seriesId}`}{content.seriesSequence ? ` · پرونده ${content.seriesSequence.toLocaleString('fa-IR')}` : ''}</button>}
              </div>
              {content.description?.trim() && (
                <p className="mt-2 min-w-0 max-w-3xl whitespace-pre-wrap text-xs leading-6 text-slate-600 sm:text-sm">{content.description}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {connectedProject && <button type="button" onClick={() => { setSelectedProjectId(connectedProject.id); setActiveView('project-detail'); }} className={`${DETAIL_BADGE_CLASS} border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100`}><FolderKanban className="h-3.5 w-3.5" />پروژه: {connectedProject.name}</button>}
                {content.status !== 'delayed' && overdueOpenStages.length > 0 && <span className={`${DETAIL_BADGE_CLASS} border-violet-200 bg-violet-50 text-violet-700`} title="مهلت یک یا چند مرحلهٔ ناتمام گذشته است؛ وضعیت این پرونده در نخستین بازبینی سرور به «در تأخیر» تغییر می‌کند."><Clock className="h-3.5 w-3.5" />{`${overdueOpenStages.length.toLocaleString('fa-IR')} مرحلهٔ گذشته از مهلت`}</span>}
              </div>
            </div>

            {/* Action Buttons - دنبال کردن فعلا پنهان */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-sm lg:justify-end">
              {false && hasPermission('content.watch') && (
                <button type="button" disabled={watchSaving} onClick={() => void toggleWatch()} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-wait">
                  {watching ? <BellOff className="h-4 w-4 text-amber-600" /> : <Bell className="h-4 w-4 text-indigo-600" />}
                  {watchSaving ? 'در حال ثبت…' : watching ? 'لغو دنبال‌کردن' : 'دنبال‌کردن'}
                </button>
              )}
              {(content.access?.edit ?? hasPermission('content.edit')) && <button type="button" onClick={() => setIsEditModalOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"><Edit3 className="h-4 w-4 text-indigo-600" />ویرایش محتوا</button>}
              {!isPublished && workflowReady && hasPermission('content.publish') && <button type="button" disabled={publishingContentIds.includes(content.id)} onClick={() => setPublishConfirmOpen(true)} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-50"><Zap className="h-4 w-4" />{publishingContentIds.includes(content.id) ? 'در حال ثبت…' : 'انتشار'}</button>}
              {isPublished && hasPermission('content.publish') && <button type="button" disabled={publishingContentIds.includes(content.id)} onClick={() => { if (window.confirm('انتشار این محتوا لغو شود و به «آماده انتشار» بازگردد؟')) unpublishContent(content.id); }} className="flex items-center gap-1.5 rounded-xl bg-slate-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-slate-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" />لغو انتشار</button>}
            </div>
          </div>

          <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3"><span className="text-[10px] font-bold text-slate-400">وضعیت محتوا</span><div className="mt-2"><ContentStatusBadge status={content.status} size="md" /></div></div>
            <div className={`rounded-2xl border p-3 ${contentDeadlineTone}`}><span className="text-[10px] font-bold text-slate-400">مهلت نهایی</span><p className={`mt-2 text-xs font-black ${contentDeadlineTextTone}`}>{formatPersianDate(content.deadline) || 'تعیین نشده'}</p>{contentDeadlineLabel && <p className={`mt-1 text-[9px] font-black ${contentDeadlineTextTone}`}>{contentDeadlineLabel}{contentDeadlineState.tier === 'past' && content.status !== 'delayed' ? ' · وضعیت پرونده با بازبینی سرور به «در تأخیر» می‌رود' : ''}</p>}</div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-slate-400">پیشرفت جریان</span><span className="text-xs font-black text-indigo-700">{workflowProgress.toLocaleString('fa-IR')}٪</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={workflowProgress}><div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${workflowProgress}%` }} /></div><p className="mt-2 text-[9px] font-bold text-slate-500">{completedStages.toLocaleString('fa-IR')} از {stages.length.toLocaleString('fa-IR')} مرحله تکمیل شده</p></div>
            <div className={`rounded-2xl border p-3 ${publicationBoxTone}`}><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-slate-400">برنامه انتشار</span><Clock className={`h-3.5 w-3.5 ${publicationIconTone}`} /></div><p className={`mt-2 text-xs font-black ${publicationTextTone}`}>{content.publishInfo?.date ? formatPersianDate(content.publishInfo.date) : 'تعیین نشده'}</p><p className="mt-1 text-[9px] font-bold text-slate-500">{content.publishInfo?.time ? `ساعت ${formatPersianTime(content.publishInfo.time)}` : 'ساعت تعیین نشده'} · {publisher?.name || 'ناشر تعیین نشده'}</p>{publicationState && <p className={`mt-1 text-[9px] font-black ${publicationTextTone}`}>{publicationState.label}{!publicationState.hasTime && content.publishInfo?.date ? ' (فقط روز؛ ساعتی ثبت نشده)' : ''}</p>}</div>
          </div>
        </div>
      </section>

      {/* Tabs Navigation */}
      <nav className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs" role="tablist" aria-label="بخش‌های پرونده محتوا">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:flex xl:flex-wrap">
          {detailTabs.map(item => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return <button key={item.id} type="button" role="tab" aria-selected={selected} aria-controls={`content-panel-${item.id}`} onClick={() => setActiveTab(item.id)} className={`group flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-right transition-colors xl:w-auto ${selected ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-white' : 'text-indigo-500'}`} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black">{item.label}</span></span>
              {item.count !== undefined && <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${selected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{item.count.toLocaleString('fa-IR')}</span>}
            </button>;
          })}
        </div>
      </nav>

      {/* Main Tab Contents */}
      <div id={`content-panel-${activeTab}`} role="tabpanel" className="min-h-[420px] rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs sm:p-6">
        {activeTab === 'process' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  <span>مراحل زنجیره تولید و ماتریس مسئولیت‌ها</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  هر مرحله به یک دپارتمان و مسئول اختصاص دارد. تکمیل و تأیید هر مرحله، مرحله بعد را فعال می‌سازد.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canManageContentWorkflow && (
                <button
                  onClick={() => setIsEditWorkflowOpen(true)}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                  ویرایش جریان و مراحل
                </button>
                )}
              </div>
            </div>

            {stageActionFailure && (
              <div role="alert" className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-[11px] leading-6 text-rose-800">
                <div className="min-w-0 flex-1">
                  <p className="font-black">{stageActionFailure.title}</p>
                  <p className="mt-1">{stageActionFailure.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setStageActionFailure(null)}
                  className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-100"
                >بستن</button>
              </div>
            )}

            {stages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Layout className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-bold text-xs">هیچ مرحله‌ای برای این فرایند ثبت نشده است.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stages.map((stage, index) => {
                  const assignedUser = users.find(u => sameId(u.id, stage.assigneeId));
                  const stageDept = departments.find(d => sameId(d.id, stage.departmentId));
                  // ردهٔ مهلت مرحله؛ مرحلهٔ تمام‌شده نه رنگ تأخیر می‌گیرد و نه برچسب نسبی.
                  const stageDeadline = stage.deadline ? deadlineState(stage.deadline) : null;
                  const stageFinished = ['approved', 'completed', 'skipped'].includes(stage.status);
                  const stageOverdue = Boolean(stageDeadline && stageDeadline.tier === 'past' && OPEN_STAGE_STATUSES.includes(stage.status));
                  // رنگ فقط وقتی معنا دارد که مرحله هنوز تمام نشده باشد؛ در غیر این صورت خنثی.
                  const stageDeadlineTone = stageFinished ? 'later' : (stageDeadline?.tier ?? 'unknown');
                  const stageDeadlineLabel = stageFinished || !stageDeadline ? '' : deadlineRelativeLabel(stageDeadline);
                  // دلیل «همین حالا نمی‌شود» برای دکمه‌های مرحله؛ رنگ خاکستری
                  // تنها، دلیل را نمی‌گفت. مقدار busy هم در title نوشته می‌شود.
                  const stageBusyReason = stageActionKey
                    ? 'یک اقدام دیگر همین حالا در جریان است؛ پس از پایان آن دوباره تلاش کنید.'
                    : (pendingMutationKeys.includes(`contents:${content.id}`) ? 'این پرونده در حال ذخیره است؛ پس از پایان ذخیره دوباره تلاش کنید.' : '');
                  // ارزیاب مؤثر همین مرحله، با همان ترتیبی که سرور می‌خواند.
                  const stageReviewer = users.find(user => sameId(user.id, stage.reviewerId || stage.approverId || content.approverId || content.ownerId));
                  const isLocked = stage.status === 'pending_dependency';
                  const dependencyIds = stage.dependsOnStageIds || [];
                  const dependenciesComplete = dependencyIds.every(dependencyId => {
                    const dependency = stages.find(item => item.id === dependencyId);
                    return dependency && ['approved', 'completed', 'skipped'].includes(dependency.status);
                  });
                  const readyForStart = stage.status === 'ready' || (stage.status === 'not_started' && dependenciesComplete);
                  const needsRevision = stage.status === 'needs_revision' || stage.status === 'revisions_needed';
                  const deliveredOutputs = stageDeliveredOutputs(stage);
                  const nextStage = stages[index + 1];
                  const effectiveReviewerId = stage.reviewRequired === false
                    ? undefined
                    : stage.reviewerId || stage.approverId || content.approverId || content.ownerId;
                  const canForwardOutput = Boolean(nextStage) && (effectiveReviewerId
                    ? sameId(currentUser.id, effectiveReviewerId) && hasPermission('content.approve')
                    : sameId(currentUser.id, stage.assigneeId));

                  return (
                    <div
                      key={stage.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                        stageOverdue
                          ? 'bg-violet-50/40 border-violet-300 ring-1 ring-violet-100'
                          : stage.status === 'in_progress'
                          ? 'bg-indigo-50/50 border-indigo-400 ring-1 ring-indigo-100'
                          : stage.status === 'approved' || stage.status === 'completed'
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : stage.status === 'skipped'
                          ? 'bg-slate-50 border-slate-200'
                          : (stage.status === 'pending_approval' || stage.status === 'ready_for_review')
                          ? 'bg-indigo-50/50 border-indigo-200'
                          : needsRevision
                          ? 'bg-rose-50/40 border-rose-200'
                          : readyForStart
                          ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-100'
                          : isLocked
                          ? 'bg-slate-50/50 border-slate-200 opacity-75'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            stage.status === 'approved' || stage.status === 'completed'
                              ? 'bg-emerald-600 text-white'
                              : stage.status === 'in_progress'
                              ? 'bg-indigo-600 text-white'
                              : stage.status === 'pending_approval' || stage.status === 'ready_for_review'
                              ? 'bg-indigo-600 text-white'
                              : needsRevision
                              ? 'bg-rose-600 text-white'
                              : readyForStart
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-200 text-slate-700'
                          }`}>
                            {(index + 1).toLocaleString('fa-IR')}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-sm text-slate-900">{stage.title}</h4>
                              {!sameId(stage.departmentId, departmentId) && (stageDept?.name || stage.departmentId) && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700" title="دپارتمان این مرحله با دپارتمان مجری پرونده تفاوت دارد؛ دپارتمان پرونده در سربرگ صفحه آمده است.">
                                  {stageDept?.name || stage.departmentId}
                                </span>
                              )}
                              {getStageStatusBadge(stage.status, readyForStart, stage.reviewRequired !== false)}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{stage.description}</p>
                          </div>
                        </div>

                        {/* Assignee & Deadline */}
                        <div className="flex items-center gap-3 flex-wrap text-xs">
                          {/* مسئول انجام؛ کلیک، فهرست انتخاب را باز می‌کند (بدون پنجرهٔ ویرایش جریان) */}
                          <div className="relative">
                            <button
                              type="button"
                              disabled={!canAssignStagePeople || stagePersonSaving === stage.id}
                              aria-haspopup={canAssignStagePeople ? 'listbox' : undefined}
                              aria-expanded={stagePersonPicker?.stageId === stage.id && stagePersonPicker.field === 'assignee'}
                              onClick={() => setStagePersonPicker(current => current && current.stageId === stage.id && current.field === 'assignee' ? null : { stageId: stage.id, field: 'assignee' })}
                              title={canAssignStagePeople ? 'کلیک برای تغییر مسئول انجام این مرحله' : 'تغییر مسئول نیازمند دسترسی مدیریت جریان محتوا یا نقش مدیر محتواست'}
                              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-colors ${canAssignStagePeople ? 'cursor-pointer border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-white' : 'border-slate-200 bg-slate-50'}`}
                            >
                              {assignedUser ? (
                                <>
                                  <Avatar user={assignedUser} size="xs" />
                                  <span className="px-1 py-0.5 text-xs font-bold text-slate-800">{assignedUser.name}</span>
                                </>
                              ) : (
                                <>
                                  <Users className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="px-1 py-0.5 text-xs font-bold text-slate-500">بدون مسئول</span>
                                </>
                              )}
                              {canAssignStagePeople && <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden />}
                            </button>
                            {stagePersonPicker?.stageId === stage.id && stagePersonPicker.field === 'assignee' && stagePersonPanel(stage, 'assignee')}
                          </div>

                          {/* ارزیاب مرحله؛ همان الگوی مستقیم، با گزینه‌های دارای مجوز تأیید */}
                          <div className="relative">
                            <button
                              type="button"
                              disabled={!canAssignStagePeople || stage.reviewRequired === false || stagePersonSaving === stage.id}
                              aria-haspopup={canAssignStagePeople && stage.reviewRequired !== false ? 'listbox' : undefined}
                              aria-expanded={stagePersonPicker?.stageId === stage.id && stagePersonPicker.field === 'reviewer'}
                              onClick={() => setStagePersonPicker(current => current && current.stageId === stage.id && current.field === 'reviewer' ? null : { stageId: stage.id, field: 'reviewer' })}
                              title={stage.reviewRequired === false ? 'این مرحله به ارزیاب نیاز ندارد' : canAssignStagePeople ? 'کلیک برای تغییر ارزیاب این مرحله' : 'تغییر ارزیاب نیازمند دسترسی مدیریت جریان محتوا یا نقش مدیر محتواست'}
                              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-colors ${canAssignStagePeople && stage.reviewRequired !== false ? 'cursor-pointer border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-white' : 'border-slate-200 bg-slate-50'}`}
                            >
                              {stage.reviewRequired === false ? (
                                <>
                                  <Users className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="px-1 py-0.5 text-xs font-bold text-slate-600">بدون نیاز به ارزیاب</span>
                                </>
                              ) : stageReviewer ? (
                                <>
                                  <Avatar user={stageReviewer} size="xs" />
                                  <span className="px-1 py-0.5 text-xs font-bold text-slate-800">ارزیاب: {stageReviewer.name}</span>
                                </>
                              ) : (
                                <>
                                  <Users className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="px-1 py-0.5 text-xs font-bold text-slate-600">ارزیاب تعیین نشده</span>
                                </>
                              )}
                              {canAssignStagePeople && stage.reviewRequired !== false && <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden />}
                            </button>
                            {stagePersonPicker?.stageId === stage.id && stagePersonPicker.field === 'reviewer' && stagePersonPanel(stage, 'reviewer')}
                          </div>

                          {stageDeadline && (
                            <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border ${DEADLINE_CHIP_TONES[stageDeadlineTone]}`} title={stageFinished ? 'مهلت این مرحله (تکمیل‌شده)' : 'مهلت این مرحله'}>
                              <Calendar className={`w-3.5 h-3.5 ${DEADLINE_ICON_TONES[stageDeadlineTone]}`} />
                              <span className="font-sans">{formatPersianDate(stage.deadline)}</span>
                              {stageDeadlineLabel && <span className="text-[10px] font-bold">· {stageDeadlineLabel}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ورودی‌ها و خروجی‌های مرحله — رابط کاربری یکپارچه با پیش‌نمایش درون‌صفحه‌ای */}
                      <div className="space-y-3 border-t border-slate-100 pt-3 text-xs">
                        {(() => {
                          // شناسهٔ نمایشی مستقل از شناسهٔ داده تا کلیدها یکتا بمانند.
                          const inputs = stageInputs(stage);
                          const forwardedInputs = forwardedStageInputCount(stage);
                          const inputItems = inputs.map((input, index) => ({
                            view: { ...inputToAssetView(input, stage.title), id: `${stage.id}-input-${index}` },
                          }));
                          const outputItems = stageDeliveredOutputs(stage).map((output, index) => ({
                            output,
                            view: { ...outputToAssetView(output, stage.title, stage.id), id: `${stage.id}-output-${index}` },
                          }));
                          return <>
                            <StageAssetSection
                              kind="input"
                              title="ورودی‌های مرحله"
                              items={inputItems.map(item => item.view)}
                              pendingTitles={stagePendingOutputs(stage).map(output => output.name)}
                              emptyTitle="ورودی خاصی برای این مرحله تعیین نشده است."
                              emptyHint="ورودی‌های هر مرحله از قالب فرایند یا از خروجی مرحلهٔ قبل می‌آیند و همان‌جا در همین کارت نمایش داده می‌شوند."
                              onPreview={setPreviewStageAsset}
                            />
                            <StageAssetSection
                              kind="output"
                              title="خروجی‌های مرحله"
                              items={outputItems.map(item => item.view)}
                              pendingTitles={stagePendingOutputs(stage).map(output => output.name)}
                              emptyTitle="هنوز خروجی تحویل نشده است."
                              emptyHint="مسئول مرحله، مدیر پرونده و دارندگان مجوز ویرایش محتوا می‌توانند فایل، پیوند یا دارایی خروجی را ثبت کنند."
                              onPreview={setPreviewStageAsset}
                              action={canDepositOutput(stage)
                                ? <button type="button" onClick={() => { setDeliverableError(''); setDeliverableAppendTo(null); setSelectedStageForDeliverable(stage); }} className="ui-button ui-button-secondary !min-h-8 !rounded-xl !px-3 !py-1.5 text-[10px]" title={sameId(currentUser.id, stage.assigneeId) ? 'ثبت خروجی این مرحله' : 'ثبت خروجی به‌عنوان مدیر محتوا (نه مسئول مرحله)'}><Plus className="h-3.5 w-3.5" />ثبت خروجی جدید</button>
                                : undefined}
                              renderActions={view => {
                                const output = outputItems.find(item => item.view.id === view.id)?.output;
                                if (!output) return null;
                                const forwardKey = `forward:${stage.id}:${output.id}`;
                                const removeKey = `remove:${stage.id}:${output.id}`;
                                const forwardTarget = stages.find(item => item.id === output.forwardedToStageId)?.title || 'مرحله بعد';
                                return <>
                                  {output.forwardedToStageId && <span className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1 text-[9px] font-bold text-indigo-700"><Send className="h-3 w-3" />به {forwardTarget} ارجاع شد</span>}
                                  {false && !output.forwardedToStageId && nextStage && canForwardOutput && <button type="button" onClick={() => void runStageAction(forwardKey, () => forwardStageOutput(content.id, stage.id, output.id))} disabled={stageActionKey === forwardKey || !!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)} className="ui-button ui-button-secondary !min-h-7 !rounded-lg !px-2 !py-1 text-[10px] text-indigo-700" title={`ارجاع این خروجی به مرحله «${nextStage.title}»`}>{stageActionKey === forwardKey ? <InlineSpinner size="sm" /> : <Send className="h-3.5 w-3.5" />}{stageActionKey === forwardKey ? 'در حال ارجاع…' : 'ارجاع به مرحله بعد'}</button>}
                                  {canDepositOutput(stage) && !output.forwardedToStageId && <button type="button" onClick={() => { if (confirm('آیا از حذف این خروجی اطمینان دارید؟')) void runStageAction(removeKey, () => removeStageDeliverable(content.id, stage.id, output.id)); }} disabled={stageActionKey === removeKey} className="ui-button ui-button-ghost ui-icon-button !min-h-7 !w-7 text-rose-600" title="حذف خروجی" aria-label="حذف خروجی">{stageActionKey === removeKey ? <InlineSpinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}</button>}
                                </>;
                              }}
                            />
                          </>;
                        })()}
                      </div>

                      {/* Stage Action Controls */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {readyForStart && (
                            <button
                              onClick={() => {
                                const reason = editRefusal() || assigneeRefusal(stage, 'شروع این مرحله') || prerequisiteRefusal(stage);
                                if (reason) { reportStageActionFailure(`start:${stage.id}`, reason); return; }
                                void runStageAction(`start:${stage.id}`, () => updateStageStatus(content.id, stage.id, 'in_progress'));
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer ${sameId(currentUser.id, stage.assigneeId) ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-300'}`}
                              disabled={!!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)}
                              title={stageBusyReason || (sameId(currentUser.id, stage.assigneeId) ? 'شروع کار' : 'شروع این مرحله؛ اگر انجام نشود، دلیلش همین‌جا نوشته می‌شود')}
                            >
                              {stageActionKey === `start:${stage.id}` && <InlineSpinner size="sm" className="text-white" />}
                              {stageActionKey === `start:${stage.id}` ? 'در حال شروع…' : 'شروع این مرحله'}
                            </button>
                          )}

                          {stage.status === 'in_progress' && (
                            <button
                              onClick={() => {
                                const action = stage.reviewRequired === false ? 'تکمیل این مرحله' : 'ارسال این مرحله جهت بررسی';
                                const reason = editRefusal() || assigneeRefusal(stage, action) || prerequisiteRefusal(stage);
                                if (reason) { reportStageActionFailure(`submit:${stage.id}`, reason); return; }
                                void runStageAction(`submit:${stage.id}`, () => updateStageStatus(content.id, stage.id, stage.reviewRequired === false ? 'completed' : 'pending_approval'));
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer ${sameId(currentUser.id, stage.assigneeId) ? stage.reviewRequired === false ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300'}`}
                              disabled={!!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)}
                              title={stageBusyReason || (stage.reviewRequired === false ? 'تکمیل مستقیم مرحله بدون ارزیابی' : 'ارسال جهت بررسی و تأیید')}
                            >
                              {stageActionKey === `submit:${stage.id}` && <InlineSpinner size="sm" className="text-white" />}
                              {stageActionKey === `submit:${stage.id}` ? 'در حال ثبت…' : stage.reviewRequired === false ? 'تکمیل مرحله' : 'ارسال جهت بررسی و تأیید'}
                            </button>
                          )}

                          {['pending_approval', 'ready_for_review'].includes(stage.status) && (
                            content.reviewableStageIds?.includes(stage.id)
                              ? <div className="flex flex-wrap items-center gap-2">
                                  <button type="button" disabled={!!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)} onClick={() => void runStageAction(`approve:${stage.id}`, () => approveStage(content.id, stage.id))} title={stageBusyReason || `تأیید و بستن این مرحله${stageReviewer ? ` به‌عنوان ارزیاب «${stageReviewer.name}»` : ''}`} className="ui-button ui-button-primary !min-h-8 !px-2.5 !py-1 text-[11px] disabled:opacity-50">{stageActionKey === `approve:${stage.id}` ? <InlineSpinner size="sm" className="text-white" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{stageActionKey === `approve:${stage.id}` ? 'در حال تأیید…' : 'تأیید مستقیم'}</button>
                                  <button type="button" disabled={!!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)} onClick={() => { setRejectReason(''); setRejectError(''); setSelectedStageForReject(stage); }} title={stageBusyReason || 'درخواست اصلاح از ارزیاب مرحله'} className="ui-button ui-button-danger !min-h-8 !px-2.5 !py-1 text-[11px] disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />نیازمند اصلاح</button>
                                </div>
                              : <span className="text-xs leading-6 text-slate-500">{stageReviewer
                                ? `در انتظار تصمیم ارزیاب «${stageReviewer.name}» برای این مرحله؛ تأیید و «نیازمند اصلاح» فقط از حساب او (یا دارندهٔ مجوز تأیید محتوا) انجام می‌شود.`
                                : 'ارزیاب این مرحله مشخص نشده است؛ از «ویرایش جریان و مراحل» ارزیاب مرحله یا مسئول پرونده را تعیین کنید.'}</span>
                          )}

                          {needsRevision && (
                            <button
                              onClick={() => {
                                const reason = editRefusal() || assigneeRefusal(stage, 'شروع اصلاحات');
                                if (reason) { reportStageActionFailure(`revise:${stage.id}`, reason); return; }
                                void runStageAction(`revise:${stage.id}`, () => updateStageStatus(content.id, stage.id, 'in_progress'));
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer ${sameId(currentUser.id, stage.assigneeId) ? 'bg-amber-600 hover:bg-amber-700' : 'bg-amber-300'}`}
                              disabled={!!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)}
                              title={stageBusyReason || 'شروع اصلاحات'}
                            >
                              {stageActionKey === `revise:${stage.id}` && <InlineSpinner size="sm" className="text-white" />}
                              {stageActionKey === `revise:${stage.id}` ? 'در حال شروع…' : 'شروع اصلاحات'}
                            </button>
                          )}
                        </div>

                        {stage.revisionReason && (
                          <div className="text-[11px] text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                            <strong>علت بازبینی:</strong> {stage.revisionReason}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* تب سناریو و اهداف رسانه‌ای فعلا پنهان - رشته‌ها در فایل می‌مانند تا حذف کامل نشود */}
        {false && activeTab === 'info' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black">سناریو و اهداف رسانه‌ای</h3>
            <p>این بخش فعلا پنهان است</p>
          </div>
        )}
        {false && activeTab === 'flows' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black">جریان‌های محتوا</h3>
            <p>این تب فعلا پنهان است</p>
          </div>
        )}

        {/* TAB: Attachments / Files - بخش تکراری ورودی/خروجی جریان حذف شد؛ فقط DAM */}
        {!runtime.demoMode && activeTab === 'attachments' && <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="mb-4"><h3 className="text-xs font-black text-slate-900">فایل‌های مرتبط</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">نام فایل و پوشهٔ آن نمایش داده می‌شود.</p></div>
            {linkedContentAssets.isLoading && <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-xs text-slate-400">در حال دریافت فایل‌های ورودی، خروجی و پیوست‌ها…</div>}
            {linkedContentAssets.isError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><span>{parseApiError(linkedContentAssets.error).message}</span><Button variant="secondary" className="text-[10px]" onClick={() => void linkedContentAssets.refetch()}>تلاش دوباره</Button></div>}
            {!linkedContentAssets.isLoading && !linkedContentAssets.isError && <div className="grid gap-3 lg:grid-cols-3">
              <LinkedAssetGroup title="فایل‌های ورودی" assets={inputAssets} empty="فایل ورودی ثبت نشده است." onOpen={asset => setPreviewStageAsset(linkedAssetView(asset, 'فایل ورودی محتوا'))} />
              <LinkedAssetGroup title="فایل‌های خروجی" assets={outputAssets} empty="فایل خروجی ثبت نشده است." onOpen={asset => setPreviewStageAsset(linkedAssetView(asset, 'فایل خروجی محتوا'))} />
              <LinkedAssetGroup title="پیوست‌های دیگر" assets={otherAssets} empty="پیوست دیگری ثبت نشده است." onOpen={asset => setPreviewStageAsset(linkedAssetView(asset, 'پیوست محتوا'))} />
            </div>}
          </section>
          
          {hasPermission('assets.view') && <section className="rounded-2xl border border-slate-200 p-4" aria-label="ردیف‌های جدول اطلاعات متصل به این پرونده">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs font-black text-slate-900">ردیف‌های جدول اطلاعات متصل به این پرونده</h3>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">این ردیف‌ها در «دارایی‌های دیجیتال → جدول اطلاعات» ساخته شده‌اند و به همین پرونده وصل‌اند؛ داده‌شان همان‌جا می‌ماند و برای ویرایش، همان جدول باز می‌شود.</p>
              </div>
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{(contentLinkedRows.data?.meta?.total ?? contentLinkedRows.data?.data.length ?? 0).toLocaleString('fa-IR')} ردیف</span>
            </div>
            {contentLinkedRows.isLoading && <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-xs text-slate-400">در حال دریافت ردیف‌های جدول اطلاعات…</div>}
            {contentLinkedRows.isError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><span>{parseApiError(contentLinkedRows.error).message}</span><Button variant="secondary" className="text-[10px]" onClick={() => void contentLinkedRows.refetch()}>تلاش دوباره</Button></div>}
            {rowLinkError && <p role="alert" className="mb-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] leading-6 text-rose-700">{rowLinkError}</p>}
            {!contentLinkedRows.isLoading && !contentLinkedRows.isError && (!(contentLinkedRows.data?.data || []).length
              ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[11px] leading-6 text-slate-400">هنوز ردیفی از جدول اطلاعات به این پرونده وصل نشده است؛ در بخش «افزودن ضمیمه» گزینهٔ «اتصال ردیف‌های موجود» همین کار را می‌کند.</p>
              : <div className="space-y-2">{(contentLinkedRows.data?.data || []).map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><TableProperties className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-700">{dataTableRowValueSummary(row.cells)}</span><span className="mt-0.5 block text-[9px] text-slate-400">جدول: {row.data_table?.name || 'بدون نام'} · شناسهٔ ردیف {row.id.toLocaleString('fa-IR')}</span></span>{row.data_table?.id && <Button variant="secondary" className="text-[10px]" title="جدول در دارایی‌های دیجیتال باز می‌شود و همین ردیف نمایش داده می‌شود" onClick={() => navigate(`/dam?table=${row.data_table?.id}&row=${row.id}`)}><TableProperties className="h-3.5 w-3.5" />مشاهدهٔ جدول</Button>}
                  {/* یک دکمهٔ ادغام‌شده: مشاهدهٔ ردیف و ویرایش همان ردیف در یک
                      مدال؛ رفتن به جدول فقط برای دیدن کل جدول می‌ماند. */}
                  {row.data_table?.id && <Button variant="secondary" className="text-[10px]" title="مشاهده و ویرایش همین ردیف جدول اطلاعات" disabled={rowDetailsLoadingId === row.id} onClick={() => void openLinkedRowDetails(row)}><Pencil className="h-3.5 w-3.5" />{rowDetailsLoadingId === row.id ? 'در حال دریافت…' : 'مشاهده و ویرایش ردیف'}</Button>}{row.can_edit !== false && <Button variant="ghost" className="text-[10px] text-rose-600" disabled={unlinkingRowId === row.id} onClick={() => void unlinkContentRow(row)}>{unlinkingRowId === row.id ? 'در حال قطع…' : 'قطع اتصال'}</Button>}</div>)}</div>)}
          </section>}
          {!!content.attachments?.length && <section className="p-4 border rounded-xl space-y-2" aria-label="پیوست‌های قدیمی محتوا"><h3 className="font-bold">پیوست‌های ثبت‌شده در ساختار قدیمی</h3>{content.attachments.map(att=><div key={att.id} className="flex gap-3 flex-wrap text-sm"><span>{att.name}</span>{resourceUrl(att.url) ? <a href={resourceUrl(att.url)!} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">دریافت</a> : <span className="text-slate-500">پیوند قابل دریافت در دسترس نیست.</span>}</div>)}</section>}
        </div>}
        {runtime.demoMode && activeTab === 'attachments' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-indigo-600" />
                  <span>پیوست‌ها و فایل‌های مرتبط با محتوا</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تصاویر، ویدیوها، سناریوهای متنی و خروجی‌های نهایی را ضمیمه کنید
                </p>
              </div>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  multiple
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>افزودن فایل جدید</span>
                </button>
              </div>
            </div>

            {/* Attachments List */}
            {content.attachments && content.attachments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {content.attachments.map(att => (
                  <div key={att.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-indigo-300 transition-all flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-slate-800 truncate" title={att.name}>{att.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">{att.size}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => deleteContentAttachment(content.id, att.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="حذف فایل"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="pt-2 mt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                      <span>توسط {att.uploadedBy}</span>
                      <a
                        href={att.url}
                        download={att.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>دریافت</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-all cursor-pointer"
              >
                <UploadCloud className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-bold text-xs text-slate-700">هیچ فایلی ضمیمه نشده است.</p>
                <p className="text-[11px] text-slate-400 mt-1">کلیک کنید تا فایل‌های ویدیویی، تصویری یا اسناد را بارگذاری کنید.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Publish Settings */}
        {activeTab === 'publish' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <span>پلتفرم‌ها و جزئیات انتشار</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">کانال‌های انتشار، متن کپشن و زمان‌بندی</p>
              </div>

              <div className="flex flex-wrap gap-2">
              {!isPublished && hasPermission('content.publish') && <Button variant="secondary" onClick={openPublicationEdit}><Edit3 className="h-4 w-4" />ویرایش تنظیمات انتشار</Button>}
              {!isPublished && workflowReady && hasPermission('content.publish') && (
                <button
                  disabled={publishingContentIds.includes(content.id)}
                onClick={() => setPublishConfirmOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>ثبت انتشار در تدبیر</span>
                </button>
              )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <span className="font-bold text-slate-800 block">پلتفرم‌های انتخاب‌شده برای انتشار:</span>
                <div className="flex flex-wrap gap-2">
                  {!content.publishInfo?.channels?.length && <span className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-[11px] text-slate-400">هنوز کانال انتشاری انتخاب نشده است.</span>}
                  {content.publishInfo?.channels?.map(platformId => {
                    const config = platformConfig(platformId);
                    const Icon = getPlatformIcon(config?.iconName || 'Globe');
                    const appearance = platformAppearance(platformId);
                    return <span key={platformId} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" style={{ color: appearance.color, backgroundColor: appearance.backgroundColor, borderColor: `${appearance.color}38` }}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white/65" style={{ borderColor: `${appearance.color}2b` }}><Icon className="h-4 w-4" /></span>{platformLabel(platformId)}
                    </span>;
                  })}
                </div>

                <div className="border-t border-slate-200/60 pt-3"><span className="block text-slate-500">ناشر:</span><span className="mt-1 block font-bold text-slate-800">{publisher?.name || 'تعیین نشده'}</span></div>
                <div className="space-y-1 border-t border-slate-200/60 pt-3">
                  <span className="block text-slate-500">زمان‌بندی:</span>
                  <span className="font-bold text-slate-800">
                    {formatPersianDateTime(content.publishInfo?.date, content.publishInfo?.time) || 'تنظیم نشده'}
                    {publicationState && <span className={`mr-2 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold ${PUBLICATION_TEXT_TONE_CLASSES[publicationState.tone]}`}>{publicationState.label}</span>}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">متن کپشن / هشتگ‌های همراه:</span>
                  <button
                    type="button"
                    onClick={() => void copyCaption()}
                    disabled={!content.publishInfo?.caption}
                    title={content.publishInfo?.caption ? 'کپی متن کپشن در حافظهٔ موقت' : 'کپشنی برای کپی ثبت نشده است'}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {captionCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {captionCopied ? 'کپی شد' : 'کپی کپشن'}
                  </button>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl text-slate-700 leading-relaxed min-h-[90px] whitespace-pre-wrap">
                  {content.publishInfo?.caption || 'متن کپشنی تعریف نشده است.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Connected Tasks */}
        {!runtime.demoMode && activeTab === 'tasks' && <div className="space-y-4"><header className="flex items-start gap-3 border-b border-slate-100 pb-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><CheckSquare className="h-5 w-5" /></span><div><h3 className="text-sm font-black text-slate-900">تسک‌های مرتبط با محتوا</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">وضعیت کارهای اجرایی را ببینید و برای جزئیات هر وظیفه وارد شوید.</p></div></header><RelatedRecords module="tasks" scope={{content_id:content.id}} variant="task-list" /></div>}
        {runtime.demoMode && activeTab === 'tasks' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900">وظایف متصل به این محتوا</h3>
            {connectedTasks.length > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500">
                        <th className="p-3">عنوان وظیفه</th>
                        <th className="p-3">وضعیت</th>
                        <th className="p-3">اولویت</th>
                        <th className="p-3">مهلت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {connectedTasks.map(task => (
                        <tr
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          className="cursor-pointer hover:bg-indigo-50/50 transition-colors"
                          title="مشاهده جزئیات وظیفه"
                        >
                          <td className="p-3 font-bold text-slate-800">{task.title}</td>
                          <td className="p-3"><TaskStatusBadge status={task.status} size="sm" /></td>
                          <td className="p-3"><PriorityPill priority={task.priority} size="sm" /></td>
                          <td className="p-3 text-slate-600 whitespace-nowrap">{formatPersianDate(task.deadline) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">هیچ تسکی به این محتوا متصل نیست.</p>
            )}
          </div>
        )}

        {/* تب گفت‌وگوها و دیدگاه‌ها فعلا پنهان - رشته‌ها در فایل می‌مانند */}
        {false && activeTab === 'comments' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black">گفت‌وگوها</h3>
            <p>این تب فعلا پنهان است</p>
          </div>
        )}
        {false && activeTab === 'ideas' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black">دیدگاه‌ها</h3>
            <p>این تب فعلا پنهان است</p>
          </div>
        )}
      </div>

      {rowDetails && <RowDetailsModal
        tableId={rowDetails.tableId}
        tableName={rowDetails.tableName}
        row={rowDetails.row}
        columns={rowDetails.columns}
        canEdit={rowDetails.canEdit && (hasPermission('assets.edit_info') || hasPermission('assets.upload'))}
        users={users}
        tasks={tasks}
        contents={contents}
        onClose={() => setRowDetails(null)}
        onSaved={() => { setRowDetails(null); void contentLinkedRows.refetch(); }}
        onDeleted={() => { setRowDetails(null); void contentLinkedRows.refetch(); }}
        onOpenTask={taskId => { setRowDetails(null); setSelectedTaskId(taskId); setActiveView('task-detail'); }}
        onOpenContent={contentId => { setRowDetails(null); setSelectedContentId(contentId); setActiveView('content-detail'); }}
      />}

      <Modal open={publishConfirmOpen} onClose={() => setPublishConfirmOpen(false)} title="تأیید انتشار محتوا" description="خروجی‌ها، کپشن و کانال‌های انتشار را مرور کنید و سپس انتشار را ثبت کنید." icon={<Zap className="h-5 w-5" />} size="lg">
        <div className="space-y-5 p-5 sm:p-6">
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-black text-slate-900">خروجی‌های ثبت‌شده</h4>
              {publishOutputs.length > 0 && <button
                type="button"
                disabled={downloadingOutputs}
                onClick={() => void downloadAllOutputs()}
                title="دریافت همهٔ خروجی‌های فایل‌دار روی دستگاه شما"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-wait disabled:opacity-60"
              >
                {downloadingOutputs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {downloadingOutputs ? 'در حال دریافت…' : 'دانلود خروجی‌ها'}
              </button>}
            </div>
            {(content.stages || []).flatMap(stage => stage.outputs || []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-center text-[11px] text-slate-400">هنوز خروجی‌ای ثبت نشده است.</p>
            ) : (
              <ul className="space-y-2">
                {publishOutputs.map((out: any, idx: number) => {
                  const downloadable = Boolean((typeof out.assetId === 'string' && /^\d+$/.test(out.assetId)) || (typeof out.url === 'string' && /^https?:\/\//i.test(out.url)) || String(out.value || '').trim());
                  return <li key={`${out.id || idx}`} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-white p-2.5 text-[11px]">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-[10px] font-black">{(idx+1).toLocaleString('fa-IR')}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold text-slate-800">{out.title || out.fileName || 'خروجی بدون عنوان'}</span><span className="mt-0.5 block truncate text-[10px] text-slate-500">مرحله: {out.stage || '—'} {out.fileName ? `· فایل: ${out.fileName}` : ''} {out.value ? `· ${out.value.slice(0, 80)}` : ''}</span></span>
                    {downloadable && <button
                      type="button"
                      disabled={downloadingOutputs}
                      onClick={() => void downloadOutput(out).catch(() => notify({ type: 'error', title: 'دریافت این خروجی انجام نشد', message: 'دوباره تلاش کنید؛ خروجی‌هایی که ردیف جدول اطلاعات هستند فایلی ندارند و در خود جدول دیده می‌شوند.', dedupeKey: `output-download-${out.id || idx}` }))}
                      title="دریافت همین خروجی روی دستگاه شما"
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-wait disabled:opacity-60"
                    ><Download className="h-3.5 w-3.5" /></button>}
                  </li>;
                })}
              </ul>
            )}
          </section>
          <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-black text-slate-900">کپشن انتشار</h4>
              <button
                type="button"
                onClick={() => void copyCaption()}
                disabled={!content.publishInfo?.caption?.trim()}
                title={content.publishInfo?.caption?.trim() ? 'کپی متن کپشن در حافظهٔ موقت' : 'کپشنی برای کپی ثبت نشده است'}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {captionCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {captionCopied ? 'کپی شد' : 'کپی کپشن'}
              </button>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-[11px] leading-6 text-slate-700 whitespace-pre-wrap">{content.publishInfo?.caption?.trim() || 'کپشنی ثبت نشده است.'}</div>
          </section>
          <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
            <h4 className="text-xs font-black text-slate-900">کانال‌های انتشار</h4>
            <div className="flex flex-wrap gap-2">
              {(!content.publishInfo?.channels?.length) ? <span className="text-[11px] text-slate-400">کانالی انتخاب نشده است.</span> : content.publishInfo.channels.map((platformId: string) => {
                const config = platformConfig(platformId);
                const Icon = getPlatformIcon(config?.iconName || 'Globe');
                const appearance = platformAppearance(platformId);
                return <span key={platformId} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" style={{ color: appearance.color, backgroundColor: appearance.backgroundColor, borderColor: `${appearance.color}38` }}><span className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white/65" style={{ borderColor: `${appearance.color}2b` }}><Icon className="h-4 w-4" /></span>{platformLabel(platformId)}</span>;
              })}
            </div>
          </section>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" onClick={() => setPublishConfirmOpen(false)}>انصراف</Button>
            <Button action="publish" loading={publishingContentIds.includes(content.id)} onClick={() => { setPublishConfirmOpen(false); void publishContentNow(content.id); }}><Zap className="h-4 w-4" />تأیید و ثبت انتشار</Button>
          </div>
        </div>
      </Modal>
      <Modal open={publicationEditOpen} onClose={() => setPublicationEditOpen(false)} title="ویرایش تنظیمات انتشار" description="ناشر، زمان جلالی، کانال‌ها و کپشن را مستقیم برای همین محتوا به‌روزرسانی کنید." icon={<Globe className="h-5 w-5" />} busy={publicationSaving}>
        <form onSubmit={submitPublicationSettings}>
          <div className="space-y-4 p-5 sm:p-6">
            <FormField label="ناشر" htmlFor="content-publication-publisher"><Select id="content-publication-publisher" value={publicationDraft.publisherId} onChange={event => setPublicationDraft(previous => ({ ...previous, publisherId: event.target.value }))}><option value="">تعیین نشده</option>{users.filter(user => user.status === 'active').map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></FormField>
            <div className="grid gap-4 sm:grid-cols-2"><PersianDatePicker label="تاریخ انتشار" required value={publicationDraft.date} onChange={date => setPublicationDraft(previous => ({ ...previous, date }))} portal /><FormField required label="ساعت انتشار" htmlFor="content-publication-time"><Input id="content-publication-time" required type="time" dir="ltr" value={publicationDraft.time} onChange={event => setPublicationDraft(previous => ({ ...previous, time: event.target.value }))} /></FormField></div>
            <fieldset className="space-y-2"><legend className="text-xs font-bold text-slate-700">کانال‌های انتشار <b className="text-rose-500">*</b></legend><div className="grid gap-2 sm:grid-cols-2">{publishingPlatforms.map(platform => { const checked = publicationDraft.channels.includes(platform.id); const appearance = platformAppearance(platform.id); const Icon = getPlatformIcon(platform.iconName); return <button key={platform.id} type="button" aria-pressed={checked} onClick={() => setPublicationDraft(previous => ({ ...previous, channels: checked ? previous.channels.filter(id => id !== platform.id) : [...previous.channels, platform.id] }))} style={checked ? { color: appearance.color, borderColor: `${appearance.color}55`, backgroundColor: appearance.backgroundColor } : undefined} className={`flex items-center gap-2 rounded-xl border p-3 text-right text-xs font-bold ${checked ? '' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'}`}><Icon className="h-4 w-4" />{platform.name}{checked && <Check className="mr-auto h-4 w-4" />}</button>; })}</div></fieldset>
            <FormField label="کپشن" htmlFor="content-publication-caption"><Textarea id="content-publication-caption" rows={5} maxLength={10000} value={publicationDraft.caption} onChange={event => setPublicationDraft(previous => ({ ...previous, caption: event.target.value }))} /></FormField>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6"><Button action="cancel" type="button" variant="secondary" disabled={publicationSaving} onClick={() => setPublicationEditOpen(false)}>انصراف</Button><Button action="save" type="submit" loading={publicationSaving} disabled={!publicationDraft.date || !publicationDraft.time || publicationDraft.channels.length === 0}>ذخیره تنظیمات</Button></div>
        </form>
      </Modal>

      {/* پیش‌نمایش درون‌صفحه‌ای ورودی/خروجی مرحله */}
      <StageAssetPreviewModal
        view={previewStageAsset}
        onClose={() => setPreviewStageAsset(null)}
        canLoadAsset={hasPermission('assets.view')}
        onOpenInDam={assetId => { setDetailAssetId(assetId); setActiveView('assets'); }}
        canEditTextAsset={hasPermission('assets.edit_info')}
        onEditText={saveOutputText}
        onOpenDataTable={tableId => navigate(`/dam?table=${tableId}`)}
      />

      {/* Deliverable Modal */}
      {selectedStageForDeliverable && (
        <Modal open busy={isSavingDeliverable} onClose={()=>{ setSelectedStageForDeliverable(null); setDeliverableAppendTo(null); }} title={`ثبت خروجی مرحله «${selectedStageForDeliverable.title}»`}>
          <form onSubmit={handleAddDeliverableSubmit} className="flex min-h-0 flex-col">
            <div className="flex-1 space-y-3 p-5">
              <p className="mb-4 text-xs text-slate-500">فایل، پیوند یا متن خروجی ابتدا در مخزن مرکزی DAM ثبت و سپس به این مرحله متصل می‌شود.</p>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">عنوان خروجی (اختیاری برای فایل‌ها)</label>
                <input
                  type="text"
                  value={deliverableTitle}
                  onChange={e => setDeliverableTitle(e.target.value)}
                  placeholder="مثلاً: فایل رندر نهایی تیزر"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">لینک دسترسی یا دانلود (اختیاری)</label>
                <input
                  type="url"
                  value={deliverableUrl}
                  onChange={e => setDeliverableUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  dir="ltr"
                />
              </div>

              {!canUploadToDam && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-800">
                مجوز بارگذاری در مخزن مرکزی برای شما فعال نیست؛ با «پیوند دسترسی یا دانلود» و «توضیحات تکمیلی» می‌توانید خروجی را در همین جریان ثبت کنید. برای ثبت فایل یا اتصال دارایی موجود، مجوز مخزن لازم است.
              </p>}
              <AttachmentComposer
                value={deliverableDraft}
                onChange={setDeliverableDraft}
                disabled={isSavingDeliverable}
                linkTarget={{ contentId: content.id }}
                title="فایل‌ها و دارایی‌های خروجی"
                // نام نمایشیِ فایل‌های خروجی پیش‌فرضاً کد همین پرونده است؛
                // کاربر می‌تواند پیش از ثبت آن را تغییر دهد.
                defaultFileDisplayName={String(content.code || '').trim() || undefined}
                    defaultFolderLabel={`پیش‌فرض خودکار: ${connectedSeries ? `محتواها / ${connectedSeries.name} - ${connectedSeries.codePrefix || content.seriesCode || content.seriesId}` : `محتواها / عمومی - ${content.code || 'کد عمومی'} / خروجی‌ها`}`}
              />


              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700">متن خروجی (چندخطی)</label>
                  <span className="text-[10px] font-bold text-slate-400">{deliverableNotes.length.toLocaleString('fa-IR')} نویسه</span>
                </div>
                <textarea
                  rows={6}
                  maxLength={20000}
                  value={deliverableNotes}
                  onChange={e => { setDeliverableNotes(e.target.value); if (!e.target.value.trim()) setDeliverableAppendTo(null); }}
                  placeholder="متن خروجی این مرحله را همین‌جا بنویسید یا بنویسید و بچسبانید؛ برای متن‌های بلند می‌توانید بخش دوم را به همین متن بیفزایید."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none"
                />
                {textOutputToAppend && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5">
                  <span className="text-[10px] font-bold leading-5 text-indigo-900">
                    {deliverableAppendTo
                      ? 'این متن به متن خروجی قبلی افزوده و همان خروجی به‌روز می‌شود.'
                      : `متن خروجی قبلی (${String(textOutputToAppend.value || '').length.toLocaleString('fa-IR')} نویسه) می‌تواند ادامه پیدا کند.`}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setDeliverableNotes(String(textOutputToAppend.value || '')); setDeliverableAppendTo(textOutputToAppend.id); }}
                    className="ui-button ui-button-secondary !min-h-8 !rounded-xl !px-3 !py-1 text-[10px]"
                  >
                    {deliverableAppendTo ? 'بارگذاری دوبارهٔ متن قبلی' : 'افزودن به متن خروجی قبلی'}
                  </button>
                </div>}
              </div>

              {deliverableError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{deliverableError}</p>}
            </div>
            <footer className="sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
              <button data-button-action="cancel" type="button" disabled={isSavingDeliverable} onClick={() => setSelectedStageForDeliverable(null)} className="ui-form-action ui-button ui-button-secondary">انصراف</button>
              <button data-button-action="save" type="submit" disabled={isSavingDeliverable} aria-busy={isSavingDeliverable} className="ui-form-action ui-button ui-button-primary min-w-32">
                {isSavingDeliverable && <InlineSpinner size="sm" className="text-white" />}
                {isSavingDeliverable ? 'در حال ثبت…' : 'ثبت خروجی'}
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {/* Reject Modal */}
      {selectedStageForReject && (
        <Modal open busy={rejectSaving} onClose={()=>setSelectedStageForReject(null)} title={`عدم تأیید و درخواست بازبینی مرحله «${selectedStageForReject.title}»`}><div className="p-5">
            <p className="text-xs text-slate-500 mb-4">دلایل عدم تأیید و نکات نیازمند اصلاح را جهت اطلاع مسئول مرحله درج کنید.</p>
            {rejectError && <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] leading-6 text-rose-700">{rejectError}</p>}

            <form onSubmit={handleRejectSubmit} className="space-y-3">
              <FormField label="علت عدم تأیید و نکات اصلاحی *" htmlFor="correction-reason">
                <Textarea
                  id="correction-reason"
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="نکات کیفی، ویرایشی یا فنی مورد نظر..."
                  className="resize-none text-xs"
                />
              </FormField>
              <FormField label="مسئول تسک اصلاح (اختیاری)" htmlFor="correction-assignee">
                <Select id="correction-assignee" value={correctionAssigneeId} onChange={e => setCorrectionAssigneeId(e.target.value)} className="text-xs">
                  <option value="">انتخاب خودکار مسئول مرحله / آخرین تسک</option>
                  {users.filter(user => user.status === 'active' && (!connectedProject || connectedProject.projectManagerId === user.id || connectedProject.memberIds.includes(user.id))).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                </Select>
                <p className="mt-1 text-[10px] text-slate-400">فقط تسک اصلاح جدید به این کاربر واگذار می‌شود؛ تسک قبلی بازگشایی نمی‌شود.</p>
              </FormField>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <Button action="cancel" variant="secondary" disabled={rejectSaving} onClick={() => setSelectedStageForReject(null)}>انصراف</Button>
                <Button type="submit" variant="danger" loading={rejectSaving}>ثبت بازبینی</Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Edit Content Modal */}
      <EditContentModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        content={content}
      />
      
      {canManageContentWorkflow && (
      <EditWorkflowModal
        isOpen={isEditWorkflowOpen}
        onClose={() => setIsEditWorkflowOpen(false)}
        content={content}
      />
      )}

    </div>
  );
};

function LinkedAssetGroup({ title, assets, empty, onOpen }: {
  title: string;
  assets: LinkedContentAsset[];
  empty: string;
  onOpen: (asset: LinkedContentAsset) => void;
}) {
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
    <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-[11px] font-black text-slate-800">{title}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{assets.length.toLocaleString('fa-IR')}</span></div>
    <div className="space-y-2">{assets.map(asset => {
      const fileName = asset.latest_file?.original_filename || asset.title;
      const folderName = asset.folder?.name || (asset.folder_id ? `پوشه #${asset.folder_id}` : 'بدون پوشه');
      return <button key={asset.id} type="button" onClick={() => onOpen(asset)} className="flex w-full items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-right transition-colors hover:border-indigo-200 hover:bg-indigo-50/40">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-600"><FileText className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black text-slate-800">{fileName}</span><span className="mt-1 block truncate text-[9px] text-slate-500">{folderName}</span></span>
        <Eye className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>;
    })}{assets.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-[10px] text-slate-400">{empty}</p>}</div>
  </section>;
}
