import React, { useState } from 'react';
import { Calendar, Check, CheckSquare, Clock3, FileText, Flag, FolderKanban, Paperclip, Plus, Tags, Trash2, UserRound } from 'lucide-react';
import { parseApiError } from '../../api/errors';
import { useApp } from '../../context/AppContext';
import type { Priority, Task, TaskStatus } from '../../types';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { Button, Input, Modal, Select, Textarea } from '../common/Primitives';

const numeric = (value?: string | null): value is string => !!value && /^\d+$/.test(value);

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block space-y-2">
    <span className="flex items-center gap-2 text-xs font-bold text-slate-700">{icon}{label}</span>
    {children}
  </label>;
}

export function EditTaskModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const {
    projects, contents, users, taskPriorities, taskStatuses, updateTask, moveTaskStatus,
    addAttachment, notify, pendingMutationKeys, hasPermission, currentUser,
  } = useApp();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [projectId, setProjectId] = useState(task.projectId || '');
  const [contentId, setContentId] = useState(task.contentId || '');
  const [checklist, setChecklist] = useState(() => task.subtasks.map(item => ({ ...item })));
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [deadline, setDeadline] = useState(task.deadline || '');
  const [estimatedHours, setEstimatedHours] = useState(String(task.estimatedHours || 1));
  const [tags, setTags] = useState(task.tags.join(', '));
  const [attachments, setAttachments] = useState(createEmptyAttachmentDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const busy = saving || pendingMutationKeys.includes(`tasks:${task.id}`);
  const canAssign = hasPermission('tasks.assign');
  const canStatus = task.kind !== 'content_review' && (task.assigneeId === currentUser.id || hasPermission('tasks.status'));
  const sourceLocked = ['content_work', 'content_review'].includes(task.kind || '');
  const attachmentCount = attachmentDraftCount(attachments);
  const selectableProjects = projects.filter(project => project.status !== 'archived' || project.id === task.projectId);
  const selectableContents = contents.filter(content => !projectId || content.projectId === projectId || content.id === task.contentId);
  const addChecklistItem = () => {
    const value = newChecklistItem.trim();
    if (!value || sourceLocked) return;
    setChecklist(items => [...items, { id: `edit-${Date.now()}-${items.length}`, title: value, completed: false }]);
    setNewChecklistItem('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !title.trim() || !assigneeId) return;
    setSaving(true); setError('');
    try {
      const metadataSaved = await updateTask(task.id, {
        title: title.trim(),
        description: description.trim(),
        projectId: projectId || undefined,
        contentId: contentId || undefined,
        subtasks: checklist.map(item => ({ id: item.id, title: item.title.trim(), completed: item.completed })).filter(item => item.title),
        assigneeId,
        priority,
        deadline,
        estimatedHours: Math.max(1, Number(estimatedHours) || 1),
        tags: tags.split(',').map(item => item.trim()).filter(Boolean),
      });
      if (!metadataSaved) throw new Error('ذخیرهٔ مشخصات وظیفه انجام نشد. دوباره تلاش کنید.');
      if (status !== task.status) {
        const statusSaved = await moveTaskStatus(task.id, status);
        if (!statusSaved) throw new Error('مشخصات ذخیره شد، اما تغییر وضعیت انجام نشد.');
      }
      if (attachmentCount > 0) {
        try {
          if (numeric(task.id)) {
            await persistAttachmentDraft(attachments, {
              taskId: task.id,
              projectId: numeric(projectId) ? projectId : undefined,
              contentId: numeric(task.contentId) ? task.contentId : undefined,
            }, title.trim());
          } else {
            attachments.files.forEach(file => addAttachment(task.id, { name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} کیلوبایت`, type: file.type.startsWith('image/') ? 'image' : 'document', url: URL.createObjectURL(file) }));
            attachments.texts.forEach(text => addAttachment(task.id, { name: text.title, size: `${text.body.length} نویسه`, type: 'text', url: '#' }));
            attachments.assets.forEach(asset => addAttachment(task.id, { name: asset.latest_file?.original_filename || asset.title, size: asset.latest_file?.file_size ? `${Math.max(1, Math.round(asset.latest_file.file_size / 1024))} کیلوبایت` : '—', type: 'document', url: `/api/v1/dam/library/${asset.id}/preview` }));
          }
        } catch (attachmentError) {
          notify({ type: 'error', title: 'مشخصات ذخیره شد؛ ضمیمه‌ها کامل نشدند', message: `${parseApiError(attachmentError).message} فهرست دارایی‌های وظیفه را بررسی کنید.` });
          onClose();
          return;
        }
      }
      notify({ type: 'success', title: 'تغییرات وظیفه ذخیره شد', message: attachmentCount ? `${attachmentCount.toLocaleString('fa-IR')} ضمیمهٔ جدید نیز متصل شد.` : undefined });
      onClose();
    } catch (caught) {
      setError(parseApiError(caught).message);
    } finally {
      setSaving(false);
    }
  };

  return <Modal open onClose={onClose} title="ویرایش وظیفه" description={`تغییر مشخصات «${task.title}»`} icon={<CheckSquare className="h-5 w-5" />} busy={busy} size="xl">
    <form onSubmit={save} className="max-h-[calc(94dvh-82px)] overflow-y-auto">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="h-4 w-4 text-indigo-600" />
              <div><h3 className="text-sm font-black text-slate-900">شرح وظیفه</h3><p className="text-[11px] text-slate-500">عنوان و توضیحات قابل مشاهده برای اعضای پروژه</p></div>
            </div>
            <Field label="عنوان وظیفه *" icon={<CheckSquare className="h-4 w-4 text-slate-400" />}>
              <Input autoFocus required value={title} onChange={event => setTitle(event.target.value)} maxLength={255} placeholder="عنوان دقیق و قابل اقدام" className="font-bold" />
            </Field>
            <Field label="توضیحات و معیار تحویل" icon={<FileText className="h-4 w-4 text-slate-400" />}>
              <Textarea value={description} onChange={event => setDescription(event.target.value)} rows={6} maxLength={5000} placeholder="خروجی مورد انتظار، محدودیت‌ها و نکات تحویل را بنویسید…" className="resize-y leading-7" />
            </Field>
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-bold text-slate-700"><CheckSquare className="h-4 w-4 text-indigo-500" />چک‌لیست وظیفه</span>{sourceLocked && <span className="text-[10px] text-slate-400">تصویر ثابت از الگوی مرحله؛ غیرقابل ویرایش</span>}</div>
              <div className="space-y-2">{checklist.map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <input type="checkbox" checked={item.completed} disabled={sourceLocked} onChange={event => setChecklist(items => items.map((row, rowIndex) => rowIndex === index ? { ...row, completed: event.target.checked } : row))} className="h-4 w-4 rounded text-indigo-600" />
                <Input value={item.title} disabled={sourceLocked} onChange={event => setChecklist(items => items.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))} className="h-9 flex-1 bg-white text-xs" />
                {!sourceLocked && <button type="button" aria-label={`حذف ${item.title}`} onClick={() => setChecklist(items => items.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
              </div>)}</div>
              {!sourceLocked && <div className="flex gap-2"><Input value={newChecklistItem} onChange={event => setNewChecklistItem(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addChecklistItem(); } }} placeholder="مورد جدید چک‌لیست…" className="text-xs" /><Button type="button" variant="secondary" onClick={addChecklistItem} disabled={!newChecklistItem.trim()}><Plus className="h-4 w-4" />افزودن</Button></div>}
            </div>
          </section>

          <AttachmentComposer value={attachments} onChange={setAttachments} disabled={busy} title="ضمیمه‌های جدید این ویرایش" />
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-3"><Calendar className="h-4 w-4 text-indigo-600" /><h3 className="text-xs font-black text-slate-900">برنامه‌ریزی و مسئولیت</h3></div>
            <Field label="مسئول انجام" icon={<UserRound className="h-4 w-4 text-slate-400" />}>
              <Select value={assigneeId} disabled={!canAssign || sourceLocked} onChange={event => setAssigneeId(event.target.value)}>{users.map(user => <option key={user.id} value={user.id}>{user.name} — {user.title}</option>)}</Select>
            </Field>
            <Field label="پروژه مرتبط" icon={<FolderKanban className="h-4 w-4 text-slate-400" />}>
              <Select value={projectId} disabled={sourceLocked || task.kind === 'content_correction' || task.kind === 'content_publish'} onChange={event => setProjectId(event.target.value)}>
                {!task.projectId && <option value="">بدون پروژه</option>}
                {selectableProjects.map(project => <option key={project.id} value={project.id}>{project.name}{project.status === 'archived' ? ' (بایگانی‌شده)' : ''}</option>)}
              </Select>
            </Field>
            <Field label="محتوای مرتبط" icon={<FileText className="h-4 w-4 text-slate-400" />}>
              <Select value={contentId} disabled={sourceLocked || task.kind === 'content_correction' || task.kind === 'content_publish'} onChange={event => setContentId(event.target.value)}>
                {!task.contentId && <option value="">بدون محتوا</option>}
                {selectableContents.map(content => <option key={content.id} value={content.id}>{content.title}</option>)}
              </Select>
            </Field>
            <Field label="مهلت انجام" icon={<Calendar className="h-4 w-4 text-slate-400" />}>
              <PersianDatePicker value={deadline} onChange={setDeadline} placeholder="انتخاب تاریخ" portal />
            </Field>
            <Field label="برآورد زمان (ساعت)" icon={<Clock3 className="h-4 w-4 text-slate-400" />}>
              <Input type="number" min={1} max={200} value={estimatedHours} onChange={event => setEstimatedHours(event.target.value)} />
            </Field>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3"><Flag className="h-4 w-4 text-indigo-600" /><h3 className="text-xs font-black text-slate-900">طبقه‌بندی</h3></div>
            <Field label="اولویت" icon={<Flag className="h-4 w-4 text-slate-400" />}>
              <Select value={priority} onChange={event => setPriority(event.target.value as Priority)}>{[...taskPriorities].sort((a,b) => b.order-a.order).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
            </Field>
            <Field label="وضعیت" icon={<CheckSquare className="h-4 w-4 text-slate-400" />}>
              <Select value={status} disabled={!canStatus} onChange={event => setStatus(event.target.value as TaskStatus)}>{[...taskStatuses].sort((a,b) => a.order-b.order).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</Select>
            </Field>
            <Field label="برچسب‌ها" icon={<Tags className="h-4 w-4 text-slate-400" />}>
              <Input value={tags} onChange={event => setTags(event.target.value)} placeholder="مثلاً: فوری، طراحی، جلسه" />
            </Field>
          </section>
        </aside>
      </div>

      {error && <p role="alert" className="mx-5 mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 sm:mx-6">{error}</p>}
      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2 text-[11px] text-slate-500"><Paperclip className="h-4 w-4" />{attachmentCount ? `${attachmentCount.toLocaleString('fa-IR')} ضمیمه آمادهٔ اتصال` : 'بدون ضمیمهٔ جدید'}</div>
        <div className="flex gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>انصراف</Button><Button type="submit" loading={busy} disabled={!title.trim() || !assigneeId}><Check className="h-4 w-4" />ذخیره تغییرات</Button></div>
      </footer>
    </form>
  </Modal>;
}
