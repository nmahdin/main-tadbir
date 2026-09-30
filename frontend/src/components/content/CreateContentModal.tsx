import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, FileText, Globe2, Layers, Plus, Trash2 } from 'lucide-react';
import { Modal, Button, Input, Select, Textarea } from '../common/Primitives';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { useApp } from '../../context/AppContext';
import type { ContentStage } from '../../types';

type CustomStageDraft = { id: string; title: string; departmentId: string; assigneeId: string };

const steps = [
  { id: 1, title: 'مشخصات محتوا', icon: FileText },
  { id: 2, title: 'برنامه انتشار', icon: CalendarClock },
  { id: 3, title: 'جریان محتوا', icon: Layers },
];

export const CreateContentModal: React.FC<{ isOpen?: boolean; onClose?: () => void }> = ({ isOpen, onClose }) => {
  const { departments, users, projects, processTemplates, contentTypes, targetAudiences, publishingPlatforms, addContent, setSelectedContentId, setActiveView, currentUser, hasPermission, isCreateContentOpen, setIsCreateContentOpen, contentCreateProjectId, setContentCreateProjectId } = useApp();
  const modalOpen = isOpen ?? isCreateContentOpen;
  const closeModal = onClose ?? (() => setIsCreateContentOpen(false));
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '', description: '', type: contentTypes[0]?.id || 'video', topic: '', targetAudience: targetAudiences[0] || '', mediaGoal: '',
    departmentId: departments[0]?.id || '', processTemplateId: processTemplates[0]?.id || 'custom', projectId: '', ownerId: currentUser.id,
    approverId: '', deadline: '', publishDate: '', publishTime: '18:00', channels: [] as string[],
  });
  const [customStages, setCustomStages] = useState<CustomStageDraft[]>([
    { id: `custom-stage-${Date.now()}`, title: '', departmentId: departments[0]?.id || '', assigneeId: currentUser.id },
  ]);

  useEffect(() => {
    if (modalOpen && contentCreateProjectId) setFormData(previous => ({ ...previous, projectId: contentCreateProjectId }));
    if (!modalOpen && contentCreateProjectId) setContentCreateProjectId(null);
  }, [modalOpen, contentCreateProjectId, setContentCreateProjectId]);
  useEffect(() => {
    if (!formData.channels.length && publishingPlatforms[0]) setFormData(previous => ({ ...previous, channels: [publishingPlatforms[0].id] }));
  }, [publishingPlatforms, formData.channels.length]);
  useEffect(() => {
    if (modalOpen && !formData.targetAudience && targetAudiences[0]) setFormData(previous => ({ ...previous, targetAudience: targetAudiences[0] }));
  }, [modalOpen, targetAudiences, formData.targetAudience]);
  useEffect(() => {
    if (modalOpen && processTemplates.length === 0 && formData.processTemplateId !== 'custom') setFormData(previous => ({ ...previous, processTemplateId: 'custom' }));
  }, [modalOpen, processTemplates.length, formData.processTemplateId]);

  const selectedTemplate = useMemo(() => processTemplates.find(template => template.id === formData.processTemplateId), [processTemplates, formData.processTemplateId]);
  if (!modalOpen || !hasPermission('content.create')) return null;

  const customFlowValid = customStages.length > 0 && customStages.every(stage => stage.title.trim() && stage.departmentId);
  const validStep = step === 1
    ? !!formData.title.trim() && !!formData.type && !!formData.ownerId
    : step === 2
      ? !!formData.publishDate && !!formData.publishTime && formData.channels.length > 0
      : formData.processTemplateId === 'custom' ? customFlowValid : !!formData.processTemplateId;
  const toggleChannel = (id: string) => setFormData(previous => ({ ...previous, channels: previous.channels.includes(id) ? previous.channels.filter(channel => channel !== id) : [...previous.channels, id] }));
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (step < 3) { if (validStep) setStep(step + 1); return; }
    if (!validStep || submitting) return;
    setSubmitting(true);
    try {
      const customFlow: ContentStage[] | undefined = formData.processTemplateId === 'custom'
        ? customStages.map((stage, index) => ({
            id: `stg-${Date.now()}-${index}`,
            stageKey: `custom_${index + 1}`,
            title: stage.title.trim(),
            departmentId: stage.departmentId,
            departmentName: departments.find(department => department.id === stage.departmentId)?.name,
            assigneeId: stage.assigneeId || undefined,
            order: index + 1,
            status: index === 0 ? 'not_started' : 'pending_dependency',
            inputs: [],
            outputs: [],
            activityLog: [],
          }))
        : undefined;
      const created = await addContent({
        title: formData.title.trim(), description: formData.description.trim(), type: formData.type, topic: formData.topic.trim(),
        targetAudience: formData.targetAudience.trim(), mediaGoal: formData.mediaGoal.trim(), departmentId: formData.departmentId || departments[0]?.id,
        processTemplateId: formData.processTemplateId, stages: customFlow, projectId: formData.projectId || undefined, ownerId: formData.ownerId || currentUser.id,
        approverId: formData.approverId, deadline: formData.deadline || undefined,
        publishInfo: { date: formData.publishDate, time: formData.publishTime, channels: formData.channels, status: 'planned' },
      });
      if (!created) return;
      closeModal(); setStep(1); setSelectedContentId(created.id); setActiveView('content-detail');
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
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">نوع محتوا</span><Select value={formData.type} onChange={event => setFormData({ ...formData, type: event.target.value })}>{contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">موضوع</span><Input value={formData.topic} onChange={event => setFormData({ ...formData, topic: event.target.value })} /></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">پروژه مرتبط</span><Select value={formData.projectId} onChange={event => setFormData({ ...formData, projectId: event.target.value })}><option value="">محتوای مستقل</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name} [{project.key}]</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">دپارتمان اصلی</span><Select value={formData.departmentId} onChange={event => setFormData({ ...formData, departmentId: event.target.value })}>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">مدیر پرونده</span><Select value={formData.ownerId} onChange={event => setFormData({ ...formData, ownerId: event.target.value })}>{users.map(user => <option key={user.id} value={user.id}>{user.name} ({user.title})</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">تأییدکننده نهایی</span><Select value={formData.approverId} onChange={event => setFormData({ ...formData, approverId: event.target.value })}><option value="">انتخاب نشده</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">موعد تحویل تولید</span><PersianDatePicker value={formData.deadline} onChange={deadline => setFormData({ ...formData, deadline })} placeholder="تاریخ تحویل" /></label>
            <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">مخاطب هدف</span><Select value={formData.targetAudience} onChange={event => setFormData({ ...formData, targetAudience: event.target.value })}><option value="">انتخاب مخاطب هدف</option>{targetAudiences.map(audience => <option key={audience} value={audience}>{audience}</option>)}</Select></label>
          </div>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">هدف رسانه‌ای / پیام کلیدی</span><Input value={formData.mediaGoal} onChange={event => setFormData({ ...formData, mediaGoal: event.target.value })} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">شرح و سناریوی اولیه</span><Textarea rows={4} value={formData.description} onChange={event => setFormData({ ...formData, description: event.target.value })} /></label>
        </>}

        {step === 2 && <>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-xs leading-6 text-violet-900"><CalendarClock className="inline w-4 h-4 ml-1" />زمان انتشار مستقل از موعد تحویل تولید است و در تقویم انتشار نمایش داده می‌شود.</div>
          <div className="grid sm:grid-cols-2 gap-4"><label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">تاریخ انتشار <b className="text-rose-500">*</b></span><PersianDatePicker value={formData.publishDate} onChange={publishDate => setFormData({ ...formData, publishDate })} placeholder="تاریخ انتشار" /></label><label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">ساعت انتشار <b className="text-rose-500">*</b></span><Input type="time" dir="ltr" value={formData.publishTime} onChange={event => setFormData({ ...formData, publishTime: event.target.value })} /></label></div>
          <fieldset className="space-y-2"><legend className="text-xs font-bold text-slate-700">پلتفرم‌های انتشار <b className="text-rose-500">*</b></legend><div className="grid sm:grid-cols-2 gap-2">{publishingPlatforms.map(platform => { const checked = formData.channels.includes(platform.id); return <button key={platform.id} type="button" onClick={() => toggleChannel(platform.id)} className={`rounded-xl border p-3 flex items-center gap-3 text-right ${checked ? 'border-violet-400 bg-violet-50 text-violet-800 shadow-xs' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200'}`}><span className={`w-9 h-9 rounded-xl flex items-center justify-center ${checked ? 'bg-violet-600 text-white' : 'bg-slate-100'}`}><Globe2 className="w-4 h-4" /></span><span className="font-bold text-xs">{platform.name}</span>{checked && <CheckCircle2 className="w-4 h-4 mr-auto text-violet-600" />}</button>; })}</div></fieldset>
        </>}

        {step === 3 && <>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><div className="flex items-center gap-2 text-indigo-900"><Layers className="w-5 h-5" /><h3 className="text-sm font-black">جریان تولید محتوا</h3></div><p className="mt-1 text-[11px] leading-5 text-indigo-700">این جریان فقط برای محتواست و مستقل از جریان هر ایده نگهداری می‌شود.</p></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <button type="button" onClick={() => setFormData({ ...formData, processTemplateId: 'custom' })} className={`rounded-2xl border p-4 text-right ${formData.processTemplateId === 'custom' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}><div className="flex items-center justify-between gap-2"><span className="font-black text-sm text-slate-900">جریان اختصاصی جدید</span>{formData.processTemplateId === 'custom' && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}</div><p className="mt-1 text-[11px] text-slate-500">مراحل را همین‌جا برای این محتوا تعریف کنید.</p></button>
            {processTemplates.map(template => { const selected = formData.processTemplateId === template.id; return <button key={template.id} type="button" onClick={() => setFormData({ ...formData, processTemplateId: template.id })} className={`rounded-2xl border p-4 text-right ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}><div className="flex items-center justify-between gap-2"><span className="font-black text-sm text-slate-900">{template.name}</span>{selected && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}</div><p className="mt-1 text-[11px] text-slate-500">{template.stages.length.toLocaleString('fa-IR')} مرحله</p></button>; })}
          </div>
          {formData.processTemplateId === 'custom' && <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="flex items-center justify-between gap-2"><div><h4 className="text-xs font-black text-slate-900">مراحل جریان اختصاصی</h4><p className="mt-0.5 text-[10px] text-slate-500">حداقل یک مرحله با عنوان و دپارتمان مشخص لازم است.</p></div><Button type="button" variant="secondary" onClick={() => setCustomStages(previous => [...previous, { id: `custom-stage-${Date.now()}`, title: '', departmentId: departments[0]?.id || '', assigneeId: '' }])} className="!min-h-9 !px-3 !py-1.5 text-xs"><Plus className="w-3.5 h-3.5" />افزودن مرحله</Button></div>
            <ol className="space-y-2">{customStages.map((stage, index) => <li key={stage.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"><div className="flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black shrink-0">{(index + 1).toLocaleString('fa-IR')}</span><Input value={stage.title} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, title: event.target.value } : item))} placeholder="عنوان مرحله" maxLength={120} />{customStages.length > 1 && <button type="button" onClick={() => setCustomStages(previous => previous.filter(item => item.id !== stage.id))} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg" aria-label={`حذف مرحله ${index + 1}`}><Trash2 className="w-4 h-4" /></button>}</div><div className="grid sm:grid-cols-2 gap-2"><Select aria-label={`دپارتمان مرحله ${index + 1}`} value={stage.departmentId} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, departmentId: event.target.value } : item))}><option value="">انتخاب دپارتمان</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select><Select aria-label={`مسئول مرحله ${index + 1}`} value={stage.assigneeId} onChange={event => setCustomStages(previous => previous.map(item => item.id === stage.id ? { ...item, assigneeId: event.target.value } : item))}><option value="">بدون مسئول مستقیم</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></div></li>)}</ol>
          </div>}
          {selectedTemplate && <ol className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">{selectedTemplate.stages.map((stage, index) => <li key={`${stage.stageKey}-${index}`} className="flex items-center gap-3 rounded-xl bg-white border border-slate-100 p-3"><span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black">{(index + 1).toLocaleString('fa-IR')}</span><div><div className="text-xs font-bold text-slate-800">{stage.title}</div><div className="text-[10px] text-slate-500">{stage.departmentName}</div></div></li>)}</ol>}
        </>}
      </div>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 sm:px-6 py-4">
        <Button type="button" variant="secondary" disabled={submitting} onClick={closeModal}>انصراف</Button>
        <div className="flex items-center gap-2">{step > 1 && <Button type="button" variant="ghost" disabled={submitting} onClick={() => setStep(step - 1)}><ChevronRight className="w-4 h-4" />مرحله قبل</Button>}{step < 3 ? <Button type="submit" disabled={!validStep}>مرحله بعد<ChevronLeft className="w-4 h-4" /></Button> : <Button type="submit" loading={submitting} disabled={!validStep}><CheckCircle2 className="w-4 h-4" />ایجاد محتوا و جریان</Button>}</div>
      </footer>
    </form>
  </Modal>;
};
