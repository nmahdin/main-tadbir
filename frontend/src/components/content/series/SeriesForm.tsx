import React, { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileStack, Layers3, Link2, Settings2, UserRound } from 'lucide-react';
import { seriesApi, type SeriesInput } from '../../../api/series';
import { parseApiError } from '../../../api/errors';
import { useApp } from '../../../context/AppContext';
import type { ContentSeries, SeriesRecurrenceType } from '../../../types';
import { platformIcon } from '../../../utils/platformIcons';
import { Button, FormField, Input, Modal, Select, Textarea } from '../../common/Primitives';
import { PersianDatePicker } from '../../common/PersianDatePicker';

const steps = [
  { title: 'دامنه و مالکیت', icon: Layers3 },
  { title: 'تقویم و تناوب', icon: Settings2 },
  { title: 'فرایند و پیش‌فرض‌ها', icon: FileStack },
];

export function SeriesForm({
  open,
  initial,
  projectDefault,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: ContentSeries | null;
  projectDefault: string;
  onClose: () => void;
  onSaved: (series: ContentSeries) => Promise<void>;
}) {
  const {
    projects, departments, users, contentTypes, processTemplates, publishingPlatforms, targetAudiences,
    assets, currentUser, notify,
  } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [recurrence, setRecurrence] = useState<SeriesRecurrenceType>('weekly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [occurrenceLimit, setOccurrenceLimit] = useState('');
  const [interval, setInterval] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [codePrefix, setCodePrefix] = useState('');
  const [topic, setTopic] = useState('');
  const [mediaGoal, setMediaGoal] = useState('');
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [tagsText, setTagsText] = useState('مجموعه محتوا');
  const [channels, setChannels] = useState<string[]>([]);
  const [publicationTime, setPublicationTime] = useState('09:00');
  const [publicationCaption, setPublicationCaption] = useState('');
  const [publisherId, setPublisherId] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal' | 'restricted'>('internal');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [stageAssignments, setStageAssignments] = useState<Record<string, { assigneeId: string; reviewerId: string }>>({});
  const [changeReason, setChangeReason] = useState('');

  useEffect(() => {
    if (!open) return;
    const defaults = initial?.defaultContentPayload;
    const publication = initial?.defaultPublicationConfig as Record<string, unknown> | undefined;
    setStep(0);
    setName(initial?.name || '');
    setDescription(initial?.description || '');
    const nextContentType = initial?.contentType || contentTypes[0]?.id || '';
    setContentType(nextContentType);
    setProjectId(initial?.projectId || projectDefault);
    setDepartmentId(initial?.departmentId || '');
    setOwnerId(initial?.ownerId || currentUser?.id || '');
    const initialTemplate = processTemplates.find(template => template.id === initial?.processTemplateId && template.type === nextContentType);
    setTemplateId(initialTemplate?.id || processTemplates.find(template => template.type === nextContentType)?.id || '');
    setRecurrence(initial?.recurrenceType || 'weekly');
    setStartDate(initial?.recurrenceConfig.startDate || new Date().toISOString().slice(0, 10));
    setEndDate(initial?.recurrenceConfig.endDate || '');
    setOccurrenceLimit(initial?.recurrenceConfig.occurrenceLimit ? String(initial.recurrenceConfig.occurrenceLimit) : '');
    setInterval(initial?.recurrenceConfig.interval || 1);
    setDayOfMonth(initial?.recurrenceConfig.dayOfMonth || 1);
    setCodePrefix(initial?.codePrefix || '');
    setTopic(defaults?.topic || '');
    setMediaGoal(defaults?.mediaGoal || '');
    setSelectedAudiences(defaults?.targetAudiences || (defaults?.targetAudience ? [defaults.targetAudience] : []));
    setTagsText((defaults?.tags || ['مجموعه محتوا']).join('، '));
    setChannels(Array.isArray(publication?.channels) ? publication.channels.map(String) : publishingPlatforms[0] ? [publishingPlatforms[0].id] : []);
    setPublicationTime(typeof publication?.time === 'string' ? publication.time : '09:00');
    setPublicationCaption(typeof publication?.caption === 'string' ? publication.caption : '');
    setPublisherId(typeof publication?.publisherId === 'string' || typeof publication?.publisherId === 'number' ? String(publication.publisherId) : '');
    setVisibility(['public', 'internal', 'restricted'].includes(String(publication?.visibility))
      ? publication?.visibility as 'public' | 'internal' | 'restricted' : 'internal');
    setAssetIds((defaults?.assetIds || []).map(String));
    setStageAssignments(Object.fromEntries((defaults?.stages || []).map((stage, index) => [
      `${initialTemplate?.id || initial?.processTemplateId || ''}:${stage.stageKey || stage.id}:${index}`,
      { assigneeId: stage.assigneeId || '', reviewerId: stage.reviewerId || '' },
    ])));
    setChangeReason('');
  }, [open, initial, projectDefault, contentTypes, processTemplates, publishingPlatforms, currentUser]);

  useEffect(() => {
    if (recurrence === 'project_based' && !projectId) setRecurrence('manual');
  }, [projectId, recurrence]);

  const compatibleTemplates = useMemo(() => processTemplates.filter(template => template.type === contentType), [processTemplates, contentType]);
  const selectedTemplate = useMemo(() => processTemplates.find(template => template.id === templateId), [processTemplates, templateId]);
  const selectProcessTemplate = (id: string) => {
    const template = processTemplates.find(item => item.id === id);
    setTemplateId(id);
    if (template && template.type !== contentType) setContentType(template.type);
  };
  const stageAssignmentKey = (stageKey: string, index: number) => `${templateId}:${stageKey}:${index}`;
  const membersForDepartment = (targetDepartmentId: string) => {
    const department = departments.find(item => item.id === targetDepartmentId);
    const memberIds = new Set([
      ...(department?.members || []).map(member => member.userId),
      ...(department?.managerId ? [department.managerId] : []),
    ]);
    return users.filter(user => user.status === 'active'
      && (user.departmentId === targetDepartmentId || memberIds.has(user.id)));
  };

  useEffect(() => {
    if (!open || !templateId || compatibleTemplates.some(template => template.id === templateId)) return;
    setTemplateId(compatibleTemplates[0]?.id || '');
  }, [open, templateId, compatibleTemplates]);

  const selectableAssets = useMemo(() => assets
    .filter(asset => !asset.isTrash && (!projectId || !asset.projectId || asset.projectId === projectId))
    .slice(0, 30), [assets, projectId]);

  const validStep = () => {
    if (step === 0) return Boolean(name.trim() && codePrefix.trim() && contentType && ownerId);
    if (step === 1) return Boolean(startDate
      && (recurrence !== 'project_based' || projectId)
      && (!endDate || endDate >= startDate)
      && (!occurrenceLimit || Number(occurrenceLimit) >= 1));
    return Boolean(publicationTime && channels.length > 0 && (!initial || changeReason.trim()));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const templateChanged = templateId !== (initial?.processTemplateId || '');
      const existingStages = initial?.defaultContentPayload?.stages || [];
      const stages = selectedTemplate
        ? selectedTemplate.stages.map((templateStage, index) => {
            const existing = !templateChanged
              ? existingStages.find(stage => stage.stageKey === templateStage.stageKey) || existingStages[index]
              : undefined;
            const assignment = stageAssignments[stageAssignmentKey(templateStage.stageKey, index)];
            return {
              ...(existing || templateStage),
              id: existing?.id || `series-${templateStage.stageKey}-${index}`,
              stageKey: templateStage.stageKey,
              title: templateStage.title,
              departmentId: templateStage.departmentId,
              assigneeId: assignment?.assigneeId || undefined,
              reviewerId: templateStage.reviewRequired === false ? undefined : assignment?.reviewerId || undefined,
            };
          })
        : [];
      const body: SeriesInput = {
        name: name.trim(), description: description.trim(), codePrefix: codePrefix.trim().toUpperCase(), contentType,
        projectId: projectId || null, departmentId: departmentId || null, ownerId,
        processTemplateId: templateId || null, recurrenceType: recurrence,
        recurrenceConfig: {
          startDate, interval, calendar: 'jalali',
          ...(endDate ? { endDate } : {}),
          ...(occurrenceLimit ? { occurrenceLimit: Number(occurrenceLimit) } : {}),
          ...(recurrence === 'monthly' ? { dayOfMonth } : {}),
        },
        defaultContentPayload: {
          ...(initial?.defaultContentPayload || {}), topic: topic.trim(), mediaGoal: mediaGoal.trim(),
          targetAudiences: selectedAudiences, targetAudience: selectedAudiences[0] || undefined,
          tags: tagsText.split(/[،,]/).map(tag => tag.trim()).filter(Boolean),
          assetIds, stages: stages as NonNullable<ContentSeries['defaultContentPayload']['stages']>,
        },
        defaultPublicationConfig: {
          channels, status: 'planned', ...(initial ? { visibility } : {}), time: publicationTime,
          caption: publicationCaption.trim(), publisherId: publisherId || null,
        },
        applyTemplate: Boolean(templateId) && (!initial || templateChanged),
        changeReason: changeReason.trim() || undefined,
        lockVersion: initial?.lockVersion,
      };
      return initial ? seriesApi.update(initial.id, body) : seriesApi.create(body);
    },
    onSuccess: async result => {
      notify({
        type: 'success',
        title: initial ? 'نسخه آینده مجموعه ثبت شد' : 'مجموعه ایجاد شد',
        message: initial ? 'این تغییر فقط بر پرونده‌های محتوای بعدی اثر می‌گذارد.' : 'نسخه اولیه و تنظیمات سروری ثبت شدند.',
      });
      await onSaved(result.data);
      onClose();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });

  const toggle = (value: string, values: string[], setter: (next: string[]) => void) =>
    setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش تنظیمات آینده مجموعه' : 'ایجاد مجموعه محتوای جدید'}
      description="تنظیمات توسط سرور اعتبارسنجی و به‌صورت نسخه تغییرناپذیر ذخیره می‌شود."
      icon={<Layers3 className="h-5 w-5" />}
      busy={mutation.isPending}
      size="lg"
    >
      <form onSubmit={event => { event.preventDefault(); if (step < 2) setStep(step + 1); else mutation.mutate(); }}>
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <ol className="grid grid-cols-3 gap-2" aria-label="مراحل ایجاد مجموعه">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const active = index === step;
              return (
                <li key={item.title} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : index < step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-100 text-slate-400'}`}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white">{index < step ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}</span>
                  <span className="hidden sm:inline">{item.title}</span>
                  <span className="sm:hidden">{index + 1}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="min-h-[24rem] space-y-4 p-5 sm:p-6">
          {step === 0 && (
            <>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField required label="نام مجموعه" htmlFor="series-name"><Input id="series-name" required value={name} onChange={event => setName(event.target.value)} /></FormField>
              <FormField required label="پیشوند کد مجموعه" htmlFor="series-prefix"><Input id="series-prefix" required value={codePrefix} onChange={event => setCodePrefix(event.target.value.replace(/[^A-Za-z0-9_-]/g, '').replace(/^[_-]+/, ''))} dir="ltr" placeholder="EDITORIAL" /><p className="text-[10px] leading-5 text-slate-500">این مقدار عیناً ابتدای کد و عنوان هر پروندهٔ محتوا می‌آید؛ مثلاً EDITORIAL001.</p></FormField>
              <FormField required label="نوع محتوا" htmlFor="series-content-type"><Select id="series-content-type" required value={contentType} onChange={event => setContentType(event.target.value)}>{contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></FormField>
              <FormField required={recurrence === 'project_based'} label="پروژه" htmlFor="series-project"><Select id="series-project" disabled={Boolean(initial?.occurrenceCount)} value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">بدون پروژه</option>{projects.filter(project => project.status !== 'archived' || project.id === initial?.projectId).map(project => <option key={project.id} value={project.id}>{project.name}{project.status === 'archived' ? ' (بایگانی)' : ''}</option>)}</Select></FormField>
              <FormField label="دپارتمان" htmlFor="series-department"><Select id="series-department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">بدون دپارتمان</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></FormField>
              <FormField required label="مالک" htmlFor="series-owner"><Select id="series-owner" required value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">انتخاب مالک</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></FormField>
              <div className="sm:col-span-2"><FormField label="توضیحات" htmlFor="series-description"><Textarea id="series-description" value={description} onChange={event => setDescription(event.target.value)} rows={3} /></FormField></div>
            </div>
            {Boolean(initial?.occurrenceCount) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">پس از ایجاد نخستین پروندهٔ محتوا، پروژه مجموعه برای حفظ یکپارچگی پرونده‌های موجود قابل تغییر نیست.</p>}
            </>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField required label="نوع تناوب" htmlFor="series-recurrence"><Select id="series-recurrence" required value={recurrence} onChange={event => setRecurrence(event.target.value as SeriesRecurrenceType)}><option value="weekly">هفتگی</option><option value="monthly">ماهانه شمسی</option><option value="project_based" disabled={!projectId}>بر پایه بازه پروژه</option><option value="manual">دستی با تاریخ صریح</option></Select></FormField>
              <div><PersianDatePicker label="تاریخ شروع مجموعه" required value={startDate} onChange={setStartDate} portal /></div>
              <div><PersianDatePicker label="تاریخ پایان مجموعه" value={endDate} onChange={setEndDate} portal /></div>
              <FormField label="تعداد کل محتوای برنامه‌ریزی‌شده" htmlFor="series-occurrence-limit"><Input id="series-occurrence-limit" type="number" min={1} max={10000} value={occurrenceLimit} onChange={event => setOccurrenceLimit(event.target.value)} placeholder="بدون محدودیت" /><p className="text-[10px] leading-5 text-slate-500">پس از رسیدن به این تعداد، پروندهٔ محتوای تازه‌ای ساخته نمی‌شود.</p></FormField>
              {recurrence !== 'manual' && <FormField required label={recurrence === 'weekly' ? 'فاصله (هفته)' : recurrence === 'monthly' ? 'فاصله (ماه)' : 'فاصله مازاد (روز)'} htmlFor="series-interval"><Input id="series-interval" required type="number" min={1} max={120} value={interval} onChange={event => setInterval(Number(event.target.value) || 1)} /></FormField>}
              {recurrence === 'monthly' && <FormField required label="روز ترجیحی ماه شمسی" htmlFor="series-month-day"><Input id="series-month-day" required type="number" min={1} max={31} value={dayOfMonth} onChange={event => setDayOfMonth(Number(event.target.value) || 1)} /></FormField>}
              {endDate && endDate < startDate && <p role="alert" className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold text-rose-700">تاریخ پایان نمی‌تواند پیش از تاریخ شروع مجموعه باشد.</p>}
              <div className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-[11px] leading-6 text-indigo-800">
                {recurrence === 'manual'
                  ? 'برای هر پروندهٔ محتوای دستی، تاریخ شروع و مهلت در زمان ایجاد به‌صورت صریح دریافت می‌شود.'
                  : recurrence === 'monthly'
                    ? 'ماهانه بر پایه تقویم جلالی سازمان محاسبه می‌شود؛ روزهای ناموجود به آخر همان ماه محدود می‌شوند.'
                    : recurrence === 'project_based'
                      ? 'پرونده‌های محتوا بر پایه تعداد تعیین‌شده در بازه پروژه یا تاریخ پایان مجموعه توزیع می‌شوند.'
                      : 'تاریخ‌ها از تاریخ شروع مجموعه و فاصله هفتگی محاسبه می‌شوند؛ نخستین پروندهٔ محتوا «هفته ۱» است و شماره هفته، ترتیبیِ همین مجموعه است نه شماره هفته تقویم سال.'}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="قالب فرایند" htmlFor="series-template"><Select id="series-template" value={templateId} onChange={event => selectProcessTemplate(event.target.value)}><option value="">بدون قالب</option>{processTemplates.map(template => <option key={template.id} value={template.id}>{template.name} · {contentTypes.find(type => type.id === template.type)?.name || template.type}{template.estimatedDays ? ` — حدود ${template.estimatedDays.toLocaleString('fa-IR')} روز` : ''}</option>)}</Select><p className="text-[10px] leading-5 text-slate-500">انتخاب قالبی از نوع دیگر، نوع محتوای مجموعه را با همان قالب هماهنگ می‌کند.</p></FormField>
                <FormField label="موضوع پیش‌فرض" htmlFor="series-topic"><Input id="series-topic" value={topic} onChange={event => setTopic(event.target.value)} /></FormField>
                <FormField label="هدف رسانه‌ای / پیام کلیدی" htmlFor="series-media-goal"><Input id="series-media-goal" value={mediaGoal} onChange={event => setMediaGoal(event.target.value)} /></FormField>
                <FormField label="برچسب‌های پیش‌فرض" htmlFor="series-tags"><Input id="series-tags" value={tagsText} onChange={event => setTagsText(event.target.value)} placeholder="تحریریه، خبر" /></FormField>
                {initial && <FormField label="سطح نمایش نسخه آینده" htmlFor="series-visibility"><Select id="series-visibility" value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)}><option value="internal">داخلی</option><option value="restricted">محدود</option><option value="public">عمومی</option></Select></FormField>}
                <FormField label="ناشر پیش‌فرض" htmlFor="series-publisher"><Select id="series-publisher" value={publisherId} onChange={event => setPublisherId(event.target.value)}><option value="">بعداً برای هر محتوا تعیین می‌شود</option>{users.filter(user => user.status === 'active').map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></FormField>
                <FormField required label="ساعت انتشار هر پروندهٔ محتوا" htmlFor="series-publication-time"><Input id="series-publication-time" type="time" required value={publicationTime} onChange={event => setPublicationTime(event.target.value)} /><p className="text-[10px] leading-5 text-slate-500">تاریخ انتشار به‌صورت خودکار از تاریخ همان پروندهٔ محتوا ساخته می‌شود؛ ساعت از این تنظیم مجموعه می‌آید.</p></FormField>
                <div className="sm:col-span-2"><FormField label="کپشن پیش‌فرض" htmlFor="series-caption"><Textarea id="series-caption" rows={3} maxLength={5000} value={publicationCaption} onChange={event => setPublicationCaption(event.target.value)} placeholder="در صورت نیاز، برای هر پروندهٔ محتوا قابل تغییر است." /></FormField></div>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-slate-700">مخاطبان هدف</legend>
                <div className="flex flex-wrap gap-2">{targetAudiences.map(audience => { const checked = selectedAudiences.includes(audience); return <button key={audience} type="button" aria-pressed={checked} onClick={() => toggle(audience, selectedAudiences, setSelectedAudiences)} className={`rounded-xl border px-3 py-2 text-[11px] font-bold ${checked ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200'}`}>{checked && <Check className="ml-1 inline h-3.5 w-3.5" />}{audience}</button>; })}</div>
                {!targetAudiences.length && <p className="text-[11px] text-slate-400">مخاطب هدفی در تنظیمات سازمان تعریف نشده است.</p>}
              </fieldset>
              {selectedTemplate && <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black text-slate-900">مسئول اجرا و ارزیابی مراحل</h4><p className="mt-1 text-[10px] leading-5 text-slate-500">این تخصیص‌ها پیش‌فرض پرونده‌های محتوای آینده‌اند و هنگام ساخت هر پروندهٔ محتوا قابل تغییر هستند.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-indigo-700">{selectedTemplate.stages.length.toLocaleString('fa-IR')} مرحله</span></div>
                <ol className="space-y-2.5">{selectedTemplate.stages.map((stage, index) => {
                  const key = stageAssignmentKey(stage.stageKey, index);
                  const assignment = stageAssignments[key] || { assigneeId: '', reviewerId: '' };
                  const candidates = membersForDepartment(stage.departmentId);
                  return <li key={key} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                    <div className="mb-3 flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span><div className="min-w-0"><div className="truncate text-xs font-black text-slate-900">{stage.title}</div><div className="mt-1 text-[10px] text-slate-500">{departments.find(item => item.id === stage.departmentId)?.name || stage.departmentName || 'دپارتمان تعیین نشده'}</div></div></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="min-w-0"><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><UserRound className="h-3.5 w-3.5" />مسئول اجرا</span><Select aria-label={`مسئول اجرای مرحله ${index + 1}`} value={assignment.assigneeId} onChange={event => setStageAssignments(previous => ({ ...previous, [key]: { ...assignment, assigneeId: event.target.value } }))}><option value="">بدون مسئول مستقیم</option>{candidates.map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></label>
                      <label className="min-w-0"><span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-600"><Eye className="h-3.5 w-3.5" />ارزیاب مرحله</span><Select disabled={stage.reviewRequired === false} aria-label={`ارزیاب مرحله ${index + 1}`} value={stage.reviewRequired === false ? '' : assignment.reviewerId} onChange={event => setStageAssignments(previous => ({ ...previous, [key]: { ...assignment, reviewerId: event.target.value } }))}><option value="">{stage.reviewRequired === false ? 'این مرحله ارزیابی ندارد' : 'بر پایه سیاست قالب'}</option>{candidates.map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></label>
                    </div>
                    {!candidates.length && <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">برای دپارتمان این مرحله عضو فعالی ثبت نشده است.</p>}
                  </li>;
                })}</ol>
              </section>}
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-slate-700">کانال‌های انتشار پیش‌فرض <b className="text-rose-500">*</b></legend>
                <div className="grid gap-2 sm:grid-cols-2">{publishingPlatforms.map(platform => {
                  const checked = channels.includes(platform.id);
                  const color = /^#[0-9a-f]{6}$/i.test(platform.color || '') ? platform.color : '#4f46e5';
                  const background = /^#[0-9a-f]{6}$/i.test(platform.bg || '') ? platform.bg : `${color}12`;
                  const Icon = platformIcon(platform.iconName);
                  return <button key={platform.id} type="button" onClick={() => toggle(platform.id, channels, setChannels)} aria-pressed={checked} style={checked ? { borderColor: color, backgroundColor: background, color } : undefined} className={`flex items-center gap-3 rounded-xl border p-3 text-right transition ${checked ? 'shadow-xs' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200'}`}><span style={checked ? { backgroundColor: color } : undefined} className={`flex h-9 w-9 items-center justify-center rounded-xl ${checked ? 'text-white' : 'bg-slate-100'}`}><Icon className="h-4 w-4" /></span><span className="text-xs font-bold">{platform.name}</span>{checked && <CheckCircle2 style={{ color }} className="mr-auto h-4 w-4" />}</button>;
                })}</div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><Link2 className="h-4 w-4" />دارایی‌های مرجع DAM</legend>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  <div className="grid gap-2 sm:grid-cols-2">{selectableAssets.map(asset => <label key={asset.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-[11px] hover:bg-slate-50"><input type="checkbox" checked={assetIds.includes(asset.id)} onChange={() => toggle(asset.id, assetIds, setAssetIds)} /><span className="truncate">{asset.title || asset.fileName}</span></label>)}</div>
                  {!selectableAssets.length && <p className="p-2 text-[11px] text-slate-400">دارایی قابل دسترسی برای پیوند پیش‌فرض وجود ندارد.</p>}
                </div>
              </fieldset>
              {initial && <FormField required label="دلیل تغییر نسخه آینده" htmlFor="series-change-reason"><Textarea id="series-change-reason" required value={changeReason} onChange={event => setChangeReason(event.target.value)} rows={2} placeholder="مثلاً تغییر تقویم انتشار از پروندهٔ محتوای بعدی" /></FormField>}
              <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800"><Eye className="mt-0.5 h-4 w-4 shrink-0" /><span>قالب، پیش‌فرض انتشار و دارایی‌های مرجع به‌صورت snapshot ثبت می‌شوند. ویرایش مجموعه هیچ پروندهٔ محتوای قبلی را بازنویسی نمی‌کند.</span></div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button action={step === 0 ? 'cancel' : undefined} type="button" variant="secondary" disabled={mutation.isPending} onClick={() => step ? setStep(step - 1) : onClose()}>{step ? <><ChevronRight className="h-4 w-4" />مرحله قبل</> : 'انصراف'}</Button>
          <Button action={step === 2 ? (initial ? 'save' : 'create') : undefined} type="submit" loading={mutation.isPending} disabled={!validStep()}>{step < 2 ? <>مرحله بعد<ChevronLeft className="h-4 w-4" /></> : initial ? 'ثبت نسخه آینده' : 'ایجاد مجموعه'}</Button>
        </div>
      </form>
    </Modal>
  );
}
