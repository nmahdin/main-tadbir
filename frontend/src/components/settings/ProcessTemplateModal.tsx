import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ContentProcessTemplate, ReviewerStrategy, StageAdvanceMode } from '../../types';
import { ArrowDown, ArrowUp, X, Plus, Trash2, FileText, Check, Settings } from 'lucide-react';

interface ProcessTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ContentProcessTemplate | null;
  onSave: (data: Omit<ContentProcessTemplate, 'id'> | ContentProcessTemplate) => void | Promise<void>;
}

export const ProcessTemplateModal: React.FC<ProcessTemplateModalProps> = ({ isOpen, onClose, template, onSave }) => {
  const { contentTypes, departments, roles } = useApp();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('poster');
  const [description, setDescription] = useState('');
  const [estimatedDays, setEstimatedDays] = useState<number>(7);
  const [stages, setStages] = useState<ContentProcessTemplate['stages']>([]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setType(template.type);
      setDescription(template.description);
      setEstimatedDays(template.estimatedDays ?? 7);
      setStages((template.stages || []).map((stage, index) => {
        const legacyDeadlinePolicy = stage.deadlinePolicy as string | undefined;
        const deadlinePolicy = legacyDeadlinePolicy === 'from_start'
          ? 'relative_days'
          : legacyDeadlinePolicy === 'absolute_date'
            ? 'none'
            : stage.deadlinePolicy || 'relative_days';
        return {
          ...stage,
          order: index + 1,
          dependsOnPrevious: index === 0 ? false : stage.dependsOnPrevious !== false,
          deadlinePolicy,
          relativeDueDays: stage.relativeDueDays ?? 2,
          reviewerStrategy: ['stage_reviewer', 'content_owner', 'department_manager'].includes(stage.reviewerStrategy || '')
            ? stage.reviewerStrategy
            : 'stage_reviewer',
          checklist: (stage.checklist || []).map((item, itemIndex) => ({
            id: item.id || `${stage.stageKey}-check-${itemIndex + 1}`,
            text: item.text,
          })),
        } as ContentProcessTemplate['stages'][number];
      }));
    } else {
      setName('');
      setType(contentTypes[0]?.id || 'poster');
      setDescription('');
      setEstimatedDays(7);
      setStages([{
        stageKey: `stg-${Date.now()}`,
        title: 'مرحله جدید',
        description: '',
        departmentId: departments[0]?.id || '',
        departmentName: departments[0]?.name || '',
        defaultRole: roles[0]?.id || '',
        order: 1,
        daysFromStart: 0,
        inputs: [],
        outputs: [],
        checklist: [],
        dependsOnPrevious: false,
        // پیش‌فرض صریح و سازگار با رفتار مراحل قدیمی: تأیید ارزیاب.
        reviewRequired: true,
        advanceMode: 'approval' as StageAdvanceMode,
        reviewerStrategy: 'stage_reviewer' as ReviewerStrategy,
        deadlinePolicy: 'relative_days',
        relativeDueDays: 2,
      }]);
    }
  }, [template, isOpen, contentTypes, departments, roles]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        ...(template ? { id: template.id } : {}),
        name: name.trim(),
        type,
        description: description.trim(),
        estimatedDays,
        stages: stages.map((stage, index) => ({
          ...stage,
          order: index + 1,
          dependsOnPrevious: index === 0 ? false : !!stage.dependsOnPrevious,
          checklist: (stage.checklist || [])
            .map(item => ({ ...item, text: item.text.trim() }))
            .filter(item => item.text !== ''),
        }))
      } as Omit<ContentProcessTemplate, 'id'> | ContentProcessTemplate);

      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'ذخیره الگو ناموفق بود');
    } finally {
      setSaving(false);
    }
  };

  const addStage = () => {
    setStages([
      ...stages,
      {
        stageKey: `stg-${Date.now()}`,
        title: 'مرحله جدید',
        description: '',
        departmentId: departments[0]?.id || '',
        departmentName: departments[0]?.name || '',
        defaultRole: roles[0]?.id || '',
        order: stages.length + 1,
        daysFromStart: stages.length + 1,
        inputs: [],
        outputs: [],
        checklist: [],
        dependsOnPrevious: stages.length > 0,
        reviewRequired: true,
        advanceMode: 'approval' as StageAdvanceMode,
        reviewerStrategy: 'stage_reviewer' as ReviewerStrategy,
        deadlinePolicy: 'relative_days',
        relativeDueDays: 2,
      }
    ]);
  };

  const updateStage = (index: number, updates: Partial<ContentProcessTemplate['stages'][number]>) => {
    setStages(previous => previous.map((stage, stageIndex) => stageIndex === index
      ? { ...stage, ...updates, ...(stageIndex === 0 ? { dependsOnPrevious: false } : {}) }
      : stage));
  };

  const removeStage = (index: number) => {
    setStages(previous => previous
      .filter((_, stageIndex) => stageIndex !== index)
      .map((stage, stageIndex) => ({ ...stage, order: stageIndex + 1, ...(stageIndex === 0 ? { dependsOnPrevious: false } : {}) })));
  };

  const moveStage = (index: number, dir: 'up' | 'down') => {
    if (dir === 'up' && index === 0) return;
    if (dir === 'down' && index === stages.length - 1) return;

    const newStages = [...stages];
    const previousFirstStage = stages[0];
    const targetIdx = dir === 'up' ? index - 1 : index + 1;
    [newStages[index], newStages[targetIdx]] = [newStages[targetIdx], newStages[index]];
    setStages(newStages.map((stage, stageIndex) => ({
      ...stage,
      order: stageIndex + 1,
      dependsOnPrevious: stageIndex === 0 ? false : (stage === previousFirstStage ? true : !!stage.dependsOnPrevious),
    })));
  };

  const addChecklistItem = (stageIndex: number) => {
    const stage = stages[stageIndex];
    updateStage(stageIndex, {
      checklist: [
        ...(stage.checklist || []),
        { id: `${stage.stageKey}-check-${Date.now()}`, text: '' },
      ],
    });
  };

  const updateChecklistItem = (stageIndex: number, itemIndex: number, text: string) => {
    const checklist = [...(stages[stageIndex].checklist || [])];
    checklist[itemIndex] = { ...checklist[itemIndex], text };
    updateStage(stageIndex, { checklist });
  };

  const removeChecklistItem = (stageIndex: number, itemIndex: number) => {
    updateStage(stageIndex, {
      checklist: (stages[stageIndex].checklist || []).filter((_, index) => index !== itemIndex),
    });
  };

  const moveChecklistItem = (stageIndex: number, itemIndex: number, direction: 'up' | 'down') => {
    const checklist = [...(stages[stageIndex].checklist || [])];
    const targetIndex = direction === 'up' ? itemIndex - 1 : itemIndex + 1;
    if (targetIndex < 0 || targetIndex >= checklist.length) return;
    [checklist[itemIndex], checklist[targetIndex]] = [checklist[targetIndex], checklist[itemIndex]];
    updateStage(stageIndex, { checklist });
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full flex flex-col max-h-[90vh] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {saveError && <p role="alert" className="p-3 text-xs text-rose-700">{saveError}</p>}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white rounded-t-3xl">
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            {template ? 'ویرایش الگو فرایند تولید' : 'افزودن الگو فرایند جدید'}
          </h2>
          <button disabled={saving} onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-8" dir="rtl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">عنوان الگو</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: فرایند استاندارد ویدیو..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                required
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">شناسه سیستمی (نوع محتوا)</label>
              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                required
              >
                {!contentTypes.some(contentType => contentType.id === type) && type && <option value={type}>{type} (قدیمی)</option>}
                {contentTypes.map(contentType => <option key={contentType.id} value={contentType.id}>{contentType.name} — {contentType.id}</option>)}
              </select>
              <span className="mt-1 block text-[10px] font-normal leading-5 text-slate-500">کلید فنی نوع محتواست؛ سامانه با آن فقط الگوهای سازگار را هنگام ساخت همان نوع محتوا پیشنهاد می‌دهد.</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">زمان تقریبی کل (روز)</label>
              <input
                type="number"
                min={1}
                max={3650}
                value={estimatedDays}
                onChange={event => setEstimatedDays(Math.max(1, Number(event.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
              <span className="mt-1 block text-[10px] font-normal leading-5 text-slate-500">برآورد برنامه‌ریزی کل جریان است و هنگام انتخاب الگو نمایش داده می‌شود؛ جای موعد واقعی محتوا یا مرحله را نمی‌گیرد.</span>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">توضیحات الگو</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="توضیحاتی در مورد این فرایند تولید..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all min-h-[60px] resize-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-900 border-r-2 border-indigo-500 pr-2">مراحل فرایند تولید</h3>
              <button
                type="button"
                onClick={addStage}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> افزودن مرحله
              </button>
            </div>

            <div className="space-y-4">
              {stages.map((stage, index) => (
                <div key={stage.stageKey || index} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-end gap-3">
                    <span className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span>
                    <label className="min-w-0 flex-1 text-[10px] font-bold text-slate-600">عنوان مرحله
                      <input type="text" value={stage.title} onChange={event => updateStage(index, { title: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold focus:bg-white focus:border-indigo-500 focus:outline-hidden" />
                    </label>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label="انتقال مرحله به بالا" title="انتقال مرحله به بالا" onClick={() => moveStage(index, 'up')} disabled={index === 0} className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="انتقال مرحله به پایین" title="انتقال مرحله به پایین" onClick={() => moveStage(index, 'down')} disabled={index === stages.length - 1} className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="حذف مرحله" onClick={() => removeStage(index)} className="rounded-lg bg-rose-50 p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[10px] font-bold text-slate-600">دپارتمان مسئول
                      <select value={stage.departmentId} onChange={event => { const department = departments.find(item => item.id === event.target.value); updateStage(index, { departmentId: event.target.value, departmentName: department?.name || '' }); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden">{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                    </label>
                    <label className="text-[10px] font-bold text-slate-600">نقش پیش‌فرض مجری
                      <select value={stage.defaultRole} onChange={event => updateStage(index, { defaultRole: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden">{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
                    </label>
                  </div>

                  <label className="block text-[10px] font-bold text-slate-600">توضیحات مرحله و راهنمای مجری
                    <textarea rows={3} value={stage.description} onChange={event => updateStage(index, { description: event.target.value })} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 focus:bg-white focus:border-indigo-500 focus:outline-hidden" />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[10px] font-bold text-slate-600">روز شروع نسبت به آغاز جریان
                      <input type="number" min={0} max={3650} value={stage.daysFromStart ?? index} onChange={event => updateStage(index, { daysFromStart: Math.max(0, Number(event.target.value) || 0) })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden" />
                      <span className="mt-1 block font-normal leading-5 text-slate-500">فاصلهٔ تقویمی شروع برنامه‌ریزی‌شدهٔ این مرحله از روز آغاز جریان؛ وابستگی ممکن است شروع واقعی را عقب بیندازد.</span>
                    </label>
                    <label className="text-[10px] font-bold text-slate-600">سیاست مهلت مرحله
                      <select
                        value={stage.deadlinePolicy || 'relative_days'}
                        onChange={event => updateStage(index, { deadlinePolicy: event.target.value as ContentProcessTemplate['stages'][number]['deadlinePolicy'] })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="from_content">همان موعد کل محتوا</option>
                        <option value="relative_days">چند روز پس از شروع همین مرحله</option>
                        <option value="from_previous">چند روز پس از مهلت مرحله قبل</option>
                        <option value="none">بدون مهلت خودکار</option>
                      </select>
                      <span className="mt-1 block font-normal leading-5 text-slate-500">مشخص می‌کند تاریخ مهلت این مرحله هنگام ساخت محتوا از کدام مبنا محاسبه شود.</span>
                    </label>
                    {(stage.deadlinePolicy === 'relative_days' || stage.deadlinePolicy === 'from_previous' || !stage.deadlinePolicy) && (
                      <label className="text-[10px] font-bold text-slate-600">فاصله تا مهلت (روز)
                        <input type="number" min={0} max={3650} value={stage.relativeDueDays ?? 2} onChange={event => updateStage(index, { relativeDueDays: Math.max(0, Number(event.target.value) || 0) })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden" />
                        <span className="mt-1 block font-normal leading-5 text-slate-500">برای سیاست نسبی، این تعداد روز به شروع مرحله یا مهلت مرحلهٔ قبل افزوده می‌شود.</span>
                      </label>
                    )}
                  </div>

                  {/*
                    سیاست پیشروی: آیا تکمیل مرحله بعدی به تأیید ارزیاب بسنده می‌کند
                    یا خروجی مشخصی باید با دستور «ارسال خروجی» تحویل شود. این تصمیم
                    صریح است تا دو مسیر فعال‌سازی مرحلهٔ بعدی با هم اشتباه نشوند.
                  */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[10px] font-bold text-slate-600">سیاست پیشروی مرحله بعدی
                      <select
                        value={stage.advanceMode || 'approval'}
                        onChange={event => updateStage(index, { advanceMode: event.target.value as StageAdvanceMode })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="approval">با تأیید ارزیاب فعال می‌شود</option>
                        <option value="forwarded_output">با ارسال خروجی تأییدشده فعال می‌شود</option>
                      </select>
                      <span className="mt-1 block font-normal leading-5 text-slate-500">تعیین می‌کند پس از تأیید مرحله، مرحلهٔ بعد مستقیم باز شود یا تا ارجاع یک خروجی تحویل‌شده منتظر بماند.</span>
                    </label>
                    <label className="text-[10px] font-bold text-slate-600">سیاست تعیین ارزیاب
                      <select
                        value={stage.reviewerStrategy || 'stage_reviewer'}
                        onChange={event => updateStage(index, { reviewerStrategy: event.target.value as ReviewerStrategy })}
                        disabled={stage.reviewRequired === false}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="stage_reviewer">ارزیاب ثبت‌شده در مرحله</option>
                        <option value="content_owner">مسئول اصلی محتوا</option>
                        <option value="department_manager">مدیر دپارتمان مسئول</option>
                      </select>
                      <span className="mt-1 block font-normal leading-5 text-slate-500">هنگام ارسال برای ارزیابی، شخص مسئول را از ارزیاب مرحله، مالک محتوا یا مدیر دپارتمان پیدا می‌کند.</span>
                    </label>
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3" aria-label={`چک‌لیست مرحله ${index + 1}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-[11px] font-extrabold text-slate-700">چک‌لیست انجام کار</h4>
                        <p className="mt-1 text-[10px] leading-5 text-slate-500">گام‌های اجرایی تسک است و با «خروجی‌های مورد انتظار» که اقلام تحویل‌شدنی مرحله‌اند، یکی نیست.</p>
                      </div>
                      <button type="button" onClick={() => addChecklistItem(index)} className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 shadow-xs ring-1 ring-slate-200 hover:bg-indigo-50">
                        <Plus className="h-3.5 w-3.5" /> افزودن مورد
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {(stage.checklist || []).map((item, itemIndex, checklist) => (
                        <div key={item.id || `${stage.stageKey}-check-${itemIndex}`} className="flex items-center gap-1.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black text-slate-500 ring-1 ring-slate-200">{(itemIndex + 1).toLocaleString('fa-IR')}</span>
                          <input
                            type="text"
                            value={item.text}
                            onChange={event => updateChecklistItem(index, itemIndex, event.target.value)}
                            placeholder="شرح یک گام قابل انجام"
                            aria-label={`متن مورد ${itemIndex + 1} چک‌لیست مرحله ${index + 1}`}
                            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                          />
                          <button type="button" aria-label="انتقال مورد چک‌لیست به بالا" title="انتقال به بالا" onClick={() => moveChecklistItem(index, itemIndex, 'up')} disabled={itemIndex === 0} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" aria-label="انتقال مورد چک‌لیست به پایین" title="انتقال به پایین" onClick={() => moveChecklistItem(index, itemIndex, 'down')} disabled={itemIndex === checklist.length - 1} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                          <button type="button" aria-label="حذف مورد چک‌لیست" title="حذف مورد" onClick={() => removeChecklistItem(index, itemIndex)} className="rounded-lg bg-rose-50 p-2 text-rose-600 hover:bg-rose-100"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                      {(stage.checklist || []).length === 0 && <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-center text-[10px] text-slate-400">هنوز موردی به چک‌لیست افزوده نشده است.</p>}
                    </div>
                    <p className="mt-2 text-[10px] leading-5 text-slate-500">این فهرست هنگام ساخت محتوا و تسک به‌صورت snapshot مستقل کپی می‌شود؛ ویرایش بعدی الگو، چک‌لیست‌های قبلی را تغییر نمی‌دهد.</p>
                  </section>

                  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input type="checkbox" checked={stage.reviewRequired !== false} onChange={event => updateStage(index, { reviewRequired: event.target.checked })} />
                      نیازمند ارزیابی مستقل است
                    </label>
                    <label className={`flex items-center gap-2 text-xs font-bold ${index === 0 ? 'cursor-not-allowed text-slate-400' : 'text-slate-700'}`} title={index === 0 ? 'مرحله اول مرحله قبلی ندارد.' : undefined}>
                      <input type="checkbox" checked={index === 0 ? false : !!stage.dependsOnPrevious} disabled={index === 0} onChange={event => updateStage(index, { dependsOnPrevious: event.target.checked })} />
                      وابسته به تکمیل مرحله قبل
                    </label>
                    {index === 0 && <span className="text-[10px] font-medium text-slate-500">مرحله اول مرحلهٔ قبلی ندارد؛ این گزینه همیشه خاموش است.</span>}
                    {stage.advanceMode === 'forwarded_output' && (
                      <span className="text-[10px] font-bold text-indigo-700">
                        مرحلهٔ بعدی تا «ارسال خروجی» باز نمی‌شود؛ تأیید به‌تنهایی کافی نیست.
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {stages.length === 0 && (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-500">هیچ مرحله‌ای تعریف نشده است.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50 rounded-b-3xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-colors cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {saving ? 'در حال ذخیره…' : 'ذخیره الگو'}
          </button>
        </div>
      </div>
    </div>
  );
};
