import React, { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Eye, FileStack, Layers3, Link2, Settings2 } from 'lucide-react';
import { seriesApi, type SeriesInput } from '../../../api/series';
import { parseApiError } from '../../../api/errors';
import { useApp } from '../../../context/AppContext';
import type { ContentSeries, SeriesRecurrenceType } from '../../../types';
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
    projects, departments, users, contentTypes, processTemplates, publishingPlatforms,
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
  const [interval, setInterval] = useState(1);
  const [offset, setOffset] = useState(7);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [activationTime, setActivationTime] = useState('08:00');
  const [codePrefix, setCodePrefix] = useState('');
  const [topic, setTopic] = useState('');
  const [tagsText, setTagsText] = useState('مجموعه محتوا');
  const [channels, setChannels] = useState<string[]>([]);
  const [publicationTime, setPublicationTime] = useState('09:00');
  const [visibility, setVisibility] = useState<'public' | 'internal' | 'restricted'>('internal');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [changeReason, setChangeReason] = useState('');

  useEffect(() => {
    if (!open) return;
    const defaults = initial?.defaultContentPayload;
    const publication = initial?.defaultPublicationConfig as Record<string, unknown> | undefined;
    setStep(0);
    setName(initial?.name || '');
    setDescription(initial?.description || '');
    setContentType(initial?.contentType || contentTypes[0]?.id || '');
    setProjectId(initial?.projectId || projectDefault);
    setDepartmentId(initial?.departmentId || '');
    setOwnerId(initial?.ownerId || currentUser?.id || '');
    setTemplateId(initial?.processTemplateId || processTemplates[0]?.id || '');
    setRecurrence(initial?.recurrenceType || 'weekly');
    setStartDate(initial?.recurrenceConfig.startDate || new Date().toISOString().slice(0, 10));
    setInterval(initial?.recurrenceConfig.interval || 1);
    setOffset(initial?.recurrenceConfig.deadlineOffsetDays || 7);
    setDayOfMonth(initial?.recurrenceConfig.dayOfMonth || 1);
    setActivationTime(initial?.recurrenceConfig.activationTime || '08:00');
    setCodePrefix(initial?.codePrefix || '');
    setTopic(defaults?.topic || '');
    setTagsText((defaults?.tags || ['مجموعه محتوا']).join('، '));
    setChannels(Array.isArray(publication?.channels) ? publication.channels.map(String) : publishingPlatforms[0] ? [publishingPlatforms[0].id] : []);
    setPublicationTime(typeof publication?.time === 'string' ? publication.time : initial?.recurrenceConfig.activationTime || '09:00');
    setVisibility(['public', 'internal', 'restricted'].includes(String(publication?.visibility))
      ? publication?.visibility as 'public' | 'internal' | 'restricted' : 'internal');
    setAssetIds((defaults?.assetIds || []).map(String));
    setChangeReason('');
  }, [open, initial, projectDefault, contentTypes, processTemplates, publishingPlatforms, currentUser]);

  useEffect(() => {
    if (recurrence === 'project_based' && !projectId) setRecurrence('manual');
  }, [projectId, recurrence]);

  const selectableAssets = useMemo(() => assets
    .filter(asset => !asset.isTrash && (!projectId || !asset.projectId || asset.projectId === projectId))
    .slice(0, 30), [assets, projectId]);

  const validStep = () => {
    if (step === 0) return Boolean(name.trim() && codePrefix.trim() && contentType && ownerId);
    if (step === 1) return recurrence !== 'project_based' || Boolean(projectId);
    return Boolean(publicationTime && (!initial || changeReason.trim()));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const existingStages = initial?.defaultContentPayload?.stages || [];
      const body: SeriesInput = {
        name: name.trim(), description: description.trim(), codePrefix: codePrefix.trim().toUpperCase(), contentType,
        projectId: projectId || null, departmentId: departmentId || null, ownerId,
        processTemplateId: templateId || null, recurrenceType: recurrence,
        recurrenceConfig: {
          startDate, interval, deadlineOffsetDays: offset, calendar: 'jalali',
          ...(recurrence === 'monthly' ? { dayOfMonth } : {}), activationTime,
        },
        defaultContentPayload: {
          ...(initial?.defaultContentPayload || {}), topic: topic.trim(),
          tags: tagsText.split(/[،,]/).map(tag => tag.trim()).filter(Boolean),
          assetIds, stages: existingStages,
        },
        defaultPublicationConfig: { channels, status: 'planned', visibility, time: publicationTime },
        applyTemplate: !initial || templateId !== initial.processTemplateId,
        changeReason: changeReason.trim() || undefined,
        lockVersion: initial?.lockVersion,
      };
      return initial ? seriesApi.update(initial.id, body) : seriesApi.create(body);
    },
    onSuccess: async result => {
      notify({
        type: 'success',
        title: initial ? 'نسخه آینده مجموعه ثبت شد' : 'مجموعه ایجاد شد',
        message: initial ? 'این تغییر فقط بر رخدادهای بعدی اثر می‌گذارد.' : 'نسخه اولیه و تنظیمات سروری ثبت شدند.',
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
              <FormField label="نام مجموعه" htmlFor="series-name"><Input id="series-name" required value={name} onChange={event => setName(event.target.value)} /></FormField>
              <FormField label="پیشوند کد مجموعه" htmlFor="series-prefix"><Input id="series-prefix" required value={codePrefix} onChange={event => setCodePrefix(event.target.value.replace(/[^A-Za-z0-9_-]/g, '').replace(/^[_-]+/, ''))} dir="ltr" placeholder="EDITORIAL" /><p className="text-[10px] leading-5 text-slate-500">این مقدار عیناً ابتدای کد و عنوان هر رخداد می‌آید؛ مثلاً EDITORIAL001.</p></FormField>
              <FormField label="نوع محتوا" htmlFor="series-content-type"><Select id="series-content-type" required value={contentType} onChange={event => setContentType(event.target.value)}>{contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></FormField>
              <FormField label="پروژه" htmlFor="series-project"><Select id="series-project" disabled={Boolean(initial?.occurrenceCount)} value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">بدون پروژه</option>{projects.filter(project => project.status !== 'archived' || project.id === initial?.projectId).map(project => <option key={project.id} value={project.id}>{project.name}{project.status === 'archived' ? ' (بایگانی)' : ''}</option>)}</Select></FormField>
              <FormField label="دپارتمان" htmlFor="series-department"><Select id="series-department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}><option value="">بدون دپارتمان</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></FormField>
              <FormField label="مالک" htmlFor="series-owner"><Select id="series-owner" required value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">انتخاب مالک</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></FormField>
              <div className="sm:col-span-2"><FormField label="توضیحات" htmlFor="series-description"><Textarea id="series-description" value={description} onChange={event => setDescription(event.target.value)} rows={3} /></FormField></div>
            </div>
            {Boolean(initial?.occurrenceCount) && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">پس از ایجاد نخستین رخداد، پروژه مجموعه برای حفظ یکپارچگی پرونده‌های موجود قابل تغییر نیست.</p>}
            </>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="نوع تناوب" htmlFor="series-recurrence"><Select id="series-recurrence" value={recurrence} onChange={event => setRecurrence(event.target.value as SeriesRecurrenceType)}><option value="weekly">هفتگی</option><option value="monthly">ماهانه شمسی</option><option value="project_based" disabled={!projectId}>بر پایه بازه پروژه</option><option value="manual">دستی با تاریخ صریح</option></Select></FormField>
              <div><PersianDatePicker label="لنگر تقویم سازمان" value={startDate} onChange={setStartDate} portal /></div>
              {recurrence !== 'manual' && <FormField label={recurrence === 'weekly' ? 'فاصله (هفته)' : recurrence === 'monthly' ? 'فاصله (ماه)' : 'فاصله مازاد (روز)'} htmlFor="series-interval"><Input id="series-interval" type="number" min={1} max={120} value={interval} onChange={event => setInterval(Number(event.target.value) || 1)} /></FormField>}
              {recurrence === 'monthly' && <FormField label="روز ترجیحی ماه شمسی" htmlFor="series-month-day"><Input id="series-month-day" type="number" min={1} max={31} value={dayOfMonth} onChange={event => setDayOfMonth(Number(event.target.value) || 1)} /></FormField>}
              <FormField label="مهلت از شروع (روز)" htmlFor="series-offset"><Input id="series-offset" type="number" min={0} max={3650} value={offset} onChange={event => setOffset(Math.max(0, Number(event.target.value) || 0))} /></FormField>
              <FormField label="ساعت فعال‌سازی جریان کار" htmlFor="series-activation"><Input id="series-activation" type="time" value={activationTime} onChange={event => setActivationTime(event.target.value)} /></FormField>
              <div className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-[11px] leading-6 text-indigo-800">
                {recurrence === 'manual'
                  ? 'برای هر رخداد دستی، تاریخ شروع و مهلت در زمان ایجاد به‌صورت صریح دریافت می‌شود.'
                  : recurrence === 'monthly'
                    ? 'ماهانه بر پایه تقویم جلالی سازمان محاسبه می‌شود؛ روزهای ناموجود به آخر همان ماه محدود می‌شوند.'
                    : recurrence === 'project_based'
                      ? 'رخدادها با تعداد هدف برنامه محتوا در بازه شروع تا مهلت پروژه توزیع می‌شوند.'
                      : 'تاریخ‌ها از لنگر و فاصله هفتگی محاسبه می‌شوند؛ نخستین رخداد «هفته ۱» است و شماره هفته، ترتیبیِ همین مجموعه است نه شماره هفته تقویم سال.'}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="قالب فرایند" htmlFor="series-template"><Select id="series-template" value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">بدون قالب</option>{processTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></FormField>
                <FormField label="موضوع پیش‌فرض" htmlFor="series-topic"><Input id="series-topic" value={topic} onChange={event => setTopic(event.target.value)} /></FormField>
                <FormField label="برچسب‌های پیش‌فرض" htmlFor="series-tags"><Input id="series-tags" value={tagsText} onChange={event => setTagsText(event.target.value)} placeholder="تحریریه، خبر" /></FormField>
                <FormField label="سطح نمایش پیش‌فرض" htmlFor="series-visibility"><Select id="series-visibility" value={visibility} onChange={event => setVisibility(event.target.value as typeof visibility)}><option value="internal">داخلی</option><option value="restricted">محدود</option><option value="public">عمومی</option></Select></FormField>
                <FormField label="ساعت انتشار هر رخداد" htmlFor="series-publication-time"><Input id="series-publication-time" type="time" required value={publicationTime} onChange={event => setPublicationTime(event.target.value)} /><p className="text-[10px] leading-5 text-slate-500">تاریخ انتشار از تاریخ همان رخداد و ساعت از این تنظیم مجموعه ثبت می‌شود.</p></FormField>
              </div>
              <fieldset>
                <legend className="mb-2 text-xs font-bold text-slate-700">کانال‌های انتشار پیش‌فرض</legend>
                <div className="flex flex-wrap gap-2">{publishingPlatforms.map(platform => <button key={platform.id} type="button" onClick={() => toggle(platform.id, channels, setChannels)} className={`rounded-xl border px-3 py-2 text-[11px] font-bold ${channels.includes(platform.id) ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{platform.name}</button>)}</div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-700"><Link2 className="h-4 w-4" />دارایی‌های مرجع DAM</legend>
                <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  <div className="grid gap-2 sm:grid-cols-2">{selectableAssets.map(asset => <label key={asset.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-[11px] hover:bg-slate-50"><input type="checkbox" checked={assetIds.includes(asset.id)} onChange={() => toggle(asset.id, assetIds, setAssetIds)} /><span className="truncate">{asset.title || asset.fileName}</span></label>)}</div>
                  {!selectableAssets.length && <p className="p-2 text-[11px] text-slate-400">دارایی قابل دسترسی برای پیوند پیش‌فرض وجود ندارد.</p>}
                </div>
              </fieldset>
              {initial && <FormField label="دلیل تغییر نسخه آینده" htmlFor="series-change-reason"><Textarea id="series-change-reason" required value={changeReason} onChange={event => setChangeReason(event.target.value)} rows={2} placeholder="مثلاً تغییر تقویم انتشار از رخداد بعدی" /></FormField>}
              <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-[11px] leading-5 text-emerald-800"><Eye className="mt-0.5 h-4 w-4 shrink-0" /><span>قالب، پیش‌فرض انتشار و دارایی‌های مرجع به‌صورت snapshot ثبت می‌شوند. ویرایش مجموعه هیچ رخداد قبلی را بازنویسی نمی‌کند.</span></div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => step ? setStep(step - 1) : onClose()}>{step ? <><ChevronRight className="h-4 w-4" />مرحله قبل</> : 'انصراف'}</Button>
          <Button type="submit" loading={mutation.isPending} disabled={!validStep()}>{step < 2 ? <>مرحله بعد<ChevronLeft className="h-4 w-4" /></> : initial ? 'ثبت نسخه آینده' : 'ایجاد مجموعه'}</Button>
        </div>
      </form>
    </Modal>
  );
}
