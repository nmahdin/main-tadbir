import { parseApiError } from '../../api/errors';
import { Modal, Button, Input } from '../common/Primitives';
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { TaskStatus, Priority } from '../../types';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';
import { ArrowDown, ArrowUp, CheckSquare, Clock3, GripVertical, Trash2, Plus, Calendar, Flag, User, Target, Tags, FileText } from 'lucide-react';
import { PersianDatePicker } from '../common/PersianDatePicker';

const isNumericId = (id?: string) => !!id && /^\d+$/.test(id);

export const CreateTaskModal: React.FC = () => {
  const {
    isCreateTaskOpen, setIsCreateTaskOpen, projects, users, contents, activeView, selectedProjectId,
    addTaskAsync, addAttachment, currentUser, taskStatuses, taskPriorities, notify
  } = useApp();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [contentId, setContentId] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentUser?.id || users[0]?.id || '');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [deadline, setDeadline] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('1');
  const [description, setDescription] = useState('');

  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);

  const sortedStatuses = [...taskStatuses].sort((a, b) => a.order - b.order);
  const sortedPriorities = [...taskPriorities].sort((a, b) => a.order - b.order);

  // Reset form when modal opens
  useEffect(() => {
    if (isCreateTaskOpen) {
      setTitle('');
      setProjectId(activeView === 'project-detail' ? selectedProjectId || '' : '');
      setContentId('');
      setAssigneeId(currentUser?.id || users[0]?.id || '');
      setPriority('medium');
      setStatus('backlog');
      setDeadline('');
      setEstimatedHours('1');
      setDescription('');
      setSubtasks([]);
      setNewSubtask('');
      setTagInput('');
      setSubmitError('');
      setSubmitting(false);
      setAttachmentDraft(createEmptyAttachmentDraft());
    }
  }, [isCreateTaskOpen, activeView, selectedProjectId]);

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([...subtasks, newSubtask.trim()]);
      setNewSubtask('');
    }
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, idx) => idx !== index));
  };

  const moveSubtask = (from: number, to: number) => {
    if (to < 0 || to >= subtasks.length || from === to) return;
    setSubtasks(current => {
      const reordered = [...current];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      return reordered;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(''); setFieldErrors({});
    if (!title.trim() || !assigneeId || submitting) return;

    setSubmitting(true);
    try {
      const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);

      const created = await addTaskAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        projectId: projectId || undefined,
        contentId: contentId || undefined,
        assigneeId,
        status,
        priority,
        deadline: deadline || undefined,
        estimatedHours: Math.max(1, Math.min(200, Number(estimatedHours) || 1)),
        subtasks: subtasks.map(stTitle => ({
          id: `st-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: stTitle,
          completed: false
        })),
        tags: tags.length > 0 ? tags : undefined
      });

      const attachmentCount = attachmentDraftCount(attachmentDraft);
      if (attachmentCount > 0) {
        try {
          if (isNumericId(created.id)) {
            await persistAttachmentDraft(attachmentDraft, {
              taskId: created.id,
              projectId: isNumericId(created.projectId || projectId) ? (created.projectId || projectId) : undefined,
              contentId: isNumericId(created.contentId || contentId) ? (created.contentId || contentId) : undefined,
            }, created.title);
          } else {
            attachmentDraft.files.forEach(file => addAttachment(created.id, { name: file.name, size: `${Math.max(1, Math.round(file.size / 1024))} کیلوبایت`, type: file.type.startsWith('image/') ? 'image' : 'document', url: URL.createObjectURL(file) }));
            attachmentDraft.texts.forEach(text => addAttachment(created.id, { name: text.title, size: `${text.body.length} نویسه`, type: 'text', url: '#' }));
            attachmentDraft.assets.forEach(asset => addAttachment(created.id, { name: asset.latest_file?.original_filename || asset.title, size: asset.latest_file?.file_size ? `${Math.max(1, Math.round(asset.latest_file.file_size / 1024))} کیلوبایت` : '—', type: 'document', url: `/api/v1/dam/library/${asset.id}/preview` }));
          }
          notify({ type: 'success', title: 'ضمیمه‌ها متصل شدند', message: `${attachmentCount.toLocaleString('fa-IR')} ضمیمه به وظیفه جدید متصل شد.` });
        } catch (attachmentError) {
          notify({ type: 'error', title: 'وظیفه ایجاد شد؛ ضمیمه‌ها کامل نشدند', message: `${parseApiError(attachmentError).message} از بخش ویرایش وظیفه دوباره ضمیمه‌ها را اضافه کنید.` });
          setIsCreateTaskOpen(false);
          return;
        }
      }
      notify({ type: 'success', title: 'تسک با موفقیت ایجاد شد.' });
      setIsCreateTaskOpen(false);
    } catch (error) {
      const parsed = parseApiError(error); setFieldErrors(parsed.fields); setSubmitError(parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isCreateTaskOpen) return null;

  return (
    <Modal open={isCreateTaskOpen} onClose={() => setIsCreateTaskOpen(false)} title="ایجاد وظیفه جدید" description="مشخصات، برنامه‌ریزی و ضمیمه‌های وظیفه را یکجا ثبت کنید" icon={<CheckSquare className="h-5 w-5" />} busy={submitting} size="xl" panelScroll={false}>
        <form onSubmit={handleSubmit} className="flex max-h-[calc(94dvh-82px)] min-h-0 flex-col">
          {/* Only this body scrolls; actions remain available at the modal bottom. */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          {/* Main Title */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <Target className="w-4 h-4 text-slate-400" />
              <span>عنوان وظیفه *</span>
            </label>
            <Input
              required
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: طراحی و پیاده‌سازی فرم ورود"
              className="bg-slate-50 text-sm font-bold"
              aria-invalid={!!fieldErrors.title} aria-describedby="title-error"
            />
              {fieldErrors.title && <p id="title-error" role="alert" className="text-xs text-rose-700 mt-1">{fieldErrors.title.join(' • ')}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <CheckSquare className="w-4 h-4 text-slate-400" />
                <span>پروژه مرتبط</span>
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                <option value="">بدون پروژه (مستقل)</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <FileText className="w-4 h-4 text-slate-400" />
                <span>محتوای مرتبط</span>
              </label>
              <select
                value={contentId}
                onChange={(e) => setContentId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                <option value="">بدون محتوا</option>
                {contents.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <User className="w-4 h-4 text-slate-400" />
              <span>مسئول انجام *</span>
            </label>
            <select
              required
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}{u.title?.trim() ? ` — ${u.title.trim()}` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <Flag className="w-4 h-4 text-slate-400" />
                <span>اولویت *</span>
              </label>
              <select
                required
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                {sortedPriorities.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <CheckSquare className="w-4 h-4 text-slate-400" />
                <span>وضعیت اولیه *</span>
              </label>
              <select
                required
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                {sortedStatuses.map(st => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>مهلت انجام</span>
              </label>
              <PersianDatePicker
                value={deadline}
                onChange={(val) => setDeadline(val)}
                placeholder="انتخاب تاریخ"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <Clock3 className="w-4 h-4 text-slate-400" />
                <span>زمان برآوردی (ساعت) *</span>
              </label>
              <Input
                required
                type="number"
                min={1}
                max={200}
                step={1}
                value={estimatedHours}
                onChange={event => setEstimatedHours(event.target.value)}
                className="bg-slate-50 text-xs font-bold"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span>توضیحات و جزئیات</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اهداف، محدودیت‌ها یا لینک‌های مرتبط با این وظیفه را بنویسید..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden resize-none transition-all"
            />
          </div>

          {/* Subtasks */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-3">
              <CheckSquare className="w-4 h-4 text-slate-400" />
              <span>چک‌لیست و زیروظایف</span>
            </label>

            {subtasks.length > 0 && (
              <div className="space-y-2 mb-3">
                {subtasks.map((st, idx) => (
                  <div
                    key={`${st}-${idx}`}
                    draggable
                    onDragStart={event => event.dataTransfer.setData('text/plain', String(idx))}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => { event.preventDefault(); moveSubtask(Number(event.dataTransfer.getData('text/plain')), idx); }}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium shadow-2xs"
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" aria-hidden />
                    <span className="min-w-0 flex-1 text-slate-700">{st}</span>
                    <button type="button" disabled={idx === 0} onClick={() => moveSubtask(idx, idx - 1)} aria-label={`انتقال «${st}» به بالا`} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={idx === subtasks.length - 1} onClick={() => moveSubtask(idx, idx + 1)} aria-label={`انتقال «${st}» به پایین`} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => handleRemoveSubtask(idx)} aria-label={`حذف «${st}»`} className="p-1 text-slate-400 transition-colors hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="مثلاً: طراحی ساختار دیتابیس..."
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن</span>
              </button>
            </div>
          </div>

          <AttachmentComposer value={attachmentDraft} onChange={setAttachmentDraft} disabled={submitting} title="ضمیمه‌های وظیفه" defaultFolderLabel="وظایف / شناسه وظیفه (مسیر پیش‌فرض)" />

          {/* Tags */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <Tags className="w-4 h-4 text-slate-400" />
              <span>برچسب‌ها (با کاما جدا کنید)</span>
            </label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="مثلاً: فرانت‌اند, فوری, جلسه"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
            />
          </div>

          {submitError && (
            <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
              {submitError}
            </p>
          )}

          </div>
          {/* Fixed action bar: submitting never changes scroll position. */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <Button variant="secondary" disabled={submitting} type="button" onClick={() => setIsCreateTaskOpen(false)}>
              انصراف
            </Button>
            <Button loading={submitting} type="submit" disabled={!title.trim() || !assigneeId || !estimatedHours}>
              {!submitting && <CheckSquare className="w-4 h-4" />}
              <span>{submitting ? 'در حال ایجاد…' : 'ایجاد وظیفه جدید'}</span>
            </Button>
          </div>
        </form>
    </Modal>
  );
};
