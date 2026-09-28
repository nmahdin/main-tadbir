import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { TaskStatus, Priority } from '../../types';
import { request } from '../../api/client';
import { X, CheckSquare, Trash2, Plus, Calendar, Flag, User, Target, Tags, FileText, Paperclip, Upload, Library, Type, FolderOpen, LoaderCircle, Search } from 'lucide-react';
import { PersianDatePicker } from '../common/PersianDatePicker';

type AttachMode = 'file' | 'text' | 'library';

interface LibraryAsset {
  id: number;
  title: string;
  latest_file?: { original_filename: string; file_size: number } | null;
}

interface DamFolder {
  id: number;
  name: string;
  parent_id: number | null;
}

const isNumericId = (id?: string) => !!id && /^\d+$/.test(id);

export const CreateTaskModal: React.FC = () => {
  const {
    isCreateTaskOpen, setIsCreateTaskOpen, projects, users, contents,
    addTaskAsync, addAttachment, currentUser, taskStatuses, taskPriorities, notify
  } = useApp();

  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [contentId, setContentId] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentUser?.id || users[0]?.id || '');
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');

  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ضمیمه‌ها در هر سه حالت دارایی دیجیتال
  const [attachMode, setAttachMode] = useState<AttachMode>('file');
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [textTitle, setTextTitle] = useState('');
  const [textBody, setTextBody] = useState('');
  const [folderId, setFolderId] = useState('');
  const [folders, setFolders] = useState<DamFolder[]>([]);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState<LibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedStatuses = [...taskStatuses].sort((a, b) => a.order - b.order);
  const sortedPriorities = [...taskPriorities].sort((a, b) => a.order - b.order);

  // Reset form when modal opens
  useEffect(() => {
    if (isCreateTaskOpen) {
      setTitle('');
      setProjectId('');
      setContentId('');
      setAssigneeId(currentUser?.id || users[0]?.id || '');
      setPriority('medium');
      setStatus('backlog');
      setDeadline('');
      setDescription('');
      setSubtasks([]);
      setNewSubtask('');
      setTagInput('');
      setSubmitError('');
      setSubmitting(false);
      setAttachMode('file');
      setQueuedFiles([]);
      setTextTitle('');
      setTextBody('');
      setFolderId('');
      setLibraryQuery('');
      setLibraryItems([]);
      setSelectedAssetIds([]);
      request<{ data: DamFolder[] }>('/dam/library/folders')
        .then(result => setFolders(result.data || []))
        .catch(() => setFolders([]));
    }
  }, [isCreateTaskOpen, users, currentUser]);

  const searchLibrary = async (query: string) => {
    setLibraryQuery(query);
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams({ per_page: '20' });
      if (query.trim()) params.set('search', query.trim());
      const result = await request<{ data: LibraryAsset[] }>(`/dam/library?${params}`);
      setLibraryItems(result.data || []);
    } catch {
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  };

  useEffect(() => {
    if (isCreateTaskOpen && attachMode === 'library' && libraryItems.length === 0 && !libraryLoading) {
      void searchLibrary('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachMode, isCreateTaskOpen]);

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([...subtasks, newSubtask.trim()]);
      setNewSubtask('');
    }
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
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
        subtasks: subtasks.map(stTitle => ({
          id: `st-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          title: stTitle,
          completed: false
        })),
        tags: tags.length > 0 ? tags : undefined
      });

      // اتصال ضمیمه‌ها پس از ساخته شدن تسک
      const numericTask = isNumericId(created.id);
      const numericProject = isNumericId(created.projectId || projectId);
      const today = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short' }).format(new Date());

      // ۱) فایل‌های آپلودشده
      for (const file of queuedFiles) {
        const formattedSize = file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`
          : `${(file.size / 1024).toFixed(0)} کیلوبایت`;
        if (numericTask) {
          const form = new FormData();
          form.append('file', file);
          form.append('title', file.name);
          form.append('task_id', created.id);
          if (numericProject) form.append('project_id', (created.projectId || projectId) as string);
          if (folderId) form.append('folder_id', folderId);
          await request('/dam/library', { method: 'POST', body: form });
        } else {
          addAttachment(created.id, {
            name: file.name,
            size: formattedSize,
            type: file.type.startsWith('image/') ? 'image' : 'document',
            url: URL.createObjectURL(file)
          });
        }
      }

      // ۲) متن ثبت‌شده
      if (textBody.trim()) {
        if (numericTask) {
          await request('/dam/library', {
            method: 'POST',
            body: {
              title: textTitle.trim() || `یادداشت تسک: ${created.title}`.slice(0, 200),
              body: textBody.trim(),
              task_id: Number(created.id),
              project_id: numericProject ? Number(created.projectId || projectId) : undefined,
              folder_id: folderId ? Number(folderId) : undefined,
            },
          });
        } else {
          addAttachment(created.id, {
            name: textTitle.trim() || 'یادداشت متنی',
            size: `${textBody.trim().length} نویسه`,
            type: 'text',
            url: '#'
          });
        }
      }

      // ۳) دارایی‌های انتخاب‌شده از مخزن
      for (const assetId of selectedAssetIds) {
        if (numericTask) {
          await request(`/dam/library/${assetId}/relations`, {
            method: 'POST',
            body: { related_type: 'task', related_id: Number(created.id) },
          });
        } else {
          const asset = libraryItems.find(a => a.id === assetId);
          if (asset) {
            addAttachment(created.id, {
              name: asset.latest_file?.original_filename || asset.title,
              size: asset.latest_file ? `${(asset.latest_file.file_size / 1024).toFixed(0)} کیلوبایت` : '—',
              type: 'document',
              url: `/api/v1/dam/library/${asset.id}/download`
            });
          }
        }
      }

      if (queuedFiles.length > 0 || textBody.trim() || selectedAssetIds.length > 0) {
        notify({ type: 'success', title: 'ضمیمه‌ها متصل شدند', message: 'فایل‌ها و دارایی‌های انتخاب‌شده به تسک جدید متصل شدند.' });
      }
      setIsCreateTaskOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'ایجاد تسک ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isCreateTaskOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6" dir="rtl">
      <div className="bg-white rounded-3xl max-w-2xl w-full flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">

        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">ایجاد وظیفه جدید</h3>
              <p className="text-[11px] text-slate-500 font-medium">تسک مستقل، متصل به پروژه یا متصل به محتوا — همراه با ضمیمه.</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateTaskOpen(false)}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[75vh] space-y-6">

          {/* Main Title */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
              <Target className="w-4 h-4 text-slate-400" />
              <span>عنوان وظیفه *</span>
            </label>
            <input
              required
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: طراحی و پیاده‌سازی فرم ورود"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
            />
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
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} - {u.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2">
                <Flag className="w-4 h-4 text-slate-400" />
                <span>اولویت</span>
              </label>
              <select
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
                <span>وضعیت اولیه</span>
              </label>
              <select
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
                portal
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
                  <div key={idx} className="flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium shadow-2xs">
                    <span className="text-slate-700">{st}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSubtask(idx)}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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

          {/* Attachments — هر سه حالت دارایی دیجیتال */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Paperclip className="w-4 h-4 text-slate-400" />
              <span>ضمیمه‌ها</span>
              {(queuedFiles.length > 0 || textBody.trim() || selectedAssetIds.length > 0) && (
                <span className="mr-auto px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 text-[10px]">
                  {queuedFiles.length + (textBody.trim() ? 1 : 0) + selectedAssetIds.length} مورد
                </span>
              )}
            </label>

            <div className="flex gap-1.5 p-1 bg-white rounded-xl border border-slate-200">
              {([
                ['file', 'آپلود فایل', Upload],
                ['text', 'ثبت متن', Type],
                ['library', 'انتخاب از مخزن', Library],
              ] as [AttachMode, string, typeof Upload][]).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAttachMode(mode)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${attachMode === mode ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {attachMode === 'file' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white text-xs font-bold text-slate-600 hover:text-indigo-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>انتخاب فایل‌ها</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    setQueuedFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />
                {queuedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px]">
                    <span className="font-bold text-slate-700 truncate">{file.name}</span>
                    <button type="button" onClick={() => setQueuedFiles(prev => prev.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {attachMode === 'text' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="عنوان یادداشت (اختیاری)"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-400 focus:outline-hidden"
                />
                <textarea
                  rows={3}
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  placeholder="متن یادداشت یا توضیح ضمیمه..."
                  className="w-full p-3.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-400 focus:outline-hidden resize-none"
                />
              </div>
            )}

            {attachMode === 'library' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={libraryQuery}
                    onChange={(e) => void searchLibrary(e.target.value)}
                    placeholder="جست‌وجو در مخزن مرکزی..."
                    className="w-full pr-9 pl-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-400 focus:outline-hidden"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto space-y-1.5">
                  {libraryLoading && <p className="text-[11px] text-slate-400 text-center py-3 flex items-center justify-center gap-2"><LoaderCircle className="w-3.5 h-3.5 animate-spin" />در حال جست‌وجو...</p>}
                  {!libraryLoading && libraryItems.map(asset => {
                    const checked = selectedAssetIds.includes(asset.id);
                    return (
                      <label key={asset.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] cursor-pointer transition-all ${checked ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedAssetIds(prev => checked ? prev.filter(id => id !== asset.id) : [...prev, asset.id])}
                          className="w-3.5 h-3.5 rounded-sm text-indigo-600"
                        />
                        <span className="font-bold text-slate-700 truncate">{asset.latest_file?.original_filename || asset.title}</span>
                      </label>
                    );
                  })}
                  {!libraryLoading && libraryItems.length === 0 && (
                    <p className="text-[11px] text-slate-400 text-center py-3">دارایی‌ای یافت نشد.</p>
                  )}
                </div>
              </div>
            )}

            {(queuedFiles.length > 0 || textBody.trim()) && (
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                  <span>پوشه مقصد در مخزن (اختیاری)</span>
                </label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:border-indigo-400 focus:outline-hidden"
                >
                  <option value="">ریشه مخزن</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

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

          {/* Footer Submit */}
          <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setIsCreateTaskOpen(false)}
              className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-black shadow-md shadow-indigo-200 transition-all cursor-pointer flex items-center gap-2"
            >
              {submitting ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <CheckSquare className="w-5 h-5" />}
              <span>{submitting ? 'در حال ایجاد...' : 'ایجاد وظیفه جدید'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
