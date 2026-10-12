import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, LoaderCircle, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Content, ContentStage, ContentStageStatus, ReviewerStrategy, StageAdvanceMode } from '../../types';
import { Modal, Input, Select, Textarea } from '../common/Primitives';
import { PersianDatePicker } from '../common/PersianDatePicker';

interface EditWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content | null;
}

const reviewOnlyStatuses: ContentStageStatus[] = ['ready_for_review', 'pending_approval', 'revisions_needed', 'needs_revision', 'approved'];
const statusWithoutReview = (status: ContentStageStatus): ContentStageStatus => {
  if (status === 'approved') return 'completed';
  return reviewOnlyStatuses.includes(status) ? 'in_progress' : status;
};

const stageStatuses: Array<{ id: ContentStageStatus; label: string }> = [
  { id: 'not_started', label: 'شروع‌نشده' },
  { id: 'pending_dependency', label: 'در انتظار پیش‌نیاز' },
  { id: 'in_progress', label: 'در حال انجام' },
  { id: 'ready_for_review', label: 'آماده ارزیابی' },
  { id: 'revisions_needed', label: 'نیازمند اصلاح' },
  { id: 'approved', label: 'تأییدشده' },
  { id: 'completed', label: 'تکمیل‌شده' },
  { id: 'skipped', label: 'بدون نیاز / عبور' },
];

const advanceModes: Array<{ id: StageAdvanceMode; label: string; hint: string }> = [
  { id: 'approval', label: 'فعال‌سازی با تأیید مرحله', hint: 'پس از تأیید ارزیاب، مرحلهٔ بعد آزاد می‌شود.' },
  { id: 'forwarded_output', label: 'فعال‌سازی با ارجاع خروجی', hint: 'تأیید ارزیاب مرحله را می‌بندد، اما مرحلهٔ بعد تا ارجاع رسمی یک خروجی تحویل‌شده فعال نمی‌شود.' },
];

const reviewerStrategies: Array<{ id: ReviewerStrategy; label: string }> = [
  { id: 'stage_reviewer', label: 'ارزیاب انتخاب‌شدهٔ همین مرحله' },
  { id: 'content_owner', label: 'مدیر پروندهٔ محتوا' },
  { id: 'department_manager', label: 'مدیر دپارتمان مسئول' },
];

/** مراحل سرور که در قالب گروهی کار می‌کنند را به شکل قابل ویرایش محلی برمی‌گرداند. */
const normalizeStages = (stages: ContentStage[] | undefined): ContentStage[] => (stages || []).map(stage => {
  const reviewRequired = stage.reviewRequired ?? !!(stage.reviewerId || stage.approverId);
  return {
    ...stage,
    reviewRequired,
    reviewerStrategy: stage.reviewerStrategy || 'stage_reviewer',
    advanceMode: stage.advanceMode || 'approval',
    status: reviewRequired ? stage.status : statusWithoutReview(stage.status),
  };
});

const sameStages = (left: ContentStage[], right: ContentStage[]) => JSON.stringify(left) === JSON.stringify(right);

