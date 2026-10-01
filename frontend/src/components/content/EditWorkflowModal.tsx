import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Content, ContentStage, ContentStageStatus } from '../../types';
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

export const EditWorkflowModal: React.FC<EditWorkflowModalProps> = ({ isOpen, onClose, content }) => {
  const { pendingMutationKeys, departments, users, updateContent, currentUser, hasPermission } = useApp();
  const [stages, setStages] = useState<ContentStage[]>([]);
  const canManageWorkflow = currentUser.role === 'admin' || hasPermission('content.edit');

  useEffect(() => {
    if (content && isOpen) {
      setStages((content.stages || []).map(stage => {
        const reviewRequired = stage.reviewRequired ?? !!(stage.reviewerId || stage.approverId);
        return {
          ...stage,
          reviewRequired,
          status: reviewRequired ? stage.status : statusWithoutReview(stage.status),
        };
      }));
    }
  }, [content, isOpen]);

  if (!isOpen || !content || !canManageWorkflow) return null;

  const busy = pendingMutationKeys.includes(`contents:${content.id}`);
  const updateStage = (id: string, updates: Partial<ContentStage>) => setStages(previous => previous.map(stage => stage.id === id ? { ...stage, ...updates } : stage));
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
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    setStages(previous => {
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const addStage = () => {
    const department = departments.find(item => item.status === 'active') || departments[0];
    setStages(previous => [...previous, {
      id: `stage-${Date.now()}`,
      stageKey: `custom_${previous.length + 1}`,
      title: 'مرحله جدید',
      description: '',
      departmentId: department?.id || '',
      departmentName: department?.name || '',
      order: previous.length,
      status: 'not_started',
      assigneeId: '',
      reviewerId: '',
      reviewRequired: false,
      inputs: [],
      outputs: [],
    }]);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || stages.some(stage => !stage.title.trim() || !stage.departmentId)) return;
    const saved = await updateContent(content.id, {
      stages: stages.map((stage, index) => ({
        ...stage,
        title: stage.title.trim(),
        description: stage.description?.trim(),
        order: index,
        status: stage.reviewRequired ? stage.status : statusWithoutReview(stage.status),
        reviewerId: stage.reviewRequired ? (stage.reviewerId || content.ownerId) : undefined,
        approverId: stage.reviewRequired ? (stage.reviewerId || content.ownerId) : undefined,
      })),
    });
    if (saved) onClose();
  };

  return <Modal open={isOpen} title="ویرایش جریان محتوا" description="هر مرحله در ردیف‌های جدا و خوانا تنظیم می‌شود" onClose={onClose} busy={busy} size="xl">
    <form onSubmit={submit} className="flex min-h-0 max-h-[calc(94dvh-74px)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
        {stages.map((stage, index) => <article key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
          <header className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span><strong className="text-xs text-slate-700">تنظیم مرحله</strong></div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="انتقال به بالا" disabled={index === 0} onClick={() => move(index, -1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" aria-label="انتقال به پایین" disabled={index === stages.length - 1} onClick={() => move(index, 1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" aria-label="حذف مرحله" onClick={() => setStages(previous => previous.filter(item => item.id !== stage.id))} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </header>

          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]">
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">عنوان مرحله<Input value={stage.title} onChange={event => updateStage(stage.id, { title: event.target.value })} maxLength={120} /></label>
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">وضعیت<Select value={stage.status} onChange={event => updateStage(stage.id, { status: event.target.value as ContentStageStatus })}>{stageStatuses.map(status => <option key={status.id} value={status.id} disabled={!stage.reviewRequired && reviewOnlyStatuses.includes(status.id)}>{status.label}</option>)}</Select></label>
            </div>

            <label className="block space-y-1.5 text-[10px] font-bold text-slate-600">توضیحات و خروجی مورد انتظار<Textarea rows={2} value={stage.description || ''} onChange={event => updateStage(stage.id, { description: event.target.value })} className="resize-y" /></label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">دپارتمان مسئول<Select value={stage.departmentId} onChange={event => { const department = departments.find(item => item.id === event.target.value); updateStage(stage.id, { departmentId: event.target.value, departmentName: department?.name || '', assigneeId: '', reviewerId: '' }); }}>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></label>
              <label className="space-y-1.5 text-[10px] font-bold text-slate-600">مسئول اجرا<Select value={stage.assigneeId || ''} onChange={event => updateStage(stage.id, { assigneeId: event.target.value })}><option value="">بدون مسئول مشخص</option>{membersOfDepartment(stage.departmentId).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-700"><span>این مرحله به ارزیابی مستقل نیاز دارد</span><input type="checkbox" checked={!!stage.reviewRequired} onChange={event => updateStage(stage.id, { reviewRequired: event.target.checked, status: event.target.checked ? stage.status : statusWithoutReview(stage.status), reviewerId: event.target.checked ? stage.reviewerId : '', approverId: event.target.checked ? stage.approverId : '' })} /></label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-[10px] font-bold text-slate-600">ارزیاب (عضو دپارتمان یا مدیر پرونده)<Select disabled={!stage.reviewRequired} value={stage.reviewerId || stage.approverId || ''} onChange={event => updateStage(stage.id, { reviewerId: event.target.value, approverId: event.target.value })}><option value="">{stage.reviewRequired ? `مدیر پرونده (${users.find(user => user.id === content.ownerId)?.name || 'نامشخص'})` : 'بدون نیاز به ارزیاب'}</option>{reviewerOptions(stage).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></label>
                <div className="space-y-1.5 text-[10px] font-bold text-slate-600"><PersianDatePicker value={stage.deadline || ''} onChange={deadline => updateStage(stage.id, { deadline })} label="مهلت انجام مرحله" placeholder="انتخاب تاریخ مهلت" /></div>
              </div>
            </div>
          </div>
        </article>)}

        <button type="button" onClick={addStage} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-4 text-xs font-bold text-slate-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"><Plus className="h-4 w-4" />افزودن مرحله جدید</button>
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4">
        <button type="button" disabled={busy} onClick={onClose} className="ui-button ui-button-secondary">انصراف</button>
        <button type="submit" disabled={busy || stages.length === 0} className="ui-button ui-button-primary min-w-36">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? 'در حال ذخیره…' : 'ذخیره جریان'}</button>
      </footer>
    </form>
  </Modal>;
};
