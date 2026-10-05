import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, Layers, Plus, Trash2, UserRound } from 'lucide-react';
import { Modal, Button, Input, Select, Textarea } from '../common/Primitives';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import type { Content, ContentStage } from '../../types';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';
import { platformIcon } from '../../utils/platformIcons';

type CustomStageDraft = { id: string; title: string; description: string; departmentId: string; assigneeId: string; reviewerId: string; reviewRequired: boolean; deadline: string; dependsOnPrevious: boolean };

const addCalendarDays = (date: string | undefined, days: number): string => {
  const base = date ? new Date(`${date}T00:00:00Z`) : new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + Math.max(0, days));
  return base.toISOString().split('T')[0];
};

const steps = [
  { id: 1, title: 'مشخصات محتوا', icon: FileText },
  { id: 2, title: 'برنامه انتشار', icon: CalendarClock },
  { id: 3, title: 'جریان محتوا', icon: Layers },
];

export const CreateContentModal: React.FC<{ isOpen?: boolean; onClose?: () => void }> = ({ isOpen, onClose }) => {
  const { departments, users, projects, processTemplates, contentTypes, targetAudiences, publishingPlatforms, addContent, addContentAttachment, setSelectedContentId, setActiveView, currentUser, hasPermission, isCreateContentOpen, setIsCreateContentOpen, contentCreateProjectId, setContentCreateProjectId } = useApp();
  const modalOpen = isOpen ?? isCreateContentOpen;
  const closeModal = onClose ?? (() => setIsCreateContentOpen(false));
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', type: contentTypes[0]?.id || 'video', topic: '', targetAudiences: targetAudiences[0] ? [targetAudiences[0]] : [] as string[], mediaGoal: '',
    departmentId: departments[0]?.id || '', processTemplateId: processTemplates[0]?.id || 'custom', projectId: '', ownerId: currentUser.id,
    publisherId: '', deadline: '', publishDate: '', publishTime: '18:00', caption: '', channels: [] as string[],
  });
  const [customStages, setCustomStages] = useState<CustomStageDraft[]>([
    { id: `custom-stage-${Date.now()}`, title: '', description: '', departmentId: departments[0]?.id || '', assigneeId: currentUser.id, reviewerId: '', reviewRequired: false, deadline: '', dependsOnPrevious: false },
  ]);
  const [templateStageAssignees, setTemplateStageAssignees] = useState<Record<string, string>>({});
  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);
  const [createdContent, setCreatedContent] = useState<Content | null>(null);
  const [initialFileError, setInitialFileError] = useState('');

  useEffect(() => {
    if (modalOpen) {
      setAttachmentDraft(createEmptyAttachmentDraft());
      setTemplateStageAssignees({});
      setCreatedContent(null);
      setInitialFileError('');
    }
  }, [modalOpen]);
  useEffect(() => {
    if (modalOpen && contentCreateProjectId) setFormData(previous => ({ ...previous, projectId: contentCreateProjectId }));
    if (!modalOpen && contentCreateProjectId) setContentCreateProjectId(null);
  }, [modalOpen, contentCreateProjectId, setContentCreateProjectId]);
  useEffect(() => {
    if (!formData.channels.length && publishingPlatforms[0]) setFormData(previous => ({ ...previous, channels: [publishingPlatforms[0].id] }));
  }, [publishingPlatforms, formData.channels.length]);
  useEffect(() => {
    if (modalOpen && !formData.targetAudiences.length && targetAudiences[0]) {
      setFormData(previous => ({ ...previous, targetAudiences: [targetAudiences[0]] }));
    }
  }, [modalOpen, targetAudiences, formData.targetAudiences.length]);
  useEffect(() => {
    if (!modalOpen || !departments[0]) return;
    const fallbackId = departments.find(department => department.status === 'active')?.id || departments[0].id;
    setFormData(previous => departments.some(department => department.id === previous.departmentId)
      ? previous
      : { ...previous, departmentId: fallbackId });
    setCustomStages(previous => previous.map(stage => {
      const departmentId = departments.some(department => department.id === stage.departmentId) ? stage.departmentId : fallbackId;
      const members = membersForDepartment(departmentId);
      return {
        ...stage,
        departmentId,
        assigneeId: members.some(user => user.id === stage.assigneeId) ? stage.assigneeId : '',
        reviewerId: members.some(user => user.id === stage.reviewerId) ? stage.reviewerId : '',
      };
    }));
  }, [modalOpen, departments, users]);
  useEffect(() => {
    if (!modalOpen || formData.processTemplateId === 'custom') return;
    const selectedIsCompatible = processTemplates.some(template => template.id === formData.processTemplateId && template.type === formData.type);
    if (!selectedIsCompatible) {
      const fallbackTemplate = processTemplates.find(template => template.type === formData.type);
      setFormData(previous => ({ ...previous, processTemplateId: fallbackTemplate?.id || 'custom' }));
    }
  }, [modalOpen, processTemplates, formData.processTemplateId, formData.type]);

  const membersForDepartment = (departmentId: string) => {
    const department = departments.find(item => item.id === departmentId);
    const memberIds = new Set([
      ...(department?.members || []).map(member => member.userId),
      ...(department?.managerId ? [department.managerId] : []),
    ]);
    return users.filter(user => user.status === 'active' && (user.departmentId === departmentId || memberIds.has(user.id)));
  };
  const compatibleTemplates = useMemo(() => processTemplates.filter(template => template.type === formData.type), [processTemplates, formData.type]);
  const selectedTemplate = useMemo(() => compatibleTemplates.find(template => template.id === formData.processTemplateId), [compatibleTemplates, formData.processTemplateId]);
  const templateStageKey = (templateId: string, stageKey: string, index: number) => `${templateId}:${stageKey}:${index}`;
  if (!modalOpen || !hasPermission('content.create')) return null;

  const customFlowValid = customStages.length > 0 && customStages.every(stage => stage.title.trim() && stage.departmentId);
  const validStep = step === 1
    ? !!formData.title.trim() && !!formData.type && !!formData.ownerId
    : step === 2
      ? !!formData.publishDate && !!formData.publishTime && formData.channels.length > 0
      : formData.processTemplateId === 'custom' ? customFlowValid : !!selectedTemplate;
  const toggleChannel = (id: string) => setFormData(previous => ({ ...previous, channels: previous.channels.includes(id) ? previous.channels.filter(channel => channel !== id) : [...previous.channels, id] }));
  const toggleAudience = (audience: string) => setFormData(previous => ({
    ...previous,
    targetAudiences: previous.targetAudiences.includes(audience)
      ? previous.targetAudiences.filter(item => item !== audience)
      : [...previous.targetAudiences, audience],
  }));
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step < 3) { if (validStep) setStep(step + 1); return; }
    if (!validStep || submitting) return;
    setSubmitting(true);
    let contentWasCreated = !!createdContent;
    try {
      const flowSeed = Date.now();
      const customFlow: ContentStage[] | undefined = formData.processTemplateId === 'custom'
        ? customStages.map((stage, index) => ({
            id: `stg-${flowSeed}-${index}`,
            stageKey: `custom_${index + 1}`,
            title: stage.title.trim(),
            description: stage.description.trim() || undefined,
            departmentId: stage.departmentId,
            departmentName: departments.find(department => department.id === stage.departmentId)?.name,
            assigneeId: stage.assigneeId || undefined,
            reviewerId: stage.reviewRequired ? (stage.reviewerId || formData.ownerId || undefined) : undefined,
            reviewRequired: stage.reviewRequired,
            deadline: stage.deadline || undefined,
            order: index + 1,
            dependsOnStageIds: stage.dependsOnPrevious && index > 0 ? [`stg-${flowSeed}-${index - 1}`] : [],
            status: stage.dependsOnPrevious && index > 0 ? 'pending_dependency' : 'not_started',
            inputs: [],
            outputs: [],
            activityLog: [],
          }))
        : undefined;
      const templateFlow: ContentStage[] | undefined = selectedTemplate
        ? (() => {
            let previousDeadline: string | undefined;
            return selectedTemplate.stages.map((stage, index) => {
              const candidates = membersForDepartment(stage.departmentId);
              const assignmentKey = templateStageKey(selectedTemplate.id, stage.stageKey, index);
              const defaultAssigneeId = index === 0 && candidates.some(user => user.id === currentUser.id) ? currentUser.id : '';
              const assigneeId = templateStageAssignees[assignmentKey] ?? defaultAssigneeId;
              const dependsOnPrevious = index > 0 && stage.dependsOnPrevious !== false;
              const startDate = addCalendarDays(undefined, stage.daysFromStart || 0);
              const relativeDueDays = stage.relativeDueDays ?? 2;
              const deadlinePolicy = stage.deadlinePolicy || 'relative_days';
              const deadline = deadlinePolicy === 'from_content'
                ? formData.deadline || undefined
                : deadlinePolicy === 'none' || deadlinePolicy === 'absolute_date'
                  ? undefined
                  : deadlinePolicy === 'from_previous' && previousDeadline
                    ? addCalendarDays(previousDeadline, relativeDueDays)
                    : addCalendarDays(startDate, relativeDueDays);
              previousDeadline = deadline || previousDeadline;
              return {
                id: `stg-${flowSeed}-${index}`,
                stageKey: stage.stageKey,
                title: stage.title,
                description: stage.description,
                departmentId: stage.departmentId,
                departmentName: departments.find(department => department.id === stage.departmentId)?.name || stage.departmentName,
                assigneeRole: stage.defaultRole,
                assigneeId: candidates.some(user => user.id === assigneeId) ? assigneeId : undefined,
                reviewerId: stage.reviewerStrategy === 'content_owner' ? formData.ownerId || undefined : undefined,
                reviewRequired: stage.reviewRequired !== false,
                reviewerStrategy: stage.reviewerStrategy || 'stage_reviewer',
                advanceMode: stage.advanceMode || 'approval',
                order: index + 1,
                status: dependsOnPrevious ? 'pending_dependency' : 'not_started',
                startDate,
                deadline,
                dependsOnStageIds: dependsOnPrevious ? [`stg-${flowSeed}-${index - 1}`] : [],
                inputs: stage.inputs.map((input, inputIndex) => ({
                  id: `inp-${flowSeed}-${index}-${inputIndex}`,
                  title: input.title,
                  description: input.description,
                  type: input.type,
                  isReady: !dependsOnPrevious,
                })),
                outputs: stage.outputs.map((output, outputIndex) => ({
                  id: `out-${flowSeed}-${index}-${outputIndex}`,
                  name: output.name,
                  type: output.type,
                  isRequired: output.isRequired,
                  isDelivered: false,
                })),
                checklist: (stage.checklist || []).map((item, checklistIndex) => ({ id: `chk-${flowSeed}-${index}-${checklistIndex}`, text: item.text, isCompleted: false })),
                activityLog: [],
              };
            });
          })()
        : undefined;
      let created = createdContent;
      if (!created) {
        created = await addContent({
          title: formData.title.trim(), description: formData.description.trim(), type: formData.type, topic: formData.topic.trim(),
          targetAudiences: formData.targetAudiences, targetAudience: formData.targetAudiences[0] || undefined,
          mediaGoal: formData.mediaGoal.trim(), departmentId: formData.departmentId || departments[0]?.id,
          processTemplateId: formData.processTemplateId, stages: customFlow || templateFlow, projectId: formData.projectId || undefined, ownerId: formData.ownerId || currentUser.id,
          publisherId: formData.publisherId || undefined, deadline: formData.deadline || undefined,
          publishInfo: { date: formData.publishDate, time: formData.publishTime, channels: formData.channels, caption: formData.caption.trim(), status: 'planned' },
        });
        if (!created) return;
        setCreatedContent(created);
      }
      contentWasCreated = true;
      setInitialFileError('');
      if (attachmentDraftCount(attachmentDraft) > 0) {
        if (/^\d+$/.test(created.id)) {
          await persistAttachmentDraft(attachmentDraft, {
            contentId: created.id,
            projectId: /^\d+$/.test(created.projectId || formData.projectId) ? (created.projectId || formData.projectId) : undefined,
            contentBucket: 'inputs',
            relationRole: 'initial_input',
          }, created.title, {
            onPersisted: (_item, source) => setAttachmentDraft(previous => ({
              ...previous,
              files: source.kind === 'file' ? previous.files.filter(file => `${file.name}:${file.size}:${file.lastModified}` !== source.key) : previous.files,
              fileDisplayNames: source.kind === 'file'
                ? Object.fromEntries(Object.entries(previous.fileDisplayNames || {}).filter(([key]) => key !== source.key))
                : previous.fileDisplayNames,
              texts: source.kind === 'text' ? previous.texts.filter(text => text.id !== source.key) : previous.texts,
              assets: source.kind === 'asset' ? previous.assets.filter(asset => String(asset.id) !== source.key) : previous.assets,
              tables: source.kind === 'table' ? previous.tables.filter(table => table.id !== source.key) : previous.tables,
            })),
          });
        } else {
          for (const file of attachmentDraft.files) {
            const key = `${file.name}:${file.size}:${file.lastModified}`;
            await addContentAttachment(created.id, { name: attachmentDraft.fileDisplayNames?.[key]?.trim() || file.name, size: `${Math.max(1, Math.round(file.size / 1024))} کیلوبایت`, type: file.type || 'file', url: URL.createObjectURL(file) });
          }
          for (const text of attachmentDraft.texts) await addContentAttachment(created.id, { name: text.title, size: `${text.body.length} نویسه`, type: 'text', url: '#' });
          for (const asset of attachmentDraft.assets) await addContentAttachment(created.id, { name: asset.latest_file?.original_filename || asset.title, size: asset.latest_file?.file_size ? `${Math.max(1, Math.round(asset.latest_file.file_size / 1024))} کیلوبایت` : '—', type: 'document', url: `/api/v1/dam/library/${asset.id}/preview` });
        }
      }
      closeModal(); setStep(1); setSelectedContentId(created.id); setActiveView('content-detail');
    } catch (caught) {
      // The canonical content already exists at this point. Keep the modal and
      // only the unsaved sources so retry never creates a second content/file.
      setInitialFileError(contentWasCreated
        ? (caught instanceof Error
          ? `محتوا ثبت شد، اما بارگذاری همه فایل‌های اولیه کامل نشد: ${caught.message}`
          : 'محتوا ثبت شد، اما بارگذاری فایل‌های اولیه کامل نشد. موارد باقی‌مانده را دوباره تلاش کنید.')
        : (caught instanceof Error ? caught.message : 'ایجاد محتوا انجام نشد؛ اطلاعات فرم حفظ شده است.'));
    } finally { setSubmitting(false); }
  };

  return <Modal open={modalOpen} onClose={closeModal} busy={submitting} title="ایجاد محتوای جدید" description="مشخصات، انتشار و جریان تولید را مرحله‌به‌مرحله تعریف کنید" icon={<FileText className="w-5 h-5" />}>
    <form onSubmit={handleSubmit}>
      <div className="border-b border-slate-100 bg-white px-5 sm:px-6 py-4">
        <ol className="grid grid-cols-3 gap-2">{steps.map(item => { const Icon = item.icon; const active = item.id === step; const done = item.id < step; return <li key={item.id} className={`rounded-xl border px-2.5 py-2 flex items-center gap-2 text-[10px] sm:text-xs font-bold ${active ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-400'}`}><span className={`w-7 h-7 rounded-lg flex items-center justify-center ${active ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-white'}`}>{done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}</span><span className="hidden sm:inline">{item.title}</span></li>; })}</ol>
      </div>

      <div className="p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[58dvh]">
        {step === 1 && <>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">عنوان محتوا <b className="text-rose-500">*</b></span><Input required value={formData.title} onChange={event => setFormData({ ...formData, title: event.target.value })} placeholder="مثال: گزارش تصویری عملکرد فصل" /></label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">نوع محتوا <b className="text-rose-500">*</b></span><Select required value={formData.type} onChange={event => { const type = event.target.value; const fallbackTemplate = processTemplates.find(template => template.type === type); setFormData({ ...formData, type, processTemplateId: fallbackTemplate?.id || 'custom' }); }}>{contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">موضوع</span><Input value={formData.topic} onChange={event => setFormData({ ...formData, topic: event.target.value })} /></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">پروژه مرتبط</span><Select value={formData.projectId} onChange={event => setFormData({ ...formData, projectId: event.target.value })}><option value="">محتوای مستقل</option>{projects.filter(project => project.status !== 'archived').map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">دپارتمان اصلی</span><Select value={formData.departmentId} onChange={event => setFormData({ ...formData, departmentId: event.target.value })}>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">مدیر پرونده <b className="text-rose-500">*</b></span><Select required value={formData.ownerId} onChange={event => setFormData({ ...formData, ownerId: event.target.value })}>{users.map(user => <option key={user.id} value={user.id}>{user.name} ({user.title})</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">موعد تحویل تولید</span><PersianDatePicker value={formData.deadline} onChange={deadline => setFormData({ ...formData, deadline })} placeholder="تاریخ تحویل" /></label>
          </div>
          <fieldset className="space-y-2"><legend className="text-xs font-bold text-slate-700">مخاطبان هدف</legend><div className="flex flex-wrap gap-2">{targetAudiences.map(audience => { const checked = formData.targetAudiences.includes(audience); return <button key={audience} type="button" aria-pressed={checked} onClick={() => toggleAudience(audience)} className={`rounded-xl border px-3 py-2 text-[11px] font-bold ${checked ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200'}`}>{checked && <Check className="ml-1 inline h-3.5 w-3.5" />}{audience}</button>; })}</div>{!targetAudiences.length && <p className="text-[11px] text-slate-400">مخاطب هدفی در تنظیمات سازمان تعریف نشده است.</p>}</fieldset>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">هدف رسانه‌ای / پیام کلیدی</span><Input value={formData.mediaGoal} onChange={event => setFormData({ ...formData, mediaGoal: event.target.value })} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">شرح و سناریوی اولیه</span><Textarea rows={4} value={formData.description} onChange={event => setFormData({ ...formData, description: event.target.value })} /></label>
          <AttachmentComposer value={attachmentDraft} onChange={setAttachmentDraft} disabled={submitting} title="فایل اولیه / منابع اولیه" defaultFolderLabel="پیش‌فرض خودکار: محتواها / نوع محتوا / کد و عنوان / ورودی‌ها" />
          {initialFileError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900"><strong className="block">ثبت محتوا از بین نرفته است.</strong>{initialFileError}<span className="mt-1 block text-[10px]">فایل‌های موفق در DAM حفظ شده‌اند و فقط موارد باقی‌مانده دوباره ارسال می‌شوند.</span></div>}
        </>}

        {step === 2 && <>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs leading-6 text-indigo-900"><CalendarClock className="inline w-4 h-4 ml-1" />زمان انتشار مستقل از موعد تحویل تولید است و در تقویم انتشار نمایش داده می‌شود.</div>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">ناشر (قابل تعیین پیش از پایان جریان)</span><Select value={formData.publisherId} onChange={event => setFormData({ ...formData, publisherId: event.target.value })}><option value="">بعداً تعیین می‌شود</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} ({user.title})</option>)}</Select></label>
          <div className="grid sm:grid-cols-2 gap-4"><label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">تاریخ انتشار <b className="text-rose-500">*</b></span><PersianDatePicker value={formData.publishDate} onChange={publishDate => setFormData({ ...formData, publishDate })} placeholder="تاریخ انتشار" /></label><label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">ساعت انتشار <b className="text-rose-500">*</b></span><Input type="time" dir="ltr" value={formData.publishTime} onChange={event => setFormData({ ...formData, publishTime: event.target.value })} /></label></div>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">متن کپشن</span><Textarea rows={4} maxLength={10000} value={formData.caption} onChange={event => setFormData({ ...formData, caption: event.target.value })} placeholder="کپشن نهایی، هشتگ‌ها و دعوت به اقدام را وارد کنید..." /></label>
          <fieldset className="space-y-2"><legend className="text-xs font-bold text-slate-700">پلتفرم‌های انتشار <b className="text-rose-500">*</b></legend><div className="grid sm:grid-cols-2 gap-2">{publishingPlatforms.map(platform => { const checked = formData.channels.includes(platform.id); const platformColor = /^#[0-9a-f]{6}$/i.test(platform.color || '') ? platform.color : '#4f46e5'; const platformBackground = /^#[0-9a-f]{6}$/i.test(platform.bg || '') ? platform.bg : `${platformColor}12`; const PlatformIcon = platformIcon(platform.iconName); return <button key={platform.id} type="button" onClick={() => toggleChannel(platform.id)} aria-pressed={checked} style={checked ? { borderColor: platformColor, backgroundColor: platformBackground, color: platformColor } : undefined} className={`rounded-xl border p-3 flex items-center gap-3 text-right transition ${checked ? 'shadow-xs' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'}`}><span style={checked ? { backgroundColor: platformColor } : undefined} className={`w-9 h-9 rounded-xl flex items-center justify-center ${checked ? 'text-white' : 'bg-slate-100'}`}><PlatformIcon className="w-4 h-4" /></span><span className="font-bold text-xs">{platform.name}</span>{checked && <CheckCircle2 style={{ color: platformColor }} className="w-4 h-4 mr-auto" />}</button>; })}</div></fieldset>
        </>}

        {step === 3 && <>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex items-center gap-2 text-indigo-900"><Layers className="w-5 h-5" /><h3 className="text-sm font-black">جریان تولید محتوا <b className="text-rose-500">*</b></h3></div><p className="mt-1 text-[11px] leading-5 text-indigo-700">این جریان فقط برای محتواست و مستقل از جریان هر ایده نگهداری می‌شود.</p></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => setFormData({ ...formData, processTemplateId: 'custom' })} className={`rounded-2xl border p-4 text-right ${formData.processTemplateId === 'custom' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}><div className="flex items-center justify-between gap-2"><span className="font-black text-sm text-slate-900">جریان اختصاصی جدید</span>{formData.processTemplateId === 'custom' && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}</div><p className="mt-1 text-[11px] text-slate-500">مراحل را همین‌جا برای این محتوا تعریف کنید.</p></button>
            {compatibleTemplates.map(template => { const selected = formData.processTemplateId === template.id; return <button key={template.id} type="button" onClick={() => setFormData({ ...formData, processTemplateId: template.id })} className={`rounded-2xl border p-4 text-right ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}><div className="flex items-center justify-between gap-2"><span className="font-black text-sm text-slate-900">{template.name}</span>{selected && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}</div><p className="mt-1 text-[11px] text-slate-500">{template.stages.length.toLocaleString('fa-IR')} مرحله{template.estimatedDays ? ` · حدود ${template.estimatedDays.toLocaleString('fa-IR')} روز` : ''}</p></button>; })}
          </div>
          {formData.processTemplateId === 'custom' && <div className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h4 className="text-sm font-black text-slate-900">مراحل جریان اختصاصی</h4><p className="mt-1 text-[11px] text-slate-500">ساختار هر مرحله را مانند الگوهای تنظیمات تعریف کنید.</p></div>
              <Button type="button" variant="secondary" onClick={() => setCustomStages(previous => [...previous, { id: `custom-stage-${Date.now()}`, title: '', description: '', departmentId: departments[0]?.id || '', assigneeId: '', reviewerId: '', reviewRequired: false, deadline: '', dependsOnPrevious: previous.length > 0 }])} className="!min-h-9 !px-3 !py-1.5 text-xs"><Plus className="w-3.5 h-3.5" />افزودن مرحله</Button>
            </div>
            <ol className="space-y-3">{customStages.map((stage, index) => <li key={stage.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-end gap-2">
                <span className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span>
                <label className="min-w-0 flex-1 text-[10px] font-bold text-slate-600">عنوان مرحله <b className="text-rose-500">*</b><Input required className="mt-1.5" value={stage.title} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, title: event.target.value } : item))} placeholder="عنوان روشن و کوتاه مرحله" maxLength={120} /></label>
                {customStages.length > 1 && <button type="button" onClick={() => setCustomStages(previous => previous.filter(item => item.id !== stage.id))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`حذف مرحله ${index + 1}`}><Trash2 className="w-4 h-4" /></button>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-slate-600">دپارتمان مسئول <b className="text-rose-500">*</b><Select required className="mt-1.5" aria-label={`دپارتمان مرحله ${index + 1}`} value={stage.departmentId} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, departmentId: event.target.value, assigneeId: '', reviewerId: '' } : item))}><option value="">انتخاب دپارتمان</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></label>
                <label className="text-[10px] font-bold text-slate-600">مسئول مستقیم<Select className="mt-1.5" aria-label={`مسئول مرحله ${index + 1}`} value={stage.assigneeId} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, assigneeId: event.target.value } : item))}><option value="">بدون مسئول مستقیم</option>{membersForDepartment(stage.departmentId).map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></label>
                <label className="text-[10px] font-bold text-slate-600">ارزیاب مرحله<Select disabled={!stage.reviewRequired} className="mt-1.5" aria-label={`ارزیاب مرحله ${index + 1}`} value={stage.reviewerId} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, reviewerId: event.target.value } : item))}><option value="">{stage.reviewRequired ? `مدیر پرونده (${users.find(user => user.id === formData.ownerId)?.name || 'تعیین‌نشده'})` : 'بدون نیاز به ارزیاب'}</option>{membersForDepartment(stage.departmentId).filter(user => user.id !== formData.ownerId).map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></label>
                <label className="text-[10px] font-bold text-slate-600">مهلت مرحله<PersianDatePicker value={stage.deadline} onChange={deadline => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, deadline } : item))} placeholder="انتخاب مهلت" /></label>
              </div>
              <label className="flex min-h-[var(--control-height)] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700"><span>این مرحله نیاز به ارزیاب دارد</span><input type="checkbox" checked={stage.reviewRequired} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, reviewRequired: event.target.checked, reviewerId: event.target.checked ? item.reviewerId : '' } : item))} /></label>
              <label className="block text-[10px] font-bold text-slate-600">توضیحات و راهنمای اجرا<Textarea className="mt-1.5" rows={3} value={stage.description} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, description: event.target.value } : item))} placeholder="خروجی مورد انتظار و نکات اجرایی این مرحله" /></label>
              {index > 0 && <label className="flex h-[var(--control-height)] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700"><span>شروع پس از تکمیل مرحله قبل</span><input type="checkbox" checked={stage.dependsOnPrevious} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, dependsOnPrevious: event.target.checked } : item))} /></label>}
            </li>)}</ol>
          </div>}

          {selectedTemplate && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black text-slate-900">تخصیص مسئولان مراحل</h4><p className="mt-1 text-[10px] leading-5 text-slate-500">مسئول اجرای هر مرحله را از اعضا و مدیر دپارتمان همان مرحله انتخاب کنید.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-indigo-700">{selectedTemplate.stages.length.toLocaleString('fa-IR')} مرحله</span></div>
            <ol className="space-y-2.5">{selectedTemplate.stages.map((stage, index) => {
              const candidates = membersForDepartment(stage.departmentId);
              const assignmentKey = templateStageKey(selectedTemplate.id, stage.stageKey, index);
              const defaultAssigneeId = index === 0 && candidates.some(user => user.id === currentUser.id) ? currentUser.id : '';
              const selectedAssigneeId = templateStageAssignees[assignmentKey] ?? defaultAssigneeId;
              return <li key={assignmentKey} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span><div className="min-w-0"><div className="truncate text-xs font-black text-slate-900">{stage.title}</div><div className="mt-1 text-[10px] text-slate-500">{departments.find(department => department.id === stage.departmentId)?.name || stage.departmentName || 'دپارتمان تعیین نشده'}</div></div></div>
                  <label className="min-w-0 sm:w-72"><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><UserRound className="h-3.5 w-3.5" />مسئول اجرای مرحله</span><Select aria-label={`مسئول اجرای مرحله ${index + 1}`} value={selectedAssigneeId} onChange={event => setTemplateStageAssignees(previous => ({ ...previous, [assignmentKey]: event.target.value }))}><option value="">بدون مسئول مستقیم</option>{candidates.map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></label>
                </div>
                {candidates.length === 0 && <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">برای این دپارتمان عضو فعالی ثبت نشده است؛ ابتدا اعضای دپارتمان را بررسی کنید.</p>}
              </li>;
            })}</ol>
          </div>}
        </>}
      </div>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 sm:px-6 py-4">
        <Button action="cancel" type="button" variant="secondary" disabled={submitting} onClick={closeModal}>انصراف</Button>
        <div className="flex items-center gap-2">{step > 1 && <Button type="button" variant="ghost" disabled={submitting} onClick={() => setStep(step - 1)}><ChevronRight className="w-4 h-4" />مرحله قبل</Button>}{step < 3 ? <Button type="submit" disabled={!validStep}>مرحله بعد<ChevronLeft className="w-4 h-4" /></Button> : <Button action={createdContent ? undefined : 'create'} type="submit" loading={submitting} disabled={!validStep}><CheckCircle2 className="w-4 h-4" />{createdContent ? 'تلاش مجدد فایل‌های اولیه' : 'ایجاد محتوا و جریان'}</Button>}</div>
      </footer>
    </form>
  </Modal>;
};