export const EditWorkflowModal: React.FC<EditWorkflowModalProps> = ({ isOpen, onClose, content }) => {
  const { pendingMutationKeys, departments, users, updateContent, currentUser, hasPermission } = useApp();
  const [stages, setStages] = useState<ContentStage[]>([]);
  const [initialStages, setInitialStages] = useState<ContentStage[]>([]);
  const [baseline, setBaseline] = useState<{ id: string; version: string } | null>(null);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [error, setError] = useState('');
  const canManageWorkflow = currentUser.role === 'admin' || hasPermission('content.workflow.manage');
  const dirty = !sameStages(stages, initialStages);

  const loadFromContent = (target: Content) => {
    const normalized = normalizeStages(target.stages);
    setStages(normalized);
    setInitialStages(normalized);
    setBaseline({ id: target.id, version: target.reviewVersion || '' });
    setRemoteChanged(false);
    setError('');
  };

  // Loading happens only when the modal opens for a record; a background refresh of the
  // workspace must never discard edits the user is still making.
  useEffect(() => {
    if (!isOpen || !content) return;
    loadFromContent(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, content?.id]);

  const latest = useRef({ dirty, stages });
  latest.current = { dirty, stages };

  // A server-side change while the modal is open is reported instead of overwriting the draft.
  useEffect(() => {
    if (!isOpen || !content || !baseline || baseline.id !== content.id) return;
    if ((content.reviewVersion || '') === baseline.version) return;
    if (latest.current.dirty) { setRemoteChanged(true); return; }
    loadFromContent(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isOpen, baseline]);

  if (!isOpen || !content || !canManageWorkflow) return null;

  const busy = pendingMutationKeys.includes(`contents:${content.id}`);
  const updateStage = (id: string, updates: Partial<ContentStage>) => {
    setStages(previous => previous.map(stage => stage.id === id ? { ...stage, ...updates } : stage));
    setError('');
  };
  const membersOfDepartment = (departmentId: string) => {
    const department = departments.find(item => item.id === departmentId);
    const ids = new Set((department?.members || []).map(member => member.userId));
    const members = users.filter(user => ids.has(user.id) || user.departmentId === departmentId);
    return members.length ? members : users.filter(user => user.departmentId === departmentId);
  };
  const reviewerOptions = (stage: ContentStage) => {
    const owner = users.find(user => user.id === content.ownerId);
    const members = membersOfDepartment(stage.departmentId);
    // The case manager already has a dedicated fallback option below; omitting
    // them here prevents the same person from appearing twice in the selector.
    return members.filter(user => user.id !== owner?.id);
  };
  /** استراتژی خودکار سرور، انتخاب دستی ارزیاب را بی‌اثر می‌کند. */
  const reviewerIsAutomatic = (stage: ContentStage) => stage.reviewRequired !== false
    && (stage.reviewerStrategy === 'content_owner' || stage.reviewerStrategy === 'department_manager');

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    setStages(previous => {
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setError('');
  };
  const removeStage = (id: string) => {
    if (!confirm('این مرحله از جریان محتوا حذف شود؟ وابستگی مراحل بعدی به آن نیز پاک می‌شود.')) return;
    setStages(previous => previous
      .filter(stage => stage.id !== id)
      .map(stage => {
        const dependencies = (stage.dependsOnStageIds || []).filter(dependencyId => dependencyId !== id);
        // A stage whose only dependency was removed must not stay locked forever.
        const unlocked = dependencies.length === 0 && stage.status === 'pending_dependency' ? 'not_started' as ContentStageStatus : stage.status;
        return { ...stage, dependsOnStageIds: dependencies, status: unlocked };
      }));
    setError('');
  };
  const addStage = () => {
    const department = departments.find(item => item.status === 'active') || departments[0];
    setStages(previous => [...previous, {
      id: crypto.randomUUID(),
      stageKey: `custom_${previous.length + 1}`,
      title: 'مرحله جدید',
      description: '',
      departmentId: department?.id || '',
      departmentName: department?.name || '',
      order: previous.length,
      status: 'not_started',
      assigneeId: '',
      reviewerId: '',
      reviewerStrategy: 'stage_reviewer',
      advanceMode: 'approval',
      reviewRequired: false,
      inputs: [],
      outputs: [],
    }]);
    setError('');
  };

  const validationMessage = (): string => {
    if (stages.length === 0) return 'جریان محتوا باید حداقل یک مرحله داشته باشد.';
    const withoutTitle = stages.findIndex(stage => !stage.title.trim());
    if (withoutTitle >= 0) return `عنوان مرحلهٔ ${(withoutTitle + 1).toLocaleString('fa-IR')} را وارد کنید.`;
    const withoutDepartment = stages.findIndex(stage => !stage.departmentId);
    if (withoutDepartment >= 0) return `دپارتمان مسئول مرحلهٔ ${(withoutDepartment + 1).toLocaleString('fa-IR')} را انتخاب کنید.`;
    return '';
  };

  const close = () => {
    if (dirty && !confirm('تغییرات ذخیره‌نشدهٔ جریان محتوا از دست می‌رود. خارج می‌شوید؟')) return;
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = validationMessage();
    if (problem) { setError(problem); return; }
    setError('');
    const saved = await updateContent(content.id, {
      stages: stages.map((stage, index) => ({
        ...stage,
        title: stage.title.trim(),
        description: stage.description?.trim(),
        order: index,
        status: stage.reviewRequired ? stage.status : statusWithoutReview(stage.status),
        // Without an explicit reviewer the server keeps resolving it from the stage
        // strategy (department manager, content owner or the case manager fallback).
        reviewerId: stage.reviewRequired ? (stage.reviewerId || undefined) : undefined,
        approverId: stage.reviewRequired ? (stage.approverId || undefined) : undefined,
      })),
    });
    if (saved) { onClose(); return; }
    setError('ذخیرهٔ جریان محتوا انجام نشد. اگر متن خطا بالا نمایش داده شده است، آن را برطرف کنید و دوباره تلاش کنید.');
  };

  return <Modal open={isOpen} title="ویرایش جریان محتوا" description="هر مرحله در ردیف‌های جدا و خوانا تنظیم می‌شود" onClose={close} busy={busy} size="xl">
    <form onSubmit={submit} className="flex min-h-0 max-h-[calc(94dvh-74px)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
        {remoteChanged && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold text-amber-900">
          <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />ساختار این جریان از زمان بازشدن پنجره روی سرور تغییر کرده است. برای جلوگیری از بازنویسی تغییرات دیگران، اطلاعات ذخیره‌شده را بارگذاری کنید.</span>
          <button type="button" onClick={() => loadFromContent(content)} className="ui-button ui-button-secondary !min-h-8 text-[11px]"><RotateCcw className="h-3.5 w-3.5" />بارگذاری داده‌های سرور</button>
        </div>}
        {!!error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-bold text-rose-800">{error}</p>}

        {stages.map((stage, index) => <article key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
          <header className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span><strong className="text-xs text-slate-700">تنظیم مرحله</strong></div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="انتقال به بالا" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" aria-label="انتقال به پایین" disabled={index === stages.length - 1} onClick={() => move(index, 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" aria-label="حذف مرحله" onClick={() => removeStage(stage.id)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </header>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]">
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">عنوان مرحله<Input value={stage.title} onChange={event => updateStage(stage.id, { title: event.target.value })} maxLength={120} /></label>
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">وضعیت<Select value={stage.status} onChange={event => updateStage(stage.id, { status: event.target.value as ContentStageStatus })}>{stageStatuses.map(status => <option key={status.id} value={status.id} disabled={!stage.reviewRequired && reviewOnlyStatuses.includes(status.id)}>{status.label}</option>)}</Select></label>
            </div>

            <label className="block space-y-1.5 text-[10px] font-bold text-slate-600">توضیحات و خروجی مورد انتظار<Textarea rows={2} value={stage.description || ''} onChange={event => updateStage(stage.id, { description: event.target.value })} className="resize-y" /></label>

            {index > 0 && <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-600"
                checked={(stage.dependsOnStageIds || []).includes(stages[index - 1].id)}
                onChange={event => {
                  const previousStageId = stages[index - 1].id;
                  const dependencies = stage.dependsOnStageIds || [];
                  updateStage(stage.id, {
                    dependsOnStageIds: event.target.checked
                      ? Array.from(new Set([...dependencies, previousStageId]))
                      : dependencies.filter(id => id !== previousStageId),
                    ...(event.target.checked && stage.status === 'not_started'
                      ? { status: 'pending_dependency' as ContentStageStatus }
                      : !event.target.checked && stage.status === 'pending_dependency'
                        ? { status: 'not_started' as ContentStageStatus }
                        : {}),
                  });
                }}
              />
              این مرحله به مرحله قبل وابسته است
            </label>}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">دپارتمان مسئول<Select value={stage.departmentId} onChange={event => { const department = departments.find(item => item.id === event.target.value); updateStage(stage.id, { departmentId: event.target.value, departmentName: department?.name || '', assigneeId: '', reviewerId: '', approverId: '' }); }}>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></label>
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">مسئول اجرا<Select value={stage.assigneeId || ''} onChange={event => updateStage(stage.id, { assigneeId: event.target.value })}><option value="">بدون مسئول مشخص</option>{membersOfDepartment(stage.departmentId).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-700"><span>این مرحله به ارزیابی مستقل نیاز دارد</span><input type="checkbox" checked={!!stage.reviewRequired} onChange={event => updateStage(stage.id, { reviewRequired: event.target.checked, status: event.target.checked ? stage.status : statusWithoutReview(stage.status), reviewerId: event.target.checked ? stage.reviewerId : '', approverId: event.target.checked ? stage.approverId : '' })} /></label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-[10px] font-bold text-slate-600">سیاست تعیین ارزیاب
                  <Select disabled={!stage.reviewRequired} value={stage.reviewerStrategy || 'stage_reviewer'} onChange={event => updateStage(stage.id, { reviewerStrategy: event.target.value as ReviewerStrategy, reviewerId: '', approverId: '' })}>
                    {reviewerStrategies.map(strategy => <option key={strategy.id} value={strategy.id}>{strategy.label}</option>)}
                  </Select>
                  <span className="block text-[9px] font-medium text-slate-500">در سیاست‌های خودکار، ارزیاب هنگام بررسی از مدیر پرونده یا مدیر دپارتمان خوانده می‌شود.</span>
                </label>
                <label className="space-y-1.5 text-[10px] font-bold text-slate-600">ارزیاب (عضو دپارتمان یا مدیر پرونده)<Select disabled={!stage.reviewRequired || reviewerIsAutomatic(stage)} value={stage.reviewerId || ''} onChange={event => updateStage(stage.id, { reviewerId: event.target.value, approverId: event.target.value })}><option value="">{!stage.reviewRequired ? 'بدون نیاز به ارزیاب' : reviewerIsAutomatic(stage) ? 'تعیین خودکار بر پایه سیاست' : `ارزیاب پیش‌فرض: مدیر پرونده (${users.find(user => user.id === content.ownerId)?.name || 'نامشخص'})`}</option>{reviewerOptions(stage).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></label>
                <div className="space-y-1.5 text-[10px] font-bold text-slate-600"><PersianDatePicker value={stage.deadline || ''} onChange={deadline => updateStage(stage.id, { deadline })} label="مهلت انجام مرحله" placeholder="انتخاب تاریخ مهلت" /></div>
                <label className="space-y-1.5 text-[10px] font-bold text-slate-600">نحوهٔ فعال‌سازی مرحلهٔ بعد
                  <Select value={stage.advanceMode || 'approval'} onChange={event => updateStage(stage.id, { advanceMode: event.target.value as StageAdvanceMode })}>
                    {advanceModes.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
                  </Select>
                  <span className="block text-[9px] font-medium text-slate-500">{advanceModes.find(mode => mode.id === (stage.advanceMode || 'approval'))?.hint}</span>
                </label>
              </div>
            </div>
          </div>
        </article>)}

        <button type="button" onClick={addStage} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-4 text-xs font-bold text-slate-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"><Plus className="h-4 w-4" />افزودن مرحله جدید</button>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
        <span className="text-[10px] font-bold text-slate-500">{dirty ? 'تغییرات ذخیره‌نشده دارید.' : 'همهٔ تغییرات ذخیره شده است.'}</span>
        <div className="flex items-center gap-3">
          {dirty && <button type="button" disabled={busy} onClick={() => { setStages(initialStages); setError(''); }} className="ui-button ui-button-ghost text-[11px]"><RotateCcw className="h-3.5 w-3.5" />بازنشانی تغییرات</button>}
          <button data-button-action="cancel" type="button" disabled={busy} onClick={close} className="ui-form-action ui-button ui-button-secondary">انصراف</button>
          <button data-button-action="save" type="submit" disabled={busy || stages.length === 0} className="ui-form-action ui-button ui-button-primary min-w-36">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? 'در حال ذخیره…' : 'ذخیره جریان'}</button>
        </div>
      </footer>
    </form>
  </Modal>;
};
