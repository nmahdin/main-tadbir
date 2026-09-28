import { getContentStatusBadge } from '../../utils/statusBadges';
import React, { useState, useRef } from 'react';
import { formatPersianDate } from '../../utils/date';
import { useApp } from '../../context/AppContext';
import { ContentStageStatus, ContentStage } from '../../types';
import { Avatar } from '../common/Avatar';
import { EditContentModal } from './EditContentModal';
import { EditWorkflowModal } from './EditWorkflowModal';
import { Settings } from 'lucide-react';
import {
  ArrowRight,
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
  Tag
} from 'lucide-react';

export const ContentDetailView: React.FC = () => {
  const {
    contents,
    selectedContentId,
    setActiveView, hasPermission,
    setSelectedProjectId,
    users,
    departments,
    projects,
    publishingPlatforms,
    changeContentStatus,
    updateContentPublishInfo,
    publishContentNow,
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
    currentUser
  } = useApp();

  const [activeTab, setActiveTab] = useState<'process' | 'info' | 'attachments' | 'publish' | 'tasks' | 'comments'>('process');
  const [commentInput, setCommentInput] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditWorkflowOpen, setIsEditWorkflowOpen] = useState(false);

  // Deliverable modal
  const [selectedStageForDeliverable, setSelectedStageForDeliverable] = useState<ContentStage | null>(null);
  const [deliverableTitle, setDeliverableTitle] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null);

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
        <button
          onClick={() => setActiveView('content')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
        >
          بازگشت به فهرست مدیریت محتوا
        </button>
      </div>
    );
  }

  const dept = departments.find(d => d.id === content.departmentId);
  const owner = users.find(u => u.id === content.ownerId);
  const connectedProject = projects.find(p => p.id === content.projectId);
  const isPublished = content.status === 'published' || content.publishInfo?.status === 'published';
  const canManageContentWorkflow = currentUser.role === 'admin' || currentUser.role === 'content_manager';

  const stages = content.stages || [];

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    addContentComment(content.id, commentInput.trim());
    setCommentInput('');
  };

  const handleAddDeliverableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStageForDeliverable || !deliverableTitle.trim()) return;
    addStageDeliverable(content.id, selectedStageForDeliverable.id, `out-new-${Date.now()}`, {
      title: deliverableTitle.trim(),
      url: deliverableFile ? URL.createObjectURL(deliverableFile) : (deliverableUrl.trim() || undefined),
      value: deliverableNotes.trim() || undefined
    });
    setSelectedStageForDeliverable(null);
    setDeliverableTitle('');
    setDeliverableUrl('');
    setDeliverableNotes('');
    setDeliverableFile(null);
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStageForReject || !rejectReason.trim()) return;
    rejectStage(content.id, selectedStageForReject.id, rejectReason.trim());
    setSelectedStageForReject(null);
    setRejectReason('');
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

  const getStageStatusBadge = (status: ContentStageStatus) => {
    switch (status) {
      case 'completed':
      case 'approved':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3.5 h-3.5" /> تأییدشده و نهایی</span>;
      case 'ready_for_review':
      case 'pending_approval':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200"><FileCheck className="w-3.5 h-3.5" /> در انتظار بررسی مدیر</span>;
      case 'in_progress':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200"><Activity className="w-3.5 h-3.5 animate-pulse" /> در حال انجام</span>;
      case 'revisions_needed':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"><RotateCcw className="w-3.5 h-3.5" /> نیازمند بازبینی و اصلاح</span>;
      case 'pending_dependency':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3.5 h-3.5" /> در انتظار مرحله قبل</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">شروع‌نشده</span>;
    }
  };

  const connectedTasks = tasks.filter(t => content.taskIds?.includes(t.id) || (t.title && t.title.includes(content.title)));

  return (
    <div className="space-y-6 animate-in fade-in duration-200 text-right" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => setActiveView('content')}
              className="p-2.5 bg-slate-100 text-slate-600 rounded-2xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors cursor-pointer"
              title="بازگشت به فهرست محتوا"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100">
    {content.type}
  </span>
  {getContentStatusBadge(content.status)}
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
                {isPublished && (
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    منتشرشده
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                {content.title}
              </h1>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {hasPermission('content.edit') && (
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

            {!isPublished && hasPermission('content.publish') && (
              <button
                onClick={() => publishContentNow(content.id)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>انتشار آنی</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Metadata Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-slate-400">صاحب پرونده</span>
            <span className="font-bold text-slate-800">{owner?.name || 'نامشخص'}</span>
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
              {content.publishInfo?.channels?.join('، ') || 'وب‌سایت رسمی'}
            </span>
          </div>
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
          پیوست‌ها و فایل‌های خام ({content.attachments?.length || 0})
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
          تسک‌های مرتبط ({connectedTasks.length})
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

                  return (
                    <div
                      key={stage.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                        stage.status === 'in_progress'
                          ? 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-100'
                          : stage.status === 'approved' || stage.status === 'completed'
                          ? 'bg-emerald-50/30 border-emerald-200'
                          : (stage.status === 'pending_approval' || stage.status === 'ready_for_review')
                          ? 'bg-purple-50/40 border-purple-200'
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
                              : 'bg-slate-200 text-slate-700'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-sm text-slate-900">{stage.title}</h4>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                {stageDept?.name || stage.departmentId}
                              </span>
                              {getStageStatusBadge(stage.status)}
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
    const approver = users.find(u => u.id === stage.approverId);
    return approver ? (
      <>
        <Avatar user={approver} size="xs" />
        <span className="font-bold text-amber-800 text-xs px-1 py-0.5">{approver.name}</span>
      </>
    ) : (
      <>
        <Users className="w-3.5 h-3.5 text-amber-500" />
        <span className="font-bold text-amber-700 text-xs px-1 py-0.5">بدون ارزیاب</span>
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
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
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
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-slate-600">خروجی‌ها و فایل‌های تحویلی:</span>
                            {currentUser.id === stage.assigneeId ? (
                            <button
                              type="button"
                              onClick={() => setSelectedStageForDeliverable(stage)}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>ثبت خروجی</span>
                            </button>
                            ) : null}
                          </div>

                          {stage.outputs && stage.outputs.length > 0 ? (
                            <div className="space-y-1">
                              {stage.outputs.map((del, idx) => (
                                <div key={idx} className="flex items-center justify-between p-1.5 bg-white border border-slate-200 rounded-lg text-[11px]">
                                  <span className="font-bold text-slate-800 truncate">{del.name} {del.fileName ? `(${del.fileName})` : ''}</span>
                                  {del.url && (
                                    <div className="flex items-center gap-2">
                                      {del.url && (
                                        <a href={del.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-0.5">
                                          <ExternalLink className="w-3 h-3" />
                                          <span>مشاهده</span>
                                        </a>
                                      )}
                                      {currentUser.id === stage.assigneeId && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if(confirm('آیا از حذف این خروجی اطمینان دارید؟')) {
                                            removeStageDeliverable(content.id, stage.id, del.id);
                                          }
                                        }}
                                        className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                        title="حذف خروجی"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">هنوز خروجی ثبت نشده است.</span>
                          )}
                        </div>
                      </div>

                      {/* Stage Action Controls */}
                      <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {(stage.status === 'not_started' || stage.status === 'ready') && (
                            <button
                              onClick={() => {
                                if (currentUser.id === stage.assigneeId) {
                                  updateStageStatus(content.id, stage.id, 'in_progress');
                                } else {
                                  alert('فقط مسئول این مرحله می‌تواند کار را شروع کند.');
                                }
                              }}
                              className={`px-3 py-1.5 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer ${currentUser.id === stage.assigneeId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 opacity-50 cursor-not-allowed'}`}
                              disabled={currentUser.id !== stage.assigneeId}
                              title={currentUser.id !== stage.assigneeId ? 'فقط مسئول این مرحله می‌تواند کار را شروع کند' : 'شروع کار'}
                            >
                              شروع این مرحله
                            </button>
                          )}

                          {stage.status === 'in_progress' && (
                            <button
                              onClick={() => {
                                if (currentUser.id === stage.assigneeId) {
                                  updateStageStatus(content.id, stage.id, 'pending_approval');
                                } else {
                                  alert('فقط مسئول این مرحله می‌تواند کار را جهت بررسی ارسال کند.');
                                }
                              }}
                              className={`px-3 py-1.5 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer ${currentUser.id === stage.assigneeId ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-300 opacity-50 cursor-not-allowed'}`}
                              disabled={currentUser.id !== stage.assigneeId}
                              title={currentUser.id !== stage.assigneeId ? 'فقط مسئول این مرحله می‌تواند کار را جهت بررسی ارسال کند' : 'ارسال جهت بررسی و تأیید'}
                            >
                              ارسال جهت بررسی و تأیید
                            </button>
                          )}

                          {(stage.status === 'pending_approval' || stage.status === 'ready_for_review') && (
                            <div className="flex items-center gap-2">
                              {(() => {
                                const project = projects.find(p => p.id === content.projectId);
                                const canApprove = currentUser.id === stage.approverId || currentUser.id === project?.projectManagerId || currentUser.id === content.ownerId;
                                return (
                                  <>
                                    <button
                                      onClick={() => {
                                        if (canApprove) {
                                          approveStage(content.id, stage.id);
                                        } else {
                                          alert('شما مجاز به تأیید این مرحله نیستید.');
                                        }
                                      }}
                                      className={`px-3 py-1.5 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1 cursor-pointer ${canApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-300 opacity-50 cursor-not-allowed'}`}
                                      disabled={!canApprove}
                                      title={!canApprove ? 'فقط تأییدکننده و مدیر پروژه مجاز هستند' : 'تأیید کار'}
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>تأیید مرحله و انتقال به گام بعد</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (canApprove) setSelectedStageForReject(stage);
                                        else alert('شما مجاز به رد این مرحله نیستید.');
                                      }}
                                      className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${canApprove ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-400 border-slate-200 opacity-50 cursor-not-allowed'}`}
                                      disabled={!canApprove}
                                      title={!canApprove ? 'فقط تأییدکننده و مدیر پروژه مجاز هستند' : 'رد کار'}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>رد / نیاز به اصلاح</span>
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {stage.status === 'revisions_needed' && (
                            <button
                              onClick={() => {
                                if (currentUser.id === stage.assigneeId) {
                                  updateStageStatus(content.id, stage.id, 'in_progress');
                                } else {
                                  alert('فقط مسئول این مرحله می‌تواند اصلاحات را شروع کند.');
                                }
                              }}
                              className={`px-3 py-1.5 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer ${currentUser.id === stage.assigneeId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-amber-300 opacity-50 cursor-not-allowed'}`}
                              disabled={currentUser.id !== stage.assigneeId}
                              title={currentUser.id !== stage.assigneeId ? 'فقط مسئول این مرحله می‌تواند اصلاحات را شروع کند' : 'شروع اصلاحات'}
                            >
                              شروع اصلاحات
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
        {activeTab === 'attachments' && (
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

              {!isPublished && hasPermission('content.publish') && (
                <button
                  onClick={() => publishContentNow(content.id)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>انتشار آنی در پلتفرم‌ها</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                <span className="font-bold text-slate-800 block">پلتفرم‌های انتخاب‌شده برای انتشار:</span>
                <div className="flex flex-wrap gap-2">
                  {content.publishInfo?.channels?.map((ch, idx) => (
                    <span key={idx} className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-xl text-xs shadow-2xs">
                      {ch}
                    </span>
                  ))}
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
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900">وظایف متصل به این محتوا</h3>
            {connectedTasks.length > 0 ? (
              <div className="space-y-2">
                {connectedTasks.map(t => (
                  <div key={t.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-slate-800">{t.title}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-white border text-slate-600 font-mono text-[11px]">{t.status}</span>
                  </div>
                ))}
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
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500"
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

      {/* Deliverable Modal */}
      {selectedStageForDeliverable && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h4 className="font-extrabold text-sm text-slate-900 mb-1">ثبت خروجی مرحله «{selectedStageForDeliverable.title}»</h4>
            <p className="text-xs text-slate-500 mb-4">عنوان خروجی، لینک فایل و توضیحات را وارد کنید.</p>

            <form onSubmit={handleAddDeliverableSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">عنوان خروجی *</label>
                <input
                  type="text"
                  required
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

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">آپلود فایل (جایگزین یا همراه لینک)</label>
                <div 
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                    deliverableFile ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                  }`}
                  onClick={() => document.getElementById('deliverableFileInput')?.click()}
                >
                  <input
                    id="deliverableFileInput"
                    type="file"
                    className="hidden"
                    onChange={(e) => setDeliverableFile(e.target.files?.[0] || null)}
                  />
                  {deliverableFile ? (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-bold text-slate-800">{deliverableFile.name}</div>
                      <div className="text-[10px] text-slate-500">{(deliverableFile.size / 1024 / 1024).toFixed(2)} MB</div>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
                        <UploadCloud className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-bold text-slate-600">برای انتخاب فایل کلیک کنید یا فایل را اینجا بکشید</div>
                      <div className="text-[10px] text-slate-400">PDF, JPG, MP4, ZIP (حداکثر ۵۰ مگابایت)</div>
                    </>
                  )}
                </div>
              </div>


              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">توضیحات تکمیلی</label>
                <textarea
                  rows={2}
                  value={deliverableNotes}
                  onChange={e => setDeliverableNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedStageForDeliverable(null)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer"
                >
                  ثبت خروجی
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {selectedStageForReject && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <h4 className="font-extrabold text-sm text-slate-900 mb-1">عدم تأیید و درخواست بازبینی مرحله «{selectedStageForReject.title}»</h4>
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
                  onClick={() => setSelectedStageForReject(null)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer"
                >
                  ثبت بازبینی
                </button>
              </div>
            </form>
          </div>
        </div>
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
