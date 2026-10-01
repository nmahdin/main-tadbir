import { DamLibrary } from '../dam/DamLibrary';
import { resourceUrl } from '../../utils/resourceUrl';
import { Modal } from '../common/Primitives';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';
import { runtime } from '../../config/runtime';
import { RelatedRecords } from '../workspace/RelatedRecords';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ContentStatusBadge } from '../../utils/statusBadges';
import React, { useState, useRef } from 'react';
import { formatPersianDate } from '../../utils/date';
import { damApi } from '../../api/dam';
import { request } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { ContentStageStatus, ContentStage, ContentStageOutput } from '../../types';
import { platformIcon as getPlatformIcon } from '../../utils/platformIcons';
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
  Share2,
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
  ExternalLink,
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
  Repeat,
  Copy,
  ListChecks,
  ArrowRight,
  Link2,
  X
} from 'lucide-react';

export const ContentDetailView: React.FC = () => {
  const {
    pendingMutationKeys,
    contents,
    selectedContentId,
    setActiveView, hasPermission,
    setDetailAssetId,
    setSelectedContentId,
    contentTypes,
    contentStatuses,
    duplicateContent,
    setSelectedProjectId,
    users,
    departments,
    projects,
    publishingPlatforms,
    changeContentStatus,
    updateContentPublishInfo,
    publishContentNow,
    publishingContentIds,
    unpublishContent,
    addContentComment,
    deleteContent,
    assignStageResponsibility,
    updateStageStatus,
    addStageDeliverable,
    removeStageDeliverable,
    approveStage,
    rejectStage,
    addContentAttachment,
    deleteContentAttachment,
    tasks,
    setSelectedTaskId,
    currentUser
  } = useApp();

  const navigate = useNavigate();
  const [tabParams,setTabParams] = useSearchParams();
  const activeTab = ['process','info','attachments','publish','tasks','comments'].includes(tabParams.get('tab') || '') ? tabParams.get('tab')! : 'process';
  const setActiveTab = (tab:string) => {const next=new URLSearchParams(tabParams);next.set('tab',tab);setTabParams(next);};
  const [commentInput, setCommentInput] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditWorkflowOpen, setIsEditWorkflowOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // Deliverable modal
  const [selectedStageForDeliverable, setSelectedStageForDeliverable] = useState<ContentStage | null>(null);
  const [deliverableTitle, setDeliverableTitle] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');
  const [deliverableDraft, setDeliverableDraft] = useState(createEmptyAttachmentDraft);
  const [isSavingDeliverable, setIsSavingDeliverable] = useState(false);
  const [rejectSaving,setRejectSaving]=useState(false);
  const [deliverableError, setDeliverableError] = useState('');
  const [previewOutput, setPreviewOutput] = useState<{ output: ContentStageOutput; stageTitle: string } | null>(null);
  const [stageActionKey, setStageActionKey] = useState<string | null>(null);

  // Rejection modal
  const [selectedStageForReject, setSelectedStageForReject] = useState<ContentStage | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const content = contents.find(c => c.id === selectedContentId);

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center" dir="rtl">
        <AlertCircle className="w-12 h-12 text-slate-300 mb-3" />
        <p className="font-bold text-slate-800">محتوای مورد نظر یافت نشد یا حذف شده است.</p>
      </div>
    );
  }

  const dept = departments.find(d => d.id === content.departmentId);
  const owner = users.find(u => u.id === content.ownerId);
  const publisher = users.find(u => u.id === content.publisherId);
  const connectedProject = projects.find(p => p.id === content.projectId);
  const isPublished = content.status === 'published' || content.publishInfo?.status === 'published';
  const workflowReady = !!content.stages?.length && content.stages.every(stage => ['approved', 'completed', 'skipped'].includes(stage.status));
  const canManageContentWorkflow = currentUser.role === 'admin' || hasPermission('content.edit');

  const stages = content.stages || [];
  const completedStages = stages.filter(stage => ['approved', 'completed', 'skipped'].includes(stage.status)).length;
  const workflowProgress = stages.length ? Math.round((completedStages / stages.length) * 100) : 0;
  const platformConfig = (platformId: string) => publishingPlatforms.find(platform => platform.id === platformId);
  const platformLabel = (platformId: string) => platformConfig(platformId)?.name || ({ website: 'وب‌سایت', instagram: 'اینستاگرام', telegram: 'تلگرام', bale: 'بله', eitaa: 'ایتا', rubika: 'روبیکا', youtube: 'یوتیوب', linkedin: 'لینکدین', twitter: 'ایکس', x: 'ایکس' } as Record<string, string>)[platformId] || platformId;
  const platformAppearance = (platformId: string) => {
    const config = platformConfig(platformId);
    return {
      color: /^#[0-9a-f]{6}$/i.test(config?.color || '') ? config!.color : '#4f46e5',
      backgroundColor: /^#[0-9a-f]{6}$/i.test(config?.bg || '') ? config!.bg : '#eef2ff',
    };
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    if (pendingMutationKeys.includes(`contents:${content.id}`)) return;
    if (await addContentComment(content.id, commentInput.trim())) setCommentInput('');
  };

  const runStageAction = async (key: string, action: () => Promise<unknown>) => {
    if (stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)) return;
    setStageActionKey(key);
    try {
      await action();
    } finally {
      setStageActionKey(null);
    }
  };

  const handleAddDeliverableSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStageForDeliverable || isSavingDeliverable) return;
    const draftCount = attachmentDraftCount(deliverableDraft);
    if (!draftCount && !deliverableTitle.trim()) {
      setDeliverableError('یک فایل، یادداشت یا عنوان خروجی وارد کنید.');
      return;
    }

    setIsSavingDeliverable(true);
    setDeliverableError('');
    try {
      const externalUrl = deliverableUrl.trim();
      const description = deliverableNotes.trim();
      if (externalUrl && !resourceUrl(externalUrl)) throw new Error('پیوند باید HTTP یا HTTPS معتبر باشد.');
      const persisted = draftCount
        ? await persistAttachmentDraft(deliverableDraft, { contentId: content.id, projectId: content.projectId || undefined, contentBucket: 'outputs' }, selectedStageForDeliverable.title)
        : [];

      if (persisted.length) {
        for (const asset of persisted) {
          const saved = await addStageDeliverable(content.id, selectedStageForDeliverable.id, `out-${asset.type}-${asset.assetId}`, {
            title: deliverableTitle.trim() || asset.name,
            assetId: asset.type === 'data_table' ? undefined : String(asset.assetId),
            fileName: asset.type === 'file' ? asset.name : undefined,
            fileSize: asset.size ? `${(asset.size / 1024 / 1024).toFixed(2)} MB` : undefined,
            url: externalUrl || asset.previewUrl || undefined,
            value: asset.type === 'data_table' ? [description, `جدول اطلاعات شماره ${asset.dataTableId}`].filter(Boolean).join(' — ') : description || undefined,
          });
          if (!saved) throw new Error('اتصال یکی از خروجی‌ها به مرحله ذخیره نشد؛ دوباره بررسی کنید.');
        }
      } else {
        const body = [externalUrl ? `پیوند خروجی: ${externalUrl}` : '', description].filter(Boolean).join('\n\n') || deliverableTitle.trim();
        const response = await damApi.library.createText({ title: deliverableTitle.trim(), contentId: content.id, contentBucket: 'outputs', body, description: description || undefined });
        const asset = response.data;
        const saved = await addStageDeliverable(content.id, selectedStageForDeliverable.id, `out-${asset.id}`, {
          title: deliverableTitle.trim(), assetId: String(asset.id), url: externalUrl || damApi.library.previewUrl(asset.id), value: description || undefined,
        });
        if (!saved) throw new Error('دارایی ثبت شد، اما اتصال خروجی به مرحله ذخیره نشد؛ دوباره بررسی کنید.');
      }
      if (selectedStageForDeliverable.reviewRequired === false) {
        await updateStageStatus(content.id, selectedStageForDeliverable.id, 'completed');
      }
      setSelectedStageForDeliverable(null);
      setDeliverableTitle(''); setDeliverableUrl(''); setDeliverableNotes('');
      setDeliverableDraft(createEmptyAttachmentDraft());
    } catch (error) {
      console.error('Registering workflow output in DAM failed.', error);
      setDeliverableError(error instanceof Error ? error.message : 'ثبت خروجی در مخزن مرکزی انجام نشد.');
    } finally {
      setIsSavingDeliverable(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStageForReject || !rejectReason.trim() || rejectSaving) return;
    setRejectSaving(true);
    try { if (await rejectStage(content.id, selectedStageForReject.id, rejectReason.trim())) {setSelectedStageForReject(null);setRejectReason('');} } finally {setRejectSaving(false);}
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
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200"><FileCheck className="w-3.5 h-3.5" /> در انتظار بررسی مدیر</span>;
      case 'in_progress':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200"><Activity className="w-3.5 h-3.5 animate-pulse" /> در حال انجام</span>;
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

  const connectedTasks = tasks.filter(t => t.contentId === content.id);

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-right" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div>
              <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                <span className="rounded-xl border px-3.5 py-1.5 text-xs font-black" style={{ color: contentTypes.find(type => type.id === content.type)?.color || '#4f46e5', backgroundColor: `${contentTypes.find(type => type.id === content.type)?.color || '#4f46e5'}18`, borderColor: `${contentTypes.find(type => type.id === content.type)?.color || '#4f46e5'}45` }}>
                  {contentTypes.find(type => type.id === content.type)?.name || content.type}
                </span>
  <div className="relative inline-block">
    <button
      onClick={() => setStatusMenuOpen(value => !value)}
      title="تغییر وضعیت"
      className="cursor-pointer rounded-lg hover:ring-2 hover:ring-indigo-200 transition-all"
    >
      <ContentStatusBadge status={content.status} />
    </button>
    {statusMenuOpen && (
      <>
        <div
          className="fixed inset-0 z-40 cursor-default"
          onClick={() => setStatusMenuOpen(false)}
        />
        <div className="absolute top-full right-0 mt-1.5 z-50 min-w-[180px] bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 animate-in fade-in zoom-in-95 duration-100">
          <p className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400">تغییر وضعیت به:</p>
          <div className="max-h-64 overflow-y-auto">
            {[...contentStatuses].sort((a, b) => a.order - b.order).filter(st => st.id !== 'archived').map(st => (
              <button
                key={st.id}
                onClick={() => {
                  if (content.status !== st.id) {
                    changeContentStatus(content.id, st.id as typeof content.status);
                  }
                  setStatusMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                  content.status === st.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                <span>{st.label}</span>
                {content.status === st.id && <Check className="w-3.5 h-3.5 mr-auto" />}
              </button>
            ))}
          </div>
        </div>
      </>
    )}
  </div>
                <span className="text-xs font-bold text-slate-500">
                  {dept?.name || 'دپارتمان رسانه'}
                </span>
                {connectedProject && (
                  <button
                    onClick={() => {
                      setSelectedProjectId(connectedProject.id);
                      setActiveView('project-detail');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                  >
                    <FolderKanban className="w-3 h-3" />
                    <span>پروژه: {connectedProject.name}</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/contents')} aria-label="بازگشت" title="بازگشت" className="ui-button ui-button-ghost ui-icon-button ui-icon-button-back !h-9 !w-9 shrink-0"><ArrowRight className="h-4 w-4" /></button>
                <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                  {content.title}
                </h1>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {(content.access?.edit ?? hasPermission('content.edit')) && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Edit3 className="w-4 h-4 text-indigo-600" />
              <span>ویرایش محتوا</span>
            </button>
          )}

            <button
              onClick={() => setActiveView('content-publishing')}
              className="px-3.5 py-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>تقویم و میز انتشار</span>
            </button>


            {!isPublished && workflowReady && hasPermission('content.publish') && (
              <button
                disabled={publishingContentIds.includes(content.id)}
                onClick={() => void publishContentNow(content.id)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>{publishingContentIds.includes(content.id) ? 'در حال ثبت…' : 'انتشار'}</span>
              </button>
            )}
            {isPublished && hasPermission('content.publish') && (
              <button
                disabled={publishingContentIds.includes(content.id)}
                onClick={() => {
                  if (window.confirm('انتشار این محتوا لغو شود و به «آماده انتشار» بازگردد؟')) {
                    unpublishContent(content.id);
                  }
                }}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>لغو انتشار</span>
              </button>
            )}
            {hasPermission('content.create') && (
              <button
                disabled={pendingMutationKeys.includes('contents:create')}
                onClick={async () => {
                  const copy = await duplicateContent(content.id);
                  if (copy) setSelectedContentId(copy.id);
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="ساخت یک کپی از این محتوا"
              >
                <Copy className="w-4 h-4 text-slate-500" />
                <span>کپی</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Metadata Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400">صاحب پرونده</span>
            <span className="font-bold text-slate-800">{owner?.name || 'نامشخص'}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400">ناشر</span>
            <span className="font-bold text-slate-800">{publisher?.name || 'تعیین نشده'}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400">تعداد مراحل فرایند</span>
            <span className="font-bold text-indigo-600">{stages.length} مرحله تولیدی</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400">مهلت نهایی</span>
            <span className="font-bold text-slate-800">{formatPersianDate(content.deadline) || 'تعیین نشده'}</span>
          </div>

          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400">پلتفرم‌های انتشار</span>
            <span className="font-bold text-slate-800">
              {content.publishInfo?.channels?.map(platformLabel).join('، ') || 'وب‌سایت رسمی'}
            </span>
          </div>
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between text-[11px] font-bold"><span className="text-slate-600">پیشرفت جریان محتوا</span><span className="text-indigo-700">{workflowProgress.toLocaleString('fa-IR')}٪ — {completedStages.toLocaleString('fa-IR')} از {stages.length.toLocaleString('fa-IR')} مرحله</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={workflowProgress}><div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${workflowProgress}%` }} /></div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setActiveTab('process')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'process' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          فرایند تولید و مسئولیت‌ها ({stages.length})
        </button>

        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'info' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          سناریو و اهداف رسانه‌ای
        </button>

        <button
          onClick={() => setActiveTab('attachments')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'attachments' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Paperclip className="w-4 h-4" />
          پیوست‌ها و فایل‌های خام
        </button>

        <button
          onClick={() => setActiveTab('publish')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'publish' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Globe className="w-4 h-4" />
          تنظیمات انتشار
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'tasks' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          تسک‌های مرتبط {runtime.demoMode ? `(${connectedTasks.length})` : ''}
        </button>

        <button
          onClick={() => setActiveTab('comments')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'comments' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          دیدگاه‌ها و گفتگوها ({content.comments?.length || 0})
        </button>
      </div>

      {/* Main Tab Contents */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-2xs min-h-[420px]">
        {/* TAB 1: Process & Stages Workflow */}
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

            {stages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Layout className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <p className="font-bold text-xs">هیچ مرحله‌ای برای این فرایند ثبت نشده است.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stages.map((stage, index) => {
                  const assignedUser = users.find(u => u.id === stage.assigneeId);
                  const stageDept = departments.find(d => d.id === stage.departmentId);
                  const isLocked = stage.status === 'pending_dependency';
                  const dependencyIds = stage.dependsOnStageIds || [];
                  const dependenciesComplete = dependencyIds.every(dependencyId => {
                    const dependency = stages.find(item => item.id === dependencyId);
                    return dependency && ['approved', 'completed', 'skipped'].includes(dependency.status);
                  });
                  const readyForStart = stage.status === 'ready' || (stage.status === 'not_started' && dependenciesComplete);
                  const needsRevision = stage.status === 'needs_revision' || stage.status === 'revisions_needed';
                  const deliveredOutputs = (stage.outputs || []).filter(output => output.isDelivered || output.value || output.url || output.assetId || output.fileName);

                  return (
                    <div
                      key={stage.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                        stage.status === 'in_progress'
                          ? 'bg-blue-50/50 border-blue-300 ring-1 ring-blue-100'
                          : stage.status === 'approved' || stage.status === 'completed'
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : stage.status === 'skipped'
                          ? 'bg-slate-50 border-slate-200'
                          : (stage.status === 'pending_approval' || stage.status === 'ready_for_review')
                          ? 'bg-purple-50/50 border-purple-200'
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
                              ? 'bg-blue-600 text-white'
                              : stage.status === 'pending_approval' || stage.status === 'ready_for_review'
                              ? 'bg-purple-600 text-white'
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
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                {stageDept?.name || stage.departmentId}
                              </span>
                              {getStageStatusBadge(stage.status, readyForStart, stage.reviewRequired !== false)}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{stage.description}</p>
                          </div>
                        </div>

                        {/* Assignee & Deadline */}
                        <div className="flex items-center gap-3 flex-wrap text-xs">
                          {/* Assignee dropdown */}
                          
<div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
  {assignedUser ? (
    <>
      <Avatar user={assignedUser} size="xs" />
      <span className="font-bold text-slate-800 text-xs px-1 py-0.5">{assignedUser.name}</span>
    </>
  ) : (
    <>
      <Users className="w-3.5 h-3.5 text-slate-400" />
      <span className="font-bold text-slate-500 text-xs px-1 py-0.5">بدون مسئول</span>
    </>
  )}
</div>

                          
<div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200">
  {(() => {
    const approver = users.find(u => u.id === (stage.reviewerId || stage.approverId));
    return stage.reviewRequired === false ? (
      <>
        <Users className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-bold text-amber-700 text-xs px-1 py-0.5">بدون نیاز به ارزیاب</span>
      </>
    ) : approver ? (
      <>
        <Avatar user={approver} size="xs" />
        <span className="font-bold text-amber-800 text-xs px-1 py-0.5">{approver.name}</span>
      </>
    ) : (
      <>
        <Users className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-bold text-amber-700 text-xs px-1 py-0.5">ارزیاب تعیین نشده</span>
      </>
    );
  })()}
</div>


                          {stage.deadline && (
                            <div className="flex items-center gap-1 text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-mono">{formatPersianDate(stage.deadline)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Inputs & Deliverables */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                        {/* Inputs */}
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 md:col-span-2">
                          <span className="text-[11px] font-bold text-slate-600 block mb-1.5">ورودی‌های مورد نیاز مرحله:</span>
                          {stage.inputs && stage.inputs.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {stage.inputs.map((inp, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700 text-[11px]">
                                  • {inp.title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">ورودی خاصی تعیین نشده است.</span>
                          )}
                        </div>

                        {/* Outputs / Deliverables */}
                        <section className="md:col-span-2 overflow-hidden rounded-2xl border border-indigo-100 bg-white">
                          <header className="flex flex-col gap-3 border-b border-indigo-100 bg-indigo-50/45 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-white text-indigo-600 shadow-2xs"><FileCheck className="h-5 w-5" /></span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2"><h4 className="text-xs font-black text-slate-800">خروجی‌های مرحله</h4><span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-black text-indigo-700">{deliveredOutputs.length.toLocaleString('fa-IR')} تحویل</span></div>
                                <p className="mt-1 text-[10px] text-slate-500">فایل‌ها، پیوندها و اقلام نهایی ثبت‌شده برای این مرحله</p>
                              </div>
                            </div>
                            {currentUser.id === stage.assigneeId && <button type="button" onClick={() => { setDeliverableError(''); setSelectedStageForDeliverable(stage); }} className="ui-button ui-button-secondary !min-h-8 !rounded-xl !px-3 !py-1.5 text-[10px]"><Plus className="h-3.5 w-3.5" />ثبت خروجی جدید</button>}
                          </header>

                          <div className="p-3 sm:p-4">
                            {deliveredOutputs.length > 0 ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{deliveredOutputs.map((output, idx) => {
                              const link = resourceUrl(output.url);
                              const outputTitle = output.name || output.fileName || `خروجی ${(idx + 1).toLocaleString('fa-IR')}`;
                              return <article key={output.id || idx} onClick={() => setPreviewOutput({ output, stageTitle: stage.title })} className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white transition-colors hover:border-indigo-200 hover:bg-indigo-50/20">
                                <div className="flex items-start gap-3 p-3.5">
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100">{link ? <Link2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2"><h5 className="break-words text-xs font-black leading-5 text-slate-900">{outputTitle}</h5><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">تحویل‌شده</span></div>
                                    {output.value ? <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-[10px] leading-5 text-slate-500">{output.value}</p> : <p className="mt-1.5 text-[10px] text-slate-400">برای مشاهدهٔ اطلاعات کامل، کارت را باز کنید.</p>}
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                      {output.fileName && <span className="max-w-[190px] truncate rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600" title={output.fileName}><Paperclip className="ml-1 inline h-3 w-3" />{output.fileName}</span>}
                                      {output.fileSize && <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] text-slate-500">{output.fileSize}</span>}
                                      {output.assetId && <span className="rounded-lg bg-sky-50 px-2 py-1 text-[9px] font-bold text-sky-700">ثبت‌شده در مخزن</span>}
                                      {link && <span className="rounded-lg bg-violet-50 px-2 py-1 text-[9px] font-bold text-violet-700">دارای پیوند</span>}
                                    </div>
                                  </div>
                                </div>
                                <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-3.5 py-2">
                                  <span className="text-[9px] text-slate-400">خروجی شمارهٔ {(idx + 1).toLocaleString('fa-IR')}</span>
                                  <div className="flex flex-wrap items-center justify-end gap-1">
                                    <button type="button" onClick={event => { event.stopPropagation(); setPreviewOutput({ output, stageTitle: stage.title }); }} className="ui-button ui-button-ghost !min-h-7 !rounded-lg !px-2 !py-1 text-[10px]"><Eye className="h-3.5 w-3.5" />جزئیات</button>
                                    {link && <a href={link} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} className="ui-button ui-button-ghost !min-h-7 !rounded-lg !px-2 !py-1 text-[10px]"><ExternalLink className="h-3.5 w-3.5" />بازکردن</a>}
                                    {output.assetId && <button type="button" onClick={event => { event.stopPropagation(); setDetailAssetId(String(output.assetId)); setActiveView('assets'); }} className="ui-button ui-button-ghost !min-h-7 !rounded-lg !px-2 !py-1 text-[10px]" title="مشاهده دارایی در مخزن"><FolderKanban className="h-3.5 w-3.5" />مخزن</button>}
                                    {currentUser.id === stage.assigneeId && <button type="button" onClick={event => { event.stopPropagation(); if (confirm('آیا از حذف این خروجی اطمینان دارید؟')) void runStageAction(`remove:${stage.id}:${output.id}`, () => removeStageDeliverable(content.id, stage.id, output.id)); }} disabled={stageActionKey === `remove:${stage.id}:${output.id}`} className="ui-button ui-button-ghost ui-icon-button !min-h-7 !w-7 text-rose-600" title="حذف خروجی" aria-label="حذف خروجی">{stageActionKey === `remove:${stage.id}:${output.id}` ? <InlineSpinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />}</button>}
                                  </div>
                                </footer>
                              </article>;
                            })}</div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-300 shadow-2xs"><FileText className="h-5 w-5" /></span><p className="mt-2 text-[11px] font-bold text-slate-500">هنوز خروجی تحویل نشده است.</p><p className="mt-1 text-[9px] text-slate-400">مسئول مرحله می‌تواند فایل، پیوند یا دارایی خروجی را ثبت کند.</p></div>}

                            {(stage.outputs || []).some(output => !output.isDelivered && !output.value && !output.url && !output.assetId && !output.fileName) && <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/50 p-2.5"><p className="mb-1.5 text-[9px] font-black text-amber-700">خروجی‌های مورد انتظار</p><div className="flex flex-wrap gap-1.5">{stage.outputs.filter(output => !output.isDelivered && !output.value && !output.url && !output.assetId && !output.fileName).map(output => <span key={output.id} className="rounded-lg border border-amber-100 bg-white px-2 py-1 text-[9px] font-bold text-slate-600">{output.name}</span>)}</div></div>}
                          </div>
                        </section>
                      </div>

                      {/* Stage Action Controls */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {readyForStart && (
                            <button
                              onClick={() => {
                                if (currentUser.id === stage.assigneeId) {
                                  void runStageAction(`start:${stage.id}`, () => updateStageStatus(content.id, stage.id, 'in_progress'));
                                } else {
                                  alert('فقط مسئول این مرحله می‌تواند کار را شروع کند.');
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer ${currentUser.id === stage.assigneeId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 opacity-50 cursor-not-allowed'}`}
                              disabled={currentUser.id !== stage.assigneeId || !!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`) || !(content.access?.edit ?? hasPermission('content.edit'))}
                              title={currentUser.id !== stage.assigneeId ? 'فقط مسئول این مرحله می‌تواند کار را شروع کند' : 'شروع کار'}
                            >
                              {stageActionKey === `start:${stage.id}` && <InlineSpinner size="sm" className="text-white" />}
                              {stageActionKey === `start:${stage.id}` ? 'در حال شروع…' : 'شروع این مرحله'}
                            </button>
                          )}

                          {stage.status === 'in_progress' && (
                            <button
                              onClick={() => {
                                if (currentUser.id === stage.assigneeId) {
                                  void runStageAction(`submit:${stage.id}`, () => updateStageStatus(content.id, stage.id, stage.reviewRequired === false ? 'completed' : 'pending_approval'));
                                } else {
                                  alert(stage.reviewRequired === false ? 'فقط مسئول این مرحله می‌تواند آن را تکمیل کند.' : 'فقط مسئول این مرحله می‌تواند کار را جهت بررسی ارسال کند.');
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer ${currentUser.id === stage.assigneeId ? stage.reviewRequired === false ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-purple-600 hover:bg-purple-700' : 'bg-slate-300 opacity-50 cursor-not-allowed'}`}
                              disabled={currentUser.id !== stage.assigneeId || !!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`) || !(content.access?.edit ?? hasPermission('content.edit'))}
                              title={currentUser.id !== stage.assigneeId ? 'فقط مسئول مرحله مجاز به این اقدام است' : stage.reviewRequired === false ? 'تکمیل مستقیم مرحله بدون ارزیابی' : 'ارسال جهت بررسی و تأیید'}
                            >
                              {stageActionKey === `submit:${stage.id}` && <InlineSpinner size="sm" className="text-white" />}
                              {stageActionKey === `submit:${stage.id}` ? 'در حال ثبت…' : stage.reviewRequired === false ? 'تکمیل مرحله' : 'ارسال جهت بررسی و تأیید'}
                            </button>
                          )}

                          {['pending_approval', 'ready_for_review'].includes(stage.status) && (
                            content.reviewableStageIds?.includes(stage.id)
                              ? <div className="flex flex-wrap items-center gap-2">
                                  <button type="button" disabled={!!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)} onClick={() => void runStageAction(`approve:${stage.id}`, () => approveStage(content.id, stage.id))} className="ui-button ui-button-primary !min-h-8 !px-2.5 !py-1 text-[11px]">{stageActionKey === `approve:${stage.id}` ? <InlineSpinner size="sm" className="text-white" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{stageActionKey === `approve:${stage.id}` ? 'در حال تأیید…' : 'تأیید مستقیم'}</button>
                                  <button type="button" disabled={!!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`)} onClick={() => { setRejectReason(''); setSelectedStageForReject(stage); }} className="ui-button ui-button-danger !min-h-8 !px-2.5 !py-1 text-[11px]"><RotateCcw className="h-3.5 w-3.5" />نیازمند اصلاح</button>
                                </div>
                              : <span className="text-xs text-slate-500">در انتظار تصمیم بررسی‌کنندهٔ مجاز</span>
                          )}

                          {needsRevision && (
                            <button
                              onClick={() => {
                                if (currentUser.id === stage.assigneeId) {
                                  void runStageAction(`revise:${stage.id}`, () => updateStageStatus(content.id, stage.id, 'in_progress'));
                                } else {
                                  alert('فقط مسئول این مرحله می‌تواند اصلاحات را شروع کند.');
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer ${currentUser.id === stage.assigneeId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-amber-300 opacity-50 cursor-not-allowed'}`}
                              disabled={currentUser.id !== stage.assigneeId || !!stageActionKey || pendingMutationKeys.includes(`contents:${content.id}`) || !(content.access?.edit ?? hasPermission('content.edit'))}
                              title={currentUser.id !== stage.assigneeId ? 'فقط مسئول این مرحله می‌تواند اصلاحات را شروع کند' : 'شروع اصلاحات'}
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

        {/* TAB 2: Info & Scenario */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                توضیحات و سناریوی تولید
              </h3>
              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {content.description || 'توضیحات تکمیلی برای این محتوا ثبت نشده است.'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2.5 text-xs">
                <h4 className="font-bold text-slate-900">مشخصات کلیدی محتوا</h4>
                <div className="flex justify-between py-1.5 border-b border-slate-200/60">
                  <span className="text-slate-500">موضوع / دسته‌بندی:</span>
                  <span className="font-bold text-slate-800">{content.topic || 'عمومی'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200/60">
                  <span className="text-slate-500">مخاطب هدف:</span>
                  <span className="font-bold text-slate-800">{content.targetAudience || 'عموم جامعه'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">هدف رسانه‌ای:</span>
                  <span className="font-bold text-slate-800">{content.mediaGoal || 'آگاهی‌بخشی و اطلاع‌رسانی'}</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2.5 text-xs">
                <h4 className="font-bold text-slate-900">پروژه و وابستگی‌های سازمانی</h4>
                <div className="flex justify-between py-1.5 border-b border-slate-200/60">
                  <span className="text-slate-500">پروژه سازمانی متصل:</span>
                  <span className="font-bold text-indigo-600">{connectedProject?.name || 'محتوای مستقل'}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-200/60">
                  <span className="text-slate-500">دپارتمان مجری:</span>
                  <span className="font-bold text-slate-800">{dept?.name || 'دپارتمان تولید محتوا'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-500">مدیر پرونده:</span>
                  <span className="font-bold text-slate-800">{owner?.name || 'نامشخص'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Attachments / Files */}
        {!runtime.demoMode && activeTab === 'attachments' && <div className="space-y-4"><DamLibrary context={{content_id:Number(content.id)}}/>{!!content.attachments?.length && <section className="p-4 border rounded-xl space-y-2" aria-label="پیوست‌های قدیمی محتوا"><h3 className="font-bold">پیوست‌های ثبت‌شده در ساختار قدیمی</h3>{content.attachments.map(att=><div key={att.id} className="flex gap-3 flex-wrap text-sm"><span>{att.name}</span>{resourceUrl(att.url) ? <a href={resourceUrl(att.url)!} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">دریافت</a> : <span className="text-slate-500">پیوند قابل دریافت در دسترس نیست.</span>}</div>)}</section>}</div>}
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

              {!isPublished && workflowReady && hasPermission('content.publish') && (
                <button
                  disabled={publishingContentIds.includes(content.id)}
                onClick={() => void publishContentNow(content.id)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>ثبت انتشار در تدبیر</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <span className="font-bold text-slate-800 block">پلتفرم‌های انتخاب‌شده برای انتشار:</span>
                <div className="flex flex-wrap gap-2">
                  {content.publishInfo?.channels?.map(platformId => {
                    const config = platformConfig(platformId);
                    const Icon = getPlatformIcon(config?.iconName || 'Globe');
                    const appearance = platformAppearance(platformId);
                    return <span key={platformId} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" style={{ color: appearance.color, backgroundColor: appearance.backgroundColor, borderColor: `${appearance.color}38` }}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border bg-white/65" style={{ borderColor: `${appearance.color}2b` }}><Icon className="h-4 w-4" /></span>{platformLabel(platformId)}
                    </span>;
                  })}
                </div>

                <div className="pt-3 border-t border-slate-200/60 space-y-1">
                  <span className="text-slate-500 block">زمان‌بندی:</span>
                  <span className="font-bold text-slate-800">
                    {content.publishInfo?.date ? `${content.publishInfo.date} ساعت ${content.publishInfo.time || '18:00'}` : 'تنظیم نشده'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                <span className="font-bold text-slate-800 block">متن کپشن / هشتگ‌های همراه:</span>
                <div className="p-3 bg-white border border-slate-200 rounded-xl text-slate-700 leading-relaxed min-h-[90px] whitespace-pre-wrap">
                  {content.publishInfo?.caption || 'متن کپشنی تعریف نشده است.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Connected Tasks */}
        {!runtime.demoMode && activeTab === 'tasks' && <RelatedRecords module="tasks" scope={{content_id:content.id}} variant="task-list" />}
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

        {/* TAB 6: Comments & Discussion */}
        {activeTab === 'comments' && (
          <div className="space-y-6">
            <h3 className="text-sm font-black text-slate-900">گفتگوها و بازخوردهای تیم</h3>

            <form onSubmit={handleSendComment} className="flex gap-2">
              <input
                type="text"
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                placeholder="ثبت نظر یا بازخورد برای تیم تولید..."
                className="comment-composer flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>ارسال</span>
              </button>
            </form>

            <div className="space-y-3">
              {content.comments && content.comments.length > 0 ? (
                content.comments.map(c => (
                  <div key={c.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{c.userName}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{c.timestamp}</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">{c.text}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 py-6 text-center">نظری برای این محتوا ثبت نشده است.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Output preview */}
      <Modal open={!!previewOutput} onClose={() => setPreviewOutput(null)} title="جزئیات خروجی مرحله" description={previewOutput?.stageTitle} icon={<FileCheck className="h-5 w-5" />}>
        {previewOutput && <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-white text-indigo-600"><FileText className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-black text-slate-900">{previewOutput.output.name || previewOutput.output.fileName || 'خروجی مرحله'}</h3><div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-slate-500">{previewOutput.output.fileName && <span>{previewOutput.output.fileName}</span>}{previewOutput.output.fileSize && <span>• {previewOutput.output.fileSize}</span>}{previewOutput.output.deliveredAt && <span>• تحویل: {previewOutput.output.deliveredAt}</span>}</div></div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700">تحویل‌شده</span>
          </div>
          {previewOutput.output.value && <section><h4 className="mb-2 text-[11px] font-black text-slate-700">توضیحات و گزارش خروجی</h4><p className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-7 text-slate-600">{previewOutput.output.value}</p></section>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            {previewOutput.output.assetId && <button type="button" onClick={() => { setDetailAssetId(String(previewOutput.output.assetId)); setPreviewOutput(null); setActiveView('assets'); }} className="ui-button ui-button-secondary"><FolderKanban className="h-4 w-4" />نمایش در مخزن</button>}
            {resourceUrl(previewOutput.output.url) && <a href={resourceUrl(previewOutput.output.url)!} target="_blank" rel="noopener noreferrer" className="ui-button ui-button-primary"><ExternalLink className="h-4 w-4" />بازکردن خروجی</a>}
            <button type="button" onClick={() => setPreviewOutput(null)} className="ui-button ui-button-ghost">بستن</button>
          </div>
        </div>}
      </Modal>

      {/* Deliverable Modal */}
      {selectedStageForDeliverable && (
        <Modal open busy={isSavingDeliverable} onClose={()=>setSelectedStageForDeliverable(null)} title={`ثبت خروجی مرحله «${selectedStageForDeliverable.title}»`}><div className="p-5">
            <p className="text-xs text-slate-500 mb-4">فایل، پیوند یا متن خروجی ابتدا در مخزن مرکزی DAM ثبت و سپس به این مرحله متصل می‌شود.</p>

            <form onSubmit={handleAddDeliverableSubmit} className="space-y-3">
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

              <AttachmentComposer
                value={deliverableDraft}
                onChange={setDeliverableDraft}
                disabled={isSavingDeliverable}
                title="فایل‌ها و دارایی‌های خروجی"
                defaultFolderLabel={`پیش‌فرض خودکار: محتواها / ${contentTypes.find(type => type.id === content.type)?.name || content.type} / ${content.title} / خروجی‌ها`}
              />


              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">توضیحات تکمیلی</label>
                <textarea
                  rows={2}
                  value={deliverableNotes}
                  onChange={e => setDeliverableNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none"
                />
              </div>

              {deliverableError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{deliverableError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSavingDeliverable} onClick={() => setSelectedStageForDeliverable(null)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSavingDeliverable}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-xl cursor-pointer"
                >
                  {isSavingDeliverable ? 'در حال ثبت در DAM...' : 'ثبت خروجی'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {selectedStageForReject && (
        <Modal open busy={rejectSaving} onClose={()=>setSelectedStageForReject(null)} title={`عدم تأیید و درخواست بازبینی مرحله «${selectedStageForReject.title}»`}><div className="p-5">
            <p className="text-xs text-slate-500 mb-4">دلایل عدم تأیید و نکات نیازمند اصلاح را جهت اطلاع مسئول مرحله درج کنید.</p>

            <form onSubmit={handleRejectSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">علت عدم تأیید و نکات اصلاحی *</label>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="نکات کیفی، ویرایشی یا فنی مورد نظر..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={rejectSaving} onClick={() => setSelectedStageForReject(null)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={rejectSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70 rounded-xl cursor-pointer"
                >
                  {rejectSaving && <InlineSpinner size="sm" className="text-white" />}
                  {rejectSaving ? 'در حال ثبت…' : 'ثبت بازبینی'}
                </button>
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
